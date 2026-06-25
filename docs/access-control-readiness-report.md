# Access-Control Readiness Report

Scope: role-based access control and operational governance only.

## PASS

- Database role mapping exists through `roles`, `permissions`, `role_permissions`, `app_users`, and `user_roles`.
- Default roles are seeded:
  - Super Admin
  - Pharmacy Manager
  - Pharmacist
  - Pharmacy Assistant
- Default permissions are seeded and mapped to the role matrix.
- Default Super Admin user is seeded as `system:super-admin`.
- Middleware resolves actors from `x-user-id`, `x-actor-id`, request body actor, or query actor.
- Middleware enforces permissions with `requirePermission`.
- Unauthorized RBAC failures are audited as `access.unauthorized`.
- Admin-token failures are audited as `access.unauthorized`.
- Assistant queries require `assistant.query` and `citations.view`.
- Source uploads require `sources.upload`.
- Source replacements require `sources.replace`.
- Source approvals require `sources.approve`.
- Source rejections require `sources.reject`.
- Source archival deletions require `sources.archive`.
- Approved source listing requires `sources.view_approved`.
- Source detail viewing requires `source_details.view`.
- Audit viewing requires `audits.view`.
- Reporting requires `reports.view`.
- User management requires `users.manage`.
- Ingestion configuration requires `sources.configure_ingestion`.
- Answer feedback requires `answers.feedback`.
- Review queue viewing requires `review_queue.view`.
- Review queue management requires `review_queue.manage`.
- Super Admin has full access.
- Pharmacy Manager can upload documents, replace source versions, view approved sources, audits, reports, and manage the review queue, but cannot approve or reject sources.
- Pharmacist can query, view citations, view active approved source details, view own answer history, and submit answer feedback.
- Pharmacy Assistant can query and view citations only.
- Role matrix documentation exists in `docs/role-matrix.md`.

## WARNING

- This MVP uses header-based user identity (`x-user-id`). Production should place this behind a trusted authentication layer or signed identity provider.
- The existing admin token remains as an additional guard on admin routes. Operators must keep it secret and rotate it if exposed.
- UI controls were intentionally not updated; unauthorized backend actions are still blocked and audited.
- Existing users must be created or mapped to roles before they can use protected endpoints.

## FAIL

- None.

## Verification Queries

```sql
SELECT r.name AS role, p.key AS permission
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
ORDER BY r.name, p.key;
```

```sql
SELECT event_type, actor, metadata, created_at
FROM audit_logs
WHERE event_type = 'access.unauthorized'
ORDER BY created_at DESC
LIMIT 20;
```
