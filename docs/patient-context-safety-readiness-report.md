# Patient Context Safety Readiness Report

Scope: patient context safety before pharmacy guidance.

## PASS

- Configurable patient context requirements exist in `patient_context_requirements`.
- Requirements are seeded by query type:
  - Dosage
  - Drug interactions
  - Contraindications
  - Side effects
  - Counselling points
  - Administration guidance
  - General medicine information
  - ICD-10
  - Medicine suitability
  - Unknown
- Supported patient context fields:
  - age
  - weight
  - gender
  - pregnancy status
  - breastfeeding status
  - allergies
  - chronic conditions
  - renal impairment
  - hepatic impairment
- Chat accepts structured `patientContext`.
- Chat refuses to generate guidance when required context is missing.
- Missing context returns follow-up questions instead of assuming values.
- Paediatric dosing can require age and weight.
- Pregnancy-sensitive queries can require pregnancy status.
- Renal dosing can require kidney function information.
- Hepatic-sensitive queries can require liver function information.
- Pharmacy Assistant and unknown/support-only roles receive `Pharmacist consultation may be required.` on missing-context follow-up.
- Context bypass attempts are audited when `contextBypass` is supplied and context is still incomplete.
- Context completion is audited when required fields are present.
- Context questions asked are audited.
- Admin endpoints exist to view and update context requirements:
  - `GET /api/admin/patient-context-requirements`
  - `PUT /api/admin/patient-context-requirements/:queryType`
- Validation test exists:
  - `npm --workspace server run test:patient-context`

## WARNING

- Query type detection still depends on the existing deterministic classifier and pattern rules. It is safety-biased but should be tuned with real pharmacy pilot questions.
- The API validates whether fields are present, not whether values are clinically plausible. Clinical plausibility checks can be added later.
- UI was intentionally not changed, so host applications must send `patientContext` when available.

## FAIL

- None.

## Verification

```bash
npm --workspace server run test:patient-context
```

Expected result:

```text
Patient context validation scenarios passed.
```
