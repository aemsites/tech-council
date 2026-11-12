# Adobe Tech Council
A platform for technical collaboration and knowledge sharing within Adobe, built on AEM Edge Delivery Services.

## Environments
- Preview: https://main--tech-council--aemsites.aem.page/
- Live: https://main--tech-council--aemsites.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template and add a mountpoint in the `fstab.yaml`
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `tech-council` directory in your favorite IDE and start coding :)

If port 3000 is already in use, run `aem up --port 3001 --no-open --no-stop-other`
and open http://localhost:3001/. If the proxy reports an expired token, open
http://localhost:3001/.aem/cli/login and complete Adobe sign-in.

## SharePoint authoring for the redesign

The redesign reuses the site's existing EDS blocks. No new block library,
SharePoint list, or content migration is required. Edit Word documents and Excel
workbooks in the mounted SharePoint folder configured in `fstab.yaml`.
Block tables below describe Word tables, not Markdown to paste into a document:
merge the first row across the table and enter the block name there.
Use real hyperlinks and Word heading/list styles in the content cells.

### Homepage

Keep the homepage document's current path and arrange its existing sections in
this order. A paragraph containing only `---` separates sections.

| Block or section | What to author |
| --- | --- |
| `Hero Quote` | A two-column table with one content row: the headline in the left cell and one mission paragraph in the right cell. Keep a single slide on the homepage. The community artwork and two discovery links are supplied by the code. |
| `Doc Search (contained, homepage)` | Keep the existing link to `/docpages-index.json` in its content cell. Events and recordings are also included automatically. |
| `Section Heading` | A one-column table: first content row `Events`; optional second content row is a short description. |
| `Fragment` | A one-column table with a hyperlink to `/fragments/events-fragment`. |
| `Section Heading` | First content row `Communities`; optional second row is a short description. |
| `Fragment` | A hyperlink to `/fragments/communities-fragment`. |
| `Carousel` | Keep the existing speaker panel: two columns, optional image on the left; heading, short paragraph, and one link to `/speaker` on the right. Keep one row for a single contribution panel. |
| `Section Heading` | First content row `Collaboration`. |
| `Fragment` | A hyperlink to `/fragments/tools-fragment`. |
| `Carousel` | Keep the existing feedback panel, with one link to `/feedback`. |

Retain the existing section metadata and block variants when editing existing
documents. Add a useful page title and description in each page's Metadata table.
The homepage's Events and Communities headings automatically get view-all links;
do not add duplicate buttons.

### Communities fragment

Edit the Word document at `/fragments/communities-fragment`. Its
`Communities Card List` table has two columns:

| First content column | Second content column |
| --- | --- |
| `addCommunityLink` | A hyperlink to `/communities/new-community`, or another approved proposal destination. This configuration row must come first. |
| Community image, then community name on its own paragraph | A bulleted list of leads, an optional description paragraph, then the Slack channel hyperlink. |
| Another community image and name | Another leads list, optional description, and Slack hyperlink. |

Use one row per community. If including both a wiki and Slack, put the wiki link
first and Slack second; with one link it is treated as Slack. Give the Slack
hyperlink readable channel-name text rather than a raw URL. Supply meaningful
image alt text. The search box and result count are generated automatically.
Keep this fragment shared between the homepage and `/communities/`.

### Events, recordings, and resources

The `Events` and `Recordings` blocks read existing Excel feeds; adding Word card
tables will not change their entries. Preserve workbook/sheet names and column
headings exactly.

| Published feed | Required authoring fields |
| --- | --- |
| `/forms/events-form/events.json?sheet=events` | `title`, `speaker`, `dateTime`, `tag`; optional `meetingRoom` and `meetingLink`. Use ISO date/time text with an explicit timezone offset. |
| `/forms/recording-form/recordings.json?sheet=recordings` | `title`, `speaker`, `date`, `tag`; `recordingLink` and optional `presentationLink` must be accessible to the intended employees. |
| The JSON link in the existing `Tools` block on `/resources` | Keep that source unchanged. Maintain `title`, `description`, `link`, and `type` (`skill`, `agent`, or `app`) in its workbook. |

Homepage search currently uses the separate
`/forms/events-form/events-data.json` and
`/forms/recording-form/recordings-data.json` feeds. Update and preview their source
workbooks as well when changing events or recordings; otherwise search and the
listing pages can disagree. Do not create competing feeds with new names.

Upcoming events are ordered automatically. If none are upcoming, a recordings
link is shown instead; add real scheduled events rather than placeholder dates.
Add a Heading 1 above the existing block/form on `/recordings`, `/resources`,
`/feedback`, and `/communities/new-community`, which currently lack a page heading.
Use Heading 2 for subsequent sections.

### Navigation and footer

In the existing `/nav` document, keep the brand in the first section and the
navigation bullet list in the second. Link the brand to `/` rather than a
hard-coded environment URL. Keep Home, Events, Communities, Recordings, Resources,
and Call For Speakers pointing to the existing routes.

Create and preview a `/footer` Word document if an authored footer is wanted.
Use the Tech Council name, a short factual description, and a Feedback Form link
to `/feedback`. The current preview has no published footer; code supplies a safe
fallback until the document is available. An optional `/placeholders` workbook
with `Key` and `Text` columns can customize existing block labels; defaults work
without it.

### Preview and publish

Save changes, then use AEM Sidekick to **Preview** changed documents, workbooks,
and fragments. Preview shared fragments before the pages that reference them.
Check the homepage, communities, events, recordings, resources, and forms while
signed in; verify keyboard navigation, narrow layouts, filtering, and employee
access to Slack/meeting/recording links.

Publish only after content-owner approval. Previewing a Word document does not
publish its dependent Excel feeds, and pushing this code branch does not publish
SharePoint content. Keep speaker and feedback form endpoints unchanged; verify
real submissions only with an approved test entry and the receiving team.