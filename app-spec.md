# WebUI App Spec (v1)

## Purpose
Build a React WebUI that lets users search, filter, and browse extracted exam questions from `data.json`, then view question images and metadata with correct handling of Section B subquestions and intro stems.

This spec reflects:
- Current ingestion behavior in `ingest.py`
- Current project rules in `AGENTS.md`
- Original intent in `docs/spec.md`
- Current output artifacts in `data/{SOURCE}_{YEAR}/`

## Scope

### In scope (v1)
- Searchable question database using root `data.json`
- Filtering by metadata/tags (including taxonomy-driven AOS/topic)
- Question detail view with image + metadata + links
- Subquestion behavior:
  - If selected row is a Section B lettered subquestion (`a`, `b`, etc), show the matching `intro` image with it
- Navigation to full parent question view (all parts)

### Out of scope (future)
- PDF generation
- Export/custom paper builder
- Authoring or editing tags in UI

## Data Sources

## Required files
- `data.json` (primary searchable index)
- `config/tag_taxonomy.json` (AOS/topic definitions used for labels and descriptions)

## Optional per-exam files (for richer views)
- `data/{SOURCE}_{YEAR}/question_archive.json` (grouped sections/questions and full metadata)
- `data/{SOURCE}_{YEAR}/question_tags.json` (tagging diagnostics/errors)
- `data/{SOURCE}_{YEAR}/manifest.json` (exam metadata)

## Canonical row shape (from `data.json`)
Each row is treated as one renderable unit:
- `id`
- `source`
- `year`
- `section`
- `question_number`
- `subquestion` (`null`, `intro`, or letter)
- `question_label`
- `image`
- `exam_pdf` (local path)
- `exam_url` (remote exam file URL)
- `assessor_url`
- `exam_folder`
- `start_page`
- `end_page`
- `aos_id`
- `topic_id`

## Taxonomy contract
From `config/tag_taxonomy.json`:
- `aos[]`: `{ id, name, description, ... }`
- `topics[]`: `{ id, aos_id, name, description, ... }`

UI must resolve `aos_id` and `topic_id` in `data.json` via this taxonomy.

## Core UX

## 1. Database/Search Page
Primary route: `/questions`

### Behaviors
- Load all rows from `data.json`
- Full-text search across:
  - `id`, `source`, `year`, `section`, `question_label`
  - taxonomy-resolved `aos name`, `topic name`
- Filter controls:
  - `source`
  - `year`
  - `section`
  - `question_number`
  - `subquestion` (main/intros/lettered)
  - `aos_id` (shown as name)
  - `topic_id` (shown as name)
- Combined filtering is AND logic.
- Sort default:
  - `source`, then `year`, then `section`, then `question_number`, then `subquestion`.

### Result card/row minimum
- `question_label`
- `source year`
- `section`
- `question_number` + `subquestion` marker
- `AOS` name
- `topic` name
- thumbnail/preview optional

Click opens question detail route.

## 2. Question Detail Page
Route: `/questions/:id`

### Content
- Main question image (`image`)
- Metadata panel:
  - source/year/section/question_number/subquestion
  - AOS + topic (resolved names + descriptions from taxonomy)
  - page range (`start_page` to `end_page`)
  - links: `exam_url`, `assessor_url`
- For Section B lettered subquestion:
  - also show intro image for same `(exam_folder, section, question_number, subquestion='intro')`
  - intro shown before selected subquestion image

### Actions
- `View Full Question` button:
  - navigates to parent question route (same section + question number)

## 3. Full Question Page
Route: `/questions/full/:examFolder/:section/:questionNumber`

### Behavior
- Gather all rows sharing:
  - same `exam_folder`
  - same `section`
  - same `question_number`
- Render in logical order:
  - Section A: single image
  - Section B: `intro` first, then `a`, `b`, `c`, ...
- Display shared metadata and same external links.

## Data Handling Rules

## Subquestion intro pairing rule
When viewing a row with lettered `subquestion`:
- Find intro row by:
  - `exam_folder` exact match
  - `section` exact match
  - `question_number` exact match
  - `subquestion === 'intro'`
- If missing, continue gracefully and show only selected subquestion.

## Unknown taxonomy values
- If `aos_id` or `topic_id` is missing or unmatched, display `Unknown`.
- Filtering should still work on raw IDs where present.

## URLs and files
- Use `exam_url` and `assessor_url` for user-facing links.
- `exam_pdf` is local artifact metadata, not guaranteed browser-accessible URL.
- `image` paths must be served by app/static host.

## React Implementation Requirements

## State and data
- Client-side app is acceptable for v1.
- Load `data.json` and `config/tag_taxonomy.json` at startup.
- Build lookup maps:
  - `aosById`
  - `topicById`
- Build an index keyed by `id` for quick detail-page lookup.

## Routing
- `/questions`
- `/questions/:id`
- `/questions/full/:examFolder/:section/:questionNumber`

## Performance targets (v1)
- Initial dataset load should remain responsive for low thousands of rows.
- Search/filter updates should feel near-instant (<100ms typical on modern desktop).
- Use memoized filtering and pagination or virtualized list if dataset grows.

## Error/empty states
- Missing `data.json`: show blocking empty-state message.
- Missing taxonomy file: app still works, but tags show as IDs/Unknown.
- Broken image path: show placeholder and preserve metadata/actions.

## Acceptance Criteria (v1)
- User can search all questions from `data.json`.
- User can filter by source/year/section/AOS/topic/subquestion.
- Clicking a question opens detail page with image and metadata.
- Detail page exposes direct links to exam and assessor report.
- If selected question is lettered subquestion, its intro is displayed with it.
- `View Full Question` opens a page with all parts for that question.
- Taxonomy names/descriptions are resolved from `config/tag_taxonomy.json`, not duplicated in `data.json`.

## Future Hooks (not implemented in v1)
- Export selected questions as custom set
- Generate compiled PDF from selected questions
- Saved filter sets and shareable query URLs
