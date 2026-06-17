# VTRAC Survey Portal v1

Lightweight survey collection MVP for pilot data collection.

## Phase 1 Scope

- Public survey link with no login
- One admin login for project setup and downloads
- Client logins for read-only collection metrics, with project-level access assignment
- Admin can create projects and design survey forms
- Enumerator name and survey location
- Automatic server-side submitted date/time
- Optional GPS capture from the mobile browser
- Fixed pilot survey questions
- Admin dashboard with totals, charts, recent submissions, search, and filters
- Project-specific CSV and Excel exports
- PostgreSQL persistence
- React frontend and Node.js/Express backend
- Mobile responsive UI

Not included in Phase 1: login, roles, offline sync, Android/iOS apps, survey builder, photo/video uploads, approval workflow, or complex skip logic.

## Structure

```text
vtrac-survey-portal/
  backend/
    src/
      db.js
      server.js
    .env.example
    package.json
  frontend/
    src/
      App.jsx
      main.jsx
      styles.css
    index.html
    package.json
    vite.config.js
  db/
    schema.sql
  docs/
    deployment-guide.md
    implementation-plan.md
```

## Local Setup

Create the database with Docker:

```bash
docker compose up -d postgres
```

Or create it with a local PostgreSQL install:

```bash
createdb vtrac_survey
psql vtrac_survey < db/schema.sql
```

Start the backend:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Local URLs:

- Survey form: `http://localhost:5173/`
- Admin dashboard: `http://localhost:5173/admin`
- Client dashboard: `http://localhost:5173/client`
- API health: `http://localhost:8081/api/health`

Default local admin login:

- Username: `admin`
- Password: `admin123`

Change `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN_SECRET` in `backend/.env` before deploying.
Change `CLIENT_USERNAME` and `CLIENT_PASSWORD` before sharing the client dashboard.
Additional client IDs and project access can be managed from the admin dashboard.

Project survey links use `/p/{project-slug}`. Example: `http://localhost:5173/p/pilot-survey`.
