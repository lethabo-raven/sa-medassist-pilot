# Axian Auth/RBAC Readiness Report

Scope: authentication, session handling, demo user seeding, and role-based navigation only.

## PASS

- Central frontend role/navigation map added at:
  - `client/src/auth/rolePermissions.js`
- Floating workspace now renders navigation sections from the central role map.
- Sidebar visibility is based on authenticated role/profile data, not local ad hoc section lists.
- Normal staff role map:
  - `pharmacist_assistant`: Chat, Account
  - `pharmacist`: Chat, Account
  - `pharmacy_assistant`: Chat, Account
- Manager role map:
  - `pharmacy_manager`: Chat, Account, Admin, Documents, Analytics, User Management
- Existing `POST /api/auth/login` endpoint remains the login endpoint.
- Existing `GET /api/workspace/me` endpoint is used to reload the authenticated user after refresh.
- After successful login:
  - session token is stored
  - profile is stored
  - Chat remains the default selected section
  - chat input focus is requested
- Logout clears:
  - `sessionStorage.saMedassistToken`
  - `sessionStorage.saMedassistProfile`
  - `localStorage.saMedassistToken`
  - `localStorage.saMedassistProfile`
- Demo seed script exists and is guarded by `DEMO_MODE=true`.
- Demo users are marked demo-only.
- No Ollama installation was performed.
- No AI model files were downloaded.
- No UI redesign was performed.
- No backend clinical safety, retrieval, citation, ingestion, audit, allergy, interaction, patient-context, or clinical escalation logic was changed.

## WARNING

- Runtime verification could not be completed because the Windows runner still fails with:
  - `CreateProcessAsUserW failed: 5`
- The seed command could not be executed in this environment.
- Browser login flows could not be manually verified in this environment.
- The backend RBAC file did not match the safe patch context for adding a separate `pharmacist_assistant` backend permission role.
- To keep the demo assistant login compatible with the likely existing backend staff permission role, PA001 is seeded with:
  - job title: `Pharmacist Assistant`
  - permission role: `pharmacy_assistant`
- The frontend role map supports `pharmacist_assistant`; if the backend later supports that exact role, the seed can be changed back safely.

## FAIL

- Manual browser verification is not complete.
- Demo users were not actually tested end-to-end because commands cannot run.

## Files Changed

- `client/src/auth/rolePermissions.js`
- `client/src/widget/FloatingWorkspace.jsx`
- `server/src/db/seeds/demoUsers.js`
- `server/package.json`
- `README.md`
- `mock-user-readiness-report.md`
- `axian-auth-rbac-readiness-report.md`

## Auth Endpoint Used

- Login:
  - `POST /api/auth/login`
- Reload authenticated user:
  - `GET /api/workspace/me`
- PIN/password change:
  - `POST /api/auth/reset-own-pin`

## Session Storage Method

- Token:
  - `sessionStorage.saMedassistToken`
  - fallback read from `localStorage.saMedassistToken`
- Profile:
  - `sessionStorage.saMedassistProfile`
  - fallback read from `localStorage.saMedassistProfile`
- Logout clears both storage locations.

## RBAC Map Location

- Frontend role/navigation map:
  - `client/src/auth/rolePermissions.js`

## Demo Users

Pharmacy:

- Code: `DEMO-PHARMACY`
- Name: `Demo Pharmacy`

Users:

- Pharmacist Assistant:
  - Employee Number: `PA001`
  - PIN: `123456`
  - Job Title: `Pharmacist Assistant`
  - Permission Role: `pharmacy_assistant`
- Pharmacist:
  - Employee Number: `PH001`
  - PIN: `123456`
  - Role: `pharmacist`
- Pharmacy Manager:
  - Employee Number: `PM001`
  - PIN: `123456`
  - Role: `pharmacy_manager`

## Manual Verification Results

- Login as PA001: NOT VERIFIED
- Confirm PA001 only sees Chat and Account: NOT VERIFIED
- Logout PA001: NOT VERIFIED
- Login as PH001: NOT VERIFIED
- Confirm PH001 only sees Chat and Account: NOT VERIFIED
- Logout PH001: NOT VERIFIED
- Login as PM001: NOT VERIFIED
- Confirm PM001 sees manager/admin icons: NOT VERIFIED
- Refresh page and confirm session persists: NOT VERIFIED
- Logout clears session: NOT VERIFIED
- Invalid login shows clear error: NOT VERIFIED

## Remaining Blockers

- Local command execution must work before seeding, building, starting, and browser verification can be completed.
- Required commands:

```powershell
$env:DEMO_MODE="true"
cd server
npm run seed:demo-users
npm run dev
```

```powershell
cd client
npm run build
npm run dev
```

