# Contract: Word Add-in Workflows

## Lightweight Local Taskpane

**Purpose**: Local scaffold served by the Shared Intelligence Core.

**Current workflows**:
1. User enters or pastes facts JSON.
2. User selects draft type and requested relief.
3. Taskpane calls `POST /v1/workspace/draft`.
4. Taskpane displays draft and guardrail status.
5. User inserts draft at cursor when Office context is available.
6. If Office context is unavailable, taskpane copies draft to clipboard.

**Required behavior**:
- Do not insert empty output.
- Preserve attorney-review and guardrail status.
- Fall back cleanly when Word APIs are unavailable.

## Production-Oriented Mercy Legal Plugin

**Purpose**: React/Vite Microsoft Word add-in intended for official distribution.

**Current workflows**:
1. Read active document text or selection from Word.
2. Analyze document with local mock service.
3. Explain selected clause.
4. Draft revised language.
5. Insert text or append report into Word.
6. Generate production manifest for an HTTPS host.
7. Validate production manifest before submission.

**Modernization requirements**:
- Replace mock service responses with authenticated Shared Intelligence Core
  calls.
- Use shared request/response contracts with guardrail metadata.
- Support active matter context sync from the standalone/product workspace.
- Require HTTPS hosting, support URL, privacy policy, terms, icons, screenshots,
  descriptions, and test credentials before official submission.

