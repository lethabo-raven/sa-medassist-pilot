# Clinical Safety Readiness Report

Scope: patient safety and citation integrity only.

## PASS

- Safety response layer validates source approval status before returning answers.
- Safety response layer validates active source version before returning answers.
- Retrieval excludes expired sources.
- Expired sources cannot be cited.
- Expired sources cannot be approved or indexed.
- Retrieval confidence threshold is enforced before generation.
- Citation metadata completeness is enforced before returning answers.
- Citations must include:
  - source name
  - source version
  - approval date
  - document identifier
  - citation reference
  - approval status
- Answers with incomplete citation metadata are refused.
- Clinical escalation detection covers:
  - pregnancy
  - breastfeeding
  - paediatric dosing
  - renal impairment
  - hepatic impairment
  - overdose
  - poisoning
  - emergency symptoms
- Escalated answers include: `Clinical review recommended.`
- High-risk medicine detection is configurable through `HIGH_RISK_MEDICINE_TERMS`.
- Default high-risk medicine terms include anticoagulants, insulin, chemotherapy medicines, opioids, antiepileptics, and immunosuppressants.
- High-risk medicine answers include: `Clinical review recommended.`
- Safety analytics track:
  - escalated answers
  - refused answers
  - expired source attempts
  - high-risk medicine queries
- Safety analytics are available through `GET /api/admin/metrics/safety`.
- Clinical safety validation scenarios exist in `server/src/tests/clinicalSafety.test.js`.

## WARNING

- Escalation detection is deterministic and keyword-based for pilot safety. It should be reviewed with clinical stakeholders before production use.
- High-risk medicine matching uses configurable terms, not a complete medicines ontology.
- Source expiry dates are optional. Operators must set them for sources that require freshness governance.
- The local model may omit required citation fields; the API will refuse those answers by design.

## FAIL

- None.

## Verification

Run:

```bash
npm --workspace server run test:clinical-safety
```

Expected result:

```text
Clinical safety validation scenarios passed.
```
