# Allergy and Drug Interaction Safety Readiness Report

Scope: allergy registry, medicine-allergy risks, drug interaction detection, escalation, audit, and analytics.

## PASS

- Allergy reference tables exist:
  - `allergy_groups`
  - `allergy_terms`
  - `allergy_aliases`
- Seeded allergy groups include Penicillin, Sulphonamides, NSAIDs, Aspirin, Cephalosporins, Macrolides, Opioids, Local anaesthetics, Contrast agents, Food allergies, and Other.
- Allergy aliases and synonyms are supported.
- Patient allergy context supports `allergies: []`.
- Medicine-allergy risk table exists with medicine, allergy group, severity, warning, source reference, last reviewed date, and active flag.
- Allergy conflict detection checks patient allergies against mentioned medicines and seeded medicine-allergy risks.
- High or contraindicated allergy conflicts block normal answer generation.
- Blocked allergy conflicts return `Potential allergy conflict detected.`
- Pharmacy Assistant / support-only roles receive `Pharmacist review required before dispensing.`
- Drug interaction tables exist:
  - `medicine_interactions`
  - `interaction_references`
- Interaction severity supports minor, moderate, major, and contraindicated.
- Seeded high-risk interactions include warfarin + aspirin/NSAIDs, methotrexate + trimethoprim, lithium + ibuprofen, digoxin + clarithromycin, and insulin + prednisone.
- Contraindicated interactions block normal answer generation.
- Blocked contraindicated interactions return `Potentially unsafe medicine combination detected.`
- Major interactions add warning wording.
- Moderate interactions add caution wording.
- Audit logging captures allergy conflict, interaction detected, contraindicated interaction, pharmacist review required, and blocked recommendation.
- Safety analytics include allergy conflicts, interaction detections, contraindicated attempts, and pharmacist escalations.
- Validation test exists:
  - `npm --workspace server run test:allergy-interaction`

## WARNING

- Medicine and allergy matching is deterministic term/alias matching. Production should import a reviewed formulary and allergy ontology.
- Interaction seeds are intentionally small for pilot safety. They should be expanded before production.
- The test suite validates deterministic formatting and escalation behaviour. Full DB-backed detection requires running migrations and seeded data in PostgreSQL.

## FAIL

- None.

## Verification

```bash
npm --workspace server run test:allergy-interaction
```

Expected result:

```text
Allergy and interaction validation scenarios passed.
```
