# Pharmacy Assistant Safety Readiness Report

Scope: pharmacist assistant safety, escalation, scheduling caution, and ICD-10 support.

## PASS

- Pharmacy Assistant and unknown roles use support-only safety mode.
- Pharmacy Assistant responses include the required footer disclaimer.
- Pharmacy Assistant and Other roles receive `Pharmacist consultation required.` when consultation triggers are detected.
- Consultation triggers include pregnancy, breastfeeding, paediatric dosing, renal impairment, hepatic impairment, overdose, poisoning, emergency symptoms, interactions, contraindications, scheduled/controlled medicines, high-risk medicines, unclear diagnosis, and ICD-10 uncertainty.
- Pharmacist and Doctor roles receive clinical decision-support caution wording.
- Pharmacy Manager role receives operational wording and no clinical authority.
- Scheduled/controlled medicine terms are configurable through `SCHEDULED_MEDICINE_TERMS`.
- Scheduled/controlled medicine triggers are audited.
- High-risk medicine triggers remain configurable through `HIGH_RISK_MEDICINE_TERMS`.
- ICD-10 records can be stored with code, description, source document, source version, approval status, effective date, and optional expiry date.
- ICD-10 lookup only uses active approved non-expired source documents.
- ICD-10 uncertainty is audited and triggers pharmacist consultation for support-only roles.
- Medical aid disclaimer is appended and audited.
- Audit logs capture pharmacist consultation required, scheduled medicine trigger, ICD-10 lookup, ICD-10 uncertainty, and medical aid disclaimer shown.

## WARNING

- Scheduled/controlled medicine detection is term-based and should be aligned to South African scheduling data before production.
- ICD-10 matching is approved-source constrained but text-search based; uncertain results are deliberately not presented as final coding decisions.
- Pharmacy Assistant safety mode depends on the selected or defaulted chatbot role; production identity should still come from a trusted auth layer where available.

## FAIL

- None.

## Verification

```bash
npm --workspace server run test:assistant-role-safety
```

Expected result:

```text
Assistant role safety validation scenarios passed.
```
