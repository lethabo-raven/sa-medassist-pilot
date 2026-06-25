# Source-Backed Rules Readiness Report

Scope: source-backed import architecture for allergy, interaction, medicine-risk, ICD-10, schedule, NAPPI, and medical-aid logic.

## PASS

- Medicine risk profiles now support source-backed metadata:
  - source document id
  - source name
  - source version
  - source page/section/reference
  - import date
  - approval status
  - reviewer
  - confidence score
  - active flag
- Allergy mapping rules now support the same source-backed metadata.
- Drug interaction rules now support the same source-backed metadata.
- ICD-10 master rules now support the same source-backed metadata.
- Medical aid ICD-10 rules now support the same source-backed metadata.
- Medicine-to-ICD10 mappings now support source-backed metadata.
- Medicine schedule table exists for imported scheduling rules.
- NAPPI mapping table exists for imported NAPPI data.
- Extracted rule review queue exists in `extracted_rule_reviews`.
- Extracted rules are inactive by default and require approval before activation.
- Review workflow supports extracted rule submission, listing, approval with edits, and rejection.
- Imported rules require active approved non-expired source documents.
- Unapproved imported rules are not used by allergy, interaction, medicine-risk, ICD-10, or medical aid lookups.
- Seed/demo rules are marked with `approval_status = 'seed_demo'` and `rule_origin = 'seed_demo'`.
- Seed/demo rule use is configurable through `ENABLE_DEMO_RULES`.
- Chatbot block/warning citations for allergy and interaction safety now include source metadata or an explicit seed/demo warning.
- Import-ready endpoints exist:
  - `POST /api/admin/imports/extracted-rules`
  - `GET /api/admin/imports/extracted-rules`
  - `POST /api/admin/imports/extracted-rules/:id/approve`
  - `POST /api/admin/imports/extracted-rules/:id/reject`
  - `POST /api/admin/imports/medicine-risk-profiles`
  - `POST /api/admin/imports/icd10-master`
  - `POST /api/admin/imports/medical-aid-rules`
  - `POST /api/admin/imports/medicine-icd10-mappings`
- Source-backed architecture validation test exists:
  - `npm --workspace server run test:source-backed-rules`

## WARNING

- Existing seeded demo rules remain available for pilot testing when `ENABLE_DEMO_RULES=true`. Set `ENABLE_DEMO_RULES=false` before production use.
- Extracted rule payload validation is generic at review intake. Rule-specific validation occurs when a rule is approved and activated.
- Existing seed data is not production verified and must be replaced by approved imported sources for production.
- Automated document extraction itself is not implemented here; the architecture accepts extracted rules for review and activation.

## FAIL

- None.

## Verification

```bash
npm --workspace server run test:source-backed-rules
```

Expected result:

```text
Source-backed rule validation scenarios passed.
```
