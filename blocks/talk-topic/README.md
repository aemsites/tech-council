# Structured talk summaries

Each Word table becomes one EDS block. Merge the first row and use one of
these block names; following rows have a field name in the first column
and its content in the second.

| Block | Content fields |
| --- | --- |
| Talk Overview | Summary, Audience |
| Talk Takeaways | Takeaways (bulleted list) |
| Talk Topic | Title, Summary, Key points (bulleted list) |
| Talk Question | Question, Status, Answer |

Use at most 10 **Talk Topic** tables, in recording order. Combine related
ideas into substantial themes with detailed explanations and supporting points;
do not make every short paragraph a separate topic.
Use one **Talk Question** table per included audience question. Question statuses
are Answered or Unresolved. Omit deferred and partially answered questions;
the renderer also hides these questions in existing documents.
Do not invent answers to unresolved questions. All blocks except questions
also accept an optional Title.

Generate only these four block types. Do not add Follow-ups, Open points,
About this summary, or other extra sections. Legacy Follow-ups and Source Note
blocks remain supported by the renderer for existing documents.

## Shared metadata rows

Include these rows in every table, leaving unknown values blank:

| Field | Format |
| --- | --- |
| Start | Nonnegative integer seconds, MM:SS, or HH:MM:SS |
| End | Same format; must be later than Start |
| Timing confidence | `exact`, `segment`, or `unverified` |
| Tags | Comma-separated topic labels |

`exact` means the content boundary was checked. `segment` means the
range identifies a broader transcript segment containing the topic,
possibly shared by several topics. It is not a precise topic duration. Never estimate missing
boundaries solely to fill the template.

Missing/invalid confidence defaults to `unverified`. Timing fields are metadata
backed: headings display known times in small brackets; durations and confidence
labels are not displayed. Segment ranges identify enclosing passages, not exact topic boundaries.
Invalid starts are omitted; an end without a start or not later than the
start does not create a range. A start of zero is valid.

Rendered blocks expose validated `data-start`, `data-end`, `data-duration`
(seconds), `data-timing-confidence`, and normalized `data-tags` attributes.
Tags remain visible text;
they do not introduce filtering or modify the recording sheet.

Start/End support future playback features without changing the authoring
format. End is descriptive metadata, not a playback stop instruction.
Existing transcript timestamp links continue to work as before.

## Trying the example

The [recording summary skill](../../skills/recording-ai-summary/SKILL.md)
includes a synthetic JSON example and its matching Word document under `assets/`.
Use the bundled generator to validate the JSON and create EDS Word tables.
Upload the document to an authorized drafts folder and refresh its EDS preview
to inspect the actual conversion with the block code available.

To use a summary on an actual talk, publish its fragment and set that recording's
existing Summary field to the fragment path. No sheet-format change is needed.
Publishing content and pushing block code are separate operations; a draft
preview does not change a live recording.

The recording reader uses block headings to build its existing outline.
Standalone summary pages receive a sticky left-hand contents panel on desktop
and a section picker on mobile. No duplicate outline is added inside the reader.
Consecutive topic and question blocks are grouped automatically under
Topics covered and Questions & answers headings. Do not author extra heading
blocks for these groups.
Every block is a native disclosure and starts expanded.
Each section has a Copy link action with a stable title-based URL anchor.
Opening a section link expands it and scrolls directly to it.
TOC navigation also opens the selected section. TOC labels contain titles only.
Paragraphs in list fields are rendered as bullets when Word conversion
does not preserve the original list markup.
Existing free-form summary fragments continue to render unchanged.
