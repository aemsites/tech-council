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

The `content-ai-search` EDS block supports semantic search, Cards/List layouts,
cursor pagination, and an AI Mode with source links. It requests AI answers only
when AI Mode is selected. API keys stay in the server-side proxy, never in the
block or authored page.

For a **local demo using the live Fréscopa sample service**, start the AEM preview
on port 3002, then run `node tools/content-ai-preview.mjs` and open
`http://localhost:3003/search`. The local server maps `/search` to
`drafts/content-ai-search.html` and relays only the two Content AI routes to the
fixed sample endpoint. It listens on the loopback interface and accepts only
the `frescopa` / `ACQUISITION` source. It forwards no browser credentials to
Content AI and uses no API key. Queries go to the shared demo service:
**do not enter internal, personal, or sensitive information**.

This is real sample content, not a Tech Council index or mock responses.
The sample service currently allows the Fréscopa browser origin only, so direct
browser calls from Tech Council or localhost fail CORS. The local relay does
not modify that service's allowed origins and is not a production proxy.

To enable the dedicated page on EDS, author a `/search` page with a
**Content AI Search** two-column block table:

| Key | Value |
| --- | --- |
| Base URL | Approved proxy base URL (without `/search` or `/gensearch`) |
| Content Source | Exact indexed source name |
| Content Source Type | `AEM_PUBLISH` or `ACQUISITION` |
| Placeholder | Ask a question or enter a topic |
| Results Size | `10` (1–50) |
| Results Layout | `card` or `list` |
| AI Search Mode Enabled | `true` |
| Gen Search Error Retry Visible | `true` |
| Disclaimer Text | Approved AI disclaimer |
| Notice Text | Optional visible source/privacy notice |

The existing homepage `doc-search (homepage)` block can render this same search
experience inline. Enable it with homepage metadata:

| Metadata | Value |
| --- | --- |
| content-ai-search-base-url | Approved proxy base URL |
| content-ai-search-source | Exact indexed source name |
| content-ai-search-source-type | `AEM_PUBLISH` or `ACQUISITION` |
| content-ai-search-placeholder | Optional input hint |
| content-ai-search-notice | Optional visible source/privacy notice |

Both base URL and source must be present. Without them, the existing index search
is unchanged. Missing Content AI assets also fall back to the original search.
The local relay supplies the Fréscopa metadata to the homepage automatically:
open `http://localhost:3003/` to try results and AI answers without leaving home.
It does not change the authored homepage or the normal port-3002 preview.

Use the sample source only with an explicit Fréscopa demo notice. For production,
configure a proxy with the required EDS origins, source allow-list, rate limits,
and server-side credentials before enabling the homepage metadata. Publishing
an authored `/search` page is separate from deploying block code; homepage
search does not require that separate page.

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