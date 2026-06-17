# VTRAC Survey Portal v1 Implementation Plan

## Day 1

1. Apply `db/schema.sql` to PostgreSQL.
2. Configure backend `.env` with `DATABASE_URL`, `PORT`, and `CORS_ORIGIN`.
3. Install backend dependencies and start the Express API.
4. Install frontend dependencies and start Vite.
5. Update fixed pilot locations and survey questions in `backend/src/server.js`.
6. Test survey submission from desktop and mobile browser.
7. Confirm optional GPS capture on a mobile browser.

## Day 2

1. Validate dashboard totals against database rows.
2. Test filters: search, enumerator, location, date range.
3. Download CSV and Excel exports and verify columns.
4. Deploy backend and frontend on a Google Cloud VM.
5. Configure firewall, public IP, and domain if available.
6. Run pilot dry test with 3-5 sample submissions.
7. Share survey URL and admin URL with pilot users.

## Backend API

- `GET /api/health`
- `GET /api/survey-config`
- `POST /api/responses`
- `GET /api/dashboard`
- `GET /api/responses/export.csv`
- `GET /api/responses/export.xlsx`

## Frontend Pages

- `/` public survey form
- `/admin` admin dashboard

## Dashboard Design

- Metric cards for total samples, samples today, enumerator count, and location count
- Breakdown bars for samples by date, enumerator, and location
- Recent submissions table
- Search and filters
- CSV and Excel export buttons

