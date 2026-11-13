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

### Search and chat together

This repository contains the EDS frontend only. Search/chat API code,
authentication, and deployment templates live in the separate
[Express backend](https://github.com/Adobe-Tech-Community/tech-commuity-backend/tree/v2).
Use its local gateway to serve the site and `/api` on the same origin.
From this frontend:

```sh
aem up --port 3001 --no-open --no-stop-other \
  --html-folder test/fixtures --html-mount /dev
```

In another terminal, from the backend directory:

```sh
npm ci
npm run dev:site -- --api-config /path/to/fj-tech.sh --auth-config /path/to/fj.sh
```

Open http://localhost:8081/ for the site, or
http://localhost:8081/dev/knowledge for the authored search/chat fixture.
The optional API config reads only literal `API_URL`, `FJ_ACCESS_TOKEN` and
`FJ_PACK_UUID` assignments; it never executes the script or copies credentials
into the frontend. Alternatively configure the backend's `.env`.
The auth config reads the supplied Okta token endpoint and service credentials
without executing its shell commands. Access tokens are acquired and renewed
automatically in backend memory; the browser never receives them.
Without AI credentials, chat explicitly offers resource search instead of
claiming to generate AI answers. Configured credentials must remain valid;
health reports configuration, not successful upstream authentication.

The floating icon-only **Tech Council assistant** launcher appears on every page;
no SharePoint change is needed for it. It opens a responsive native modal dialog,
supports Close and Escape, and restores focus to its launcher. Closing stops
pending work but retains completed replies and the current draft until reload.
The full chat block and its stylesheet load only on first open.
Icon controls have accessible names and tooltips. Animated waiting dots give way
to actual streamed text; the conversation scrolls independently of the composer.
Search shows animated result placeholders followed by a short staggered reveal.
Both components honor reduced motion and inherit the site's light/dark theme.
Answers support semantic Markdown lists, headings, quotes, code, and tables.
Only links matching returned Tech Council sources are clickable; raw HTML and
images are never injected. The standalone Markdown lexer is vendored from
`marked@18.2.0` under `scripts/vendor/` with its MIT license; when upgrading,
copy `node_modules/marked/lib/marked.esm.js` to `scripts/vendor/marked.js` and
`node_modules/marked/LICENSE` to `scripts/vendor/marked.LICENSE`.

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
| `Fjsearch` | The authored homepage `Fjsearch (contained, homepage)` uses the new backend search; the old homepage Doc Search is suppressed to avoid duplicates. No configuration is required. An optional second row can contain `endpoint` with an empty value to use the default. `Backend Search` is also supported. See [search authoring](#search-authoring) for SharePoint and fragment steps. |
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

### Search authoring

Create a two-column Word table, merge the first row, and enter
`Fjsearch (contained, homepage)` on the homepage, or `Fjsearch` elsewhere.
An optional second row can configure the endpoint:

| Fjsearch | |
| --- | --- |
| endpoint | |

Leave the endpoint value empty to use same-origin `/api/search`. Do not add a
separate Key/Value header or placeholder text. Replace the old homepage
Doc Search table rather than adding a second search block; `Backend Search`
is also supported.

For shared content, create `fragments/search.docx` containing this table, then
reference `/fragments/search` from a `Fragment` block. Preview the fragment
before its pages, and publish both once the backend is available.

Direct EDS previews without an `/api` proxy can explicitly author
`https://techcouncil.corp.adobe.com/api/search`; the separate backend must allow
that exact preview origin. HTTPS pages require an HTTPS endpoint. Publishing
Word content does not deploy the backend or configure nginx.

Search starts after three trimmed characters with a 300 ms debounce.
Search/Enter submits immediately; editing or clearing cancels obsolete requests.
Only Tech Council result links are displayed. For API configuration and
deployment, use the [backend documentation](https://github.com/Adobe-Tech-Community/tech-commuity-backend/blob/v2/README.md).

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

### Optional inline AI Chat

The floating launcher is already global. To also embed chat within a page or
fragment, add a two-column Word table and merge its first row:

| AI Chat | |
| --- | --- |
| title | Ask Tech Council |
| endpoint | |

Use `AI Chat` as the merged block name. Both configuration rows are optional;
an empty endpoint uses same-origin `/api/chat`. For a fragment, create the
document at your chosen `/fragments/` path, preview it, and reference that path
from an existing `Fragment` block.

The browser sends only the question and up to five completed exchanges; it
never receives provider credentials. Replies stream as text, with site-only
source links. Answer links become clickable only when they match returned site
sources; unverified references remain plain text instead of broken local links.
Conversation stays in memory and clears on reload; the upstream
provider has its own data-retention policy.

On a direct EDS preview without an `/api` proxy, an inline block can explicitly
author the approved HTTPS API endpoint, and the backend must allow that exact
preview origin. The global launcher uses same-origin `/api/chat`, so use the
local gateway or corporate reverse proxy for it. Authoring/publishing content
does not deploy the backend.

### Events, recordings, and resources

The `Events` and `Recordings` blocks read existing Excel feeds; adding Word card
tables will not change their entries. Preserve workbook/sheet names and column
headings exactly.

| Published feed | Required authoring fields |
| --- | --- |
| `/forms/events-form/events.json?sheet=events` | `title`, `speaker`, `dateTime`, `tag`; optional `meetingRoom` and `meetingLink`. Use ISO date/time text with an explicit timezone offset. |
| `/forms/recording-form/recordings.json?sheet=recordings` | `title`, `speaker`, `date`, `tag`; `recordingLink` and optional `presentationLink` must be accessible to the intended employees. |
| The JSON link in the existing `Tools` block on `/resources` | Keep that source unchanged. Maintain `title`, `description`, `link`, and `type` (`skill`, `agent`, or `app`) in its workbook. |

Legacy Doc Search variants use the separate
`/forms/events-form/events-data.json` and
`/forms/recording-form/recordings-data.json` feeds. Update and preview their source
workbooks as well when using those legacy variants. The new homepage backend
search reads the canonical feeds above instead, including resources; it does not
depend on these duplicate search feeds. Do not create competing feeds with new names.

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