// Reads a published Google Sheet (CSV) of family recipe submissions, imports any
// new links via extract.mjs, and opens a GitHub issue if any need manual review.
//
// Env:
//   SHEET_CSV_URL      published "…/pub?output=csv" link (required to do anything)
//   GITHUB_TOKEN       optional — enables opening a review issue
//   GITHUB_REPOSITORY  "owner/repo" — provided automatically in GitHub Actions

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { extractRecipe } from "./extract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROCESSED = path.join(ROOT, "data", "processed-urls.json");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Map the form's columns by fuzzy header match (column order/wording can vary).
function columnIndex(headers, ...keywords) {
  const lower = headers.map((h) => h.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (keywords.some((k) => lower[i].includes(k))) return i;
  }
  return -1;
}

async function loadProcessed() {
  try {
    const arr = JSON.parse(await readFile(PROCESSED, "utf8"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return u.trim();
  }
}

async function openReviewIssue(items) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || items.length === 0) return;

  const lines = items.map((r) => `- [ ] **${r.title}** — \`recipes/${r.slug}.md\` (${r.source})`);
  const body = [
    "These recipes were imported but couldn't be auto-extracted cleanly.",
    "Please open each file and fill in the ingredients/steps:",
    "",
    ...lines,
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "family-recipes-bot",
    },
    body: JSON.stringify({ title: "🍳 Recipes needing manual entry", body }),
  });
  if (!res.ok) console.error(`Could not open review issue: HTTP ${res.status}`);
  else console.log("Opened a review issue for", items.length, "recipe(s).");
}

async function main() {
  const csvUrl = process.env.SHEET_CSV_URL;
  if (!csvUrl) {
    console.log("SHEET_CSV_URL not set — skipping family import (Phase B not configured yet).");
    return;
  }

  const res = await fetch(csvUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching sheet CSV`);
  const rows = parseCsv(await res.text()).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 2) { console.log("Sheet has no submissions yet."); return; }

  const headers = rows[0];
  const iUrl = columnIndex(headers, "url", "link");
  const iBy = columnIndex(headers, "name", "your name");
  const iNotes = columnIndex(headers, "note", "modification");
  const iTags = columnIndex(headers, "tag");
  if (iUrl === -1) throw new Error("No recipe-URL column found in the sheet.");

  const processed = await loadProcessed();
  const newlyProcessed = [];
  const needReview = [];

  for (const row of rows.slice(1)) {
    const rawUrl = (row[iUrl] || "").trim();
    if (!rawUrl) continue;
    const url = normalizeUrl(rawUrl);
    if (processed.has(url)) continue;

    const opts = {
      by: iBy >= 0 ? (row[iBy] || "").trim() : "",
      notes: iNotes >= 0 ? (row[iNotes] || "").trim() : "",
      tags: iTags >= 0 ? (row[iTags] || "").split(",").map((t) => t.trim()).filter(Boolean) : [],
    };

    try {
      const result = await extractRecipe(url, opts);
      console.log(`${result.needsReview ? "FLAGGED" : "OK"}: ${result.title} -> recipes/${result.slug}.md`);
      if (result.needsReview) needReview.push({ ...result, source: url });
    } catch (err) {
      console.error(`Failed to import ${url}: ${err.message}`);
    }
    processed.add(url);
    newlyProcessed.push(url);
  }

  if (newlyProcessed.length === 0) {
    console.log("No new submissions.");
    return;
  }

  await writeFile(PROCESSED, JSON.stringify([...processed], null, 2) + "\n", "utf8");
  console.log(`Imported ${newlyProcessed.length} new recipe(s).`);
  await openReviewIssue(needReview);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
