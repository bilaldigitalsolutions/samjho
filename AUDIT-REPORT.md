# Samjho India — Full Site Audit Report

**Date:** 8 Oct 2026 · **Commit:** `933a239` (main) · **Auditor:** automated + manual code inspection
**Scope:** `build/`, `dist/`, `admin/`, `functions/`, `supabase/`, `questions/`, `scripts/`, `test/`, config

---

## 1. Executive summary

| Area | Score | Verdict |
|---|---|---|
| Technical SEO | 88/100 | Strong — zero broken links, zero duplicate titles, sitemap complete |
| Accessibility (automated) | 85/100 | Good — alt text, labels, H1, heading order all clean |
| Security & privacy | 62/100 | **Weakest area** — Supabase RLS grants full CRUD to any authenticated user |
| Performance | 74/100 | Fine, but 421 KB PNG fallback + 103 KB blocking CSS + 25 KB JS on every page |
| Content quality / E-E-A-T | 72/100 | Real quality gates exist, but fake newsletter / trust badges / admin user remain |
| Build & repo hygiene | 58/100 | Build is reproducible, but **224 uncommitted changes** — repo ≠ deployed site |
| Test suite health | 74/100 | 9/12 suites green; 1 crash, 3 real failures, several stale expectations |

**Overall: ~75/100 — a genuinely solid, well-engineered static site with a handful of high-impact issues.**
The top 3 things to fix are: (1) Supabase RLS policies, (2) commit the uncommitted live content, (3) `noindex` on admin pages.

---

## 2. Site inventory (verified from `dist/`)

| Metric | Value |
|---|---|
| HTML pages in `dist/` | 167 (164 `index.html` + `404.html` + tool pages) |
| URLs in `sitemap.xml` | 161 |
| Guide articles | 120 |
| Category hubs | 5 (government, documents, business, money, education) |
| Calculators | 7 (age, cgpa, compound-interest, discount, emi, gst, simple-interest) |
| Scheme pages | 4 (PM Kisan, Kisan Credit Card, PM Fasal Bima, Soil Health Card) |

---

## 3. Technical SEO

### 3.1 Verified clean (evidence)

| Check | Result |
|---|---|
| Internal links resolved | **6,967 links checked → 0 broken** |
| Titles present / unique | 160/160 present · **0 duplicates** |
| Meta descriptions present | 160/160 present |
| Canonicals present / unique | 160/160 · **0 duplicates** |
| Exactly one `<h1>` per page | 160/160 · **0 pages with 0 or 2+ H1** |
| `og:image` on every page | 160/160 |
| Image `alt` attributes | **539 images, 0 missing alt** |
| Sitemap URLs that resolve to a real page | 161/161 |
| Indexable pages missing from sitemap | **0** |
| `lastmod` spread | 13 distinct dates (not all "today") — healthy |
| `404.html` | `noindex, follow` ✅ |
| `robots.txt` | sitemap declared + AI crawlers (GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended) allowed ✅ |
| `ads.txt` | `pub-6197766330959347` matches the AdSense client in `layout.js` ✅ |
| Redirect in `firebase.json` | source → destination target exists ✅ |

### 3.2 Issues found

**P1 — `llms.txt` is listed in the XML sitemap.**
`build/build.js:3565` → `urlEntry("/llms.txt", today)`. A plain-text file does not belong in `sitemap.xml` (it is not an indexable HTML page). It is the 1 sitemap URL with no `index.html`. Remove that line.

**P1 — Admin consoles are indexable.**
- `dist/admin/index.html`, `dist/admin/content/index.html`, `dist/admin/sources/index.html`, `dist/questions/admin/index.html` have **no `<meta name="robots">`** at all (default `index, follow`).
- `robots.txt` only contains `Disallow: /admin/` — there is **no `Disallow: /questions/`**, so `/questions/admin/` is both crawlable and indexable.
- `robots.txt` is a crawl hint, not an indexing control. Add `<meta name="robots" content="noindex, nofollow">` to every admin/login page and `Disallow: /questions/` to `robots.txt`.

**P2 — Duplicate meta descriptions on paginated archives (11 URLs in 3 groups).**

| Description | Pages sharing it |
|---|---|
| "Sarkari yojana samjhein — PM Kisan e-KYC, Aadhaar update, ra…" | `/government/`, `/government/page/2/`, `/government/page/3/` |
| "Everyday money explained — banking, savings, loans, inflatio…" | `/money/`, `/money/page/2/`, `/money/page/3/` |
| "Latest guides, schemes and government updates from Samjho In…" | `/updates/`, `/updates/page/2…5/` |

Titles *are* unique (`… | Page 2 | Samjho India`) and canonicals are self-referencing, so impact is limited — but the descriptions should be suffixed with "— Page N" for cleanliness.

