// Client-side recipe browser: search, tag filters, and detail view via hash routing.
// All rendering uses textContent / createElement so recipe data can never inject HTML.

const RECIPES = Array.isArray(window.RECIPES) ? window.RECIPES : [];

const DIET_ORDER = ["vegan", "vegetarian", "pescatarian", "meat"];
const DIFF_ORDER = ["easy", "medium", "hard"];
const TIME_ORDER = ["under-30", "30-60", "over-60"];

// All interface text in both languages. Recipe content (title/ingredients/steps)
// is translated separately and stored per-recipe in data.js.
const UI = {
  en: {
    brand: "🍳 Our Recipes",
    searchPlaceholder: "Search recipes or ingredients…",
    diet: "Diet", difficulty: "Difficulty", time: "Time",
    needsReview: "Needs review",
    emptyMsg: "No recipes match. Try clearing filters or search.",
    backAll: "← All recipes",
    minutes: (n) => `⏱ ${n} min`,
    serves: (n) => `🍽 Serves ${n}`,
    addedBy: (n) => `Added by ${n}`,
    originalRecipe: "Original recipe ↗",
    familyNotes: "👪 Family notes",
    reviewBox: "⚠ This recipe couldn't be auto-extracted cleanly — the ingredients or steps may be incomplete and need a manual fill-in.",
    ingredients: "Ingredients", steps: "Steps",
    countAll: (n) => `${n} recipe${n === 1 ? "" : "s"}`,
    countSome: (a, b) => `${a} of ${b} recipes`,
    footCount: (n) => n ? `${n} recipe${n === 1 ? "" : "s"} in the collection` : "No recipes yet — add one to get started.",
    diet_vegan: "Vegan", diet_vegetarian: "Vegetarian", diet_pescatarian: "Pescatarian", diet_meat: "Meat",
    diff_easy: "Easy", diff_medium: "Medium", diff_hard: "Hard",
    "time_under-30": "Under 30 min", "time_30-60": "30–60 min", "time_over-60": "Over 60 min",
  },
  de: {
    brand: "🍳 Unsere Rezepte",
    searchPlaceholder: "Rezepte oder Zutaten suchen…",
    diet: "Ernährung", difficulty: "Schwierigkeit", time: "Zeit",
    needsReview: "Zu prüfen",
    emptyMsg: "Keine passenden Rezepte. Filter oder Suche zurücksetzen.",
    backAll: "← Alle Rezepte",
    minutes: (n) => `⏱ ${n} Min`,
    serves: (n) => `🍽 ${n} Portionen`,
    addedBy: (n) => `Hinzugefügt von ${n}`,
    originalRecipe: "Originalrezept ↗",
    familyNotes: "👪 Familiennotizen",
    reviewBox: "⚠ Dieses Rezept konnte nicht sauber automatisch ausgelesen werden — Zutaten oder Schritte sind evtl. unvollständig und müssen von Hand ergänzt werden.",
    ingredients: "Zutaten", steps: "Zubereitung",
    countAll: (n) => `${n} Rezept${n === 1 ? "" : "e"}`,
    countSome: (a, b) => `${a} von ${b} Rezepten`,
    footCount: (n) => n ? `${n} Rezept${n === 1 ? "" : "e"} in der Sammlung` : "Noch keine Rezepte — füge eines hinzu.",
    diet_vegan: "Vegan", diet_vegetarian: "Vegetarisch", diet_pescatarian: "Pescetarisch", diet_meat: "Fleisch",
    diff_easy: "Einfach", diff_medium: "Mittel", diff_hard: "Schwer",
    "time_under-30": "Unter 30 Min", "time_30-60": "30–60 Min", "time_over-60": "Über 60 Min",
  },
};

function initialLang() {
  const saved = localStorage.getItem("recipe-lang");
  if (saved === "en" || saved === "de") return saved;
  return (navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en";
}

const state = { search: "", diet: "", difficulty: "", time: "", lang: initialLang() };

const T = () => UI[state.lang] || UI.en;

// Recipe fields may be a {en, de} object (new format) or a plain string/array
// (older data). Resolve to the current language with fallback either way.
function tr(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  return val[state.lang] || val.en || val.de || "";
}
function trList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return val[state.lang] || val.en || val.de || [];
  return [];
}
const dietLabel = (v) => T()[`diet_${v}`] || v;
const diffLabel = (v) => T()[`diff_${v}`] || v;
const timeLabel = (v) => T()[`time_${v}`] || v;

