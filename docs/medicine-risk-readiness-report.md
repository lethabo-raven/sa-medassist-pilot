# Medicine Risk Readiness Report

Scope: medicine risk profiles, emergency red flags, and safety escalation.

## PASS

- Configurable `medicine_risk_profiles` table exists.
- Each profile stores medicine name, aliases, risk category, escalation reason, related safety trigger, active flag, source reference, and last reviewed date.
- Supported risk categories include:
  - pregnancy risk
  - breastfeeding caution
  - high-risk medicine
  - scheduled/controlled medicine
  - interaction risk
  - monitoring required
  - pharmacist review required
- Medicine risk profile matches create safety escalation through `chat.medicine_risk_escalation`.
- Pharmacy Assistant and unknown/support-only roles receive `Pharmacist consultation required.` when a risk profile is matched.
- Emergency red-flag detection covers chest pain, shortness of breath, stroke symptoms, severe allergic reaction, anaphylaxis, overdose, poisoning, suicidal thoughts, severe bleeding, loss of consciousness, and seizures.
- Emergency red flags stop normal answer generation.
- Emergency red flags return `Immediate medical assessment required.`
- Emergency red flags are audited as `chat.emergency_red_flag_escalation`.
- Safety analytics include emergency red flags and medicine risk escalations.
- Import-ready endpoint exists for medicine risk profiles:
  - `POST /api/admin/imports/medicine-risk-profiles`
- Validation test exists:
  - `npm --workspace server run test:medicine-risk-icd10`

## WARNING

- Medicine risk matching is term/alias based. Production use should import a reviewed medicines vocabulary and scheduling source.
- Risk profile source references are textual. For stricter governance, source references should be linked to approved source document IDs in a later iteration.
- Emergency red-flag detection is deterministic and safety-biased; it may over-escalate ambiguous wording.

## FAIL

- None.
