# VTRAC Survey Portal v1

Lightweight survey collection MVP for pilot data collection.

## Phase 1 Scope

- Public survey link with no login
- Enumerator name and survey location
- Automatic server-side submitted date/time
- Optional GPS capture from the mobile browser
- Fixed pilot survey questions
- Admin dashboard with totals, charts, recent submissions, search, and filters
- CSV and Excel exports
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

Create the database:

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
- API health: `http://localhost:8081/api/health`

