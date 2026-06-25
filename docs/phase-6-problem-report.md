# Phase 6 Problem Report

Scope: Analytics Dashboard.

## Problems Found

### PASS

- Analytics are pharmacy-scoped unless the actor is System Owner.
- Metrics are derived from existing audit/document data.

### WARNING

- Runtime validation could not run due `CreateProcessAsUserW failed: 5`.
- Frontend route mounting still needs verification.
- Metrics depend on earlier audit/document columns being present in the migrated database.

### FAIL

- No confirmed code FAIL items found in static review.

