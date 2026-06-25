# ICD-10 Medical Aid Readiness Report

Scope: ICD-10 master reference, medical aid rule mapping, medicine-to-ICD10 mappings, and claim guidance guardrails.

## PASS

- ICD-10 master table exists with code, description, category/chapter, active flag, source document, source version, effective date, optional expiry date, and last updated timestamp.
- ICD-10 master entries can only be imported against active approved non-expired source documents.
- ICD-10 lookups use approved active non-expired sources only.
- ICD-10 wording avoids final claim instructions such as `Use ICD-10 code X`.
- ICD-10 answers use guarded wording: possible matches based on approved sources, confirm against prescription, diagnosis, and relevant medical aid rules before claim submission.
- Low-confidence ICD-10 lookups refuse certainty.
- Pharmacy Assistant and unknown/support-only roles receive pharmacist confirmation wording before ICD-10 claim guidance is used.
- Medical aid rule mapping table exists with medical aid name, plan/option, ICD-10 code, PMB flag, authorisation required flag, formulary notes, claim notes, source document, source version, last verified date, and active flag.
- Medical aid architecture supports adding GEMS first, then Discovery, Bonitas, Momentum, Medscheme, Fedhealth, Bestmed, and others without schema changes.
- Medicine-to-ICD10 relationship table exists with medicine name, optional medicine identifier, ICD-10 code, relationship type, confidence score, source document, source version, and active flag.
- Import-ready endpoints exist:
  - `POST /api/admin/imports/icd10-master`
  - `POST /api/admin/imports/medical-aid-rules`
  - `GET /api/admin/imports/medical-aid-rules`
  - `POST /api/admin/imports/medicine-icd10-mappings`
- Audit logging covers ICD-10 lookup, ICD-10 uncertainty, medical aid rule lookup, medical aid disclaimer shown, and pharmacist confirmation required.
- Validation test exists:
  - `npm --workspace server run test:medicine-risk-icd10`

## WARNING

- ICD-10 search is text-search based. Low-confidence results are deliberately not treated as final coding advice.
- Medical aid rule imports depend on approved source documents being uploaded and approved first.
- Formulary and benefit rules change frequently; `last_verified_date` must be maintained operationally.
- GEMS, Discovery, Bonitas, Momentum, Medscheme, Fedhealth, and Bestmed source files still need to be imported by operators.

## FAIL

- None.
