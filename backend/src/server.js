import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import { pool, query } from './db.js';
import nodemailer from 'nodemailer';

const app = express();
const port = Number(process.env.PORT || 8081);
const localDateExpression = `(submitted_at AT TIME ZONE 'Asia/Kolkata')::date`;
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const adminDisplayName = process.env.ADMIN_DISPLAY_NAME || 'Admin';
const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || '');
const publicAppUrl = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || 'https://survey.vtracworldwide.com').replace(/\/+$/, '');
const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp-relay.gmail.com';
const smtpPort = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || process.env.MAIL_SECURE || 'false').toLowerCase() === 'true';
const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER || '';
const smtpPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.MAIL_PASSWORD || '';
const smtpHeloName = process.env.SMTP_HELO_NAME || 'survey.vtracworldwide.com';
const mailFrom = process.env.SMTP_FROM || process.env.MAIL_FROM || 'VTRAC Survey Portal <data@vtracworldwide.com>';
const recoveryNotifyEmail = normalizeEmail(process.env.RECOVERY_NOTIFY_EMAIL || process.env.SUPPORT_EMAIL || adminEmail || 'nagendra@vtracworldwide.com');
const mailTransport = createMailTransport();
const clientUsername = process.env.CLIENT_USERNAME || 'client';
const clientPassword = process.env.CLIENT_PASSWORD || 'client123';
const tokenSecret = process.env.ADMIN_TOKEN_SECRET || 'change-this-local-secret';
const defaultStaffPassword = process.env.STAFF_DEFAULT_PASSWORD || 'password';
const defaultProjectSlug = 'bengaluru-second-airport-feasibility';
const defaultProjectSettings = {
  airportLocationMode: false,
  captureGps: false,
  captureAudio: false,
  showRespondentPhone: true,
  showHouseholdId: false,
  status: 'deployed',
  archivedAt: ''
};
const transportModeOptions = [
  'Private car',
  'App cab / taxi',
  'Airport taxi',
  'Bus',
  'Metro',
  'Train',
  'Two-wheeler',
  'Auto-rickshaw',
  'Company cab',
  'Drop by family/friend',
  'Other'
];

const defaultLocations = ['Kadiri', 'Anantapur', 'Hindupur', 'Dharmavaram', 'Gorantla', 'Other'];
const defaultQuestions = [
  { id: 'age_group', label: 'Age group', type: 'select', options: ['18-25', '26-35', '36-45', '46-60', '60+'], required: true },
  { id: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other', 'Prefer not to say'], required: true },
  { id: 'occupation', label: 'Primary occupation', type: 'text', options: [], required: false },
  { id: 'service_awareness', label: 'Are you aware of VTRAC services?', type: 'select', options: ['Yes', 'No'], required: true },
  { id: 'satisfaction', label: 'Overall satisfaction', type: 'select', options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'], required: true },
  { id: 'priority_need', label: 'Top priority need', type: 'select', options: ['Employment', 'Training', 'Health', 'Education', 'Finance', 'Other'], required: true },
  { id: 'comments', label: 'Additional comments', type: 'textarea', options: [], required: false }
];

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '60mb' }));

await ensureDatabase();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vtrac-survey-portal' });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const identifier = normalizeLoginIdentifier(username);
  const envAdminMatches = identifier === normalizeLoginIdentifier(adminUsername) || (adminEmail && identifier === adminEmail);
  if (envAdminMatches && password === adminPassword) {
    return res.json({
      token: createToken(adminUsername, 'admin', null, { displayName: adminDisplayName, email: adminEmail || null }),
      username: adminUsername,
      role: 'admin',
      displayName: adminDisplayName,
      email: adminEmail || null
    });
  }
  return authenticateStaffLogin(identifier, password)
    .then((staff) => {
      if (!staff) return res.status(401).json({ error: 'Invalid staff login.' });
      res.json({
        token: createToken(staff.username, staff.role, null, { displayName: staff.display_name, email: staff.email, employeeCode: staff.employee_code }),
        username: staff.username,
        role: staff.role,
        displayName: staff.display_name,
        email: staff.email,
        employeeCode: staff.employee_code
      });
    })
    .catch((error) => {
      throw error;
    });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username, displayName: req.admin.displayName || req.admin.username, email: req.admin.email || null, role: req.admin.role });
});

