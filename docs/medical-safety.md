# Medical Safety Guardrails

This MVP is designed for verified medical-information retrieval, not diagnosis or treatment.

## Content requirements

- Only upload documents from verified South African or internationally recognized health authorities.
- Include authority and source URL metadata wherever possible.
- Archive superseded documents instead of deleting audit history.
- Re-run test questions after every document update.

## Answer requirements

- Every medical claim must have a citation.
- If no citation is available, the assistant must refuse.
- The assistant must not prescribe medication or dosage.
- Emergency symptoms must be escalated to urgent medical care.

## Suggested source authorities

- National Department of Health
- NICD
- SAHPRA
- HPCSA
- WHO
- Provincial health departments
