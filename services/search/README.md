# Tech Council search service

Dependency-free Node.js 22+ service for the EDS `Backend Search` block.
The browser sends a query to this service, never to the agent directly.
Agent URLs, credentials, and provider-specific response mapping stay server-side.

The production backend is the Express project at
https://github.com/Adobe-Tech-Community/tech-commuity-backend. Deploy that project,
not this older development-only copy. Its `deploy/` directory contains the nginx
`/api/` location and systemd service templates, and it also provides `/api/chat`.

## Run locally

From the repository root, use two terminals:

```sh
aem up --port 3001 --no-open --no-stop-other
```

```sh
npm run search:dev
```

Open http://localhost:3001/. Complete Adobe sign-in at
http://localhost:3001/.aem/cli/login if the content proxy needs authentication.
This legacy helper binds to loopback only. It is not automatically used by the
frontend: provide a local `/api/` reverse proxy or explicitly author a development
endpoint and configure its exact allowed origin.

Without an agent configured, the service searches the actual page index and the
canonical events, recordings, and resources feeds through the authenticated AEM
proxy. It ranks title, description, and content matches, deduplicates URLs,
excludes `noindex` pages, and caches the source documents for 60 seconds.
This is ranked index search, **not an AI answer or a simulated agent**.

```sh
curl https://techcouncil.corp.adobe.com/api/health
curl https://techcouncil.corp.adobe.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"MCP authentication","limit":6}'
npm run test:search
```

## API contract

Public `POST /api/search`, `Content-Type: application/json`:

```json
{
  "query": "MCP authentication",
  "limit": 6
}
```

`query` is trimmed and must contain 2-500 characters. `limit` is optional,
defaults to 6, and must be an integer from 1 to 10. Request bodies are limited to
8 KiB. Search uses POST so queries are not included in URLs or access-log paths.

Successful responses contain:

| Field | Type / meaning |
| --- | --- |
| `query` | Normalized query string. |
| `answer` | Optional plain-text answer from the agent; absent in index mode. |
| `results` | Array of `{ title, url, description, type }`. |
| `results[].url` | Tech Council site-relative path, never an external or SharePoint destination. |
| `results[].type` | `page`, `community`, `event`, `recording`, or `resource`. |
| `meta.provider` | `index` or `agent`; no silent fallback between providers. |
| `meta.requestId` | Correlation ID, also in the `X-Request-Id` header. |
| `meta.durationMs` | Backend search duration. |

No matches is a successful `200` with `results: []`. Errors use
`{ "error": { "code": "...", "message": "..." }, "requestId": "..." }`.
Status codes include `400` for invalid input, `413` for oversized bodies, `415`
for unsupported content types, `502` for agent failures, `503` for unavailable
indexes, and `504` for provider timeouts. Responses use `Cache-Control: no-store`;
queries, result bodies, and tokens are not logged by this service.

## Connect the real agent

Copy `.env.example` to `.env` inside this directory (the latter is gitignored).
Set `SEARCH_AGENT_URL` to an approved agent endpoint and, if required,
`SEARCH_AGENT_TOKEN` through your local environment or secret manager. Restart
the service after changing configuration.

Once configured, the backend makes this request instead of loading the indexes:

```http
POST <SEARCH_AGENT_URL>
Content-Type: application/json
Authorization: Bearer <server-side token, when configured>

{"query":"MCP authentication","limit":6}
```

The agent should return:

```json
{
  "answer": "Optional plain-text explanation",
  "results": [
    {
      "title": "Community documentation",
      "url": "/communities/",
      "description": "Relevant community information",
      "type": "community"
    }
  ]
}
```

URL strings in `results` are also accepted, but titled objects are preferred.
The service validates URLs, removes duplicates, enforces the requested limit,
and does not expose credentials or raw upstream errors. Corporate Tech Council
and this project's EDS URLs are normalized to site-relative paths. External
event, recording, and resource hits with titles link to the corresponding Tech
Council listing with a title highlight; other external destinations are
excluded. The UI shows descriptive titles and text rather than raw URL lines.
Provider calls time out
after 10 seconds. If the eventual agent has a different schema, adapt its
request/response in `createSearch` in `search.mjs`; the frontend contract stays
unchanged. Only configure an agent approved to receive internal search queries.

## EDS / SharePoint authoring

The homepage now authors **Fjsearch (contained, homepage)**. Its native EDS entry
points, `blocks/fjsearch/fjsearch.js` and `blocks/fjsearch/fjsearch.css`, reuse the
same Backend Search behavior and styles. An empty Fjsearch block works without
configuration; an optional `endpoint` row follows the contract below. The old
homepage Doc Search is suppressed when Fjsearch or Backend Search is present,
so only the explicitly authored search is rendered.

The existing homepage `Doc Search (contained, homepage)` is automatically
upgraded to `Backend Search` when neither new block is present. Other Doc Search
variants are unchanged.

The standalone block is implemented in
`blocks/backend-search/backend-search.js` and
`blocks/backend-search/backend-search.css`. These files stay in the code
repository; only the authored Word content belongs in SharePoint.

To author the block directly, create a **two-column, two-row table** in Word.
Merge both cells of the first row and enter **Fjsearch** (or **Backend Search**,
which remains supported). In the second row, enter `endpoint` in the left cell
and leave the right cell empty:

| Fjsearch | |
| --- | --- |
| endpoint | |

Do not add a separate `Key` / `Value` header or put placeholder text in the empty
cell. Replace the old homepage Doc Search table with this table rather than
adding a second search block. Remove the old Doc Search configuration rows.

For reusable SharePoint content:

1. Create `fragments/search.docx` in the site's mapped SharePoint folder,
   containing only the table above.
2. Replace the homepage's old search table with a `Fragment` table containing a
   hyperlink to `/fragments/search`.
3. Use AEM Sidekick to preview the fragment first, then preview the homepage.
   Publish both when the remote search API is ready.

An empty endpoint always uses `/api/search` on the current origin; there is no
automatic localhost API endpoint. When nginx serves the corporate site by
proxying EDS content, leave this cell empty. If nginx redirects visitors onto an
EDS hostname instead, set the cell to
`https://techcouncil.corp.adobe.com/api/search` and allow that exact EDS origin
in the production backend's `ALLOWED_ORIGINS`. The same explicit configuration
is needed for direct EDS previews. HTTPS pages require an HTTPS endpoint.
Publishing the Word document does not deploy Node or create nginx routes.

The block searches automatically after **at least 3 trimmed characters**, with a
300 ms typing debounce. Search / Enter submits immediately without waiting for
the debounce. Editing or clearing cancels pending and obsolete requests;
dropping below 3 characters clears the results without making another request.
IME composition does not trigger a search until the text is committed. The
backend API still accepts 2-500 characters for other clients.

The block provides visible loading, empty, retry/error, and clear states;
announces results to assistive technology; and renders agent text as text,
never HTML.

## Remote deployment

Use the standalone Express backend's README and `deploy/` files. nginx proxies
only `/api/` to the private service, stripping that prefix; existing EDS routing
must remain unchanged. Preserve Adobe authentication/authorization and apply
ingress rate/concurrency limits. **CORS is not authentication.** Do not copy this
legacy helper, AEM login state, browser cookies or CLI tokens to the machine.
