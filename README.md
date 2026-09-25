# Samjho — "Understand it. Calculate it. Decide better."

Samjho is a static, no-backend Indian information + decision-support website:
plain-English guides on common money/document/education questions, plus
in-browser calculators. No AI APIs, no login, no payments, no server.

## Folder structure

```
samjho/
├── dist/              ← THE WEBSITE. Upload this folder's contents as-is to any static host.
└── build/             ← Source/content that generates dist/. Edit here, not in dist/.
    ├── data/
    │   ├── site.js         Nav, footer, categories, AdSense placeholder IDs
    │   ├── articles.js     All guide content (the 10 "What is X?" articles)
    │   └── calculators.js  Calculator metadata (titles, descriptions, keywords)
    ├── templates/
    │   └── layout.js       Shared HTML shell: header, footer, <head> metadata
    ├── assets/
    │   ├── css/style.css   All styling (single stylesheet, CSS variables)
    │   ├── indexnow/       IndexNow key file(s), copied to the site root on build
    │   └── js/
    │       ├── main.js         Mobile nav + client-side search
    │       └── calculators.js  All six calculators' logic
    ├── scripts/
    │   └── ping-indexnow.js  Submits dist/sitemap.xml URLs to Bing/Yandex/Naver
    └── build.js         The generator — reads data/, writes dist/
```

## How it's built

`dist/` is generated, not hand-written. Every guide article and calculator page
shares the same header, footer and typography from `templates/layout.js`, so
there is exactly one place to change the design.

To rebuild after editing content:

```bash
cd build
node build.js
```

This regenerates the entire `dist/` folder from scratch (safe to delete and
re-run any time — nothing in `dist/` should be hand-edited).

## Deploying

`dist/` is a plain static site — every page is a real `.html` file at its own
folder (e.g. `dist/guides/what-is-gst/index.html` → `/guides/what-is-gst/`).
Upload the **contents** of `dist/` to any static host:

- Netlify / Vercel: drag-and-drop the `dist` folder, or point a build at `build/` with build command `node build.js` and publish directory `dist`.
- GitHub Pages / S3 / any web server: copy `dist/*` to the web root.

No Node.js, database or server process is required to *run* the site — Node
is only used to *generate* it.

## Instant indexing (IndexNow)

Bing, Yandex and Naver can be told about new or changed pages the moment you
deploy, instead of waiting for a scheduled crawl:

1. `node build.js` writes the IndexNow key file to the site root
   (`dist/<key>.txt`, e.g. `dist/6cb3ddb995af7c9d98ef41ae18d3ae7e.txt`). The key
   lives in `build/data/site.js` → `indexNow.key` and the matching file in
   `build/assets/indexnow/`.
2. Deploy `dist/` — the key file must be reachable at
   `https://samjhoindia.com/<key>.txt`.
3. Submit every URL from the sitemap:

   ```bash
   cd build
   node scripts/ping-indexnow.js --dry-run   # preview the payload
   node scripts/ping-indexnow.js             # actually ping IndexNow
   ```

The script reads `dist/sitemap.xml`, extracts every `<loc>` URL, and POSTs
`{ host, key, keyLocation, urlList }` to `https://api.indexnow.org/indexnow`
(batched at 10,000 URLs per request). Add `--key=<key>` to override the
configured key. No account, API key registration or signup is required.

IndexNow verification is done with this key **file** — there is no IndexNow
`<meta>` tag, so `templates/layout.js` needs no change.

## Before going live

1. **Domain** — update `domain` in `build/data/site.js` from the placeholder
   `https://www.samjho.in` to your real domain, then re-run `node build.js`
   (this fixes canonical URLs, sitemap.xml, robots.txt and Open Graph tags).
