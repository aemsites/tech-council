# EDS recording-summary contract

## Document structure

Use the following order. Required blocks appear exactly once unless noted.

| Block name in merged first table row | Count | Content rows |
| --- | --- | --- |
| Talk Overview | 1 | Summary, Audience |
| Talk Takeaways | 1 | Takeaways |
| Talk Topic | 1-10 | Title, Summary, Key points |
| Talk Question | 0 or more | Question, Status, Answer |

Every table also has Start, End, and Tags rows. Do not add Timing confidence.
Do not rename Start to Timestamp, Topics to Chapters, or Key points to Highlights:
the renderer reads exact case-insensitive field names.

Only these four block types belong in generated summaries. Do not add an
About this summary, Source Note, Follow-ups, Open points, or other extra section.
Keep supported caveats in the relevant topic or answered question. Omit
questions that were unanswered, unresolved, deferred, or partially answered.
Every section starts expanded and remains collapsible.

Word layout: two columns, merged first row containing only the block name.
Each remaining row has the field name on the left and its value on the right.
List-valued content must be an actual Word bulleted list, not one long paragraph.
Do not nest block tables. Blank timing values produce empty table cells.

Non-question blocks accept an optional Title to override the default section
heading. Talk Topic requires Title. Keep titles short, specific, and useful
in the TOC. Do not prefix titles with timestamps or decorative numbering.

## Shared metadata

| JSON field within fields | Type | Meaning |
| --- | --- | --- |
| Start | integer, timestamp string, or null | Recording-relative start |
| End | integer, timestamp string, or null | Later than Start; null if unknown |
| Tags | array of strings | Specific subject labels; no comma inside a label |

Use a small number of useful tags, normally 1-4. The Word generator writes
them as comma-separated text for the EDS renderer. Avoid duplicate tags
with different capitalization.

Use only checked topic or question boundaries. If they are unavailable, keep
Start and End null or empty; the Word cells must stay blank. Do not use a broad
speaker passage containing several topics as each topic's own range. Never
infer times by splitting the recording evenly.

Missing Audience stays null or empty; missing Tags stays an empty list. Do not
put Unknown, Not found, N/A, or explanations of missing values into fields.
Required substantive content must be source-backed rather than filled with
placeholders. An unsupported topic or unanswered question must be omitted.

Known times appear in small brackets beside collapsible section headings.
Unknown times produce no timestamp label. Durations are not displayed.
Validated timing remains in data-start, data-end, data-duration (seconds)
when available. Tags are visible and exposed as data-tags when present.
Transcript timestamp links are separate and unchanged.

## Content requirements

| Field | Editorial target |
| --- | --- |
| Overview Summary | 2-4 sentences describing scope and central theme |
| Audience | One supported audience description, or blank when unavailable |
| Takeaways | Usually 3-5 memorable, cross-session lessons |
| Topic Summary | A detailed explanation of a coherent theme, usually 3-5 sentences |
| Key points | Usually 3-6 substantive details, mechanisms, examples, results, or caveats |
| Question | Faithful paraphrase of an actual audience question |
| Status | Answered only; omit all unanswered, deferred, or partially answered questions |
| Answer | A substantive recorded answer, including supported limitations |

These are editorial targets, not a reason to add filler. If a topic cannot
support a useful summary and concrete detail, merge it into a related topic.
Do not summarize every individual utterance or create a quota of 20 topics.
Conversely, do not collapse several distinct research papers into one topic
when each merits its own explanation.

The shared schema version is 1. Input is:

```json
{
  "schemaVersion": 1,
  "title": "Recording title for document metadata",
  "blocks": [
    {
      "block": "Talk Topic",
      "fields": {
        "Title": "A specific topic title",
        "Start": null,
        "End": null,
        "Tags": ["Retrieval"],
        "Summary": "A transcript-grounded explanation.",
        "Key points": ["A concrete detail actually supported by the source."]
      }
    }
  ]
}
```

This snippet illustrates one block, not a complete document. Use the bundled
sample for a complete schema-valid document.

## Rendering and compatibility

Generated EDS block names map to talk-overview, talk-takeaways, talk-topic,
and talk-question. The site still supports legacy Follow-ups and Source Note
blocks, but they must not appear in new summaries. The renderer also hides
legacy questions whose status is Unresolved, Deferred, or Partially answered,
and questions with an empty answer. Legacy timing-confidence metadata remains
readable for existing documents, but new summaries must not generate it.
The recording reader normalizes headings and creates its existing left TOC.
Standalone summary pages get a sticky left TOC and a mobile section picker.
Do not author the TOC into Word: the UI derives it from topic headings.
Questions use native disclosures with full answers retained in the DOM.

Do not include custom CSS, arbitrary HTML, invented resource links, scripts,
or a prose title page in the authored Word document. Existing free-form
summaries do not need to be migrated for the new blocks to work.
