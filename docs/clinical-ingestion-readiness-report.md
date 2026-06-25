# Clinical Ingestion Readiness Report

Scope: backend/database clinical knowledge ingestion architecture.

## PASS

- Document repository metadata supports:
  - title
  - source organization
  - version
  - publication date
  - expiry date
  - uploader
  - reviewer / approver
  - approval status
  - document category
  - file name
  - MIME type
  - file size
  - source URL
- Supported document categories:
  - ICD10
  - Medical Aid Rules
  - Medicine Schedules
  - Formularies
  - Clinical Guidelines
  - SOPs
  - Drug Interactions
  - Dispensing Rules
  - Pharmacy Operations
- Parser service supports:
  - PDF
  - DOCX
  - XLSX
  - CSV
  - plain text fallback
- Processing pipeline exists:
  - upload
  - parse
  - chunk
  - extract entities
  - create embeddings
  - store in pgvector-backed chunks
- Processing runs are tracked in `document_processing_runs`.
- Extracted entities are stored separately in `document_entities`.
- Extracted entities include:
  - document id
  - entity type
  - entity value
  - normalized value
  - page number
  - section heading
  - source text
  - confidence score
  - extraction timestamp
  - review status
  - active flag
- Entity extraction supports:
  - Medicines
  - NAPPI
  - ICD10
  - Medical Aid Names
  - Drug Interactions
  - Contraindications
  - Schedules
  - Dosages
  - Pregnancy Warnings
  - Breastfeeding Warnings
  - Renal Warnings
  - Hepatic Warnings
- Review workflow supports pending, approved, and rejected extracted entities.
- Only approved active entities from approved active non-expired documents are searchable.
- Vector chunks remain filtered by approved active non-expired documents.
- Chatbot retrieval order is now:
  1. Structured database lookup from approved extracted entities
  2. Vector search
  3. LLM answer generation
- Every structured citation is tied back to the source document, source version, page number, section heading, approval date, and source URL where present.
- Admin endpoints exist to inspect and approve/reject extracted entities:
  - `GET /api/admin/documents/:id/entities`
  - `POST /api/admin/entities/:id/approve`
  - `POST /api/admin/entities/:id/reject`

## WARNING

- Entity extraction is deterministic and pattern-based. It is suitable for pilot ingestion, but production should add reviewer-assisted extraction templates per document category.
- PDF page-level extraction depends on available parser text. Current PDF parsing stores page 1 as a fallback because `pdf-parse` does not expose reliable per-page structure by default.
- Embedding creation still depends on Ollama availability during processing.
- DOCX/XLSX/CSV parser dependencies must be installed before running the pipeline.
- Approval currently activates all pending entities for a document when the document is approved; granular entity review endpoints exist for follow-up curation.

## FAIL

- None.

## Backend Flow

```text
Upload
→ Parse file
→ Chunk text
→ Extract structured entities
→ Create embeddings
→ Store chunks and entities
→ Approve document
→ Activate approved entities
→ Structured lookup before vector search
→ LLM answer with source references
```