const $ = (id) => document.getElementById(id);

function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.href) node.href = opts.href;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.onClick) node.addEventListener("click", opts.onClick);
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

// ---- Filtering ---------------------------------------------------------------

function presentValues(key, order) {
  const found = new Set(RECIPES.map((r) => r.tags && r.tags[key]).filter(Boolean));
  return order.filter((v) => found.has(v));
}

function matches(recipe) {
  const t = recipe.tags || {};
  if (state.diet && t.diet !== state.diet) return false;
  if (state.difficulty && t.difficulty !== state.difficulty) return false;
  if (state.time && t.time_bucket !== state.time) return false;
  if (state.search) {
    const q = state.search.toLowerCase();
    // Search across both languages so a query finds a recipe regardless of toggle.
    const titles = [tr(recipe.title), recipe.title && recipe.title.en, recipe.title && recipe.title.de];
    const ings = [].concat(trList(recipe.ingredients),
      (recipe.ingredients && recipe.ingredients.en) || [],
      (recipe.ingredients && recipe.ingredients.de) || []);
    const hay = [...titles, ...ings].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// ---- Filter chips ------------------------------------------------------------

function buildFilterGroup(label, key, values, labelFn) {
  if (!values.length) return null;
  const group = el("div", { class: "filter-group" }, [el("span", { class: "label", text: label })]);
  for (const v of values) {
    const chip = el("button", {
      class: "chip" + (state[key] === v ? " active" : ""),
      text: labelFn(v),
      onClick: () => { state[key] = state[key] === v ? "" : v; renderList(); },
    });
    group.appendChild(chip);
  }
  return group;
}

function renderFilters() {
  const box = $("filters");
  box.replaceChildren();
  const groups = [
    buildFilterGroup(T().diet, "diet", presentValues("diet", DIET_ORDER), dietLabel),
    buildFilterGroup(T().difficulty, "difficulty", presentValues("difficulty", DIFF_ORDER), diffLabel),
    buildFilterGroup(T().time, "time", presentValues("time_bucket", TIME_ORDER), timeLabel),
  ].filter(Boolean);
  groups.forEach((g) => box.appendChild(g));
}

// ---- Cards / list view -------------------------------------------------------

function tagChip(text, muted) {
  return el("span", { class: muted ? "tag muted" : "tag", text });
}

function recipeCard(r) {
  const t = r.tags || {};
  const imgStyle = r.image ? `background-image:url('${encodeURI(r.image)}')` : "";
  const img = el("div", { class: "card-img", attrs: imgStyle ? { style: imgStyle } : {} });
  if (!r.image) img.textContent = "🍽️";

  const tags = el("div", { class: "card-tags" });
  if (r.needs_review) tags.appendChild(el("span", { class: "badge-review", text: T().needsReview }));
  if (t.diet) tags.appendChild(tagChip(dietLabel(t.diet)));
  if (t.difficulty) tags.appendChild(tagChip(diffLabel(t.difficulty)));
  if (t.time_bucket) tags.appendChild(tagChip(timeLabel(t.time_bucket), true));

  const body = el("div", { class: "card-body" }, [
    el("h3", { class: "card-title", text: tr(r.title) }),
    tags,
  ]);
  return el("div", {
    class: "card",
    onClick: () => { location.hash = `#/recipe/${r.slug}`; },
  }, [img, body]);
}

function renderList() {
  $("detail-view").hidden = true;
  $("list-view").hidden = false;
  renderFilters();

  const results = RECIPES.filter(matches);
  const grid = $("grid");
  grid.replaceChildren();
  results.forEach((r) => grid.appendChild(recipeCard(r)));

  $("empty").textContent = T().emptyMsg;
  $("empty").hidden = results.length !== 0;
  const total = RECIPES.length;
  $("count").textContent = results.length === total
    ? T().countAll(total)
    : T().countSome(results.length, total);
}

// ---- Detail view -------------------------------------------------------------

function renderDetail(slug) {
  const r = RECIPES.find((x) => x.slug === slug);
  if (!r) { location.hash = ""; return; }

  $("list-view").hidden = true;
  const view = $("detail-view");
  view.hidden = false;
  view.replaceChildren();

  view.appendChild(el("button", { class: "back", text: T().backAll, onClick: () => { location.hash = ""; } }));

  const t = r.tags || {};
  const title = tr(r.title);
  const metaBits = [];
  if (r.time_minutes) metaBits.push(T().minutes(r.time_minutes));
  if (r.servings) metaBits.push(T().serves(r.servings));
  if (t.difficulty) metaBits.push(diffLabel(t.difficulty));
  if (t.diet) metaBits.push(dietLabel(t.diet));

  const meta = el("div", { class: "detail-meta" }, [el("h2", { text: title })]);
  if (metaBits.length) meta.appendChild(el("div", { class: "meta-row", text: metaBits.join("  ·  ") }));
  const sub = el("div", { class: "meta-row" });
  if (r.added_by) sub.appendChild(el("span", { text: `${T().addedBy(r.added_by)}   ` }));
  if (r.source) sub.appendChild(el("a", { text: T().originalRecipe, href: r.source, attrs: { target: "_blank", rel: "noopener" } }));
  if (sub.childNodes.length) meta.appendChild(sub);

  const head = el("div", { class: "detail-head" });
  if (r.image) head.appendChild(el("img", { class: "detail-img", attrs: { src: r.image, alt: title, loading: "lazy" } }));
  head.appendChild(meta);
  view.appendChild(head);

  if (r.notes) {
    view.appendChild(el("div", { class: "notes-box" }, [
      el("strong", { text: T().familyNotes }),
      el("span", { text: r.notes }),
    ]));
  }
  if (r.needs_review) {
    view.appendChild(el("div", { class: "review-box", text: T().reviewBox }));
  }

  const ingList = el("ul");
  trList(r.ingredients).forEach((i) => ingList.appendChild(el("li", { text: i })));
  const stepList = el("ol");
  trList(r.steps).forEach((s) => stepList.appendChild(el("li", { text: s })));

  view.appendChild(el("div", { class: "columns" }, [
    el("div", {}, [el("h3", { text: T().ingredients }), ingList]),
    el("div", {}, [el("h3", { text: T().steps }), stepList]),
  ]));

  window.scrollTo(0, 0);
}

// ---- Routing -----------------------------------------------------------------

function route() {
  const m = location.hash.match(/^#\/recipe\/(.+)$/);
  if (m) renderDetail(decodeURIComponent(m[1]));
  else renderList();
}

// ---- Language switch ---------------------------------------------------------

// Update the bits of UI chrome that live outside the re-rendered views.
function applyStaticLabels() {
  document.documentElement.lang = state.lang;
  $("home-link").textContent = T().brand;
  $("search").placeholder = T().searchPlaceholder;
  $("foot-count").textContent = T().footCount(RECIPES.length);
  document.querySelectorAll("#lang-switch .lang-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === state.lang);
  });
}

function setLang(lang) {
  if (lang !== "en" && lang !== "de") return;
  state.lang = lang;
  localStorage.setItem("recipe-lang", lang);
  applyStaticLabels();
  route();
}

function buildLangSwitch() {
  const box = $("lang-switch");
  if (!box) return;
  box.replaceChildren();
  for (const lang of ["en", "de"]) {
    box.appendChild(el("button", {
      class: "lang-btn" + (state.lang === lang ? " active" : ""),
      text: lang.toUpperCase(),
      attrs: { type: "button", "aria-label": lang === "en" ? "English" : "Deutsch" },
      onClick: () => setLang(lang),
    })).dataset.lang = lang;
  }
}

function init() {
  $("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    if (!location.hash.startsWith("#/recipe/")) renderList();
  });
  $("home-link").addEventListener("click", () => { location.hash = ""; });
  window.addEventListener("hashchange", route);

  buildLangSwitch();
  applyStaticLabels();
  route();
}

init();
