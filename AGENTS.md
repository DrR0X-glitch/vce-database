# AGENTS.md

## Purpose
This project is a Next.js static-export frontend for browsing VCE exam questions from extracted metadata (`data.json`) and subject taxonomy (`config/subject_taxonomy.json`).

## Current App Shape (source of truth: `src/App.js`)
- Single-page React app (no `react-router`).
- Primary flow:
  1. Subject chooser screen.
  2. Question list for selected subject with search + filters.
  3. Optional image/detail view exists in code but is disabled behind `SHOW_IMAGES_BETA = false`.
- Question rows currently open `exam_url` in a new tab when clicked.
- No authoring/editing UI for topic/AOS in current app.

## Data Inputs
- Required:
  - `/data.json`
  - `/config/subject_taxonomy.json`
- `subject_taxonomy.json` supports either an array or `{ subjects: [...] }`.
- Subject matching for rows is derived from `row.exam_folder` token extraction and alias matching.

## Important Data Contracts
- Row shape expected in `data.json` includes:
  - `id`, `source`, `year`, `section`, `question_number`, `subquestion`, `question_label`
  - `exam_url`, `assessor_url`, `exam_folder`, `image`
  - `aos_id`, `topic_id`, `start_page`, `end_page`
- Taxonomy model in `subject_taxonomy.json` is per-subject:
  - `token`, `name`, `group`, optional `aliases`
  - `taxonomy.aos[]`, `taxonomy.topics[]`

## Filtering/Sorting Behavior
- Sorting uses:
  - `source`, `year`, `section`, `question_number`, then subquestion order (`intro`, `a`, `b`, ...).
- `intro` rows are excluded from the main list (`listRows`).
- Filters in UI:
  - `source`, `year`, `section`, `aos_id`, `topic_id`, plus text search.
- Search includes raw row fields and resolved AOS/Topic names.

## Section B / Detail Logic
- `getShowRows(...)` groups all rows for same `(exam_folder, section, question_number)` when selected row is Section B.
- This only affects the disabled beta detail image mode.

## Spec Notes (`app-spec.md` vs implementation)
- `app-spec.md` mentions routes (`/questions`, `/questions/:id`, etc.) and `config/tag_taxonomy.json`.
- Current implementation differs:
  - No routes.
  - Uses `config/subject_taxonomy.json`.
  - Detail/full-question UI exists only as disabled beta branch.
- When implementing new features, decide whether to follow current code-first behavior or move toward the spec; call this out explicitly in PR notes.

## Testing
- No automated test runner is currently configured.
- `npm test` is a placeholder command that exits successfully.

## Change Guidelines
- Keep `src/App.js` as the source of behavior truth unless actively refactoring.
- Preserve `intro` handling and subquestion sort order.
- If adding new taxonomy-dependent features, use existing `aosById`/`topicById` map pattern.
- If enabling detail mode, review `SHOW_IMAGES_BETA` branch and ensure tests cover it.
