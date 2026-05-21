// Extracts a clean recipe (ingredients + steps + tags) from a URL by reading the
// page's schema.org/Recipe JSON-LD structured data. No AI, no cost.
//
// CLI:  node scripts/extract.mjs "<url>" [--by "Name"] [--notes "..."] [--tags "a,b"]
// Also exports extractRecipe() for reuse by import-sheet.mjs.

import { writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as cheerio from "cheerio";
import matter from "gray-matter";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECIPES_DIR = path.join(ROOT, "recipes");

const MEAT = ["beef", "pork", "chicken", "turkey", "lamb", "bacon", "ham", "sausage",
  "veal", "duck", "prosciutto", "pancetta", "chorizo", "salami", "mince", "steak",
  "meat", "venison", "rabbit", "goose", "pepperoni", "guanciale"];
const SEAFOOD = ["fish", "salmon", "tuna", "cod", "shrimp", "prawn", "anchovy", "crab",
  "lobster", "mussel", "clam", "oyster", "squid", "scallop", "sardine", "mackerel",
  "trout", "haddock", "tilapia", "seafood", "calamari", "octopus"];
const ANIMAL = ["milk", "cheese", "butter", "cream", "egg", "yogurt", "yoghurt", "honey",
  "gelatin", "parmesan", "mozzarella", "cheddar", "ricotta", "mascarpone", "ghee",
  "buttermilk", "feta", "lard"];

const DIET_FROM_SCHEMA = {
  vegandiet: "vegan",
  vegetariandiet: "vegetarian",
  lowfatdiet: null,
  glutenfreediet: null,
};

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  deg: "°", frac12: "½", frac14: "¼", frac34: "¾",
};

// JSON.parse leaves HTML entities (e.g. &#39;, &amp;) intact; decode them so
// extracted text reads cleanly regardless of how the source site encoded it.
function decodeEntities(str) {
  return String(str).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (code[0] === "#") {
      const cp = code[1].toLowerCase() === "x"
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return code in NAMED_ENTITIES ? NAMED_ENTITIES[code] : m;
  });
}

export async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return await res.text();
}

// Walk arbitrary JSON-LD looking for the first node whose @type includes "Recipe".
function findRecipeNode(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const t = node["@type"];
  const types = Array.isArray(t) ? t : [t];
  if (types.some((x) => typeof x === "string" && x.toLowerCase() === "recipe")) {
    return node;
  }
  if (node["@graph"]) return findRecipeNode(node["@graph"]);
  return null;
}

function firstString(value) {
  if (value == null) return "";
  if (typeof value === "string") return decodeEntities(value).trim();
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === "object") return firstString(value.url || value.text || value.name);
  return String(value).trim();
}

function isoDurationToMinutes(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return null;
  const [, d, h, min] = m;
  const total = (Number(d || 0) * 24 * 60) + (Number(h || 0) * 60) + Number(min || 0);
  return total > 0 ? total : null;
}

