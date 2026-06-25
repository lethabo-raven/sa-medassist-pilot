# Role Matrix

## Roles

| Role | Purpose |
|---|---|
| Super Admin | Full operational and governance access. |
| Pharmacy Manager | Upload documents, view approved sources, audits, and reports. Cannot approve or reject sources. |
| Pharmacist | Query assistant, view citations, view source details, and view own answer history. |
| Pharmacy Assistant | Query assistant and view citations only. |

## Permission Matrix

| Permission | Super Admin | Pharmacy Manager | Pharmacist | Pharmacy Assistant |
|---|---:|---:|---:|---:|
| `users.manage` | Yes | No | No | No |
| `sources.view_approved` | Yes | Yes | No | No |
| `sources.upload` | Yes | Yes | No | No |
| `sources.approve` | Yes | No | No | No |
| `sources.reject` | Yes | No | No | No |
| `sources.replace` | Yes | Yes | No | No |
| `sources.archive` | Yes | No | No | No |
| `sources.configure_ingestion` | Yes | No | No | No |
| `audits.view` | Yes | Yes | No | No |
| `reports.view` | Yes | Yes | No | No |
| `assistant.query` | Yes | No | Yes | Yes |
| `citations.view` | Yes | No | Yes | Yes |
| `source_details.view` | Yes | No | Yes | No |
| `answer_history.view` | Yes | No | Yes | No |
| `answers.feedback` | Yes | No | Yes | No |
| `review_queue.view` | Yes | Yes | No | No |
| `review_queue.manage` | Yes | Yes | No | No |

## Enforcement

- `x-user-id` identifies the acting user.
- Admin routes also require `x-admin-token`.
- Middleware resolves the user's database roles and permissions.
- Unauthorized requests are denied and written to audit logs as `access.unauthorized`.
- The seeded default user is `system:super-admin` with the `super_admin` role.
