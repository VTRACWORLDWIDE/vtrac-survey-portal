import 'dotenv/config';
import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import { query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 8081);
const localDateExpression = `(submitted_at AT TIME ZONE 'Asia/Kolkata')::date`;
const adminUsername = process.env.ADMIN_USERNAME || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const clientUsername = process.env.CLIENT_USERNAME || 'client';
const clientPassword = process.env.CLIENT_PASSWORD || 'client123';
const tokenSecret = process.env.ADMIN_TOKEN_SECRET || 'change-this-local-secret';
const defaultProjectSlug = 'bengaluru-second-airport-feasibility';
const defaultProjectSettings = {
  airportLocationMode: false,
  captureGps: false,
  captureAudio: false,
  showRespondentPhone: true,
  showHouseholdId: false
};

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
  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({ error: 'Invalid admin login.' });
  }
  res.json({ token: createToken(username, 'admin'), username, role: 'admin' });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

app.post('/api/client/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const client = await authenticateClient(username, password);
    if (!client) return res.status(401).json({ error: 'Invalid client login.' });
    res.json({ token: createToken(client.username, 'client', client.id), username: client.username, role: 'client' });
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
    res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/clients/:id', requireAdmin, async (req, res, next) => {
  try {
    const client = await saveClient({ ...req.body, id: req.params.id });
    res.json({ client });
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
    const [totals, byDate, byEnumerator, byLocation, recent, reportRows, mapRows] = await Promise.all([
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
            WHEN location ILIKE '%Arrival gate%' THEN 'Arrival gates'
            WHEN location ILIKE '%Departure gate%' THEN 'Departure gates'
            WHEN location ILIKE '%Cab/Taxi point%' THEN 'Cab/Taxi point'
            WHEN location ILIKE '%Bus point%' OR location ILIKE '%Bus station%' THEN 'Bus point'
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
  try {
    const { rows, questions } = await loadExportRows(req.query);
    const headerFormat = req.query.headerFormat === 'raw' ? 'raw' : 'labels';
    const records = rows.map((row) => flattenResponse(row, questions, headerFormat));
    const workbook = new ExcelJS.Workbook();
    addExportWorksheet(workbook, 'All Responses', records, questions, headerFormat);
    addExportWorksheet(
      workbook,
      'Departures',
      records.filter((record) => String(record.location || '').includes(' - Departures')),
      questions,
      headerFormat
    );
    addExportWorksheet(
      workbook,
      'Arrivals',
      records.filter((record) => String(record.location || '').includes(' - Arrivals')),
      questions,
      headerFormat
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
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
  const message = error.type === 'entity.too.large'
    ? 'Recording upload is too large. Please refresh and submit again.'
    : error.code === '23505'
    ? 'Project slug already exists.'
    : 'Something went wrong. Please try again.';
  res.status(error.status || 500).json({ error: message });
});

app.listen(port, () => {
  console.log(`VTRAC Survey API listening on ${port}`);
});

async function ensureDatabase() {
  await query(`
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

    ALTER TABLE survey_projects ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES survey_projects(id);
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_data TEXT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_mime_type TEXT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS audio_size INT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_started_at TIMESTAMPTZ;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_ended_at TIMESTAMPTZ;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS survey_duration_seconds INT;
    ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS client_submission_id TEXT UNIQUE;

    CREATE INDEX IF NOT EXISTS idx_survey_responses_project ON survey_responses (project_id);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at ON survey_responses (submitted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_enumerator ON survey_responses (LOWER(enumerator_name));
    CREATE INDEX IF NOT EXISTS idx_survey_responses_location ON survey_responses (location);
    CREATE INDEX IF NOT EXISTS idx_survey_responses_answers ON survey_responses USING GIN (answers);
    CREATE INDEX IF NOT EXISTS idx_client_project_access_client ON client_project_access (client_id);
    CREATE INDEX IF NOT EXISTS idx_client_project_access_project ON client_project_access (project_id);
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
  await ensureDefaultClientAccount();
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

async function authenticateClient(username, password) {
  const result = await query(
    `SELECT *
    FROM client_accounts
    WHERE LOWER(username) = LOWER($1)
      AND is_active = TRUE
    LIMIT 1`,
    [String(username || '').trim()]
  );
  const client = result.rows[0];
  if (!client || !verifyPassword(password || '', client.password_hash)) return null;
  return { id: String(client.id), username: client.username, displayName: client.display_name };
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
    displayName: client.display_name,
    isActive: client.is_active,
    projectIds: access.rows
      .filter((row) => String(row.client_id) === String(client.id))
      .map((row) => String(row.project_id))
  }));
}

async function saveClient(payload) {
  const username = String(payload.username || '').trim();
  const displayName = String(payload.displayName || payload.username || '').trim();
  const password = String(payload.password || '');
  const projectIds = Array.isArray(payload.projectIds) ? payload.projectIds.map(String) : [];

  if (!username || !displayName) {
    const error = new Error('Client username and display name are required.');
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
        SET username = $1, display_name = $2, password_hash = $3, is_active = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING *`,
        [username, displayName, hashPassword(password), payload.isActive !== false, payload.id]
      )
      : await query(
        `UPDATE client_accounts
        SET username = $1, display_name = $2, is_active = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
        [username, displayName, payload.isActive !== false, payload.id]
      )
    : await query(
      `INSERT INTO client_accounts (username, display_name, password_hash, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [username, displayName, hashPassword(password), payload.isActive !== false]
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

  return (await loadClients()).find((item) => item.id === String(client.id));
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
    `SELECT *
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

function createToken(username, role, clientId = null) {
  const payload = {
    username,
    role,
    ...(clientId ? { clientId } : {}),
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
  if (!admin || admin.role !== 'admin') return res.status(401).json({ error: 'Admin login required.' });
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
  return {
    ...defaultProjectSettings,
    airportLocationMode: parsed.airportLocationMode === undefined ? slug === defaultProjectSlug : Boolean(parsed.airportLocationMode),
    captureGps: Boolean(parsed.captureGps),
    captureAudio: Boolean(parsed.captureAudio),
    showRespondentPhone: parsed.showRespondentPhone !== false,
    showHouseholdId: Boolean(parsed.showHouseholdId)
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