function flattenInstructions(instr) {
  const steps = [];
  const push = (text) => {
    const t = decodeEntities(String(text || "")).replace(/\s+/g, " ").trim();
    if (t) steps.push(t);
  };
  const walk = (node) => {
    if (!node) return;
    if (typeof node === "string") {
      // A single string may contain multiple newline-separated steps.
      node.split(/\r?\n+/).forEach((line) => push(line));
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const type = (node["@type"] || "").toString().toLowerCase();
    if (type.includes("howtosection") && node.itemListElement) {
      walk(node.itemListElement);
      return;
    }
    if (node.text) { push(node.text); return; }
    if (node.itemListElement) { walk(node.itemListElement); return; }
    if (node.name) push(node.name);
  };
  walk(instr);
  return steps;
}

function dietFromIngredients(ingredients) {
  const blob = ingredients.join(" \n ").toLowerCase();
  const has = (words) => words.some((w) => new RegExp(`\\b${w}s?\\b`).test(blob));
  if (has(MEAT)) return "meat";
  if (has(SEAFOOD)) return "pescatarian";
  if (has(ANIMAL)) return "vegetarian";
  return "vegan";
}

function dietFromSchema(node) {
  const raw = node.suitableForDiet;
  if (!raw) return null;
  const vals = Array.isArray(raw) ? raw : [raw];
  for (const v of vals) {
    const key = String(v).toLowerCase().replace(/^.*\//, "").replace(/[^a-z]/g, "");
    if (key in DIET_FROM_SCHEMA && DIET_FROM_SCHEMA[key]) return DIET_FROM_SCHEMA[key];
  }
  return null;
}

function difficultyHeuristic(ingredients, steps, minutes) {
  const i = ingredients.length, s = steps.length, t = minutes || 0;
  if (i <= 7 && s <= 6 && (t === 0 || t <= 30)) return "easy";
  if (i >= 14 || s >= 12 || t >= 90) return "hard";
  return "medium";
}

function timeBucket(minutes) {
  if (!minutes) return null;
  if (minutes < 30) return "under-30";
  if (minutes <= 60) return "30-60";
  return "over-60";
}

function slugify(str) {
  const base = String(str || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "recipe";
}

function parseServings(recipeYield) {
  const s = firstString(recipeYield);
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : (s || null);
}

// Pure extraction: HTML string -> structured recipe (no file I/O).
export function extractFromHtml(html, url) {
  const $ = cheerio.load(html);
  let recipeNode = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipeNode) return;
    const txt = $(el).contents().text();
    if (!txt) return;
    try {
      const data = JSON.parse(txt);
      recipeNode = findRecipeNode(data);
    } catch {
      /* malformed JSON-LD block, skip */
    }
  });

  if (!recipeNode) {
    return { found: false, source: url };
  }

  const title = firstString(recipeNode.name) || "Untitled recipe";
  const image = firstString(recipeNode.image);
  const ingredients = (recipeNode.recipeIngredient || recipeNode.ingredients || [])
    .map((x) => decodeEntities(String(x)).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const steps = flattenInstructions(recipeNode.recipeInstructions);
  const minutes =
    isoDurationToMinutes(recipeNode.totalTime) ||
    (isoDurationToMinutes(recipeNode.cookTime) || 0) + (isoDurationToMinutes(recipeNode.prepTime) || 0) ||
    null;

  const diet = dietFromSchema(recipeNode) || dietFromIngredients(ingredients);

  return {
    found: true,
    source: url,
    title,
    image,
    servings: parseServings(recipeNode.recipeYield),
    time_minutes: minutes,
    ingredients,
    steps,
    diet,
    difficulty: difficultyHeuristic(ingredients, steps, minutes),
  };
}

// Build the markdown file content + slug from a structured recipe.
export function buildMarkdown(recipe, opts = {}) {
  const extraTags = (opts.tags || [])
    .map((t) => String(t).trim().toLowerCase())
    .filter(Boolean);

  const tags = {};
  if (recipe.diet) tags.diet = recipe.diet;
  if (recipe.difficulty) tags.difficulty = recipe.difficulty;
  const bucket = timeBucket(recipe.time_minutes);
  if (bucket) tags.time_bucket = bucket;
  if (extraTags.length) tags.extra = extraTags;

  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];
  const needsReview = !recipe.found || ingredients.length === 0 || steps.length === 0;

  const frontmatter = {
    title: recipe.title || "Untitled recipe",
    source: recipe.source,
    image: recipe.image || "",
    servings: recipe.servings ?? "",
    time_minutes: recipe.time_minutes ?? "",
    tags,
    added_by: opts.by || "",
    notes: opts.notes || "",
    needs_review: needsReview,
  };

  const body = [
    "## Ingredients",
    ingredients.length ? ingredients.map((i) => `- ${i}`).join("\n") : "- (add ingredients here)",
    "",
    "## Steps",
    steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "1. (add steps here)",
    "",
  ].join("\n");

  const content = matter.stringify(body, frontmatter);
  const slug = slugify(recipe.title) + (recipe.found ? "" : "-todo");
  return { slug, content, needsReview };
}

async function uniqueSlug(slug) {
  let existing = [];
  try {
    existing = await readdir(RECIPES_DIR);
  } catch {
    return slug;
  }
  if (!existing.includes(`${slug}.md`)) return slug;
  let n = 2;
  while (existing.includes(`${slug}-${n}.md`)) n++;
  return `${slug}-${n}`;
}

// Full pipeline: fetch URL -> write recipes/<slug>.md. Returns metadata.
export async function extractRecipe(url, opts = {}) {
  let recipe;
  try {
    const html = await fetchHtml(url);
    recipe = extractFromHtml(html, url);
  } catch (err) {
    recipe = { found: false, source: url, title: "Could not fetch", _error: err.message };
  }
  recipe.source = url;

  const { slug: baseSlug, content, needsReview } = buildMarkdown(recipe, opts);
  const slug = await uniqueSlug(baseSlug);
  await mkdir(RECIPES_DIR, { recursive: true });
  const filePath = path.join(RECIPES_DIR, `${slug}.md`);
  await writeFile(filePath, content, "utf8");
  return { slug, filePath, needsReview, found: recipe.found, title: recipe.title };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--by") out.by = argv[++i];
    else if (a === "--notes") out.notes = argv[++i];
    else if (a === "--tags") out.tags = (argv[++i] || "").split(",");
    else out._.push(a);
  }
  return out;
}

// Run as CLI when invoked directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  const url = args._[0];
  if (!url) {
    console.error('Usage: node scripts/extract.mjs "<url>" [--by Name] [--notes "..."] [--tags a,b]');
    process.exit(1);
  }
  extractRecipe(url, args)
    .then((r) => {
      console.log(`${r.needsReview ? "FLAGGED (needs manual entry)" : "OK"}: ${r.title}`);
      console.log(`  -> recipes/${r.slug}.md`);
    })
    .catch((err) => {
      console.error("Failed:", err.message);
      process.exit(1);
    });
}