2. **AdSense** — `build/data/site.js` has an `adsense` object with empty
   `publisherId` and slot IDs. The site currently only shows clearly labelled
   placeholder boxes ("Advertisement space") in the header, in-content,
   sidebar and footer positions — no ad script is loaded. Once you have a
   publisher ID, wire it into `templates/layout.js` / the ad-slot markup in
   `build.js` yourself (deliberately left out so no real ad code ships before
   you're ready).
3. **Contact email** — `hello@samjho.in` is a placeholder used on the
   Contact and Privacy pages (`build.js` → `buildContact` / `buildPrivacy`).
   Replace it with a real inbox.
4. **Favicon** — a simple inline SVG favicon is generated in
   `templates/layout.js`; replace with a real icon file if you'd like.

## Adding Hindi, Telugu or Urdu later

Content is deliberately kept as plain data objects in `build/data/articles.js`
and `build/data/calculators.js`, separate from layout and styling. The
straightforward path to add a language later, without a translation engine:

1. Duplicate `data/articles.js` → `data/articles.hi.js` (etc.) with the same
   `slug`s, translated fields.
2. Extend `build.js` to loop over a `LANGS` list, writing each language's
   pages under `/hi/guides/...`, `/te/guides/...` etc., and pass the correct
   `lang` attribute + nav labels into `templates/layout.js`.
3. Add a small language switcher to the header partial.

This first version intentionally ships English-only with no translation
pipeline, per the brief — the data/layout split above is what makes adding a
language later a content task, not a rebuild.

## Calculators

All six calculators (`Percentage`, `EMI`, `GST`, `Age`, `Discount`,
`Simple Interest`) run entirely in the browser via
`dist/assets/js/calculators.js` — no values are ever sent to a server.
Each has been checked against known formulas (see the guide articles'
worked examples, which match the calculators' own output).

## What was intentionally left out

Per the brief: no AI APIs, no authentication, no payments, no admin
dashboard, no backend, no real ad code, no fake stats/testimonials/reviews,
no complex translation system. The site is a polished MVP meant to grow.

## MICRO 13 — DeepSeek AI provider (admin workflow only)

DeepSeek is the first REAL AI provider for the admin Content workflow:

    Official Government Source
    → Announcement / Press Release Detection
    → Full Official Content Fetch (RAW preserved)
    → Categorization
    → DeepSeek AI Refinement   ← new (server-side)
    → Draft Guide (status=draft)
    → Human Verification → Review → Approve → Publish

### Architecture / secure integration boundary

The DeepSeek API key is read ONLY on the server, from the `DEEPSEEK_API_KEY`
environment variable. It is never hardcoded and never shipped to the browser.

| File | Where it runs | Purpose |
| --- | --- | --- |
| `admin/ai/provider.js` | browser + Node | provider interface; status only, no secrets |
| `admin/ai/refine.js` | browser + Node | existing refinement workflow (mock in browser) |
| `admin/ai/server-bridge.js` | **server only** | secure boundary RAW+metadata → DeepSeek |
| `admin/ai/deepseek.js` | **server only** | provider implementation (payload, guard, parser) |
| `admin/ai/deepseek/*.js` | **server only** | payload builder, API request, parser, error handler |
| `test/micro13-tests.js` | Node only | 200-test suite for the provider integration |

`build/admin.js` deliberately **excludes** the server-only modules from
`dist/admin/`, so the browser bundle can never contain the boundary code.

### REQUIRED server/runtime component (to enable real AI refinement)

**MICRO 14 — implemented.** The secure server runtime now exists as a Firebase
Cloud Function (`functions/`) that runs the EXISTING Micro 13 bridge verbatim
(`functions/lib/` is a byte-identical copy emitted at build time by
`build/emit-functions.js` — no duplicated DeepSeek logic):

    Admin Panel (browser)
      → POST /api/refineDeepseek   (Hosting rewrite → Cloud Function)
      → functions/refine-handler.js (validation + existing bridge)
      → functions/lib/ai/server-bridge.js → deepseek.js → DeepSeek API
      → structured Guide Draft (status=draft) → Human Verification → Review
      → Approval → Publishing   (all existing gates unchanged)

- The browser never calls the AI provider directly and never sees the key.
- The key is read server-side from `DEEPSEEK_API_KEY` (env / Firebase
  `functions:config:set deepseek.api_key=...` / Functions v2 secrets).
- Client-side calls go through `admin/ai/server-endpoint.js`
  (`window.SamjhoServerEndpoint`), which only POSTs `{ raw, categorization }`.
- Failures (missing config, invalid key, timeout, rate limit, provider
  unavailable, malformed response, schema failure) return the same structured
  error format — no fake/partial draft, RAW untouched.
- Mock provider remains available for local/browser testing.

Until the function is deployed and the key configured, clicking
**Refine (DeepSeek)** shows a clear admin error (`FUNCTION_UNREACHABLE` /
`PROVIDER_DISABLED`), creates no draft, and leaves RAW untouched.

#### Deploying (NOT done automatically — requires project access)

The CLI here is authenticated with a different Google account; the target
project `samjho-96e3a` (in `.firebaserc`) is not in the accessible project
list, so deployment is intentionally left to the project owner:

```
firebase login                      # with an account that has samjho-96e3a
node build/build.js                 # regenerates dist/ + functions/lib/
cd functions && npm install         # install firebase-functions
firebase functions:config:set deepseek.api_key="<REAL KEY>"   # server-side only
firebase deploy --only functions,hosting
```

Any standalone Node 18+ process can also call
`functions/refine-handler.js → handleRefineRequest({ raw, categorization })`
directly as an alternative runtime.

### Configuration

Copy `.env.example` → `.env` (never commit `.env`) and set on the **server**:

```
DEEPSEEK_API_KEY=...      # required for real refinement; blank = disabled
DEEPSEEK_MODEL=deepseek-flash   # optional; model kept configurable
DEEPSEEK_BASE_URL=https://api.deepseek.com  # optional gateway/proxy override
```

### Guarantees enforced by code + tests

- Hallucination guard: claims not grounded in the RAW source are replaced with
  "Not specified in the official source." (see `helpers.isGroundedText`).
- Output validated against the **existing** Guide schema before any draft is
  created; invalid/malformed/API-failed responses produce a clear admin error
  and **no** partial/fake draft.
- Result is always `status: draft`; the AI can never approve, publish, or
  bypass the human verification / approval gates.
- RAW content and official source metadata (name, URL, published date,
  category, sub-category, user group) are preserved unchanged.
- No mock or hardcoded government content exists in the production workflow;
  mock data lives only in isolated tests.
