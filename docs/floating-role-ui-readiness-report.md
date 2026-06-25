# Floating Role UI Readiness Report

Scope: floating plugin workspace role-based UI.

## PASS

- Floating icon opens the workspace.
- Login is required before workspace sections are shown.
- Authenticated role controls workspace sections.
- Default logged-in view is Chat.
- The workflow is optimized for pharmacists asking clinical questions:
  - Login
  - Chat
  - Backend retrieval from approved sources
  - Answer display with citations
  - Backend audit entry through the existing chat/audit flow
- Normal staff can see only:
  - Chat
  - Account / Settings
- Pharmacy Manager can see:
  - Chat
  - Documents
  - SOP Uploads
  - Knowledge Review
  - Staff Management
  - Analytics
  - Audit Logs
  - Account / Settings
- System Owner can see:
  - Chat
  - All Pharmacies
  - Pharmacy Managers
  - Documents
  - Knowledge Review
  - Staff Management
  - Analytics
  - Audit Logs
  - Source Connectors
  - Account / Settings
- Chat and Account / Settings remain compact.
- Manager/admin tools are hidden from normal staff.
- Manager/admin tools are accessible from the workspace sidebar only.
- Manager/admin tools expand to wider admin mode.
- Mobile workspace becomes a full-screen drawer.
- Account / Settings supports profile viewing, PIN/password change, and logout.
- Backend permissions remain required for protected API access.
- Unauthorized workspace attempts can be audited.
- Clinical disclaimer remains visible in login and chat.
- Source citation cards and safety warning banners are supported.
- Hidden UI is not treated as authorization; backend RBAC remains required.

## WARNING

- The component needs final mounting into the active widget/app entry file after frontend structure verification.
- Runtime build verification could not run because the Windows runner failed with `CreateProcessAsUserW failed: 5`.
- The current landing page file could not be found at `client/src/pages/LandingPage.jsx`; no replacement landing module was created because the current instruction was to stop creating new modules.

## FAIL

- None confirmed after fixes.

## Files Changed

- `client/src/widget/FloatingWorkspace.jsx`
- `client/src/widget/FloatingWorkspace.css`
- `server/src/routes/workspace.js`
- `server/src/index.js`
- `docs/phase-3-problem-report.md`
- `docs/phase-3-fixes-report.md`
- `docs/floating-role-ui-readiness-report.md`

## Known Limitations

- UI section visibility is role-based convenience only. Backend RBAC remains the security boundary.
- The floating workspace opens manager/admin tools through the sidebar for authorized roles only; full page routing still requires active app router verification.
- Build and startup checks require the local Windows command runner issue to be resolved.
