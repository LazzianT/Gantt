# ZodGantt

Modern project management workspace for planning, scheduling, tracking, and reporting delivery work.

ZodGantt combines a server-authoritative CPM scheduler with an interactive Gantt view, PIC-owned tasks, evidence capture, manager approval, and project reports.

## Highlights

- Interactive Gantt timeline with WBS hierarchy, working days, critical path, baseline overlay, zoom, and today marker
- Project dashboard with progress, overdue work, milestones, activity, and project health
- My Tasks view scoped to the logged-in PIC
- Completion workflow with actual finish date and optional note/file evidence
- Manager approval workflow for submitted actual finish dates
- Reports for schedule variance, delay analysis, and evidence/approval audit
- Browser print/PDF support for project reports
- HRIS-backed employee directory boundary

## Screenshots

### Dashboard

![Dashboard](screenshots/dashboard.png)

### Gantt scheduling

![Gantt](screenshots/gantt.png)

### My Tasks

![My Tasks](screenshots/my-tasks.png)

### Project reports

![Project Reports](screenshots/project-reports.png)

## Architecture

```text
frontend/  React + Vite + TypeScript + Tailwind
backend/   Node.js + Express + TypeScript + SQL Server
           server-authoritative scheduling and REST API
backend/sql/ forward-only SQL Server migrations
```

The frontend treats the Gantt as a view over server-calculated schedule data. Task mutations are sent to the API, persisted, recalculated, and rendered again from the server response.

## Local setup

### Backend

```powershell
cd backend
copy .env.example .env
npm install
npm run migrate
npm run dev
```

Fill `DB_SERVER`, `DB_USER`, `DB_PASSWORD`, and `JWT_SECRET` in `.env`.

### Frontend

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Set `VITE_APP_NAME=ZodGantt` and leave `VITE_API_BASE_URL` empty when using the Vite proxy. The frontend runs on `http://localhost:5174`; the API runs on port `4000`.

## Validation

```powershell
npm run typecheck
npm test
npm run build
```

## Project structure

- `frontend/` - React application and product UI
- `backend/` - Express API, business logic, authorization, and database access
- `backend/sql/` - database migrations
- `docs/` - architecture, scheduling, database, and design documentation
- `screenshots/` - product showcase captures

## Status

Active development. The core project workspace, Gantt scheduling, task completion/evidence workflow, manager approval, and project reporting are implemented.
