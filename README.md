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

### Content AI search

The `content-ai-search` EDS block provides a compact homepage search and a dedicated
results page. Typing shows an actionable query dropdown; Enter, the search icon,
or the dropdown opens `/search?q=<query>`. Typing alone makes no API requests.
The results page requests semantic results and an AI answer concurrently, with
the answer, a collapsed Sources accordion, and Copy answer action above the results.
The Sources control shows the source count and reveals the list on activation. Clearing the
query hides both sections. API keys stay in the server-side proxy, never in the
block or authored page.
The All Results panel supports type, speaker, tag, and date filters for the
Tech Council contract. These filters operate on the returned batch, not the
entire index or AI answer; the UI states this explicitly. Filter state is kept
in the search URL, and Clear filters restores the full returned batch.
The results list scrolls within a viewport-bounded area and supports native keyboard scrolling.

Results, AI sources, and links inside AI answers exclude non-page files and
`/fragments` or `/admin` paths, including raw URL citations and card descriptions.
Missing or unavailable result thumbnails use the block's standard SVG image.
For the Tech Council contract, talk-summary fragments are first resolved to real
`/recordings?talk=...` pages using each recording's authored `summary` field.
This restores matching talks and AI citations without exposing fragment URLs or
guessing talk titles from slugs. Unmapped technical sources remain excluded.
Individual `/recordings?talk=...` sources also use the recordings sheet's title
and, when available, description instead of generic indexed "Recordings" metadata.
The same mapping applies to both AI Sources and search results. Opening a talk
updates its browser title, description, and Open Graph/Twitter title and description.
These browser-side changes do not update metadata already stored in the AI index.
The sheet's optional `Transcript` fragment is loaded into each recording page
inside a **Full transcript** disclosure, collapsed by default. The complete text
is present in the DOM before the disclosure is opened; it is not fetched on click.
Transcript fragments also resolve to their owning recording in AI Sources and
search results. Publish the fragments and recrawl the recording pages to make the
new content available to a JavaScript-rendering indexer; non-rendering indexers
must index the published fragments directly.
The transcript disclosure includes phrase search, match navigation, and copyable
moment links. Search spans inline formatting and preserves timestamp links.
Highlighting uses CSS Custom Highlights with a `<mark>` fallback, and blocked
clipboard access reveals a selectable link. Failed summary/transcript loads
offer a retry action; retrying does not publish unpublished content.
Recording deep links accept `t` in seconds, `MM:SS`, or `HH:MM:SS`, for example
`/recordings?talk=Example&t=152`. Valid times set the SharePoint embed's
`nav.playbackOptions.startTimeInSeconds` without forcing autoplay. Transcript
timestamps link to the same recording at that time; clicking one with an embedded
player seeks by reloading only the player and updates the shareable page URL.
AI source mapping preserves explicit `t` query parameters or `#t=...` fragments
from indexed citations. Source hits may alternatively provide `startSeconds`
on their data object or metadata, as a nonnegative integer or supported time string.
URL timestamps take precedence. Missing, malformed, negative, and overflowing
times do not override normal playback. The Watch recording link remains available
alongside the embed and carries valid start times for supported SharePoint links.
Every embedded player includes sign-in help and a **Sign in to SharePoint** link
that opens outside the iframe, plus **Reload player** to retry after signing in.
Both preserve the selected timestamp. SharePoint authentication is separate from
Tech Council sign-in; private windows need their own Microsoft 365 session.
The page cannot reliably inspect cross-origin login failures, so these controls
remain available even when the player works. They do not bypass file permissions.
**Hide player** removes the embedded frame, including any active playback.
**Show player**, reloading, or choosing a transcript timestamp restores it at the
selected link time. Hiding is user-controlled, not inferred from iframe events.
The AI service must supply a timestamp in its citation URL or source hit to link
to a particular snippet; the frontend does not infer it from prose.
AI Sources and result cards display supplied timestamps alongside the talk title.
When a recording lacks an authored description and the index supplies generic
Recordings metadata, results prefer an excerpt near the query terms.

The recordings listing keeps its search, sort, date period, and tags in the URL.
Talk links retain that state, and returning to the listing restores its scroll
position when session storage is available. Advanced filters collapse on mobile;
search and the result count stay visible.
Event fragments link to their owning `/events` page. Indexed sign-in captures
are excluded rather than being presented as event or recording content.
If matches exist but none have usable page links, the results explain that rather
than incorrectly reporting that no matching content exists.

