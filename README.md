# Gantt — Project Management

Standalone enterprise Project Management app. Server-authoritative CPM scheduling, Gantt as a
pure view, HRIS-backed people directory behind an adapter. Owns schema `pm` in database `CORP_DB`.

## Structure

- `docs/` — authoritative design docs. See [docs/](docs/):
  - [architecture.md](docs/architecture.md) — layers, API map, ADRs.
  - [scheduling-engine.md](docs/scheduling-engine.md) — CPM + calendar math.
  - [gantt-engine.md](docs/gantt-engine.md) — Gantt view contract and interaction.
  - [employee-integration.md](docs/employee-integration.md) — HRIS boundary.
  - [database-design.md](docs/database-design.md) — `pm` schema, migrations.
  - [design-system.md](docs/design-system.md) — tokens and components.
  - [STATUS.md](docs/STATUS.md) — milestone ledger and tech debt.
- `backend/` — Node + Express + TypeScript API, SQL Server via `mssql`.
- `frontend/` — React + Vite + Tailwind SPA.

## Backend setup

```powershell
cd backend
copy .env.example .env     # fill DB_SERVER, DB_USER, DB_PASSWORD, JWT_SECRET
npm install
npm run migrate            # applies sql/*.sql in order
npm run dev                # tsx watch src/server.ts (port 4000)
npm test                   # vitest run (no live DB required)
```

Health: `GET /health` (liveness), `GET /readyz` (503 until the DB pool responds).

## Frontend setup

```powershell
cd frontend
npm install
npm run dev                # Vite on http://localhost:5174
```

Vite dev server proxies `/api` to the backend at `http://localhost:4000`.

## HRIS integration boundary

The people directory comes from HRIS (HRIS_PORTAL, DB `CORP_DB`, table `dbo.hris_worker`). Access is
**read-only** and goes through the `EmployeeProvider` adapter only — no service queries HRIS
directly, and the `pm` schema holds **no foreign key** to `hris_worker`. See
[docs/employee-integration.md](docs/employee-integration.md).
