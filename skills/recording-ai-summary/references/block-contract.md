# EDS recording-summary contract

## Document structure

Use the following order. Required blocks appear exactly once unless noted.

| Block name in merged first table row | Count | Content rows |
| --- | --- | --- |
| Talk Overview | 1 | Summary, Audience |
| Talk Takeaways | 1 | Takeaways |
| Talk Topic | 1-10 | Title, Summary, Key points |
| Talk Question | 0 or more | Question, Status, Answer |

Every table also has Start, End, Timing confidence, and Tags rows. Do not
rename Start to Timestamp, Topics to Chapters, or Key points to Highlights:
the renderer reads exact case-insensitive field names.

Only these four block types belong in generated summaries. Do not add an
About this summary, Source Note, Follow-ups, Open points, or other extra section.
Keep important caveats and unresolved answers in the relevant topic or question.
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
| Timing confidence | exact / segment / unverified | Provenance of the boundaries |
| Tags | array of strings | Specific subject labels; no comma inside a label |

Use a small number of useful tags, normally 1-4. The Word generator writes
them as comma-separated text for the EDS renderer. Avoid duplicate tags
with different capitalization.

`exact` means a checked start/end boundary, not a precisely formatted guess.
`segment` means a wider enclosing transcript passage, potentially shared by
several topics. Its duration is **not** the exact topic duration.
`unverified` is the fallback when the source cannot establish boundaries.
Prefer null values to presenting uncertain estimates as fact.

Known times appear in small brackets beside collapsible section headings.
Confidence labels and durations are not displayed. Segment ranges identify
enclosing source passages rather than precise topic boundaries.
Validated timing remains in data-start, data-end, data-duration (seconds),
and data-timing-confidence. Tags are visible and exposed as data-tags.
Transcript timestamp links are separate and unchanged.

## Content requirements

| Field | Editorial target |
| --- | --- |
| Overview Summary | 2-4 sentences describing scope and central theme |
| Audience | One concise description of who benefits |
| Takeaways | Usually 3-5 memorable, cross-session lessons |
| Topic Summary | A detailed explanation of a coherent theme, usually 3-5 sentences |
| Key points | Usually 3-6 substantive details, mechanisms, examples, results, or caveats |
| Question | Faithful paraphrase of an actual audience question |
| Status | Answered or Unresolved; omit deferred and partially answered questions |
| Answer | What was actually said, including limits or absence of an answer |

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
        "Timing confidence": "unverified",
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
legacy questions whose status is Deferred or Partially answered.
The recording reader normalizes headings and creates its existing left TOC.
Standalone summary pages get a sticky left TOC and a mobile section picker.
Do not author the TOC into Word: the UI derives it from topic headings.
Questions use native disclosures with full answers retained in the DOM.

Do not include custom CSS, arbitrary HTML, invented resource links, scripts,
or a prose title page in the authored Word document. Existing free-form
summaries do not need to be migrated for the new blocks to work.
