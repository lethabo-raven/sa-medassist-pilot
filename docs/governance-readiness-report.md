# Governance Readiness Report

Scope: medical governance and source integrity only.

## PASS

- Every document stores `source_id`, `version`, `upload_date`, `approval_date`, `approver`, `source_type`, and `active_flag`.
- New source versions are inserted as new document rows and do not overwrite historical versions.
- Historical versions remain auditable in `documents`, `audit_logs`, and answer provenance records.
- Database uniqueness prevents duplicate `(source_id, version)` pairs.
- Database uniqueness prevents more than one active approved version per source.
- Approval indexing supersedes the previous active approved version for the same source.
- Older source versions cannot be approved over a newer submitted version.
- Rejected, archived, and superseded documents cannot be indexed.
- Pending documents are not queried because retrieval requires `status = 'approved'` and `active_flag = true`.
- Citation retrieval only returns active approved source versions.
- Answers with missing or invalid citation numbers are refused and audited.
- Every successful answer has an `answer_id`.
- Every successful answer stores cited `document_id`, `source_id`, `document_version`, citation index, and timestamp in `answer_source_provenance`.
- Uploads are audited through `admin.document_submitted` and `admin.document_replacement_submitted`.
- Approvals are audited through `admin.document_approved`.
- Rejections are audited through `admin.document_rejected`.
- Replacements are audited through replacement submission events and superseded document status.
- Deletions are implemented as archival deletes and audited through `admin.document_deleted`.
- Query usage is audited through `chat.query_received`, `chat.answered`, and refusal events.

## WARNING

- Existing pilot rows receive generated `source_id` values during migration. If earlier rows are known versions of the same real-world source, an administrator should reconcile them manually before production use.
- Deletion is implemented as archival deletion to preserve auditability. This is intentional for governance, but operators should understand that rows are retained.
- Source approval still depends on trusted admin use. Operational policy must define who may approve medical sources.
- Provenance records are created for successful cited answers going forward; historical answers from before this migration will not have provenance rows.

## FAIL

- None.

## Governance Verification Queries

Run these after migration:

```sql
SELECT source_id, count(*)
FROM documents
WHERE status = 'approved' AND active_flag = true
GROUP BY source_id
HAVING count(*) > 1;
```

Expected result: zero rows.

```sql
SELECT dc.id
FROM document_chunks dc
JOIN documents d ON d.id = dc.document_id
WHERE d.status <> 'approved' OR d.active_flag = false;
```

Expected result: zero rows.

```sql
SELECT answer_id, document_id, document_version, cited_at
FROM answer_source_provenance
ORDER BY cited_at DESC
LIMIT 20;
```

Expected result: recent successful answers have provenance rows.
