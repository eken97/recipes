// Client-side recipe browser: search, tag filters, and detail view via hash routing.
// All rendering uses textContent / createElement so recipe data can never inject HTML.

const RECIPES = Array.isArray(window.RECIPES) ? window.RECIPES : [];

const TIME_LABELS = { "under-30": "Under 30 min", "30-60": "30–60 min", "over-60": "Over 60 min" };
const DIET_LABELS = { vegan: "Vegan", vegetarian: "Vegetarian", pescatarian: "Pescatarian", meat: "Meat" };
const DIFF_LABELS = { easy: "Easy", medium: "Medium", hard: "Hard" };
const DIET_ORDER = ["vegan", "vegetarian", "pescatarian", "meat"];
const DIFF_ORDER = ["easy", "medium", "hard"];
const TIME_ORDER = ["under-30", "30-60", "over-60"];

const state = { search: "", diet: "", difficulty: "", time: "" };

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
    const hay = [recipe.title, ...(recipe.ingredients || [])].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// ---- Filter chips ------------------------------------------------------------

function buildFilterGroup(label, key, values, labelMap) {
  if (!values.length) return null;
  const group = el("div", { class: "filter-group" }, [el("span", { class: "label", text: label })]);
  for (const v of values) {
    const chip = el("button", {
      class: "chip" + (state[key] === v ? " active" : ""),
      text: labelMap[v] || v,
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
    buildFilterGroup("Diet", "diet", presentValues("diet", DIET_ORDER), DIET_LABELS),
    buildFilterGroup("Difficulty", "difficulty", presentValues("difficulty", DIFF_ORDER), DIFF_LABELS),
    buildFilterGroup("Time", "time", presentValues("time_bucket", TIME_ORDER), TIME_LABELS),
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
  if (r.needs_review) tags.appendChild(el("span", { class: "badge-review", text: "Needs review" }));
  if (t.diet) tags.appendChild(tagChip(DIET_LABELS[t.diet] || t.diet));
  if (t.difficulty) tags.appendChild(tagChip(DIFF_LABELS[t.difficulty] || t.difficulty));
  if (t.time_bucket) tags.appendChild(tagChip(TIME_LABELS[t.time_bucket] || t.time_bucket, true));

  const body = el("div", { class: "card-body" }, [
    el("h3", { class: "card-title", text: r.title }),
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

  $("empty").hidden = results.length !== 0;
  const total = RECIPES.length;
  $("count").textContent = results.length === total
    ? `${total} recipe${total === 1 ? "" : "s"}`
    : `${results.length} of ${total} recipes`;
}

// ---- Detail view -------------------------------------------------------------

function renderDetail(slug) {
  const r = RECIPES.find((x) => x.slug === slug);
  if (!r) { location.hash = ""; return; }

  $("list-view").hidden = true;
  const view = $("detail-view");
  view.hidden = false;
  view.replaceChildren();

  view.appendChild(el("button", { class: "back", text: "← All recipes", onClick: () => { location.hash = ""; } }));

  const t = r.tags || {};
  const metaBits = [];
  if (r.time_minutes) metaBits.push(`⏱ ${r.time_minutes} min`);
  if (r.servings) metaBits.push(`🍽 Serves ${r.servings}`);
  if (t.difficulty) metaBits.push(DIFF_LABELS[t.difficulty] || t.difficulty);
  if (t.diet) metaBits.push(DIET_LABELS[t.diet] || t.diet);

  const meta = el("div", { class: "detail-meta" }, [el("h2", { text: r.title })]);
  if (metaBits.length) meta.appendChild(el("div", { class: "meta-row", text: metaBits.join("  ·  ") }));
  const sub = el("div", { class: "meta-row" });
  if (r.added_by) sub.appendChild(el("span", { text: `Added by ${r.added_by}   ` }));
  if (r.source) sub.appendChild(el("a", { text: "Original recipe ↗", href: r.source, attrs: { target: "_blank", rel: "noopener" } }));
  if (sub.childNodes.length) meta.appendChild(sub);

  const head = el("div", { class: "detail-head" });
  if (r.image) head.appendChild(el("img", { class: "detail-img", attrs: { src: r.image, alt: r.title, loading: "lazy" } }));
  head.appendChild(meta);
  view.appendChild(head);

  if (r.notes) {
    view.appendChild(el("div", { class: "notes-box" }, [
      el("strong", { text: "👪 Family notes" }),
      el("span", { text: r.notes }),
    ]));
  }
  if (r.needs_review) {
    view.appendChild(el("div", { class: "review-box", text:
      "⚠ This recipe couldn't be auto-extracted cleanly — the ingredients or steps may be incomplete and need a manual fill-in." }));
  }

  const ingList = el("ul");
  (r.ingredients || []).forEach((i) => ingList.appendChild(el("li", { text: i })));
  const stepList = el("ol");
  (r.steps || []).forEach((s) => stepList.appendChild(el("li", { text: s })));

  view.appendChild(el("div", { class: "columns" }, [
    el("div", {}, [el("h3", { text: "Ingredients" }), ingList]),
    el("div", {}, [el("h3", { text: "Steps" }), stepList]),
  ]));

  window.scrollTo(0, 0);
}

// ---- Routing -----------------------------------------------------------------

function route() {
  const m = location.hash.match(/^#\/recipe\/(.+)$/);
  if (m) renderDetail(decodeURIComponent(m[1]));
  else renderList();
}

function init() {
  $("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    if (!location.hash.startsWith("#/recipe/")) renderList();
  });
  $("home-link").addEventListener("click", () => { location.hash = ""; });
  window.addEventListener("hashchange", route);

  const n = RECIPES.length;
  $("foot-count").textContent = n
    ? `${n} recipe${n === 1 ? "" : "s"} in the collection`
    : "No recipes yet — add one to get started.";

  route();
}

init();
