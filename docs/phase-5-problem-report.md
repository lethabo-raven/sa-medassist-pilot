# Phase 5 Problem Report

Scope: Knowledge Search.

## Problems Found

### PASS

- Search logic only returns approved, active documents and approved, active extracted entities.
- Search does not use unapproved connector metadata or pending documents.

### WARNING

- Runtime validation could not run due `CreateProcessAsUserW failed: 5`.
- Frontend route mounting still needs verification.

### FAIL

- Static review found entity type matching was too exact and could miss plural or underscored entity labels.