app.post('/api/auth/recovery-request', async (req, res, next) => {
  try {
    const recovery = await createRecoveryRequest(req.body);
    res.status(201).json({ ok: true, message: recovery.message });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/access-token/:token', async (req, res, next) => {
  try {
    const record = await loadAccessToken(req.params.token);
    if (!record) return res.status(404).json({ error: 'This access link is invalid or expired.' });
    res.json({
      valid: true,
      purpose: record.purpose,
      accountType: record.accountType,
      displayName: record.displayName,
      username: record.username,
      email: record.email
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/access-token/:token/reset-password', async (req, res, next) => {
  try {
    const result = await resetPasswordWithAccessToken(req.params.token, req.body?.password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/client/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const identifier = normalizeLoginIdentifier(username);
    const client = await authenticateClient(identifier, password);
    if (!client) return res.status(401).json({ error: 'Invalid client login.' });
    res.json({ token: createToken(client.username, 'client', client.id, { displayName: client.displayName, email: client.email }), username: client.username, role: 'client', displayName: client.displayName, email: client.email });
  } catch (error) {
    next(error);
  }
});

app.get('/api/client/projects', requireClient, async (req, res, next) => {
  try {
    const projects = await loadProjectsForClient(req.client.clientId);
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/clients', requireAdmin, async (_req, res, next) => {
  try {
    res.json({ clients: await loadClients() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/clients', requireAdmin, async (req, res, next) => {
  try {
    const client = await saveClient(req.body);
    res.status(201).json({ client, message: client.emailNotice || 'Client access saved.' });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/clients/:id', requireAdmin, async (req, res, next) => {
  try {
    const client = await saveClient({ ...req.body, id: req.params.id });
    res.json({ client, message: client.emailNotice || 'Client access saved.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/recovery-requests', requireAdmin, async (_req, res, next) => {
  try {
    res.json({ requests: await loadRecoveryRequests() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/recovery-requests/:id/resolve', requireAdmin, async (req, res, next) => {
  try {
    await resolveRecoveryRequest(req.params.id, req.admin.username);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects', requireAdmin, async (_req, res, next) => {
  try {
    const projects = await loadProjects();
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects', requireAdmin, async (req, res, next) => {
  try {
    const project = await saveProject(req.body);
    res.status(201).json({ project });
  } catch (error) {
    next(error);
  }
});

app.put('/api/projects/:id', requireAdmin, async (req, res, next) => {
  try {
    const project = await saveProject({ ...req.body, id: req.params.id });
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id/response-backups', requireAdmin, async (req, res, next) => {
  try {
    await query(`DELETE FROM response_clear_backups WHERE expires_at < NOW()`);
    const result = await query(
      `SELECT id, project_id, project_name, response_count, created_by, created_at, expires_at, restored_at, restored_by, restored_count
      FROM response_clear_backups
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 10`,
      [req.params.id]
    );
    res.json({
      backups: result.rows.map((row) => ({
        id: String(row.id),
        projectId: row.project_id ? String(row.project_id) : null,
        projectName: row.project_name,
        responseCount: row.response_count,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        restoredAt: row.restored_at,
        restoredBy: row.restored_by,
        restoredCount: row.restored_count
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/response-backups/:backupId/restore', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const confirmation = String(req.body?.confirmation || '').trim();
    if (confirmation !== 'RESTORE DATA') {
      return res.status(400).json({ error: 'Type RESTORE DATA to confirm restoring the backup.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM response_clear_backups WHERE expires_at < NOW() AND restored_at IS NULL`);

    const backupResult = await client.query(
      `SELECT *
      FROM response_clear_backups
      WHERE id = $1
        AND project_id = $2
      LIMIT 1`,
      [req.params.backupId, req.params.id]
    );
    const backup = backupResult.rows[0];
    if (!backup) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Backup not found or expired.' });
    }
    if (backup.restored_at) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This backup has already been restored.' });
    }
    if (new Date(backup.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'This backup has expired.' });
    }

    let restoredCount = 0;
    const rows = Array.isArray(backup.backup_data) ? backup.backup_data : [];
    for (const row of rows) {
      const inserted = await client.query(
        `INSERT INTO survey_responses (
          project_id,
          enumerator_name,
          location,
          respondent_name,
          respondent_phone,
          household_id,
          answers,
          latitude,
          longitude,
          gps_accuracy,
          audio_data,
          audio_mime_type,
          audio_size,
          survey_started_at,
          survey_ended_at,
          survey_duration_seconds,
          client_submission_id,
          submitted_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (client_submission_id) DO NOTHING
        RETURNING id`,
        [
          req.params.id,
          row.enumerator_name,
          row.location,
          row.respondent_name || null,
          row.respondent_phone || null,
          row.household_id || null,
          JSON.stringify(row.answers || {}),
          row.latitude ?? null,
          row.longitude ?? null,
          row.gps_accuracy ?? null,
          row.audio_data || null,
          row.audio_mime_type || null,
          row.audio_size ?? null,
          row.survey_started_at || null,
          row.survey_ended_at || null,
          row.survey_duration_seconds ?? null,
          row.client_submission_id || null,
          row.submitted_at || null,
          row.created_at || null
        ]
      );
      restoredCount += inserted.rowCount;
    }

    await client.query(
      `UPDATE response_clear_backups
      SET restored_at = NOW(),
        restored_by = $1,
        restored_count = $2
      WHERE id = $3`,
      [req.admin.username || 'admin', restoredCount, backup.id]
    );

    await client.query('COMMIT');
    res.json({
      restoredCount,
      backup: {
        id: String(backup.id),
        responseCount: backup.response_count
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.delete('/api/projects/:id/responses', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const confirmation = String(req.body?.confirmation || '').trim();
    if (confirmation !== 'CLEAR DATA') {
      return res.status(400).json({ error: 'Type CLEAR DATA to confirm clearing submitted responses.' });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM response_clear_backups WHERE expires_at < NOW()`);

    const projectResult = await client.query(
      `SELECT id, name
      FROM survey_projects
      WHERE id = $1
      LIMIT 1`,
      [req.params.id]
    );
    const project = projectResult.rows[0];
    if (!project) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Survey project not found.' });
    }

    const backupResult = await client.query(
      `SELECT
        COUNT(*)::int AS response_count,
        COALESCE(jsonb_agg(to_jsonb(sr) ORDER BY sr.id), '[]'::jsonb) AS backup_data
      FROM survey_responses sr
      WHERE sr.project_id = $1`,
      [project.id]
    );
    const responseCount = backupResult.rows[0]?.response_count || 0;
    const backupData = backupResult.rows[0]?.backup_data || [];

    let backup = null;
    if (responseCount > 0) {
      const inserted = await client.query(
        `INSERT INTO response_clear_backups (
          project_id,
          project_name,
          response_count,
          backup_data,
          created_by,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '7 days')
        RETURNING id, created_at, expires_at`,
        [project.id, project.name, responseCount, JSON.stringify(backupData), req.admin.username || 'admin']
      );
      backup = inserted.rows[0];

      await client.query(
        `DELETE FROM survey_responses
        WHERE project_id = $1`,
        [project.id]
      );
    }

    await client.query('COMMIT');
    res.json({
      deletedCount: responseCount,
      backup: backup
        ? {
          id: String(backup.id),
          responseCount,
          createdAt: backup.created_at,
          expiresAt: backup.expires_at
        }
        : null
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.get('/api/survey-config', async (req, res, next) => {
  try {
    const project = await loadProjectForPublic(req.query.project);
    if (!project) return res.status(404).json({ error: 'Survey project not found.' });
    res.json(project);
  } catch (error) {
    next(error);
  }
});

app.post('/api/responses', async (req, res, next) => {
  try {
    const {
      projectSlug,
      projectId,
      enumeratorName,
      location,
      respondentName,
      respondentPhone,
      householdId,
      answers = {},
      audio,
      latitude,
      longitude,
      gpsAccuracy,
      surveyStartedAt,
      surveyEndedAt,
      surveyDurationSeconds,
      clientSubmissionId
    } = req.body;

    const project = await loadProjectForPublic(projectSlug || projectId);
    if (!project) return res.status(404).json({ error: 'Survey project not found.' });
    const settings = project.settings || defaultProjectSettings;

    if (!enumeratorName?.trim() || !location?.trim()) {
      return res.status(400).json({ error: 'Enumerator name and location are required.' });
    }

    const missingQuestion = project.questions
      .filter((question) => questionAppliesToLocation(question.id, location))
      .filter((question) => question.id !== 'google_coordinates')
      .filter((question) => question.required)
      .find((question) => String(answers[question.id] || '').trim() === '');

    if (missingQuestion) {
      return res.status(400).json({ error: `Missing required question: ${missingQuestion.label}` });
    }

    const audioPayload = settings.captureAudio ? normalizeAudioData(audio) : null;
    const startedAt = parseOptionalDate(surveyStartedAt);
    const endedAt = parseOptionalDate(surveyEndedAt) || new Date();
    const calculatedDuration = startedAt && endedAt
      ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000))
      : null;
    const durationSeconds = Number.isFinite(Number(surveyDurationSeconds))
      ? Math.max(0, Math.round(Number(surveyDurationSeconds)))
      : calculatedDuration;

    const result = await query(
      `INSERT INTO survey_responses (
        project_id,
        enumerator_name,
        location,
        respondent_name,
        respondent_phone,
        household_id,
        answers,
        latitude,
        longitude,
        gps_accuracy,
        audio_data,
        audio_mime_type,
        audio_size,
        survey_started_at,
        survey_ended_at,
        survey_duration_seconds,
        client_submission_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (client_submission_id)
      DO UPDATE SET client_submission_id = EXCLUDED.client_submission_id
      RETURNING id, submitted_at`,
      [
        project.id,
        enumeratorName.trim(),
        location.trim(),
        respondentName?.trim() || null,
        settings.showRespondentPhone ? respondentPhone?.trim() || null : null,
        settings.showHouseholdId ? householdId?.trim() || null : null,
        answers,
        settings.captureGps ? normalizeOptionalNumber(latitude) : null,
        settings.captureGps ? normalizeOptionalNumber(longitude) : null,
        settings.captureGps ? normalizeOptionalNumber(gpsAccuracy) : null,
        audioPayload?.data || null,
        audioPayload?.mimeType || null,
        audioPayload?.size || null,
        startedAt,
        endedAt,
        durationSeconds,
        clientSubmissionId || null
      ]
    );

    res.status(201).json({ response: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/enumerator-stats', async (req, res, next) => {
  try {
    const project = await loadProjectForPublic(req.query.project);
    if (!project) return res.status(404).json({ error: 'Survey project not found.' });

    const enumeratorName = String(req.query.enumerator || '').trim();
    if (!enumeratorName) {
      return res.json({
        enumeratorName: '',
        totalSamples: 0,
        samplesToday: 0,
        lastSubmittedAt: null
      });
    }

    const result = await query(
      `SELECT
        COUNT(*)::int AS total_samples,
        COUNT(*) FILTER (WHERE ${localDateExpression} = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::int AS samples_today,
        MAX(submitted_at) AS last_submitted_at
      FROM survey_responses
      WHERE project_id = $1
        AND LOWER(TRIM(enumerator_name)) = LOWER(TRIM($2))`,
      [project.id, enumeratorName]
    );

    const row = result.rows[0] || {};
    res.json({
      enumeratorName,
      totalSamples: row.total_samples || 0,
      samplesToday: row.samples_today || 0,
      lastSubmittedAt: row.last_submitted_at
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const filters = buildFilters(req.query);
    const mapWhere = filters.where
      ? `${filters.where} AND latitude IS NOT NULL AND longitude IS NOT NULL`
      : 'WHERE latitude IS NOT NULL AND longitude IS NOT NULL';
    const [totals, byDate, byEnumerator, byLocation, byTerminal, byMovement, bySurveyPoint, byProject, recent, reportRows, mapRows] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int AS total_samples,
          COUNT(*) FILTER (WHERE ${localDateExpression} = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::int AS samples_today
        FROM survey_responses
        ${filters.where}`,
        filters.params
      ),
      query(
        `SELECT TO_CHAR(${localDateExpression}, 'YYYY-MM-DD') AS date, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY ${localDateExpression}
        ORDER BY date DESC
        LIMIT 30`,
        filters.params
      ),
      query(
        `SELECT enumerator_name, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY enumerator_name
        ORDER BY samples DESC, enumerator_name ASC
        LIMIT 25`,
        filters.params
      ),
      query(
        `SELECT location, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY location
        ORDER BY samples DESC, location ASC`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Terminal 1%' THEN 'Terminal 1'
            WHEN location ILIKE '%Terminal 2%' THEN 'Terminal 2'
            ELSE 'Unassigned'
          END AS terminal,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY terminal
        ORDER BY samples DESC, terminal ASC`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Departures%' THEN 'Departures'
            WHEN location ILIKE '%Arrivals%' THEN 'Arrivals'
            ELSE 'Unassigned'
          END AS movement,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY movement
        ORDER BY samples DESC, movement ASC`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Arrival gate%' THEN 'Arrival gate'
            WHEN location ILIKE '%Departure gate%' THEN 'Departure gates'
            WHEN location ILIKE '%Cab/Taxi point%' THEN 'Cab/Taxi points'
            WHEN location ILIKE '%Bus point%' OR location ILIKE '%Bus station%' THEN 'Bus station'
            WHEN location ILIKE '%Other%' THEN 'Other'
            ELSE 'Unassigned'
          END AS survey_point,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY survey_point
        ORDER BY samples DESC, survey_point ASC`,
        filters.params
      ),
      query(
        `SELECT p.name AS project, p.slug, COUNT(r.id)::int AS samples
        FROM survey_projects p
        LEFT JOIN survey_responses r ON r.project_id = p.id
        ${filters.where}
        GROUP BY p.id, p.name, p.slug
        ORDER BY samples DESC, p.name ASC
        LIMIT 50`,
        filters.params
      ),
      query(
        `SELECT id, enumerator_name, location, respondent_name, audio_mime_type, submitted_at, answers
        FROM survey_responses
        ${filters.where}
        ORDER BY submitted_at DESC
        LIMIT 100`,
        filters.params
      ),
      query(
        `SELECT id, enumerator_name, location, submitted_at, answers
        FROM survey_responses
        ${filters.where}
        ORDER BY submitted_at DESC
        LIMIT 2000`,
        filters.params
      ),
      query(
        `SELECT id, enumerator_name, location, latitude, longitude, gps_accuracy, submitted_at
        FROM survey_responses
        ${mapWhere}
        ORDER BY submitted_at DESC
        LIMIT 2500`,
        filters.params
      )
    ]);

    res.json({
      totals: totals.rows[0],
      byDate: byDate.rows,
      byEnumerator: byEnumerator.rows,
      byLocation: byLocation.rows,
      byTerminal: byTerminal.rows,
      byMovement: byMovement.rows,
      bySurveyPoint: bySurveyPoint.rows,
      byProject: byProject.rows,
      recent: recent.rows,
      reportRows: reportRows.rows,
      mapRows: mapRows.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard/options', requireAdmin, async (req, res, next) => {
  try {
    const filters = buildFilters({ projectId: req.query.projectId });
    const [enumerators, locations] = await Promise.all([
      query(
        `SELECT DISTINCT enumerator_name
        FROM survey_responses
        ${filters.where}
        ORDER BY enumerator_name ASC`,
        filters.params
      ),
      query(
        `SELECT DISTINCT location
        FROM survey_responses
        ${filters.where}
        ORDER BY location ASC`,
        filters.params
      )
    ]);

    res.json({
      enumerators: enumerators.rows.map((row) => row.enumerator_name).filter(Boolean),
      locations: locations.rows.map((row) => row.location).filter(Boolean)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/:id(\\d+)', requireAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT *
      FROM survey_responses
      WHERE id = $1
      LIMIT 1`,
      [req.params.id]
    );
    const response = result.rows[0];
    if (!response) return res.status(404).json({ error: 'Response not found.' });
    res.json({ response: normalizeResponse(response) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/:id(\\d+)/audio', requireAdmin, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT audio_data, audio_mime_type
      FROM survey_responses
      WHERE id = $1
      LIMIT 1`,
      [req.params.id]
    );
    const row = result.rows[0];
    if (!row?.audio_data) return res.status(404).json({ error: 'Audio recording not found.' });
    const audioBuffer = Buffer.from(row.audio_data, 'base64');
    const audioMimeType = normalizeStoredAudioMimeType(row.audio_mime_type);
    const extension = audioExtensionFromMime(audioMimeType);
    res.setHeader('Content-Type', audioMimeType);
    res.setHeader('Content-Disposition', `attachment; filename="vtrac-response-${req.params.id}-audio.${extension}"`);
    res.send(audioBuffer);
  } catch (error) {
    next(error);
  }
});

app.put('/api/responses/:id(\\d+)', requireAdmin, async (req, res, next) => {
  try {
    const {
      enumeratorName,
      location,
      respondentName,
      respondentPhone,
      householdId,
      answers = {}
    } = req.body;

    if (!enumeratorName?.trim() || !location?.trim()) {
      return res.status(400).json({ error: 'Enumerator name and location are required.' });
    }

    const result = await query(
      `UPDATE survey_responses
      SET enumerator_name = $1,
        location = $2,
        respondent_name = $3,
        respondent_phone = $4,
        household_id = $5,
        answers = $6
      WHERE id = $7
      RETURNING *`,
      [
        enumeratorName.trim(),
        location.trim(),
        respondentName?.trim() || null,
        respondentPhone?.trim() || null,
        householdId?.trim() || null,
        answers,
        req.params.id
      ]
    );

    const response = result.rows[0];
    if (!response) return res.status(404).json({ error: 'Response not found.' });
    res.json({ response: normalizeResponse(response) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/client/dashboard', requireClient, async (req, res, next) => {
  try {
    const projects = await loadProjectsForClient(req.client.clientId);
    const allowedIds = projects.map((project) => project.id);
    if (allowedIds.length === 0) {
      return res.json({
        totals: { total_samples: 0, samples_today: 0 },
        byDate: [],
        byTerminal: [],
        byMovement: [],
        bySurveyPoint: [],
        byLocation: []
      });
    }

    const requestedProjectId = String(req.query.projectId || allowedIds[0]);
    if (!allowedIds.includes(requestedProjectId)) return res.status(403).json({ error: 'Project not enabled for this client.' });

    const filters = buildClientFilters({ ...req.query, projectId: requestedProjectId });
    const [totals, byDate, byTerminal, byMovement, bySurveyPoint, byLocation] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int AS total_samples,
          COUNT(*) FILTER (WHERE ${localDateExpression} = (NOW() AT TIME ZONE 'Asia/Kolkata')::date)::int AS samples_today
        FROM survey_responses
        ${filters.where}`,
        filters.params
      ),
      query(
        `SELECT TO_CHAR(${localDateExpression}, 'YYYY-MM-DD') AS date, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY ${localDateExpression}
        ORDER BY date DESC
        LIMIT 30`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Terminal 1%' THEN 'Terminal 1'
            WHEN location ILIKE '%Terminal 2%' THEN 'Terminal 2'
            ELSE 'Unassigned'
          END AS terminal,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY terminal
        ORDER BY samples DESC, terminal ASC`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Departures%' THEN 'Departures'
            WHEN location ILIKE '%Arrivals%' THEN 'Arrivals'
            ELSE 'Unassigned'
          END AS movement,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY movement
        ORDER BY samples DESC, movement ASC`,
        filters.params
      ),
      query(
        `SELECT
          CASE
            WHEN location ILIKE '%Arrival gate%' THEN 'Arrival gate'
            WHEN location ILIKE '%Departure gate%' THEN 'Departure gates'
            WHEN location ILIKE '%Cab/Taxi point%' THEN 'Cab/Taxi points'
            WHEN location ILIKE '%Bus point%' OR location ILIKE '%Bus station%' THEN 'Bus station'
            WHEN location ILIKE '%Other%' THEN 'Other'
            ELSE 'Unassigned'
          END AS survey_point,
          COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY survey_point
        ORDER BY samples DESC, survey_point ASC`,
        filters.params
      ),
      query(
        `SELECT location, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY location
        ORDER BY samples DESC, location ASC`,
        filters.params
      )
    ]);

    res.json({
      totals: totals.rows[0],
      byDate: byDate.rows,
      byTerminal: byTerminal.rows,
      byMovement: byMovement.rows,
      bySurveyPoint: bySurveyPoint.rows,
      byLocation: byLocation.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/export.csv', requireAdmin, async (req, res, next) => {
  try {
    const { rows, questions } = await loadExportRows(req.query);
    const headerFormat = req.query.headerFormat === 'raw' ? 'raw' : 'labels';
    const records = rows.map((row) => flattenResponse(row, questions, headerFormat));
    const csv = stringify(records, { header: true, columns: Object.keys(records[0] || defaultExportRow(questions, headerFormat)) });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/export.xlsx', requireAdmin, async (req, res, next) => {
  let exportFilePath = '';
  try {
    const { rows, questions } = await loadExportRows(req.query);
    const headerFormat = req.query.headerFormat === 'raw' ? 'raw' : 'labels';
    exportFilePath = path.join(os.tmpdir(), `vtrac-responses-${Date.now()}-${crypto.randomUUID()}.xlsx`);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: exportFilePath,
      useStyles: false,
      useSharedStrings: false
    });

    addStreamingExportWorksheet(workbook, 'All Responses', rows, questions, headerFormat);
    addStreamingExportWorksheet(
      workbook,
      'Departures',
      rows,
      questions,
      headerFormat,
      (row) => String(row.location || '').includes(' - Departures')
    );
    addStreamingExportWorksheet(
      workbook,
      'Arrivals',
      rows,
      questions,
      headerFormat,
      (row) => String(row.location || '').includes(' - Arrivals')
    );

    await workbook.commit();
    res.download(exportFilePath, 'vtrac-survey-responses.xlsx', async (error) => {
      await fs.unlink(exportFilePath).catch(() => {});
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    if (exportFilePath) await fs.unlink(exportFilePath).catch(() => {});
    next(error);
  }
});

app.get('/api/responses/export.geojson', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await loadExportRows(req.query);
    const features = rows
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .map((row) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [Number(row.longitude), Number(row.latitude)]
        },
        properties: {
          id: row.id,
          submitted_at: formatTimestamp(row.submitted_at),
          enumerator_name: row.enumerator_name || '',
          location: row.location || '',
          respondent_name: row.respondent_name || '',
          gps_accuracy: row.gps_accuracy ?? ''
        }
      }));
    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.geojson"');
    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/export.kml', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await loadExportRows(req.query);
    const placemarks = rows
      .filter((row) => row.latitude !== null && row.longitude !== null)
      .map((row) => `
        <Placemark>
          <name>${escapeXml(row.enumerator_name || `Response ${row.id}`)}</name>
          <description>${escapeXml(`${row.location || ''}\nSubmitted: ${formatTimestamp(row.submitted_at)}`)}</description>
          <Point><coordinates>${Number(row.longitude)},${Number(row.latitude)},0</coordinates></Point>
        </Placemark>
      `)
      .join('');
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <name>VTRAC Survey GPS Coordinates</name>
          ${placemarks}
        </Document>
      </kml>`;
    res.setHeader('Content-Type', 'application/vnd.google-earth.kml+xml');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.kml"');
    res.send(kml);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const message = error.status && error.message
    ? error.message
    : error.type === 'entity.too.large'
    ? 'Recording upload is too large. Please refresh and submit again.'
    : error.code === '23505'
    ? 'A project slug, username, or email already exists.'
    : 'Something went wrong. Please try again.';
  res.status(error.status || 500).json({ error: message });
});

app.listen(port, () => {
  console.log(`VTRAC Survey API listening on ${port}`);
});

async function ensureDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS employees (
      id BIGSERIAL PRIMARY KEY,
      employee_code TEXT NOT NULL UNIQUE,
      employee_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Analyst',
      branch TEXT,
      team TEXT,
      reporting_team_lead TEXT,
      reporting_team_lead_email TEXT,
      reporting_floor_manager TEXT,
      reporting_floor_manager_email TEXT,
      employment_status TEXT NOT NULL DEFAULT 'Active',
      join_date DATE,
      exit_date DATE,
      experience_years NUMERIC(5, 2),
      phone_optional TEXT,
      personal_email_optional TEXT,
      notes_optional TEXT,
      login_username TEXT,
      login_password_hash TEXT,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS staff_accounts (
      id BIGSERIAL PRIMARY KEY,
      employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      branch TEXT,
      team TEXT,
      reporting_team_lead TEXT,
      reporting_team_lead_email TEXT,
      reporting_floor_manager TEXT,
      reporting_floor_manager_email TEXT,
      password_hash TEXT NOT NULL,
      must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employee_change_requests (
      id BIGSERIAL PRIMARY KEY,
      request_type TEXT NOT NULL,
      employee_code TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      branch TEXT,
      team TEXT,
      requested_by_username TEXT NOT NULL,
      requested_by_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      comments TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employee_notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_username TEXT NOT NULL,
      recipient_role TEXT NOT NULL,
      request_id BIGINT REFERENCES employee_change_requests(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS survey_projects (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      locations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS survey_questions (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
      question_key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('text', 'textarea', 'select', 'number', 'date')),
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      required BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, question_key)
    );

    CREATE TABLE IF NOT EXISTS survey_responses (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT REFERENCES survey_projects(id),
      enumerator_name TEXT NOT NULL,
      location TEXT NOT NULL,
      respondent_name TEXT,
      respondent_phone TEXT,
      household_id TEXT,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      latitude NUMERIC(10, 7),
      longitude NUMERIC(10, 7),
      gps_accuracy NUMERIC(10, 2),
      audio_data TEXT,
      audio_mime_type TEXT,
      audio_size INT,
      survey_started_at TIMESTAMPTZ,
      survey_ended_at TIMESTAMPTZ,
      survey_duration_seconds INT,
      client_submission_id TEXT UNIQUE,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS client_accounts (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS client_project_access (
      client_id BIGINT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
      project_id BIGINT NOT NULL REFERENCES survey_projects(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (client_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS response_clear_backups (
      id BIGSERIAL PRIMARY KEY,
      project_id BIGINT REFERENCES survey_projects(id) ON DELETE SET NULL,
      project_name TEXT NOT NULL,
      response_count INT NOT NULL DEFAULT 0,
      backup_data JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
      restored_at TIMESTAMPTZ,
      restored_by TEXT,
      restored_count INT
    );

    CREATE TABLE IF NOT EXISTS account_recovery_requests (
      id BIGSERIAL PRIMARY KEY,
      account_type TEXT NOT NULL CHECK (account_type IN ('staff', 'client')),
      request_type TEXT NOT NULL CHECK (request_type IN ('username', 'password')),
      identifier TEXT,
      email TEXT,
      matched_account_id BIGINT,
      matched_username TEXT,
      matched_display_name TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT
    );

    CREATE TABLE IF NOT EXISTS account_access_tokens (
      id BIGSERIAL PRIMARY KEY,
      account_type TEXT NOT NULL CHECK (account_type IN ('staff', 'client')),
      account_id BIGINT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'password_reset', 'username_recovery')),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE survey_projects ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES survey_projects(id);
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_data TEXT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_mime_type TEXT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_size INT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_started_at TIMESTAMPTZ;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_ended_at TIMESTAMPTZ;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_duration_seconds INT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS client_submission_id TEXT UNIQUE;
    ALTER TABLE response_clear_backups ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;
    ALTER TABLE response_clear_backups ADD COLUMN IF NOT EXISTS restored_by TEXT;
    ALTER TABLE response_clear_backups ADD COLUMN IF NOT EXISTS restored_count INT;
    ALTER TABLE staff_accounts ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE account_recovery_requests ADD COLUMN IF NOT EXISTS matched_display_name TEXT;

    CREATE INDEX IF NOT EXISTS idx_survey_responses_project ON survey_responses (project_id);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses (submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_enumerator ON survey_responses (LOWER(enumerator_name));
    CREATE INDEX IF NOT EXISTS idx_survey_responses_location ON survey_responses (location);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_answers ON survey_responses USING GIN (answers);
    CREATE INDEX IF NOT EXISTS idx_client_project_access_client ON client_project_access (client_id);
    CREATE INDEX IF NOT EXISTS idx_client_project_access_project ON client_project_access (project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_client_accounts_email_unique ON client_accounts (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
    CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_status ON account_recovery_requests (status, requested_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_access_tokens_lookup ON account_access_tokens (token_hash, used_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_account_access_tokens_account ON account_access_tokens (account_type, account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_response_clear_backups_project ON response_clear_backups (project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_response_clear_backups_expires ON response_clear_backups (expires_at);
    CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees (branch);
    CREATE INDEX IF NOT EXISTS idx_employees_team ON employees (team);
    CREATE INDEX IF NOT EXISTS idx_employees_reporting_fm ON employees (reporting_floor_manager_email);
    CREATE INDEX IF NOT EXISTS idx_staff_accounts_username ON staff_accounts (LOWER(username));
    CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_accounts_email_unique ON staff_accounts (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
    CREATE INDEX IF NOT EXISTS idx_staff_accounts_role ON staff_accounts (role);
    CREATE INDEX IF NOT EXISTS idx_employee_requests_status ON employee_change_requests (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_employee_notifications_recipient ON employee_notifications (recipient_username, is_read, created_at DESC);
  `);

  const existing = await query(`SELECT id FROM survey_projects WHERE slug = 'pilot-survey' LIMIT 1`);
  let projectId = existing.rows[0]?.id;

  if (!projectId) {
    const created = await query(
      `INSERT INTO survey_projects (name, slug, description, locations)
      VALUES ($1, $2, $3, $4)
      RETURNING id`,
      ['Pilot Survey', 'pilot-survey', 'Default VTRAC pilot survey', defaultLocations]
    );
    projectId = created.rows[0].id;
  }

  const questionCount = await query(`SELECT COUNT(*)::int AS count FROM survey_questions WHERE project_id = $1`, [projectId]);
  if (questionCount.rows[0].count === 0) {
    for (const [index, question] of defaultQuestions.entries()) {
      await query(
        `INSERT INTO survey_questions (project_id, question_key, label, type, options, required, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [projectId, question.id, question.label, question.type, JSON.stringify(question.options), question.required, index + 1]
      );
    }
  }

  await query(`UPDATE survey_responses SET project_id = $1 WHERE project_id IS NULL`, [projectId]);
  await ensureBengaluruTransportQuestions();
  await ensureDefaultClientAccount();
  await ensureEnvironmentAdminAccount();
  await ensureStaffAccountsFromEmployees();
}

async function ensureBengaluruTransportQuestions() {
  const projectResult = await query(`SELECT id FROM survey_projects WHERE slug = $1 LIMIT 1`, [defaultProjectSlug]);
  const projectId = projectResult.rows[0]?.id;
  if (!projectId) return;

  await ensureQuestionAfter(projectId, 'travel_purpose', {
    id: 'departure_transport_mode_to_airport',
    label: 'Mode of transport used to reach the airport',
    type: 'select',
    options: transportModeOptions,
    required: true
  });

  await ensureQuestionAfter(projectId, 'departure_transport_mode_to_airport', {
    id: 'arrival_transport_mode_from_airport',
    label: 'Mode of transport willing to take from the airport',
    type: 'select',
    options: transportModeOptions,
    required: true
  });
}

async function ensureQuestionAfter(projectId, afterQuestionKey, question) {
  const existing = await query(
    `SELECT id
    FROM survey_questions
    WHERE project_id = $1
      AND question_key = $2
    LIMIT 1`,
    [projectId, question.id]
  );
  if (existing.rows[0]) return;

  const anchor = await query(
    `SELECT sort_order
    FROM survey_questions
    WHERE project_id = $1
      AND question_key = $2
    LIMIT 1`,
    [projectId, afterQuestionKey]
  );
  const maxOrder = await query(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order
    FROM survey_questions
    WHERE project_id = $1`,
    [projectId]
  );
  const anchorOrder = Number(anchor.rows[0]?.sort_order ?? maxOrder.rows[0]?.max_order ?? 0);

  await query(
    `UPDATE survey_questions
    SET sort_order = sort_order + 1
    WHERE project_id = $1
      AND sort_order > $2`,
    [projectId, anchorOrder]
  );
  await query(
    `INSERT INTO survey_questions (project_id, question_key, label, type, options, required, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [projectId, question.id, question.label, question.type, JSON.stringify(question.options), question.required, anchorOrder + 1]
  );
}

async function loadProjects() {
  const projects = await query(`
    SELECT p.*,
      COUNT(r.id)::int AS response_count
    FROM survey_projects p
    LEFT JOIN survey_responses r ON r.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  const questions = await query(`
    SELECT *
    FROM survey_questions
    ORDER BY project_id ASC, sort_order ASC, id ASC
  `);

  return projects.rows.map((project) => ({
    ...normalizeProject(project),
    questions: questions.rows
      .filter((question) => String(question.project_id) === String(project.id))
      .map(normalizeQuestion)
  }));
}

async function loadProjectForPublic(identifier) {
  const value = identifier || defaultProjectSlug;
  const projectResult = await query(
    `SELECT *
    FROM survey_projects
    WHERE is_active = TRUE
      AND (slug = $1 OR id::text = $1)
    LIMIT 1`,
    [String(value)]
  );
  const project = projectResult.rows[0];
  if (!project) return null;

  const questions = await query(
    `SELECT *
    FROM survey_questions
    WHERE project_id = $1
    ORDER BY sort_order ASC, id ASC`,
    [project.id]
  );

  return {
    ...normalizeProject(project),
    questions: questions.rows.map(normalizeQuestion)
  };
}

async function ensureDefaultClientAccount() {
  const existing = await query(`SELECT id FROM client_accounts WHERE username = $1 LIMIT 1`, [clientUsername]);
  let clientId = existing.rows[0]?.id;

  if (!clientId) {
    const created = await query(
      `INSERT INTO client_accounts (username, display_name, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id`,
      [clientUsername, 'Client Viewer', hashPassword(clientPassword)]
    );
    clientId = created.rows[0].id;
  }

  await query(
    `INSERT INTO client_project_access (client_id, project_id)
    SELECT $1, id
    FROM survey_projects
    ON CONFLICT DO NOTHING`,
    [clientId]
  );
}

async function ensureEnvironmentAdminAccount() {
  const username = String(adminUsername || 'admin').trim().toLowerCase();
  if (!username || !adminPassword) return;
  await query(
    `INSERT INTO staff_accounts (username, email, display_name, role, password_hash, must_change_password, is_active)
    VALUES ($1, $2, $3, 'admin', $4, FALSE, TRUE)
    ON CONFLICT (username) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, staff_accounts.email),
      display_name = EXCLUDED.display_name,
      role = 'admin',
      password_hash = EXCLUDED.password_hash,
      must_change_password = FALSE,
      is_active = TRUE,
      updated_at = NOW()`,
    [username, adminEmail || null, adminDisplayName, hashPassword(adminPassword)]
  );
}

async function ensureStaffAccountsFromEmployees() {
  const existingEmployees = await query(
    `SELECT
      id,
      employee_code,
      employee_name,
      role,
      branch,
      team,
      reporting_team_lead,
      reporting_team_lead_email,
      reporting_floor_manager,
      reporting_floor_manager_email,
      personal_email_optional,
      login_username,
      login_password_hash,
      must_change_password,
      employment_status
    FROM employees`
  );

  for (const employee of existingEmployees.rows) {
    const username = String(employee.login_username || employee.employee_code || '').trim().toLowerCase();
    if (!username) continue;
    const displayName = String(employee.employee_name || username).trim();
    const role = normalizeStaffRole(employee.role);
    const passwordHash = employee.login_password_hash || hashPassword(defaultStaffPassword);
    await query(
      `INSERT INTO staff_accounts (
        employee_id,
        username,
        display_name,
        role,
        branch,
        team,
        reporting_team_lead,
        reporting_team_lead_email,
        reporting_floor_manager,
        reporting_floor_manager_email,
        email,
        password_hash,
        must_change_password,
        is_active
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (username) DO UPDATE SET
        employee_id = EXCLUDED.employee_id,
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        branch = EXCLUDED.branch,
        team = EXCLUDED.team,
        reporting_team_lead = EXCLUDED.reporting_team_lead,
        reporting_team_lead_email = EXCLUDED.reporting_team_lead_email,
        reporting_floor_manager = EXCLUDED.reporting_floor_manager,
        reporting_floor_manager_email = EXCLUDED.reporting_floor_manager_email,
        email = EXCLUDED.email,
        password_hash = COALESCE(staff_accounts.password_hash, EXCLUDED.password_hash),
        must_change_password = COALESCE(staff_accounts.must_change_password, EXCLUDED.must_change_password),
        is_active = EXCLUDED.is_active,
        updated_at = NOW()`,
      [
        employee.id,
        username,
        displayName,
        role,
        employee.branch || null,
        employee.team || null,
        employee.reporting_team_lead || null,
        employee.reporting_team_lead_email || null,
        employee.reporting_floor_manager || null,
        employee.reporting_floor_manager_email || null,
        normalizeEmail(employee.personal_email_optional || ''),
        passwordHash,
        employee.must_change_password !== false,
        String(employee.employment_status || 'Active').toLowerCase() === 'active'
      ]
    );
  }
}

async function authenticateStaffLogin(identifier, password) {
  const normalized = normalizeLoginIdentifier(identifier);
  const result = await query(
    `SELECT *
    FROM staff_accounts
    WHERE (LOWER(username) = LOWER($1) OR LOWER(COALESCE(email, '')) = LOWER($1))
      AND is_active = TRUE
    LIMIT 1`,
    [normalized]
  );
  const staff = result.rows[0];
  if (!staff || !verifyPassword(password || '', staff.password_hash)) return null;
  return staff;
}

async function authenticateClient(identifier, password) {
  const normalized = normalizeLoginIdentifier(identifier);
  const result = await query(
    `SELECT *
    FROM client_accounts
    WHERE (LOWER(username) = LOWER($1) OR LOWER(COALESCE(email, '')) = LOWER($1))
      AND is_active = TRUE
    LIMIT 1`,
    [normalized]
  );
  const client = result.rows[0];
  if (!client || !verifyPassword(password || '', client.password_hash)) return null;
  return { id: String(client.id), username: client.username, displayName: client.display_name, email: client.email || null };
}

async function loadProjectsForClient(clientId) {
  const result = await query(
    `SELECT p.*,
      COUNT(r.id)::int AS response_count
    FROM client_project_access cpa
    JOIN survey_projects p ON p.id = cpa.project_id
    LEFT JOIN survey_responses r ON r.project_id = p.id
    WHERE cpa.client_id = $1
      AND p.is_active = TRUE
    GROUP BY p.id
    ORDER BY p.created_at DESC`,
    [clientId]
  );

  return result.rows.map((project) => {
    const normalized = normalizeProject(project);
    return {
      id: normalized.id,
      name: normalized.name,
      slug: normalized.slug,
      responseCount: normalized.responseCount
    };
  });
}

async function loadClients() {
  const clients = await query(`
    SELECT *
    FROM client_accounts
    ORDER BY created_at DESC
  `);
  const access = await query(`
    SELECT client_id, project_id
    FROM client_project_access
    ORDER BY client_id, project_id
  `);

  return clients.rows.map((client) => ({
    id: String(client.id),
    username: client.username,
    email: client.email || '',
    displayName: client.display_name,
    isActive: client.is_active,
    projectIds: access.rows
      .filter((row) => String(row.client_id) === String(client.id))
      .map((row) => String(row.project_id))
  }));
}

async function saveClient(payload) {
  const username = String(payload.username || '').trim();
  const email = normalizeEmail(payload.email || '');
  const displayName = String(payload.displayName || payload.username || '').trim();
  const password = String(payload.password || '');
  const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds.map(String) : [];
  const isNewClient = !payload.id;
  const shouldSendAccessEmail = Boolean(email && (isNewClient || password));

  if (!username || !displayName) {
    const error = new Error('Client username and display name are required.');
    error.status = 400;
    throw error;
  }
  if (email && !isLikelyEmail(email)) {
    const error = new Error('Enter a valid client email address.');
    error.status = 400;
    throw error;
  }

  if (!payload.id && password.length < 8) {
    const error = new Error('New client password must be at least 8 characters.');
    error.status = 400;
    throw error;
  }

  const result = payload.id
    ? password
      ? await query(
        `UPDATE client_accounts
        SET username = $1, email = $2, display_name = $3, password_hash = $4, is_active = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING *`,
        [username, email || null, displayName, hashPassword(password), payload.isActive !== false, payload.id]
      )
      : await query(
        `UPDATE client_accounts
        SET username = $1, email = $2, display_name = $3, is_active = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
        [username, email || null, displayName, payload.isActive !== false, payload.id]
      )
    : await query(
      `INSERT INTO client_accounts (username, email, display_name, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [username, email || null, displayName, hashPassword(password), payload.isActive !== false]
    );

  const client = result.rows[0];
  if (!client) {
    const error = new Error('Client not found.');
    error.status = 404;
    throw error;
  }

  await query(`DELETE FROM client_project_access WHERE client_id = $1`, [client.id]);
  for (const projectId of projectIds) {
    await query(
      `INSERT INTO client_project_access (client_id, project_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING`,
      [client.id, projectId]
    );
  }

  const savedClient = (await loadClients()).find((item) => item.id === String(client.id));
  if (savedClient && shouldSendAccessEmail) {
    const emailResult = await sendAccountAccessEmail({
      accountType: 'client',
      accountId: client.id,
      email,
      username,
      displayName,
      purpose: isNewClient ? 'invite' : 'password_reset'
    });
    savedClient.emailNotice = emailResult.sent
      ? (isNewClient ? 'Client access saved and setup email sent.' : 'Client access saved and reset email sent.')
      : 'Client access saved, but the setup/reset email could not be delivered. Please share the temporary password manually and check SMTP settings.';
  } else if (savedClient && !email && password) {
    savedClient.emailNotice = 'Client access saved. Add an email address to send setup/reset links automatically.';
  }
  return savedClient;
}


async function loadRecoveryRequests() {
  const result = await query(
    `SELECT *
    FROM account_recovery_requests
    ORDER BY requested_at DESC
    LIMIT 50`
  );
  return result.rows.map((request) => ({
    id: String(request.id),
    accountType: request.account_type,
    requestType: request.request_type,
    identifier: request.identifier || '',
    email: request.email || '',
    matchedAccountId: request.matched_account_id ? String(request.matched_account_id) : '',
    matchedUsername: request.matched_username || '',
    matchedDisplayName: request.matched_display_name || '',
    status: request.status,
    requestedAt: request.requested_at,
    resolvedAt: request.resolved_at,
    resolvedBy: request.resolved_by || ''
  }));
}

async function resolveRecoveryRequest(id, resolvedBy) {
  await query(
    `UPDATE account_recovery_requests
    SET status = 'Resolved', resolved_at = NOW(), resolved_by = $2
    WHERE id = $1`,
    [id, resolvedBy || 'admin']
  );
}

async function createRecoveryRequest(payload = {}) {
  const accountType = normalizeAccountType(payload.accountType);
  const requestType = normalizeRecoveryType(payload.requestType);
  const identifier = normalizeLoginIdentifier(payload.identifier || payload.username || '');
  const email = normalizeEmail(payload.email || '');
  if (!identifier && !email) {
    const error = new Error('Enter your username or email so the admin can identify the account.');
    error.status = 400;
    throw error;
  }
  if (email && !isLikelyEmail(email)) {
    const error = new Error('Enter a valid email address.');
    error.status = 400;
    throw error;
  }

  const matched = accountType === 'client'
    ? await findClientForRecovery(identifier, email)
    : await findStaffForRecovery(identifier, email);

  const result = await query(
    `INSERT INTO account_recovery_requests (
      account_type,
      request_type,
      identifier,
      email,
      matched_account_id,
      matched_username,
      matched_display_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *`,
    [
      accountType,
      requestType,
      identifier || null,
      email || null,
      matched?.id || null,
      matched?.username || null,
      matched?.displayName || null
    ]
  );

  const emailResult = await sendRecoveryEmails(result.rows[0], matched);
  const baseMessage = matched
    ? 'Recovery request recorded. If the mapped email is available, a secure email has been sent. Admin can also reset access from User Access.'
    : 'Recovery request recorded. A portal admin will review the details you submitted.';

  return {
    message: emailResult.sent
      ? `${baseMessage} Admin alert sent.`
      : `${baseMessage} Email could not be delivered, but the request is visible to admin.`
  };
}

async function findClientForRecovery(identifier, email) {
  const result = await query(
    `SELECT id, username, email, display_name
    FROM client_accounts
    WHERE is_active = TRUE
      AND (($1 <> '' AND LOWER(username) = LOWER($1)) OR ($2 <> '' AND LOWER(COALESCE(email, '')) = LOWER($2)))
    LIMIT 1`,
    [identifier, email]
  );
  const row = result.rows[0];
  return row ? { id: row.id, username: row.username, email: row.email || '', displayName: row.display_name } : null;
}

async function findStaffForRecovery(identifier, email) {
  const result = await query(
    `SELECT id, username, email, display_name
    FROM staff_accounts
    WHERE is_active = TRUE
      AND (($1 <> '' AND LOWER(username) = LOWER($1)) OR ($2 <> '' AND LOWER(COALESCE(email, '')) = LOWER($2)))
    LIMIT 1`,
    [identifier, email]
  );
  const row = result.rows[0];
  if (row) return { id: row.id, username: row.username, email: row.email || '', displayName: row.display_name };
  if (
    (identifier && identifier === normalizeLoginIdentifier(adminUsername)) ||
    (email && adminEmail && email === adminEmail)
  ) {
    return { id: null, username: adminUsername, email: adminEmail || '', displayName: adminDisplayName };
  }
  return null;
}

async function saveProject(payload) {
  const name = payload.name?.trim();
  const slug = slugify(payload.slug || payload.name);
  const locations = normalizeLines(payload.locations);
  const questions = normalizeQuestions(payload.questions);
  const settings = normalizeProjectSettings(payload.settings, slug);

  if (!name || !slug) {
    const error = new Error('Project name is required.');
    error.status = 400;
    throw error;
  }
  if (locations.length === 0) {
    const error = new Error('At least one location is required.');
    error.status = 400;
    throw error;
  }
  if (questions.length === 0) {
    const error = new Error('At least one question is required.');
    error.status = 400;
    throw error;
  }

  const result = payload.id
    ? await query(
      `UPDATE survey_projects
      SET name = $1, slug = $2, description = $3, locations = $4, settings = $5, is_active = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *`,
      [name, slug, payload.description?.trim() || null, locations, JSON.stringify(settings), payload.isActive !== false, payload.id]
    )
    : await query(
      `INSERT INTO survey_projects (name, slug, description, locations, settings, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [name, slug, payload.description?.trim() || null, locations, JSON.stringify(settings), payload.isActive !== false]
    );

  const project = result.rows[0];
  if (!project) {
    const error = new Error('Project not found.');
    error.status = 404;
    throw error;
  }

  await query(`DELETE FROM survey_questions WHERE project_id = $1`, [project.id]);
  for (const [index, question] of questions.entries()) {
    await query(
      `INSERT INTO survey_questions (project_id, question_key, label, type, options, required, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [project.id, question.id, question.label, question.type, JSON.stringify(question.options), question.required, index + 1]
    );
  }

  return loadProjectForPublic(project.id);
}

function buildFilters(queryParams) {
  const conditions = [];
  const params = [];

  if (queryParams.projectId) {
    params.push(queryParams.projectId);
    conditions.push(`project_id = $${params.length}`);
  }

  if (queryParams.excludePilot === '1') {
    conditions.push(`project_id NOT IN (SELECT id FROM survey_projects WHERE slug = 'pilot-survey')`);
  }

  if (queryParams.location) {
    params.push(queryParams.location);
    conditions.push(`location = $${params.length}`);
  }

  if (queryParams.enumerator) {
    params.push(`%${String(queryParams.enumerator).toLowerCase()}%`);
    conditions.push(`LOWER(enumerator_name) LIKE $${params.length}`);
  }

  if (queryParams.dateFrom) {
    params.push(queryParams.dateFrom);
    conditions.push(`${localDateExpression} >= $${params.length}::date`);
  }

  if (queryParams.dateTo) {
    params.push(queryParams.dateTo);
    conditions.push(`${localDateExpression} <= $${params.length}::date`);
  }

  if (queryParams.submittedFrom) {
    params.push(queryParams.submittedFrom);
    conditions.push(`submitted_at >= $${params.length}::timestamptz`);
  }

  if (queryParams.submittedTo) {
    params.push(queryParams.submittedTo);
    conditions.push(`submitted_at <= $${params.length}::timestamptz`);
  }

  if (queryParams.search) {
    params.push(`%${String(queryParams.search).toLowerCase()}%`);
    conditions.push(`(
      LOWER(enumerator_name) LIKE $${params.length}
      OR LOWER(location) LIKE $${params.length}
      OR LOWER(COALESCE(respondent_name, '')) LIKE $${params.length}
      OR LOWER(COALESCE(household_id, '')) LIKE $${params.length}
    )`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function buildClientFilters(queryParams) {
  const conditions = [];
  const params = [];

  if (queryParams.projectId) {
    params.push(queryParams.projectId);
    conditions.push(`project_id = $${params.length}`);
  }

  if (queryParams.dateFrom) {
    params.push(queryParams.dateFrom);
    conditions.push(`${localDateExpression} >= $${params.length}::date`);
  }

  if (queryParams.dateTo) {
    params.push(queryParams.dateTo);
    conditions.push(`${localDateExpression} <= $${params.length}::date`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

async function loadExportRows(queryParams) {
  const filters = buildFilters(queryParams);
  const project = queryParams.projectId ? await loadProjectForPublic(queryParams.projectId) : null;
  const questions = project?.questions || defaultQuestions;
  const result = await query(
    `SELECT
      id,
      project_id,
      enumerator_name,
      location,
      respondent_name,
      respondent_phone,
      household_id,
      answers,
      latitude,
      longitude,
      gps_accuracy,
      submitted_at,
      created_at,
      audio_mime_type,
      audio_size,
      client_submission_id,
      survey_started_at,
      survey_ended_at,
      survey_duration_seconds
    FROM survey_responses
    ${filters.where}
    ORDER BY submitted_at DESC`,
    filters.params
  );
  return { rows: result.rows, questions };
}

function flattenResponse(row, questions, headerFormat = 'labels') {
  const base = {
    id: row.id || '',
    submitted_at: formatExportTimestamp(row.submitted_at),
    submitted_at_iso: formatTimestamp(row.submitted_at),
    survey_started_at: formatExportTimestamp(row.survey_started_at),
    survey_ended_at: formatExportTimestamp(row.survey_ended_at),
    survey_duration_seconds: row.survey_duration_seconds ?? '',
    survey_duration: formatDuration(row.survey_duration_seconds),
    enumerator_name: row.enumerator_name || '',
    location: row.location || '',
    respondent_name: row.respondent_name || '',
    respondent_phone: row.respondent_phone || '',
    household_id: row.household_id || '',
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    gps_accuracy: row.gps_accuracy ?? '',
    audio_size_bytes: row.audio_size ?? '',
    audio_mime_type: row.audio_mime_type || '',
  };

  for (const question of questions) {
    if (question.id === 'google_coordinates') continue;
    base[headerFormat === 'raw' ? question.id : question.label] = row.answers?.[question.id] ?? '';
  }

  return base;
}

function normalizeResponse(row) {
  return {
    id: String(row.id),
    projectId: String(row.project_id || ''),
    enumeratorName: row.enumerator_name || '',
    location: row.location || '',
    respondentName: row.respondent_name || '',
    respondentPhone: row.respondent_phone || '',
    householdId: row.household_id || '',
    answers: row.answers || {},
    latitude: row.latitude,
    longitude: row.longitude,
    gpsAccuracy: row.gps_accuracy,
    surveyStartedAt: formatTimestamp(row.survey_started_at),
    surveyEndedAt: formatTimestamp(row.survey_ended_at),
    surveyDurationSeconds: row.survey_duration_seconds ?? null,
    hasAudio: Boolean(row.audio_data),
    audioMimeType: row.audio_mime_type || '',
    submittedAt: formatTimestamp(row.submitted_at)
  };
}

function normalizeAudioData(audio) {
  if (!audio?.dataUrl) return null;
  const match = String(audio.dataUrl).match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;
  const payloadMimeType = String(audio.mimeType || '');
  const mimeType = match[1].startsWith('audio/')
    ? match[1]
    : payloadMimeType.startsWith('audio/')
    ? payloadMimeType
    : inferAudioMimeType(match[1]);
  if (!mimeType) return null;
  return {
    mimeType,
    data: match[2],
    size: Number(audio.size || 0) || null
  };
}

function inferAudioMimeType(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('webm')) return 'audio/webm';
  if (value.includes('mp4')) return 'audio/mp4';
  if (value.includes('ogg')) return 'audio/ogg';
  if (value.includes('aac')) return 'audio/aac';
  if (value === 'application/octet-stream') return 'audio/webm';
  return '';
}

function normalizeStoredAudioMimeType(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.startsWith('audio/')) return value;
  return inferAudioMimeType(value) || 'audio/webm';
}

function audioExtensionFromMime(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('mp4') || value.includes('aac')) return 'm4a';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('wav')) return 'wav';
  return 'webm';
}

function defaultExportRow(questions, headerFormat = 'labels') {
  return flattenResponse({ answers: {} }, questions, headerFormat);
}

function addExportWorksheet(workbook, name, records, questions = [], headerFormat = 'labels') {
  const sheet = workbook.addWorksheet(name);
  const columns = Object.keys(records[0] || defaultExportRow(questions, headerFormat)).map((key) => ({
    header: key,
    key,
    width: Math.min(Math.max(key.length + 4, 14), 36)
  }));
  sheet.columns = columns;
  sheet.addRows(records);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: Math.max(columns.length, 1) }
  };
}

function addStreamingExportWorksheet(
  workbook,
  name,
  rows,
  questions = [],
  headerFormat = 'labels',
  predicate = () => true
) {
  const sheet = workbook.addWorksheet(name);
  const columns = Object.keys(defaultExportRow(questions, headerFormat)).map((key) => ({
    header: key,
    key,
    width: Math.min(Math.max(key.length + 4, 14), 36)
  }));
  sheet.columns = columns;

  for (const row of rows) {
    if (!predicate(row)) continue;
    sheet.addRow(flattenResponse(row, questions, headerFormat)).commit();
  }

  sheet.commit();
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function questionAppliesToLocation(questionId, location = '') {
  const isArrival = location.includes(' - Arrivals - ') || location.includes(' - Arrivals');
  const isDeparture = location.includes(' - Departures - ') || location.includes(' - Departures');

  const arrivalQuestionIds = new Set([
    'destination_street_exact_final_place',
    'destination_locality',
    'destination_zone_number',
    'destination_mapped_area',
    'destination_division',
    'coming_from_city_name',
    'arrival_transport_mode_from_airport',
    'time_to_reach_final_destination_hours',
    'time_to_reach_final_destination_minutes',
    'final_destination_time_total_minutes',
    'final_destination_time_expected_range',
    'final_destination_time_validation'
  ]);

  const departureQuestionIds = new Set([
    'origin_street_exact_pickup_place',
    'origin_locality',
    'origin_zone_number',
    'origin_mapped_area',
    'origin_division',
    'travelling_to_city_name',
    'departure_transport_mode_to_airport',
    'time_taken_to_reach_airport_hours',
    'time_taken_to_reach_airport_minutes',
    'travel_time_total_minutes',
    'travel_time_expected_range',
    'travel_time_validation'
  ]);

  if (isArrival && departureQuestionIds.has(questionId)) return false;
  if (isDeparture && arrivalQuestionIds.has(questionId)) return false;
  return true;
}

function createToken(username, role, clientId = null, extraClaims = {}) {
  const payload = {
    username,
    role,
    ...(clientId ? { clientId } : {}),
    ...extraClaims,
    exp: Date.now() + 1000 * 60 * 60 * 12
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', tokenSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', tokenSecret).update(body).digest('base64url');
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const admin = verifyToken(token);
  const allowedRoles = new Set(['admin', 'analyst', 'teamLead', 'floorManager']);
  if (!admin || !allowedRoles.has(admin.role)) return res.status(401).json({ error: 'Staff login required.' });
  req.admin = admin;
  next();
}

function requireClient(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const client = verifyToken(token);
  if (!client || client.role !== 'client' || !client.clientId) return res.status(401).json({ error: 'Client login required.' });
  req.client = client;
  next();
}


function createMailTransport() {
  if (!smtpHost) return null;
  const options = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    name: smtpHeloName
  };
  if (smtpUser && smtpPassword) {
    options.auth = { user: smtpUser, pass: smtpPassword };
  }
  return nodemailer.createTransport(options);
}

function normalizeEmailRecipients(value) {
  return String(Array.isArray(value) ? value.join(',') : value || '')
    .split(/[;,]/)
    .map((item) => normalizeEmail(item))
    .filter((item, index, all) => item && isLikelyEmail(item) && all.indexOf(item) === index);
}

async function sendPortalEmail({ to, subject, text, html }) {
  const recipients = normalizeEmailRecipients(to);
  if (!recipients.length) return { sent: false, reason: 'no-recipient' };
  if (!mailTransport) return { sent: false, reason: 'not-configured' };
  try {
    await mailTransport.sendMail({ from: mailFrom, to: recipients, subject, text, html });
    return { sent: true };
  } catch (error) {
    console.error('VTRAC email delivery failed:', error.message);
    return { sent: false, reason: 'delivery-failed' };
  }
}

async function createAccessToken(accountType, accountId, purpose, expiresInHours = 48) {
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `UPDATE account_access_tokens
    SET used_at = NOW()
    WHERE account_type = $1 AND account_id = $2 AND purpose = $3 AND used_at IS NULL`,
    [accountType, accountId, purpose]
  );
  await query(
    `INSERT INTO account_access_tokens (account_type, account_id, token_hash, purpose, expires_at)
    VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::interval)`,
    [accountType, accountId, hashToken(token), purpose, String(expiresInHours)]
  );
  return token;
}

async function loadAccessToken(token) {
  const tokenHash = hashToken(token);
  const tokenResult = await query(
    `SELECT *
    FROM account_access_tokens
    WHERE token_hash = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1`,
    [tokenHash]
  );
  const record = tokenResult.rows[0];
  if (!record) return null;
  const account = await loadAccessTokenAccount(record.account_type, record.account_id);
  if (!account) return null;
  return {
    id: record.id,
    accountType: record.account_type,
    accountId: record.account_id,
    purpose: record.purpose,
    expiresAt: record.expires_at,
    ...account
  };
}

async function loadAccessTokenAccount(accountType, accountId) {
  const result = accountType === 'client'
    ? await query(
      `SELECT id, username, email, display_name
      FROM client_accounts
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1`,
      [accountId]
    )
    : await query(
      `SELECT id, username, email, display_name
      FROM staff_accounts
      WHERE id = $1 AND is_active = TRUE
      LIMIT 1`,
      [accountId]
    );
  const row = result.rows[0];
  return row ? { username: row.username, email: row.email || '', displayName: row.display_name } : null;
}

async function resetPasswordWithAccessToken(token, password) {
  const nextPassword = String(password || '');
  if (nextPassword.length < 8) {
    const error = new Error('Password must be at least 8 characters.');
    error.status = 400;
    throw error;
  }
  const record = await loadAccessToken(token);
  if (!record) {
    const error = new Error('This access link is invalid or expired.');
    error.status = 400;
    throw error;
  }
  const used = await query(
    `UPDATE account_access_tokens
    SET used_at = NOW()
    WHERE id = $1 AND used_at IS NULL
    RETURNING id`,
    [record.id]
  );
  if (!used.rows[0]) {
    const error = new Error('This access link has already been used.');
    error.status = 400;
    throw error;
  }
  if (record.accountType === 'client') {
    await query(
      `UPDATE client_accounts
      SET password_hash = $1, updated_at = NOW()
      WHERE id = $2`,
      [hashPassword(nextPassword), record.accountId]
    );
  } else {
    await query(
      `UPDATE staff_accounts
      SET password_hash = $1, must_change_password = FALSE, updated_at = NOW()
      WHERE id = $2`,
      [hashPassword(nextPassword), record.accountId]
    );
  }
  return {
    ok: true,
    message: 'Password updated. You can now sign in.',
    loginPath: record.accountType === 'client' ? '/client' : '/admin'
  };
}

async function sendAccountAccessEmail({ accountType, accountId, email, username, displayName, purpose }) {
  if (!email || !accountId) return { sent: false, reason: 'missing-email-or-account' };
  const token = await createAccessToken(accountType, accountId, purpose);
  const setupUrl = `${publicAppUrl}/reset-access?token=${encodeURIComponent(token)}`;
  const isInvite = purpose === 'invite';
  return sendPortalEmail({
    to: email,
    subject: isInvite ? 'Set up your VTRAC Survey Portal access' : 'Reset your VTRAC Survey Portal password',
    text: [
      `Hello ${displayName || username},`,
      isInvite ? 'Your VTRAC Survey Portal client access has been created.' : 'A VTRAC Survey Portal password reset was requested for your account.',
      `Username: ${username}`,
      `Set/reset password: ${setupUrl}`,
      'This secure link expires in 48 hours and can be used once.'
    ].join('\n'),
    html: mailShell(isInvite ? 'Set up your access' : 'Reset your password', `
      <p>Hello ${escapeHtml(displayName || username)},</p>
      <p>${isInvite ? 'Your VTRAC Survey Portal access has been created.' : 'A password reset was requested for your VTRAC Survey Portal account.'}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px">
        ${mailTableRow('Username', username)}
        ${mailTableRow('Email', email)}
      </table>
      <p style="margin:24px 0 0"><a href="${escapeHtml(setupUrl)}" style="display:inline-block;background:#087f8c;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set password</a></p>
      <p style="font-size:13px;color:#6b7890;margin-top:18px">This single-use link expires in 48 hours. If you did not expect this email, contact VTRAC.</p>
    `)
  });
}

async function sendRecoveryEmails(request, matched) {
  if (!request) return { sent: false, reason: 'no-request' };
  const requestLabel = request.request_type === 'username' ? 'Forgot username' : 'Forgot password';
  const accountLabel = request.account_type === 'client' ? 'Client' : 'Staff/Admin';
  const requestedAt = formatExportTimestamp(request.requested_at || new Date()) || new Date().toISOString();
  const matchedLabel = matched
    ? `${matched.displayName || matched.username} (${matched.username})`
    : 'No account matched automatically';

  const adminResult = await sendPortalEmail({
    to: recoveryNotifyEmail,
    subject: `[VTRAC Survey] ${requestLabel} request - ${accountLabel}`,
    text: [
      `${requestLabel} request received in VTRAC Survey Portal.`,
      `Account type: ${accountLabel}`,
      `Identifier: ${request.identifier || '-'}`,
      `Submitted email: ${request.email || '-'}`,
      `Matched account: ${matchedLabel}`,
      `Requested at: ${requestedAt}`,
      `Open admin: ${publicAppUrl}/admin`
    ].join('\n'),
    html: mailShell(`${requestLabel} request`, `
      <p>A ${escapeHtml(requestLabel.toLowerCase())} request was submitted in the VTRAC Survey Portal.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:14px">
        ${mailTableRow('Account type', accountLabel)}
        ${mailTableRow('Identifier', request.identifier || '-')}
        ${mailTableRow('Submitted email', request.email || '-')}
        ${mailTableRow('Matched account', matchedLabel)}
        ${mailTableRow('Requested at', requestedAt)}
      </table>
      <p style="margin:24px 0 0"><a href="${escapeHtml(publicAppUrl)}/admin" style="display:inline-block;background:#1645aa;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open User Access</a></p>
    `)
  });

  let accountResult = { sent: false, reason: 'no-matched-account-email' };
  if (matched?.email && matched?.id) {
    if (request.request_type === 'password') {
      accountResult = await sendAccountAccessEmail({
        accountType: request.account_type,
        accountId: matched.id,
        email: matched.email,
        username: matched.username,
        displayName: matched.displayName,
        purpose: 'password_reset'
      });
    } else {
      accountResult = await sendPortalEmail({
        to: matched.email,
        subject: 'Your VTRAC Survey Portal username',
        text: [
          `Hello ${matched.displayName || matched.username},`,
          `Your VTRAC Survey Portal username is: ${matched.username}`,
          `Portal: ${publicAppUrl}`
        ].join('\n'),
        html: mailShell('Your username', `
          <p>Hello ${escapeHtml(matched.displayName || matched.username)},</p>
          <p>Your VTRAC Survey Portal username is:</p>
          <p style="font-size:20px;font-weight:700;color:#14244a">${escapeHtml(matched.username)}</p>
          <p><a href="${escapeHtml(publicAppUrl)}" style="color:#087f8c;font-weight:700">Open VTRAC Survey Portal</a></p>
        `)
      });
    }
  }

  return { sent: adminResult.sent || accountResult.sent, adminResult, accountResult };
}

function mailShell(title, bodyHtml) {
  return `
    <div style="background:#f4f7fb;padding:34px 16px;font-family:Arial,sans-serif;color:#12233f">
      <div style="max-width:620px;margin:auto;background:#fff;border-radius:14px;padding:34px;border:1px solid #dce5f0">
        <div style="color:#087f8c;font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">VTRAC Worldwide</div>
        <h1 style="font-size:25px;line-height:1.25;margin:12px 0 14px;color:#14244a">${escapeHtml(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#53627a">${bodyHtml}</div>
      </div>
    </div>`;
}

function mailTableRow(label, value) {
  return `
    <tr>
      <td style="padding:10px 12px;border-top:1px solid #e4ecf4;color:#6b7890;width:36%;font-weight:700">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-top:1px solid #e4ecf4;color:#12233f">${escapeHtml(value)}</td>
    </tr>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash || '').split('$');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  if (Buffer.byteLength(actual) !== Buffer.byteLength(hash)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLoginIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function normalizeAccountType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'client' ? 'client' : 'staff';
}

function normalizeRecoveryType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'username' ? 'username' : 'password';
}

function normalizeStaffRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'team lead' || normalized === 'tl') return 'teamLead';
  if (normalized === 'floor manager' || normalized === 'fm') return 'floorManager';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'qa/qc' || normalized === 'qc') return 'qaQc';
  return 'analyst';
}

function normalizeProject(project) {
  return {
    id: String(project.id),
    name: project.name,
    slug: project.slug,
    description: project.description || '',
    locations: project.locations || [],
    settings: normalizeProjectSettings(project.settings, project.slug),
    isActive: project.is_active,
    responseCount: project.response_count || 0,
    createdAt: formatTimestamp(project.created_at),
    updatedAt: formatTimestamp(project.updated_at),
    publicUrl: `/p/${project.slug}`
  };
}

function normalizeProjectSettings(settings = {}, slug = '') {
  const parsed = typeof settings === 'string' ? safeJsonParse(settings, {}) : settings || {};
  const status = parsed.status === 'archived' ? 'archived' : (parsed.status === 'draft' ? 'draft' : 'deployed');
  return {
    ...defaultProjectSettings,
    airportLocationMode: parsed.airportLocationMode === undefined ? slug === defaultProjectSlug : Boolean(parsed.airportLocationMode),
    captureGps: Boolean(parsed.captureGps),
    captureAudio: Boolean(parsed.captureAudio),
    showRespondentPhone: parsed.showRespondentPhone !== false,
    showHouseholdId: Boolean(parsed.showHouseholdId),
    sector: parsed.sector?.trim?.() || 'Other',
    country: parsed.country?.trim?.() || 'India',
    status,
    archivedAt: status === 'archived' ? String(parsed.archivedAt || '') : ''
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeQuestion(question) {
  return {
    id: question.question_key,
    label: question.label,
    type: question.type,
    options: Array.isArray(question.options) ? question.options : [],
    required: question.required
  };
}

function normalizeQuestions(questions = []) {
  return questions
    .map((question, index) => {
      const label = question.label?.trim();
      const type = ['text', 'textarea', 'select', 'number', 'date'].includes(question.type) ? question.type : 'text';
      return {
        id: slugify(question.id || label || `question-${index + 1}`).replaceAll('-', '_'),
        label,
        type,
        options: type === 'select' ? normalizeLines(question.options) : [],
        required: Boolean(question.required)
      };
    })
    .filter((question) => question.label);
}

function normalizeLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatTimestamp(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function formatExportTimestamp(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function formatDuration(value) {
  const total = Number(value);
  if (!Number.isFinite(total)) return '';
  const seconds = Math.max(0, Math.round(total));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  if (remainingMinutes > 0) return `${remainingMinutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}
