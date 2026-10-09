# Authentication

Login is **NIP + Tanggal Lahir (date of birth)**, validated against the read-only HRIS directory. On success the API issues a JWT. No password is stored or checked by this app.

> Demo credentials below are **DEMO ONLY**. They are not production authentication. See [Production hardening checklist](#7-production-hardening-checklist).

---

## 1. Login flow

```
Client  ──POST /auth/login {nip, birthDate}──▶  API
                                                 │
                                                 ▼
                                    EmployeeProvider.getEmployee(nip)
                                                 │
                                                 ▼
                                    CORP_DB.dbo.hris_worker  (READ ONLY)
                                                 │
                        active?  &  BirthDate (date-only) === birthDate?
                                         │                │
                                        no               yes
                                         ▼                ▼
                                   401 Unauthorized   sign JWT {sub, name, role}
```

1. Client sends `POST /auth/login` with `{ nip, birthDate }` (`birthDate` = `YYYY-MM-DD`).
2. API normalizes the date to date-only and calls `EmployeeProvider.getEmployee(nip)`.
3. Adapter runs the HRIS `byNip` SELECT against `CORP_DB.dbo.hris_worker` (plus `hris_cost_center`, career/job joins). Read-only.
4. Login succeeds only when the employee exists, is active (`is_Active = '1'`), and the HRIS `BirthDate` matches the supplied date (date-only compare; time component ignored).
5. Anything else returns `401`.

Failure message is uniform (`Invalid NIP or date of birth.`) so the response does not reveal which factor failed.

### Provider boundary

Auth depends on the `EmployeeProvider` interface, never on HRIS SQL directly. `HrisEmployeeAdapter` is the only implementation that touches HRIS.

| Call | Purpose |
|------|---------|
| `getEmployee(nip)` | Single employee by full NIP; used by login. |
| `searchEmployees(keyword, limit?)` | Directory search. |
| `getActiveEmployees(page?, pageSize?)` | Active list, paginated. |
| `getEmployees(page?, pageSize?)` | Full list, paginated. |

`getEmployee` returns an `EmployeeDTO` or `null`, and caches results for the configured TTL (`HRIS_CACHE_TTL_SECONDS`). Active check reads `is_Active`; `birthDate` is normalized to `YYYY-MM-DD`.

---

## 2. JWT

Issued on successful login. Nothing else is persisted server-side.

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Secret | `JWT_SECRET` (env) |
| TTL | `JWT_EXPIRES_IN` (env, default `8h`) |
| Payload | `{ sub: nip, name, role }` |
| Transport | `Authorization: Bearer <token>` |

`sub` is the employee NIP. `name` is the HRIS display name. `role` is resolved server-side (see below).

Middleware (`requireAuth`) verifies signature + expiry and attaches `req.user`. Missing/invalid/expired → `401 {error}`. `requireRole(...)` enforces role guards on routes.

Legacy email/password login is not used by the current app. The `pm.app_users` table and the email/password code path are **reserved / unused** (see `database-design.md` §3.15).

---

## 3. Roles

Role is resolved from env allowlists at login time, in priority order:

1. NIP ∈ `AUTH_ADMIN_NIPS` → `admin`
2. NIP ∈ `AUTH_MANAGER_NIPS` → `manager`
3. otherwise → `member`

Both lists are comma-separated NIPs. Values set at login; changing the lists affects the next login, not existing tokens.

---

## 4. Demo credentials (DEMO ONLY)

The demo fallback lets login succeed when the **HRIS directory is unreachable** (the `getEmployee` call throws). It is not production auth.

| Field | Value |
|-------|-------|
| NIP | `1234` |
| Tanggal Lahir | `1990-01-01` |
| Name | `Demo Admin` |
| Role | `admin` |

Controlled by env:

| Var | Default | Notes |
|-----|---------|-------|
| `AUTH_DEMO_ENABLED` | `true` in dev, `false` in prod | Enables the fallback. |
| `DEMO_NIP` | `1234` | |
| `DEMO_BIRTHDATE` | `1990-01-01` | |
| `DEMO_NAME` | `Demo Admin` | |
| `DEMO_ROLE` | `admin` | Must be a valid role; falls back to `admin`. |

Ordering: the adapter is tried first. The demo session is granted **only** when the directory call fails **and** `AUTH_DEMO_ENABLED` is on **and** `(nip, birthDate)` match the demo values. When the directory responds, demo values are ignored and normal validation applies.

`DEMO_ROLE` is clamped to a valid role (`admin | manager | member | viewer`); an invalid value becomes `admin`.

---

## 5. Session

- `setToken(token, remember)`:
  - `remember = true` → `localStorage` (survives browser restart).
  - `remember = false` → `sessionStorage` (clears on tab close).
- `getToken()` reads `localStorage` first, then `sessionStorage`.
- `logout()` / `clearToken()` clears **both** storages.
- Keys: `pm_token`.

Client display uses the decoded token payload (`sub`, `name`, `role`). Decoding is for UI only — the server re-validates every request.

---

## 6. Limitations

- **JWT is not encrypted.** The payload is base64url and readable by anyone holding the token. It is decoded client-side for display only; authorization always depends on the server re-validating the signature and role.
- **No refresh token.** When the token expires, the user signs in again. No silent renewal.
- **Demo fallback grants `admin`.** Intended for dev when HRIS is down. Disabled in production: `env.ts` fails closed (throws on boot) if `AUTH_DEMO_ENABLED` is true while `NODE_ENV=production`.
- **Browser storage is not a security boundary.** Any script running on the page (e.g. through an XSS hole) can read the token from `localStorage`/`sessionStorage`. Treat stored tokens as bearer credentials.
- **No rate limiting** on `/auth/login` yet.
- **DOB is a low-entropy secret.** NIP + birth date is weak as a credential; it is accepted as an internal-tool convenience, not for high-assurance auth.

---

## 7. Production hardening checklist

- [ ] Disable the demo fallback (`AUTH_DEMO_ENABLED=false`; boot already refuses prod + enabled).
- [ ] Ensure real HRIS connectivity; monitor `503 Employee directory unavailable.` responses.
- [ ] Rate-limit `POST /auth/login` (per IP and per NIP).
- [ ] Consider httpOnly, `Secure`, `SameSite` cookie tokens instead of `localStorage`.
- [ ] Rotate `JWT_SECRET` on a schedule; keep it out of source and logs.
- [ ] Audit `AUTH_ADMIN_NIPS` / `AUTH_MANAGER_NIPS` allowlists regularly; remove leavers.
- [ ] Set a short `JWT_EXPIRES_IN` for shared machines (or add a refresh flow).

---

## 8. Environment variables

| Var | Used by | Notes |
|-----|---------|-------|
| `JWT_SECRET` | backend | HS256 signing key; required in production. |
| `JWT_EXPIRES_IN` | backend | Token TTL, e.g. `8h`. |
| `AUTH_ADMIN_NIPS` | backend | Comma-separated NIPs → role `admin`. |
| `AUTH_MANAGER_NIPS` | backend | Comma-separated NIPs → role `manager`. |
| `AUTH_DEMO_ENABLED` | backend | Demo fallback gate; must be false in prod. |
| `DEMO_NIP` / `DEMO_BIRTHDATE` / `DEMO_NAME` / `DEMO_ROLE` | backend | Demo credential values. |
| `HRIS_CACHE_TTL_SECONDS` | backend | Employee cache TTL. |

See `architecture.md` §11 for the full env table.
