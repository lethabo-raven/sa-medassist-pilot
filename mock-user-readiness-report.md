# Mock User Readiness Report

Scope: Axian local pilot demo users only.

## PASS

- Added guarded demo seed script:
  - `server/src/db/seeds/demoUsers.js`
- Added npm script:
  - `npm run seed:demo-users`
- Seed script refuses to run unless:
  - `DEMO_MODE=true`
- Demo pharmacy is configured as:
  - Code: `DEMO-PHARMACY`
  - Name: `Demo Pharmacy`
- Demo users are configured as:
  - Pharmacist Assistant: `PA001` / `123456` / `pharmacist_assistant`
  - Pharmacist: `PH001` / `123456` / `pharmacist`
  - Pharmacy Manager: `PM001` / `123456` / `pharmacy_manager`
- PINs are hashed through the existing authentication helper.
- No Ollama installation was performed.
- No model files were installed or downloaded.
- No UI design changes were made.
- Clinical safety logic was not changed.

## WARNING

- The local seed command could not be executed because the Windows runner failed with `CreateProcessAsUserW failed: 5`.
- The `pharmacist_assistant` role must be mapped to normal staff chat permissions in RBAC for that demo user to access Chat and Account. The RBAC file structure did not match the expected patch context, so no RBAC edit was forced.
- Database constraints must support upsert on `(pharmacy_id, employee_number)` for the employee seed to be idempotent.

## FAIL

- Runtime login verification is not complete because the seed command could not run in this environment.

## Setup

PowerShell:

```powershell
$env:DEMO_MODE="true"
cd server
npm run seed:demo-users
```

Bash:

```bash
DEMO_MODE=true npm --prefix server run seed:demo-users
```

## Test Logins

- Pharmacy Code: `DEMO-PHARMACY`
- Pharmacist Assistant: `PA001` / `123456`
- Pharmacist: `PH001` / `123456`
- Pharmacy Manager: `PM001` / `123456`

