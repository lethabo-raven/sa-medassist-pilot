# Retrieval Quality Readiness Report

Scope: retrieval quality and answer reliability only.

## PASS

- Citation confidence is configurable through `MIN_CITATION_CONFIDENCE`.
- Retrieval refuses generation when no active approved source meets the configured confidence threshold.
- Retrieval only considers active approved sources.
- Superseded, inactive, rejected, archived, and pending sources cannot be retrieved or cited.
- Approved sources are ranked by vector relevance first, then approval date, then version.
- Latest approved versions are preferred through active-source governance and version-aware ranking.
- Citation metadata includes source name, source version, citation reference, approval status, active flag, source ID, document ID, source URL, authority, and relevance.
- Answers are refused if citation metadata is incomplete.
- Answers are refused if citation numbers are missing or outside the retrieved citation range.
- Answer provenance records only the sources actually cited by the generated answer.
- Low-confidence retrievals are refused and audited with confidence metadata.
- No-source retrievals are refused and audited.
- Contradiction detection checks similar-confidence approved sources from different source versions.
- When contradiction patterns are found, the assistant returns a warning instead of a definitive answer.
- Conflicting citations are returned for review when contradictions are detected.
- Validation scenarios exist for:
  - approved source exists
  - superseded source exists
  - conflicting sources exist
  - no source exists
  - low-confidence retrieval
- Test command added: `npm --workspace server run test:retrieval-quality`.

## WARNING

- Contradiction detection is rule-based and designed for pilot safety. It catches common explicit conflicts such as recommended/not recommended, safe/unsafe, indicated/contraindicated, and avoid/use. A production medical system should add clinical ontology or reviewer-backed contradiction handling.
- The citation metadata completeness check is intentionally strict. If the local model omits source name, version, citation reference, or approval status, the answer is refused even when the medical content is otherwise grounded.
- Confidence thresholds need calibration with real South African source documents and pilot questions.

## FAIL

- None.

## Verification

Run:

```bash
npm --workspace server run test:retrieval-quality
```

Expected result:

```text
Retrieval quality validation scenarios passed.
```
