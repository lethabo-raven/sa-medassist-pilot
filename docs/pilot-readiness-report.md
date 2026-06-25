# Pharmacy Pilot Workflow Readiness Report

Scope: pharmacy operations and pilot measurement only.

## PASS

- Dashboard endpoint exists at `GET /api/admin/metrics/dashboard`.
- Dashboard reports:
  - total questions
  - questions today
  - refused questions
  - most searched medicines
  - most referenced documents
  - active users
- Query classification is implemented and stored on audit rows.
- Supported classifications:
  - Dosage
  - Drug interactions
  - Contraindications
  - Side effects
  - Counselling points
  - Administration guidance
  - General medicine information
  - Unknown
- Feedback endpoint exists at `POST /api/feedback`.
- Pharmacists can mark answers as:
  - helpful
  - not_helpful
  - needs_review
- Feedback is stored in `answer_feedback`.
- `needs_review` feedback creates a review queue item.
- Review queue exists at `GET /api/review-queue`.
- Review queue includes:
  - refused answers
  - conflicting source answers
  - user flagged answers
- Review queue status can be updated through `PATCH /api/review-queue/:id`.
- Analytics endpoint exists at `GET /api/admin/metrics/analytics`.
- Analytics include:
  - top medicines searched
  - top failed searches
  - top cited sources
  - retrieval confidence distribution
  - query classification counts
- Pharmacy workflow permissions were added to RBAC.
- Review queue access is restricted to Super Admin and Pharmacy Manager.
- Answer feedback is restricted to Super Admin and Pharmacist.

## WARNING

- Medicine extraction uses the starter medicine dictionary already present in the pilot metrics route. This should be expanded with an approved medicines terminology list for production.
- Query classification is deterministic and keyword-based for pilot measurement. It is suitable for operational dashboards, not clinical triage.
- UI was intentionally not changed; these endpoints are ready for integration by the existing/admin interface later.
- Review queue entries are created from backend outcomes and pharmacist feedback, but operational SOPs must define who reviews and resolves items.

## FAIL

- None.

## API Summary

```text
GET  /api/admin/metrics/dashboard
GET  /api/admin/metrics/analytics
POST /api/feedback
GET  /api/review-queue
PATCH /api/review-queue/:id
```
