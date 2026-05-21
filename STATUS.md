# Where we're currently at — Recipe site

_Handoff notes so a new chat/context can continue without re-deriving everything._
_Last updated: 2026-05-21._

## What this project is

A free, zero-cost personal + family recipe website. You paste a recipe link; a tool
reads the page's hidden `schema.org/Recipe` structured data (JSON-LD) and keeps only
the **ingredients** and **steps** (no blog fluff). Recipes are searchable and
filterable by **diet / difficulty / cooking time**. Family members will later submit
links via a Google Form and the site rebuilds itself.

Owner: **Elias** (GitHub `eken97`). Non-technical — keep explanations plain and keep
his machine install-free; he prefers asking Claude to do edits over running tools.

## Live now

- **Site (LIVE):** https://eken97.github.io/recipes/
- **Repo:** https://github.com/eken97/recipes (public)
- Auto-deploys via GitHub Actions on every push to `main` and daily at 06:00 UTC.

## Status by phase

- **Phase A — Core site: ✅ DONE & DEPLOYED.** Extractor, static site (search +
  Diet/Difficulty/Time filters + detail view + Family-notes box), CI build/deploy.
  3 seed recipes live (lasagna = meat/hard/over-60, pancakes = vegetarian/easy/under-30,
  hummus = vegan/easy/under-30).
- **Phase B — Family Google Form: not switched on yet.** All code exists
  (`scripts/import-sheet.mjs`, the workflow's import/commit steps). Pending USER
  actions: create the Google Form, link a Sheet, publish it as CSV, add repo variable
  `SHEET_CSV_URL`, and set Workflow permissions to "Read and write". Steps are in
  `README.md`.

## How the pipeline works

1. `recipes/<slug>.md` — one Markdown file per recipe (YAML frontmatter for
   title/source/image/servings/time_minutes/tags/added_by/notes/needs_review; body has
   `## Ingredients` and `## Steps`).
2. `scripts/extract.mjs` — fetch URL → parse JSON-LD Recipe → write a recipe `.md`.
   Derives tags: time bucket from total time; diet via `suitableForDiet` or an
   ingredient meat/seafood/animal word scan; difficulty via an ingredient/step/time
   heuristic. Decodes HTML entities. If no Recipe data: writes a stub with
   `needs_review: true`.
3. `scripts/build.mjs` — reads all `recipes/*.md` → writes `site/data.js`
   (`window.RECIPES = [...]`). It's a `.js` (not `.json`) on purpose so the site works
   when opened from `file://` with no server.
4. `site/` — `index.html` + `app.js` + `style.css`. Pure client-side: renders cards,
   search, tag filters, and a detail view via hash routing (`#/recipe/<slug>`). All
   rendering uses `textContent`/`createElement` (no HTML injection).
5. `scripts/import-sheet.mjs` (Phase B) — fetches the published Sheet CSV, finds URLs
   not in `data/processed-urls.json`, runs the extractor with each row's name/notes/
   suggested-tags, opens a GitHub issue for any `needs_review` results.
6. `.github/workflows/build.yml` — on push/dispatch/daily: `npm install` → (import, on
   schedule/dispatch only) → `npm run build` → (commit imported recipes, `[skip ci]`) →
   deploy `site/` to Pages.

## Environment facts (this Windows machine)

- **Node.js is NOT installed**, and won't be (by design). So the `npm run …` scripts
  can't run locally — they only run on GitHub Actions.
- **Therefore, to add a recipe locally, Claude does the extraction itself**: fetch the
  page (curl/WebFetch), read its `application/ld+json` Recipe block, and write the
  `recipes/<slug>.md` + update `site/data.js` by hand in the same format the scripts
  produce. Then commit + push.
- `py` (Python 3.13) IS available — used to serve the site for local preview
  (`.claude/launch.json` defines a "recipes" server on port 8099 via the preview tool).
- `git` is installed; **Git Credential Manager** handles GitHub auth (browser popup on
  first push — already authenticated as `eken97`). `gh` CLI is NOT installed.
- Workflow run status can be checked **unauthenticated** via the public API, e.g.:
  `curl -s "https://api.github.com/repos/eken97/recipes/actions/runs?per_page=1"`
  and `.../check-runs/<id>/annotations` for error messages.

## To add a recipe (the normal flow)

User says "add this recipe: <link>". Claude:
1. Fetches the page and extracts title/image/servings/time/ingredients/steps from the
   JSON-LD (same logic as `extract.mjs`).
2. Writes `recipes/<slug>.md` and adds the matching object to `site/data.js`
   (sorted by title), `needs_review: false` unless ingredients/steps are missing.
3. `git add … && git commit && git push`. Live in ~1 minute.

## Key decisions & gotchas (don't relearn the hard way)

- **`needs_review` only flags missing ingredients/steps**, NOT guessed diet/difficulty.
  (The original plan said "flag anything guessed," but diet/difficulty are always
  guessed, which would flag every recipe — so we narrowed it. Elias is fine with this.)
- **GitHub Pages had to be enabled by a human** (Settings → Pages → Source: "GitHub
  Actions"). A workflow token canNOT create the Pages site — it fails with "Resource
  not accessible by integration." We removed `enablement: true` from the workflow.
- **`site/data.js` is generated**, but it's committed so the site previews from disk and
  so the first deploy has data. CI regenerates it each build.
- **Diet heuristic** word lists live at the top of `scripts/extract.mjs`
  (MEAT/SEAFOOD/ANIMAL). Order: meat → seafood (pescatarian) → animal (vegetarian) →
  vegan. Tweak there if it mis-tags.
- Nutrition was intentionally **dropped from v1** (can't estimate it free + simply).
  Future preference if revisited: per-100g when derivable.

## Suggested next steps

- (Optional) Add more real recipes — just ask.
- Turn on **Phase B** (Google Form) when ready — follow README Phase B steps; Claude can
  guide and verify.
- (Optional, later) custom domain, a "needs review" filter chip surfaced in the UI,
  print-friendly recipe view.

## Pointers

- Full design rationale: the approved plan at
  `C:\Users\Elias\.claude\plans\i-have-an-idea-wise-eich.md`.
- User-facing how-to: `README.md`.
