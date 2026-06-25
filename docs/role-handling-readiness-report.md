# Chatbot Role Handling Readiness Report

Scope: embedded plugin role handling and safety behaviour.

## PASS

- Embedded widget asks the user to select a role on first use.
- Supported role choices are Pharmacist, Pharmacist Assistant, Pharmacy Manager, Doctor, and Other.
- Selected role is stored in browser session storage.
- If no role is selected, the backend defaults to Pharmacy Assistant safety mode.
- Role is sent with each widget chat request.
- Pharmacist and Doctor roles receive clinical decision-support wording.
- Pharmacy Assistant and Other roles receive support-only wording.
- Pharmacy Manager receives operational/admin wording without clinical authority.
- Pharmacy Assistant and unknown/defaulted role queries trigger `Pharmacist consultation required.` for pregnancy, breastfeeding, paediatrics, renal/hepatic impairment, interactions, contraindications, scheduled/controlled medicines, high-risk medicines, ICD-10 uncertainty, and emergency symptoms.
- Role selected events are audited as `chat.role_selected`.
- Missing/defaulted roles are audited as `chat.role_defaulted`.
- Pharmacist consultation triggers are audited as `chat.pharmacist_consultation_triggered`.

## WARNING

- The widget stores role for the browser session only. This is appropriate for an embeddable plugin, but server-side identity should be used where the host site can provide it.
- If a user chooses an incorrect role, the backend can only apply safety rules based on the supplied/defaulted role.

## FAIL

- None.
