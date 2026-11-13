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