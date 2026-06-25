# Pharmacy Authentication Readiness Report

Scope: backend and database support for pharmacy staff authentication, access management, tenant isolation, and role-driven chatbot safety behaviour.

## PASS

- System Owner role added with permissions for pharmacy creation, pharmacy suspension, pharmacy manager management, employee administration, PIN reset, and cross-pharmacy governance.
- Pharmacy account storage added with pharmacy code, pharmacy name, branch name, contact person, status, and created date.
- Employee account storage added with pharmacy ownership, employee number, job title, role mapping, status, hashed PIN/password, failed-login lockout fields, first-login reset requirement, and audit timestamps.
- Employee login implemented using pharmacy code, employee number, and 6-digit PIN/password.
- PIN/password storage uses salted `scrypt` hashes; plain text PINs are not stored.
- Failed login attempts are audited and lock employee accounts temporarily after repeated failures.
- Employee sessions are stored as hashed bearer tokens with expiry.
- Pharmacy Manager administration endpoints added for employee creation, employee updates, deactivation, job title assignment, role assignment, and PIN reset.
- Audit endpoints are tenant-scoped so Pharmacy Managers can view only their own pharmacy audit data.
- Authenticated employee role takes priority over plugin/session-selected role for chatbot safety handling.
- Public plugin fallback remains intact: unauthenticated users can select a role, and missing role defaults to Pharmacy Assistant safety mode.
- Core tenant fields added for users, documents, audit logs, feedback, and review queue records.
- Unauthorized actions continue through middleware permission checks and are auditable through the existing RBAC guard.
- Pharmacy authentication unit coverage added for PIN validation, hashing, role normalization, and authenticated-role precedence.

## WARNING

- A System Owner still signs in through the pharmacy employee model. For production, create a dedicated platform-owner bootstrap process or seed a platform pharmacy account for the owner tenant.
- Existing admin document-upload endpoints still use the legacy admin token gate. Pharmacy Manager document workflows should either use the new employee-session model directly or be split into pharmacy-scoped source-management endpoints before wider rollout.
- Tenant isolation is implemented at the main backend access points touched by this work, but full assurance requires running the automated tests and a route-by-route integration audit in the target environment.

## FAIL

- None identified in the implemented backend/database scope.

## Verification Notes

- The local Windows command runner is currently blocked by sandbox permission error `CreateProcessAsUserW failed: 5`, so tests could not be executed from this session.
- Required validation command once the runner/environment is available:

```bash
cd server
npm install
npm run test:pharmacy-auth
npm test
```

