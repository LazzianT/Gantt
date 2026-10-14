# Status

Project state ledger. Last updated: 2026-10-14.

## Milestones

| # | Milestone | State |
|---|-----------|-------|
| M1 | Discovery | ✔ |
| M2 | Architecture | ✔ |
| M3 | Database | ✔ |
| M4 | Employee integration | ✔ |
| M5 | Backend APIs | ✔ |
| M6 | Scheduling engine | ✔ |
| M7 | Workspace UI | ✔ |
| M8 | Gantt | ✔ |
| M9 | Resources / Workload | ✔ |
| M10 | Dashboard (Overview + portfolio) | ✔ |
| M11 | QA | in progress |
| M12 | Simulated login (NIP + DOB) | ✔ |

## What exists

### Backend

Express + TypeScript API over SQL Server. Modules under `backend/src/modules/`:

`auth`, `projects`, `tasks` (WBS), `dependencies`, `scheduling` (CPM + calendar),
`resources` (workload), `activity`, `milestones`, `progress`, `baselines`, `dashboard`,
`evidence`, `reports`, `employees` (HRIS adapter).

- 201 passing vitest tests.
- 17 SQL migrations under `backend/sql/` (`001`..`017`, forward-only, idempotent).

### Frontend

React + Vite + Tailwind. Features under `frontend/src/features/`:

- `auth` — login by NIP + Tanggal Lahir (HRIS-backed JWT); dev-only demo fallback.
- `portfolio` — project list.
- `workspace` — tabs: overview, task grid, gantt (+ interactions), resources/workload,
  team, milestones, baseline, reports, plus the manager finish-date approval panel.
- `tasks` — My Tasks checklist with completion date and evidence capture.

Frontend now has a test setup: Vitest + Testing Library (jsdom, `frontend/src/test/setup.ts`), 17 tests.

## Verification

```
backend:  npm run typecheck && npm test   # 201 pass
frontend: npm run typecheck && npm test   # 17 pass (vitest + testing-library)
frontend: npm run build                   # pass
```

Auth: NIP + Tanggal Lahir validated against read-only HRIS via `EmployeeProvider`; JWT `{sub,name,role}`. Session token in `localStorage` ("Remember me") or `sessionStorage`; `getToken` reads both, logout clears both. Demo fallback (`AUTH_DEMO_ENABLED`, default NIP `1234` / DOB `1990-01-01` -> admin) is **demo only**, used only when HRIS is unreachable, and fails closed in production. No refresh token; JWT is decoded client-side for display only (server re-validates). See `authentication.md`.

## Known issues / tech debt

- No DB integration tests — unit tests use fakes / fake-exec only.
- No transaction wrapper around multi-write flows.
- `dependencies`, `milestones`, `progress`, `activity` return raw `snake_case` rows —
  latent DTO drift.
- Gantt time axis assumes the default Mon–Fri calendar; no calendar endpoint yet.
- Reports tab provides schedule variance, delay analysis, evidence/approval audit, and
  browser print/PDF; it has no persisted report definition or scheduled export yet.
- No CI workflow; typecheck and tests are run locally.
- Doc-vs-schema naming drift partially unresolved.

## Architecture decisions

- Standalone app, owns schema `pm` in database `CORP_DB`.
- Server-authoritative scheduling; scheduling engine pure (no I/O).
- Gantt is a pure view over API data, not a scheduling source.
- HRIS (`dbo.hris_worker`) read-only, accessed only via `EmployeeProvider` adapter;
  no FK to HRIS.
- Layered modules: routes → controllers → services → repositories → db.
- JWT auth; zod request validation; `{ data }` / `{ error }` response envelope.
- Forward-only migrations.

## Next steps (priority order)

1. Calendar endpoint + Gantt axis binding.
2. Transaction wrapper + DTO normalization for remaining raw endpoints.
3. Integration / e2e tests against a real SQL Server.
4. CI workflow running typecheck, tests, and build.
5. Portfolio create-project UI.
6. Directory view (HRIS-backed people browse).