**P2 — 3 pages ship without any JSON-LD structured data:** `/calculators/`, `/explore/`, `/404.html`.

---

## 4. Performance

**Good:**
- CSS and JS are minified at build time (`minify CSS style.css: 131559 -> 103434 bytes`, `minify JS js/main.js: 8084 -> 5334`).
- Images auto-optimised to WebP at build (`hero-illustration-new.png: 441170B -> 70276B WebP (84% saved)`, total 696 KiB saved).
- 107 article images, max 109 KB each, 6.6 MB total — reasonable.
- Fonts use `rel="preload" as="style"` + `onload` swap with `<noscript>` fallback — no blocking font request.
- `preconnect`/`dns-prefetch` for fonts, AdSense, GTM, Clarity, Supabase.
- `firebase.json` cache policy is correct: `max-age=3600` css/js, `max-age=31536000, immutable` images, `max-age=0, must-revalidate` HTML.

**Issues:**

| # | Issue | Detail |
|---|---|---|
| 1 | **421 KB PNG fallback still shipped** | `dist/assets/hero-illustration-new.png` (421 KB) sits next to the 69 KB WebP and is the `<img src>` fallback. Downscale the fallback to ~1500px or drop the `<picture>` fallback for a modern-browser-only site. Same pattern for `featured-*.png` (9–18 KB each). |
| 2 | **103 KB render-blocking CSS, no critical CSS** | Single stylesheet linked in `<head>`. Inlining above-the-fold CSS would remove one round trip. |
| 3 | **25 KB `search-data.js` on all 161 pages** | The full client-side search index is deferred on every page even though search is a secondary feature. Load it on focus / first keystroke instead. |
| 4 | **LCP image lacks `fetchpriority="high"`** | Homepage hero has `width`/`height` + `loading="eager"` (good) but no priority hint. |
| 5 | **292 `<img>` tags with no `loading`/`fetchpriority`** | Mostly the header/footer logo (2 per page × 161). Low risk, but the header logo is above the fold on every page. |
| 6 | **No HSTS / COOP header** | `firebase.json` sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy and CSP — but no `Strict-Transport-Security`, and no Cross-Origin-Opener-Policy. |

---


---

## 5. Security & privacy

**Strong (verified):**
- `.env` is **not tracked by git** (`git ls-files --error-unmatch .env` → "did not match any file(s) known to git") and is in `.gitignore`.
- `DEEPSEEK_API_KEY` is read server-side only; `build/admin.js` explicitly excludes `ai/server-bridge.js`, `ai/deepseek.js`, `ai/deepseek/*` from the browser bundle.
- `test/micro23-tests.js` → **45 passed, 0 failed**, including "No API keys in dist/admin".
- Firebase Hosting sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a CSP.
- Supabase RLS is **enabled** on `content_items`.
- The admin uses only the Supabase publishable/anon key (`admin/supabase-config.js`) — no service-role key in the browser.

**Issues:**

**P0 — Supabase RLS policies give every authenticated user full CRUD.**
`supabase/migrations/20260921000000_content_items.sql`:

```sql
CREATE POLICY admin_read   ON content_items FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_insert ON content_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY admin_update ON content_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY admin_delete ON content_items FOR DELETE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON content_items TO authenticated;
```

`TO authenticated USING (true)` means *any* account that can authenticate — including any self-signup, if email signup is enabled in Supabase Auth — can read, edit and delete the entire content table. This is the single highest-risk finding in the audit. Fix by scoping to a role/claim (e.g. `USING (auth.jwt() ->> 'role' = 'admin')`) or an allowlisted email / `admin_users` table, and disable public signups.

**P1 — CSP allows `script-src 'unsafe-inline'`.**
Required by the inline GA4/Clarity/AdSense/cookie scripts in `layout.js`. Acceptable short-term, but it removes most of CSP's XSS protection. Moving those to hashed/nonced files would let you drop `'unsafe-inline'`.

**P2 — AdSense script is loaded before consent, twice.**
`layout.js` emits a **static** `<script async src="…adsbygoogle.js?client=ca-pub-…">` in `<head>` (for AdSense crawler verification) *and* a consent-gated `window.__loadAdSense()` that injects the same script again. The static tag runs before the cookie choice is known, so a third-party ad script executes pre-consent. GA4 (`gtag.js`) is also loaded unconditionally, though Consent Mode v2 defaults everything to `denied`, which is the standard, lower-risk pattern. Consider loading the AdSense tag only after consent and using a different verification method.

**P2 — `admin/index.html` ships fake identity/status UI.**
Hardcoded `Aarav M.` / `aarav@samjho.ai`, a static "Supabase Connected · samjho-prod" badge and "Last sync 2 min ago". This is misleading in an operations console — it should reflect the real session or be removed.

