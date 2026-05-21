# Our Recipes

A tiny, free, personal recipe website. Paste a link to a recipe you found online
and it keeps just the **ingredients** and **steps** — no blog story. Recipes are
searchable and filterable by **diet**, **difficulty**, and **cooking time**, and
your family can add their own via a Google Form.

**Live site:** https://eken97.github.io/recipes/
**Repo:** https://github.com/eken97/recipes

Nothing is installed on your computer. The tools run for free on GitHub's servers.

**Status:** Phase A is **live** (site deployed, auto-rebuilds on every push and daily).
Phase B (family Google Form) is **built but not yet switched on** — see below.

---

## Adding a recipe

Three ways, all free:

1. **Ask Claude** — "add this recipe: <link>". It fetches the page, pulls out the
   ingredients and steps, and saves it.
2. **Google Form** (for family) — everyone pastes a link in the form; the site
   updates itself automatically (see Phase B below).
3. **GitHub web editor** — edit a file in `recipes/` directly in the browser for
   quick fixes.

If a site doesn't publish clean recipe data, the recipe is still saved but marked
**“Needs review”** so you know to fill in the ingredients/steps by hand.

---

## One-time setup (Phase A — ✅ already done for this repo)

Kept here for reference / re-creating elsewhere:

1. Create a free **GitHub account** and a new **repository** (e.g. `recipes`).
2. Upload this project to it (Claude can do this for you).
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   (A token can't enable Pages automatically — this one click is required.)
4. Push once. The **Actions** tab builds and publishes the site to
   `https://USERNAME.github.io/recipes/`.

---

## Family submissions (Phase B — the Google Form)

1. Create a **Google Form** with these questions:
   - **Recipe URL** (short answer, required)
   - **Your name** (short answer)
   - **Notes / modifications** (paragraph, e.g. *“use 100g sugar instead of 150g”*)
   - **Suggested tags** (short answer, optional, e.g. *“spicy, kid-friendly”*)
2. In the Form, open the **Responses** tab → link it to a **Google Sheet**.
3. In the Sheet: **File → Share → Publish to web → (the responses tab) → CSV → Publish**.
   Copy the published `…/pub?output=csv` link.
4. In your GitHub repo: **Settings → Secrets and variables → Actions → Variables →
   New repository variable**, name `SHEET_CSV_URL`, paste the CSV link.
5. **Settings → Actions → General → Workflow permissions → "Read and write
   permissions" → Save.** This lets the daily job save imported recipes back to
   the repo and open review issues.

From then on, the site checks the sheet **once a day** (and whenever you click
**Run workflow** in the Actions tab), imports any new links, and rebuilds itself.
Notes show up as a **“Family notes”** box on the recipe; suggested tags are added.
If something couldn't be extracted, a **GitHub issue** is opened listing the
recipes that need a manual fill-in.

> Note: publishing the sheet as CSV and using a public repo make the recipe links
> readable by anyone with the URL — fine for family recipes. You can use a private
> repo instead and stay within GitHub's free tier.

---

## How it works

| File | Job |
|------|-----|
| `recipes/*.md` | One file per recipe (plain text — easy to edit by hand) |
| `scripts/extract.mjs` | Link → clean recipe file (reads the page's `schema.org/Recipe` data) |
| `scripts/import-sheet.mjs` | Reads the Google Sheet CSV → imports new links |
| `scripts/build.mjs` | Turns the recipe files into `site/data.js` |
| `site/` | The website itself (plain HTML/CSS/JS, no framework) |
| `.github/workflows/build.yml` | Runs the above on GitHub and deploys the site |

## Previewing locally (optional)

The site is just static files. If you have Python: `py -m http.server --directory site`
then open `http://localhost:8000`. You can also just double-click `site/index.html`.
You do **not** need Node.js — that only runs on GitHub's servers.