The Tech Council proxy base URL is
`https://4060142-techcouncilai.adobeioruntime.net/api/v1/web/content-ai/`.
Set **API Contract** to `tech-council` to use its `semantic-search` and
`content-ai-search` actions with a text query and the `tech-council` /
`ACQUISITION` source. This replaces the Fréscopa sample service.
The semantic action currently returns a server-sized batch and does not honor
cursor or limit parameters, so this contract does not show Load more or apply
Results Size. Without this contract setting, the block preserves the original
`search` / `gensearch` API, hybrid query payload, and cursor pagination.

For a **local preview using the Tech Council index**, start the AEM preview on
port 3002, then run `node tools/content-ai-preview.mjs` and open
`http://localhost:3003/` or `http://localhost:3003/search`.
The helper injects the search metadata into the local homepage and maps
`/search` to `drafts/content-ai-search.html`. Search requests go directly from
the browser to the Tech Council proxy, exercising its CORS configuration.
The helper listens only on loopback and does not relay search requests or use
API credentials. **Do not enter personal or sensitive information.**

To enable the dedicated page on EDS, author a `/search` page with a
**Content AI Search** two-column block table:

| Key | Value |
| --- | --- |
| Base URL | Proxy base URL above, without an action name |
| Content Source | `tech-council` |
| Content Source Type | `ACQUISITION` |
| API Contract | `tech-council` |
| Placeholder | Search Tech Council... |
| Results Size | `10` (1–50; original API contract only) |
| Results Layout | `list` (default) or `card` |
| AI Search Mode Enabled | `true` |
| Gen Search Error Retry Visible | `true` |
| Disclaimer Text | Approved AI disclaimer |
| Notice Text | Optional visible source/privacy notice |

The existing homepage `doc-search (homepage)` block can render the compact
search launcher instead of inline results. Enable it with homepage metadata:

| Metadata | Value |
| --- | --- |
| content-ai-search-base-url | Proxy base URL above |
| content-ai-search-source | `tech-council` |
| content-ai-search-source-type | `ACQUISITION` |
| content-ai-search-api-contract | `tech-council` |
| content-ai-search-placeholder | Optional input hint |

Both base URL and source must be present. Without them, the existing index search
is unchanged. Missing Content AI assets also fall back to the original search.
The local helper supplies the Tech Council metadata to the homepage automatically:
open `http://localhost:3003/` and submit a query to open the dedicated results page.
It does not change the authored homepage or the normal port-3002 preview.
For other entry points, configure a Content AI Search block with **Display Mode**
set to `launcher`. **Results Page** defaults to `/search`.

Before enabling on live, confirm the required access controls for the author-tier
index and configure approved EDS origins, source restrictions, rate limits, and
server-side credentials on the proxy. A successful CORS response is not an
authorization check. Publish the authored `/search` page before enabling the
homepage launcher; deploying block code alone does not create that page.

### Dashboard block

The existing `/admin/dashboard` page uses a one-column `Dashboard (Recordings)`
table with its JSON URL in the first content row, as text or a hyperlink.
An optional second row contains the workbook hyperlink. Its **Edit Excel**
button opens the original workbook URL in a new tab.
The variant supplies the visible heading: `Dashboard (Events)` shows **Events**;
plain `Dashboard` shows **Dashboard**. Change the variant and URL to reuse the
block for another dataset. No field names are hard-coded.

Sources are requested on the current origin, following the other sheet blocks,
so a corporate-site URL also works on an authenticated EDS preview or local proxy.
The source must be available there. The block supports JSON arrays, EDS
`{ "data": [...] }` feeds (including paginated sheets), multi-sheet responses,
and ordinary JSON objects. All columns, including fields appearing only in later
rows, are shown. Nested objects and arrays expand inline; zero, false, null, and
empty values remain distinguishable. Search covers every field. Fetch errors
are displayed with a Retry button.

**Preview** refreshes the authored JSON feed from its workbook through the EDS
Admin API. **Publish** copies the current preview feed to the published
environment; it does not implicitly preview unsaved workbook changes. The
adjacent icon links open the preview and published feeds in new tabs. These
actions manage the JSON source, not the `/admin/dashboard` document or code.
Sign in through AEM Sidekick with the necessary preview/publish permissions.
Failed requests are displayed explicitly, and both actions are disabled while
a request is in progress. Successful actions reload the dashboard data.

JSON fetches and View JSON use only the authored URL's path and query string,
including pagination. Workbook links and EDS Admin API URLs keep their external
domains. The Admin API and environment links use the current Tech Council EDS
branch, or `main` on localhost and custom domains.

Run the focused linters with `npx eslint blocks/dashboard/dashboard.js` and
`npx stylelint blocks/dashboard/dashboard.css`.

1. Create a new repository based on the `aem-boilerplate` template and add a mountpoint in the `fstab.yaml`
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `tech-council` directory in your favorite IDE and start coding :)