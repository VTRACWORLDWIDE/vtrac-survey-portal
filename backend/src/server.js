import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import { query } from './db.js';

const app = express();
const port = Number(process.env.PORT || 8081);

const surveyLocations = [
  'Kadiri',
  'Anantapur',
  'Hindupur',
  'Dharmavaram',
  'Gorantla',
  'Other'
];

const surveyQuestions = [
  { id: 'age_group', label: 'Age group', type: 'select', options: ['18-25', '26-35', '36-45', '46-60', '60+'], required: true },
  { id: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other', 'Prefer not to say'], required: true },
  { id: 'occupation', label: 'Primary occupation', type: 'text', required: false },
  { id: 'service_awareness', label: 'Are you aware of VTRAC services?', type: 'select', options: ['Yes', 'No'], required: true },
  { id: 'satisfaction', label: 'Overall satisfaction', type: 'select', options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'], required: true },
  { id: 'priority_need', label: 'Top priority need', type: 'select', options: ['Employment', 'Training', 'Health', 'Education', 'Finance', 'Other'], required: true },
  { id: 'comments', label: 'Additional comments', type: 'textarea', required: false }
];

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'vtrac-survey-portal' });
});

app.get('/api/survey-config', (_req, res) => {
  res.json({ locations: surveyLocations, questions: surveyQuestions });
});

app.post('/api/responses', async (req, res, next) => {
  try {
    const {
      enumeratorName,
      location,
      respondentName,
      respondentPhone,
      householdId,
      answers = {},
      gps
    } = req.body;

    if (!enumeratorName?.trim() || !location?.trim()) {
      return res.status(400).json({ error: 'Enumerator name and location are required.' });
    }

    const missingQuestion = surveyQuestions
      .filter((question) => question.required)
      .find((question) => String(answers[question.id] || '').trim() === '');

    if (missingQuestion) {
      return res.status(400).json({ error: `Missing required question: ${missingQuestion.label}` });
    }

    const result = await query(
      `INSERT INTO survey_responses (
        enumerator_name,
        location,
        respondent_name,
        respondent_phone,
        household_id,
        answers,
        latitude,
        longitude,
        gps_accuracy
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, submitted_at`,
      [
        enumeratorName.trim(),
        location.trim(),
        respondentName?.trim() || null,
        respondentPhone?.trim() || null,
        householdId?.trim() || null,
        answers,
        gps?.latitude ?? null,
        gps?.longitude ?? null,
        gps?.accuracy ?? null
      ]
    );

    res.status(201).json({ response: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard', async (req, res, next) => {
  try {
    const filters = buildFilters(req.query);
    const [totals, byDate, byEnumerator, byLocation, recent] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int AS total_samples,
          COUNT(*) FILTER (WHERE submitted_at::date = CURRENT_DATE)::int AS samples_today
        FROM survey_responses
        ${filters.where}`,
        filters.params
      ),
      query(
        `SELECT submitted_at::date AS date, COUNT(*)::int AS samples
        FROM survey_responses
        ${filters.where}
        GROUP BY submitted_at::date
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
        `SELECT id, enumerator_name, location, respondent_name, household_id, latitude, longitude, submitted_at
        FROM survey_responses
        ${filters.where}
        ORDER BY submitted_at DESC
        LIMIT 100`,
        filters.params
      )
    ]);

    res.json({
      totals: totals.rows[0],
      byDate: byDate.rows,
      byEnumerator: byEnumerator.rows,
      byLocation: byLocation.rows,
      recent: recent.rows
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/export.csv', async (req, res, next) => {
  try {
    const rows = await loadExportRows(req.query);
    const csv = stringify(rows.map(flattenResponse), { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

app.get('/api/responses/export.xlsx', async (req, res, next) => {
  try {
    const records = (await loadExportRows(req.query)).map(flattenResponse);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Survey Responses');
    sheet.columns = Object.keys(records[0] || defaultExportRow()).map((key) => ({
      header: key,
      key,
      width: Math.min(Math.max(key.length + 4, 14), 30)
    }));
    sheet.addRows(records);
    sheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vtrac-survey-responses.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(port, () => {
  console.log(`VTRAC Survey API listening on ${port}`);
});

function buildFilters(queryParams) {
  const conditions = [];
  const params = [];

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
    conditions.push(`submitted_at::date >= $${params.length}::date`);
  }

  if (queryParams.dateTo) {
    params.push(queryParams.dateTo);
    conditions.push(`submitted_at::date <= $${params.length}::date`);
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

async function loadExportRows(queryParams) {
  const filters = buildFilters(queryParams);
  const result = await query(
    `SELECT *
    FROM survey_responses
    ${filters.where}
    ORDER BY submitted_at DESC`,
    filters.params
  );
  return result.rows;
}

function flattenResponse(row) {
  const base = {
    id: row.id || '',
    submitted_at: row.submitted_at || '',
    enumerator_name: row.enumerator_name || '',
    location: row.location || '',
    respondent_name: row.respondent_name || '',
    respondent_phone: row.respondent_phone || '',
    household_id: row.household_id || '',
    latitude: row.latitude || '',
    longitude: row.longitude || '',
    gps_accuracy: row.gps_accuracy || ''
  };

  for (const question of surveyQuestions) {
    base[question.label] = row.answers?.[question.id] ?? '';
  }

  return base;
}

function defaultExportRow() {
  return flattenResponse({ answers: {} });
}