**P3 — Admin auth is client-side only.** `admin/auth.js` → `SamjhoAuth.checkSession()` redirects to `/admin/login.html` when there is no session, but the HTML/JS is publicly readable and rendering starts before the redirect. The real gate must be RLS (see P0). Add `noindex` (see §3) as well.

**P3 — Stale Firebase config in `site.js`.** `build/data/site.js` carries a `firebase` block whose `measurementId: "G-T0756717X6"` appears **nowhere** in `dist/` (0 matches). The live GA4 property used by `layout.js` is `G-QH2QZWDHMM`. Nothing in `build.js`/`layout.js`/`admin.js` reads `site.firebase` at all, so it is dead config with a stale ID — a trap for the next developer.

## 6. Accessibility (automated checks)

**Passing:** skip-link (`Skip to content` → `#main`), `<html lang="en">`, `aria-label` on both search inputs and the newsletter email input, `role="search"` on the search form, `aria-current="page"` on the active nav item, `aria-expanded`/`aria-controls` on the mobile nav toggle, exactly one `<h1>` per page, heading order is sane on samples (`h1 → h2 → h3`), 0 images without `alt`, 0 `target="_blank"` links missing `rel`.

**Needs manual/attention:**
- Colour contrast was not machine-verified — needs a Lighthouse/axe pass. The design uses an amber accent `--accent:#C97A1E` on white, which is borderline for small text.
- The cookie banner is `role="dialog"` but has **no focus trap and no `aria-modal`** — keyboard/screen-reader users can tab behind it.
- The footer newsletter input is labelled only by `aria-label`; there is no visible `<label>`, so the purpose is invisible to sighted users too.
- Cookie banner markup + styles are duplicated inline in every page (from `layout.js`), so a11y fixes must be made in the template, not per page.

`/calculators/` and `/explore/` are hub pages that should carry `CollectionPage` + `ItemList`.

**P2 — Short titles and short descriptions** (`build/scripts/seo-audit.js`):

- `SHORT_TITLE` (5): `/calculators/age/` 29 chars, `/calculators/emi/` 29, `/calculators/gst/` 29, `/disclaimer/` 25, `/privacy/` 29. All are `<30` chars — room to add a benefit phrase.
- `SHORT_DESC` (8): worst offenders `/guides/locate-epfo-office/` (4 chars!), `/guides/india-literacy-leap-path-to-full-literacy/` (5), `/guides/epfo-citizens-charter/` (13), `/guides/epfo-central-board-of-trustees-cbt/` (15), `/guides/dgft-import-export-scomet-policy-guide/` (15). These are effectively empty meta descriptions — a real CTR loss.

**P2 — 34 core URLs are stamped with "today" on every rebuild.**
`build/build.js` calls `urlEntry(<core url>, today)` for the 34 sitewide pages (home, hubs, static pages, calculators). Rebuilding tomorrow rewrites 34 `lastmod` values to a false "modified today" signal. Only pages whose content actually changed should get a new date.

**P3 — Stale title spec breaks the title test.**
`test/title-audit.js` SPEC expects homepage title `"Your Questions, Clear Answers, Brighter Decisions | Samjho India"`; `build/build.js:795` emits `"Your Questions, Clear Answers | Samjho India"`. Result: `TITLE AUDIT FAIL (1)` — spec drift, not a bug, but the suite is red.

**P3 — 3 images without `width`/`height`** (`guides/pm-kisan-yojana`, `guides/what-is-pan-card`, `guides/what-is-udyam` — the `guide-hero__img` featured images). Minor CLS risk.

**P3 — `llms.txt` contradicts the site.**
It claims "…sab simple **Hindi** mein" and "simple Hindi-English mix", while every page is `<html lang="en">` and English-only. It also labels PM Kisan as "**PM Kisan Yojana 2025**" while the page is 2026. For AI-search surfaces this is an accuracy problem.

| Pagination pages | 5 updates + 2 government + 2 money |
| Static/legal pages | 6 (about, contact, privacy, terms, disclaimer, editorial-policy) |
| `dist/` total size | 13.07 MB |
| HTML total / largest page | 5.59 MB total · 55 KB largest (`guides/what-is-udyam`) |
| Images | 135 files, 7.16 MB |
| CSS (single file, minified) | 103 KB |
| JS | `main.js` 5.2 KB, `calculators.js` 10.7 KB, `search-data.js` 25.2 KB |

**Stack:** hand-rolled Node static generator (`build/build.js`, 197 KB / 3,682 lines) → `dist/`, hosted on Firebase Hosting. Admin console is Supabase Auth + Supabase REST. AI refinement exists in **two** runtimes: Firebase Function (`functions/`) and Supabase Edge Function (`supabase/functions/refine-deepseek/`).
