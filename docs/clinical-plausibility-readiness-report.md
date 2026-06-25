# Clinical Plausibility Readiness Report

Scope: validation of patient context before it is used for pharmacy guidance.

## PASS

- Age is validated as realistic from 0 to 120 years.
- Weight is validated as realistic from 0.5kg to 350kg.
- Missing age is handled by the existing context requirements for dosage, paediatric, and suitability questions.
- Missing paediatric weight blocks guidance and asks for weight.
- Neonatal patients under 28 days are flagged as high risk.
- Clinically unusual age/weight combinations trigger pharmacist review.
- Pregnancy-sensitive questions require pregnancy status.
- Breastfeeding-sensitive questions require breastfeeding status.
- Unknown pregnancy status asks follow-up and requires pharmacist confirmation.
- Unknown breastfeeding status asks follow-up and requires pharmacist confirmation.
- Renal impairment accepts none, mild, moderate, severe, unknown, true, or false.
- Hepatic impairment accepts none, mild, moderate, severe, unknown, true, or false.
- Unknown renal impairment triggers caution wording.
- Unknown hepatic impairment triggers caution wording.
- Missing or implausible context prevents dosage or suitability guidance.
- Audit logging captures:
  - implausible patient context
  - neonatal high-risk flag
  - missing required context
  - pharmacist review required
- Validation tests cover:
  - invalid age
  - invalid weight
  - neonatal patient
  - missing paediatric weight
  - pregnancy unknown
  - renal impairment unknown

## WARNING

- Plausibility checks are conservative and rule-based. They prevent unsafe assumptions but do not replace pharmacist judgement.
- Values are checked for ranges and required presence, not full clinical appropriateness for every condition.
- Age is interpreted in years. Neonatal detection expects fractional years when age is supplied numerically.

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
