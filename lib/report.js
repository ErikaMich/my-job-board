// lib/report.js
// Renders the full sheet as a standalone HTML file — the actual reading
// view. The xlsx stays a plain, unformatted data store (dedupe source +
// hand-editable table); this is where long text fields are readable.

import path from "node:path";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { getAllRows } from "./sheet.js";
import { loadSourceStatus } from "./sourceStatus.js";
import { REPORT_FILE, UNAVAILABLE_SOURCES } from "../config.js";

const FILE_PATH = path.join(process.cwd(), REPORT_FILE);

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function paragraphs(text) {
  const escaped = escapeHtml(text);
  if (!escaped) return "";
  return escaped
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
}

function bulletList(text) {
  const escaped = escapeHtml(text);
  if (!escaped) return "";
  const items = escaped.split("\n").filter(Boolean);
  return `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

// Colour tier + displayed value for a fit score. 0 is the extractor's
// "couldn't assess this" signal — a violet "?" rather than a number, so it
// reads as "unknown", not "bad"; 1-10 run red (low) to green (high).
function fitTier(rawScore) {
  const n = parseFloat(rawScore);
  if (n === 0) return { tier: "fit-unknown", shown: "?" };
  let tier = "fit-mid";
  if (!Number.isNaN(n)) {
    if (n >= 7) tier = "fit-high";
    else if (n < 4) tier = "fit-low";
  }
  return { tier, shown: escapeHtml(rawScore) };
}

function fitBadge(rawScore) {
  if (escapeHtml(rawScore) === "") return "";
  const { tier, shown } = fitTier(rawScore);
  return `<span class="fit-badge ${tier}">${shown}</span>`;
}

// Heading inside the fit popover — the score, coloured, as a title.
function fitPopTitle(rawScore) {
  if (escapeHtml(rawScore) === "") return "";
  const { tier, shown } = fitTier(rawScore);
  return `<div class="fit-pop-title"><span class="fit-pop-score ${tier}">${shown}</span>Fit score</div>`;
}

function noteSection(label, contentHtml, variant = "") {
  if (!contentHtml) return "";
  const cls = variant ? ` note-${variant}` : "";
  return `<div class="note-section${cls}"><h4 class="note-heading">${label}</h4>${contentHtml}</div>`;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match — otherwise short keywords like "eu" match inside
// unrelated words ("Deutsche", "museum").
function matchesAnyKeyword(text, keywords) {
  return keywords.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text));
}

const IRELAND_KEYWORDS = ["ireland", "dublin", "cork", "galway"];
// Deliberately just the region-wide/unqualified remote terms — NOT specific
// countries or cities. A listing tied to one particular non-Irish country
// ("Germany", "Stockholm, Sweden") should read as "Any", not "Relevant";
// only Ireland itself or something genuinely open to anywhere in Europe
// counts.
const BROAD_EUROPE_KEYWORDS = ["europe", "emea", "worldwide", "anywhere", "global"];

// "Relevant" = Ireland-based, or remote without being pinned to one
// specific non-Irish country/city — matches how the user actually reads
// these listings (see the "Relevant" location filter).
function isRelevantLocation(location) {
  if (!location) return false;
  return matchesAnyKeyword(location, IRELAND_KEYWORDS) || matchesAnyKeyword(location, BROAD_EUROPE_KEYWORDS);
}

// Source dates arrive in whatever format each job board used (RFC 2822,
// full ISO timestamps, plain YYYY-MM-DD) — normalize to a YYYY-MM-DD string
// so "most recently posted" sorting can compare them directly (string
// comparison works since the format is fixed-width and zero-padded), and
// so the displayed date is consistent.
function normalizeDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// rotate-ccw icon for the "Reset" filters button (inherits the button colour).
const RESET_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

// external-link icon revealed on hover next to a linked sidebar source.
const EXTERNAL_ICON = `<svg class="ext-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;

function renderCard(row, index = 0) {
  const company = escapeHtml(row["Company Name"]);
  const role = escapeHtml(row["Role Name"]);
  const link = row["Link to Job Post"] || "";
  const source = escapeHtml(row["Source"]);
  const location = escapeHtml(row["Location"]);
  const salary = escapeHtml(row["Salary"]);
  const isoDate = normalizeDate(row["Date Published"]);
  const displayDate = isoDate || escapeHtml(row["Date Published"]);

  // Location and salary read as scannable tags rather than a dim text run.
  const tags = [
    location ? `<span class="tag tag-location" title="${location}">${location}</span>` : "",
    salary ? `<span class="tag tag-salary">${salary}</span>` : "",
  ].filter(Boolean).join("");
  // Footer meta: source first, then date.
  const sourceMeta = [source ? `via ${source}` : "", displayDate].filter(Boolean).join(" &middot; ");
  const fitScoreNum = parseFloat(row["Fit Score"]);
  const fitAttr = Number.isNaN(fitScoreNum) ? "" : fitScoreNum;
  const relevant = isRelevantLocation(row["Location"]);

  // Everything worth reading at a glance lives in one "Fit" section now: the
  // fit rationale, then pros and cons. Job Description and Other Notes stay as
  // spreadsheet columns (Job Description still feeds the Custom CV generator)
  // but are no longer surfaced on the card.
  const fitContent = [
    paragraphs(row["Fit Notes"]),
    noteSection("Pros", bulletList(row["Pros"]), "pros"),
    noteSection("Cons", bulletList(row["Cons"]), "cons"),
  ].filter(Boolean).join("");

  return `
<article class="card" data-fit="${fitAttr}" data-date="${isoDate || ""}" data-relevant="${relevant}">
  ${fitBadge(row["Fit Score"])}
  <header>
    <h2>${role ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener">${role}</a>` : "Untitled role"}</h2>
    <div class="company">${company}</div>
  </header>
  ${tags ? `<div class="tags">${tags}</div>` : ""}
  ${row["Company Description"] ? `<section class="always">${paragraphs(row["Company Description"])}</section>` : ""}
  <div class="card-footer">
    <div class="card-actions">
      ${link ? `<a class="btn btn-primary" href="${escapeHtml(link)}" target="_blank" rel="noopener">View job</a>` : ""}
      <button type="button" class="btn btn-secondary cv-btn" data-link="${escapeHtml(link)}" data-default-label="Custom CV">Custom CV</button>
      ${fitContent ? `<button type="button" class="fit-trigger" popovertarget="fit-${index}">Fit info</button>
      <div id="fit-${index}" popover class="fit-pop">${fitPopTitle(row["Fit Score"])}${fitContent}</div>` : ""}
    </div>
    ${sourceMeta ? `<div class="card-meta">${sourceMeta}</div>` : ""}
  </div>
</article>`;
}

// Human-facing homepage for each scraped source (the fetch URLs in
// lib/sources.js point at APIs/feeds, not pages a person would open), so the
// sidebar can link each source to somewhere worth visiting.
const SOURCE_HOMEPAGES = {
  "Remotive": "https://remotive.com/",
  "HiringCafe": "https://hiring.cafe/",
  "We Work Remotely": "https://weworkremotely.com/",
  "Jobicy": "https://jobicy.com/",
  "ProductJobsAnywhere": "https://productjobsanywhere.com/",
  "We Love Product": "https://weloveproduct.co/",
  "RemoteOK": "https://remoteok.com/",
  "Workable": "https://jobs.workable.com/",
  "CareerVault": "https://careervault.io/",
  "Jobgether": "https://jobgether.com/",
  "Flexa": "https://flexa.careers/",
  "Speedrun Talent Network": "https://speedrun-talent-network.com/",
  "Himalayas": "https://himalayas.app/",
  "Working Nomads": "https://www.workingnomads.com/",
  "NoDesk": "https://nodesk.co/",
  "Landing.jobs": "https://landing.jobs/",
};

function sourceListItem(name, extra = "") {
  const url = SOURCE_HOMEPAGES[name];
  const label = escapeHtml(name);
  const inner = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><span class="src-name">${label}</span>${EXTERNAL_ICON}</a>`
    : label;
  return `<li>${inner}${extra}</li>`;
}

// The last run's per-source outcome (lib/sourceStatus.js) — split into what
// fetched cleanly, what failed this run, and what can't be scraped at all,
// since a source can fail silently (bad token, redesigned site, timeout)
// with nothing in the spreadsheet to signal it.
function renderSidebar(total, lastRun) {
  const status = loadSourceStatus();

  // Case-insensitive alphabetical order within every section.
  const byName = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" });

  const fitOptions = [9, 8, 7, 6, 5, 4, 3, 2, 1]
    .map((n) => `<option value="${n}">${n}+</option>`)
    .join("");

  const working = (status ? status.sources.filter((s) => s.ok).map((s) => s.name) : []).sort(byName);
  const broken = status ? status.sources.filter((s) => !s.ok) : [];
  const watchlistFailures = status?.watchlist?.failures || [];
  const watchlistTotal = status?.watchlist?.total || 0;
  const watchlistOk = watchlistTotal - watchlistFailures.length;

  const sourcesList = [
    ...working.map((name) => sourceListItem(name)),
    watchlistTotal
      ? `<li class="sidebar-watchlist">+ Watchlist companies <span class="sidebar-count">(${watchlistOk}/${watchlistTotal})</span></li>`
      : "",
  ].filter(Boolean).join("");

  const failedList = [...broken, ...watchlistFailures]
    .sort((a, b) => byName(a.name, b.name))
    .map((s) => `<li>${escapeHtml(s.name)}<span class="sidebar-reason">${escapeHtml(s.reason || "")}</span></li>`)
    .join("");

  const unavailableList = [...UNAVAILABLE_SOURCES]
    .sort((a, b) => byName(a.name, b.name))
    .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener"><span class="src-name">${escapeHtml(s.name)}</span>${EXTERNAL_ICON}</a></li>`)
    .join("");

  return `
<aside class="sidebar">
  <div class="sidebar-head">
    <h1 class="app-title">My job board</h1>
    ${lastRun ? `<p class="sidebar-status">Last run ${lastRun}</p>` : ""}
  </div>
  <div class="sidebar-section">
    <div class="filters-head">
      <h3>Filters</h3>
      <button type="button" id="clearFilters">${RESET_ICON}Reset</button>
    </div>
    <div class="filters">
      <label>Fit Score
        <select id="fitFilter" aria-label="Fit Score">
          <option value="">Any</option>
          ${fitOptions}
          <option value="unclear">Unclear</option>
        </select>
      </label>
      <label>Location
        <select id="locationFilter" aria-label="Location">
          <option value="relevant" selected>Relevant</option>
          <option value="any">Any</option>
        </select>
      </label>
      <label>Sort by
        <select id="sortBy" aria-label="Sort by">
          <option value="added">Newest added</option>
          <option value="posted">Most recently posted</option>
        </select>
      </label>
      <span class="filters-count" id="count">${total} / ${total} jobs shown</span>
    </div>
  </div>
  <div class="sidebar-section">
    <h3>Automatic sources</h3>
    <p class="sidebar-desc">Where the job posts come from.</p>
    <ul>${sourcesList || `<li class="sidebar-empty">None yet</li>`}</ul>
  </div>
  ${failedList ? `<div class="sidebar-section">
    <h3>Failed sources</h3>
    <p class="sidebar-desc">Didn't respond, worth a manual check.</p>
    <ul>${failedList}</ul>
  </div>` : ""}
  <div class="sidebar-section">
    <h3>Manual sources</h3>
    <p class="sidebar-desc">Can't be scraped, browse these yourself.</p>
    <ul>${unavailableList || `<li class="sidebar-empty">None</li>`}</ul>
  </div>
</aside>`;
}

// The last run's timestamp, formatted for display — shown under the page
// title (see renderReport). Empty string when no run has been recorded yet.
function lastRunText() {
  const status = loadSourceStatus();
  return status?.checkedAt
    ? new Date(status.checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";
}

const STYLE = `
  :root {
    color-scheme: light;
    --bg: #f2f2f0;
    --card-bg: #ffffff;
    --text: #1f1f1d;
    --muted: #64635c;
    --muted-soft: #6d6c64;
    --border: #e2e1dc;
    --border-strong: #d1d0c9;
    --hover-bg: #eeede8;
    --accent: #ee5a36;
    --accent-dark: #c43f1f;
    --accent-soft: rgba(238, 90, 54, 0.12);
  }

  * { box-sizing: border-box; }

  /* Visible keyboard focus for interactive elements (mouse clicks stay clean). */
  a:focus-visible,
  button:focus-visible,
  summary:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  body {
    margin: 0;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
  }

  .page {
    display: flex;
    align-items: flex-start;
    gap: 0;
  }

  .sidebar {
    flex: none;
    width: 260px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    padding: 1.75rem;
    border-right: 1px solid var(--border);
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .sidebar::-webkit-scrollbar { width: 6px; }
  .sidebar::-webkit-scrollbar-track { background: transparent; }
  .sidebar::-webkit-scrollbar-thumb {
    background: var(--border-strong);
    border-radius: 3px;
  }
  .sidebar::-webkit-scrollbar-thumb:hover { background: var(--muted-soft); }
  .sidebar-section + .sidebar-section {
    /* Negative side margins matching the sidebar's padding let the divider
       span the full width, then the padding re-indents the content. */
    margin: 1.5rem -1.75rem 0;
    padding: 1.5rem 1.75rem 0;
    border-top: 1px solid var(--border);
  }
  .sidebar h3 {
    margin: 0;
    font-family: "Bricolage Grotesque", "Inter", -apple-system, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text);
  }
  .sidebar-desc {
    margin: 0 0 0.6rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--muted-soft);
  }
  .sidebar ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .sidebar li {
    font-size: 0.875rem;
    color: var(--text);
    opacity: 0.85;
  }
  .sidebar li a {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: inherit;
    text-decoration: none;
  }
  .sidebar li a:hover { color: var(--accent); }
  .sidebar li a:hover .src-name { text-decoration: underline; }
  .ext-icon {
    flex: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .sidebar li a:hover .ext-icon { opacity: 1; }
  .sidebar-empty { font-style: italic; color: var(--muted-soft); }
  .sidebar li.sidebar-watchlist { color: var(--muted); }
  .sidebar-count { color: var(--muted); font-size: 0.75rem;}
  .sidebar-reason {
    display: block;
    color: var(--muted-soft);
    font-size: 0.75rem;
    margin-top: 0.1rem;
  }
  .main { flex: 1; min-width: 0; }
  .main-body { padding: 2rem 2rem 4rem; }

  @media (max-width: 900px) {
    .page { flex-direction: column; }
    .sidebar {
      width: 100%;
      position: static;
      height: auto;
      overflow-y: visible;
      padding: 1.75rem 1.5rem;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    .main-body { padding: 1.5rem 1.5rem 3rem; }
  }

  h1, .card h2 {
    font-family: "Bricolage Grotesque", "Inter", -apple-system, sans-serif;
  }

  .sidebar-head { margin-bottom: 1.5rem; }
  .app-title {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .sidebar-status {
    margin: 0.2rem 0 0;
    font-size: 0.75rem;
    color: var(--muted-soft);
  }

  /* "Filters" heading with the (live) job count aligned to the right. */
  .filters-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .filters-count { font-size: 0.8rem; color: var(--muted); }

  /* Filters live in the sidebar: label stacked above each full-width select. */
  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .filters label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--muted);
  }
  .filters select {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    font: inherit;
    font-size: 0.875rem;
    color: var(--text);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background-color: var(--card-bg);
    padding: 0.4rem 1.8rem 0.4rem 0.6rem;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2377766f' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.65rem center;
    cursor: pointer;
  }
  .filters select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  #clearFilters {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    padding: 0;
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition: color 0.15s ease;
  }
  #clearFilters:hover { color: var(--accent); }
  .card.hidden { display: none; }
  .no-results { display: none; color: var(--muted); }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(346px, 1fr));
    gap: 1rem;
    align-items: stretch;
  }
  @media (min-width: 1600px) {
    .grid { grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); }
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem 1.6rem 1.2rem;
  }
  .card header { padding-right: 3.25rem; }
  .card h2 { font-size: 1.25rem; font-weight: 600; line-height: 1.3; margin: 0 0 0.3rem; }
  .card h2 a { color: var(--text); text-decoration: none; }
  .card h2 a:hover { color: var(--accent); }
  .company { color: var(--text); opacity: 0.75; font-size: 1rem; font-weight: 500; }
  /* Inline flow (not flex) + box-decoration-break so a wrapping tag's
     background hugs the text on each line rather than forming one rectangle
     with empty colour on the short last line. The generous line-height keeps
     the per-line backgrounds from touching. */
  .tags { margin-top: 0.55rem; line-height: 1.5; }
  .tag {
    display: inline;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    padding: 0.15rem 0.55rem;
    border-radius: 0.5rem;
    background: var(--bg);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 500;
    margin-right: 0.3rem;
  }
  .tag-salary { background: rgba(22, 163, 74, 0.14); color: #15803d; }
  .card-meta {
    margin-top: 1rem;
    color: var(--muted-soft);
    font-size: 0.75rem;
  }

  .fit-badge {
    position: absolute;
    top: 1.5rem;
    right: 1.6rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.25rem;
    height: 2.25rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1rem;
    line-height: 1;
    font-family: "Bricolage Grotesque", sans-serif;
  }
  .fit-high { background: rgba(22, 163, 74, 0.14); color: #15803d; }
  .fit-mid  { background: rgba(217, 119, 6, 0.16); color: #b45309; }
  .fit-low  { background: rgba(220, 38, 38, 0.14); color: #b91c1c; }
  .fit-unknown { background: rgba(124, 58, 237, 0.14); color: #6d28d9; }

  .card section.always {
    margin-top: 0.85rem;
    color: var(--text);
    opacity: 0.85;
  }
  .card p { margin: 0.35rem 0; }
  .card ul { margin: 0.35rem 0; padding-left: 1.25rem; }
  .card li { margin: 0.2rem 0; }
  .note-pros ul, .note-cons ul { list-style: none; padding-left: 1.4rem; }
  .note-pros li, .note-cons li { position: relative; }
  .note-pros li::before, .note-cons li::before {
    content: "";
    position: absolute;
    left: -1.4rem;
    top: 0.28em;
    width: 0.95em;
    height: 0.95em;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: contain;
    mask-size: contain;
  }
  /* Lucide "check" / "x" as masks so the marks read as real icons. */
  .note-pros li::before {
    background-color: var(--accent);
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
  }
  .note-cons li::before {
    background-color: var(--muted);
    -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E");
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E");
  }

  /* "Fit info" opens a floating popover (below) instead of expanding the
     card, so the equal-height grid never reflows. */
  .fit-trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.4rem;
    border: none;
    background: none;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--muted);
    text-decoration: underline dotted;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 5px;
    text-decoration-thickness: 2px;
    cursor: pointer;
  }
  .fit-trigger:hover { color: var(--accent); text-decoration-color: var(--accent); }
  .fit-pop {
    position: fixed;
    inset: auto;
    margin: 0;
    max-width: 460px;
    width: max-content;
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    background: var(--card-bg);
    color: var(--text);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
    padding: 1rem 1.1rem;
    font-size: 0.95rem;
  }
  .fit-pop:popover-open { animation: fit-pop-in 0.12s ease; }
  @keyframes fit-pop-in { from { opacity: 0; transform: translateY(-4px); } }
  .fit-pop p:first-child { margin-top: 0; }
  .fit-pop p:last-child, .fit-pop .note-section:last-child ul { margin-bottom: 0; }
  .fit-pop-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    font-family: "Bricolage Grotesque", "Inter", -apple-system, sans-serif;
    font-weight: 700;
    font-size: 1rem;
    color: var(--text);
  }
  .fit-pop-score {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2.1rem;
    height: 2.1rem;
    padding: 0 0.4rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 0.95rem;
    line-height: 1;
    font-family: "Bricolage Grotesque", sans-serif;
  }
  .note-section:not(:first-child) { margin-top: 0.75rem; }
  .note-heading {
    margin: 0 0 0.2rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }

  /* Pins the actions + meta to the bottom of the card so, with equal-height
     rows, every row's buttons line up regardless of body length. */
  .card-footer { margin-top: auto; padding-top: 1rem; }
  .card-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.6rem;
  }
  .btn {
    flex: none;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    height: 32px;
    padding: 0 0.9rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    border-radius: 10px;
    border: 1px solid transparent;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease, box-shadow 0.1s ease;
  }
  /* Primary action: opening the posting. */
  .btn-primary {
    background: var(--accent);
    border-color: var(--accent-dark);
    color: #ffffff;
    box-shadow: 0 3px 0 var(--accent-dark);
  }
  .btn-primary:hover { background: #f2704f; }
  .btn-primary:active {
    transform: translateY(3px);
    box-shadow: 0 0 0 var(--accent-dark);
  }
  /* Secondary action: generating a tailored CV. */
  .btn-secondary {
    background: var(--card-bg);
    border-color: var(--border-strong);
    color: var(--muted);
    box-shadow: 0 3px 0 var(--border-strong);
  }
  .btn-secondary:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--muted-soft);
    background: var(--hover-bg);
  }
  .btn-secondary:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 0 0 var(--border-strong);
  }
  .cv-btn:disabled { cursor: default; opacity: 0.75; }
  .cv-btn.done { background: rgba(22, 163, 74, 0.14); border-color: transparent; color: #15803d; }
  .cv-btn.error { background: rgba(220, 38, 38, 0.14); border-color: transparent; color: #b91c1c; }
`;

const SCRIPT = `
  const grid = document.querySelector(".grid");
  const cards = grid ? Array.from(grid.children) : [];
  const addedOrder = cards;
  const fitFilter = document.getElementById("fitFilter");
  const locationFilter = document.getElementById("locationFilter");
  const sortBy = document.getElementById("sortBy");
  const clearBtn = document.getElementById("clearFilters");
  const countEl = document.getElementById("count");
  const noResultsEl = document.getElementById("noResults");
  const total = cards.length;

  function applySort() {
    if (!grid) return;
    if (sortBy.value === "posted") {
      const sorted = [...cards].sort((a, b) => {
        // Cards with no known date sink to the bottom rather than
        // being mistaken for the oldest listings.
        if (!a.dataset.date) return 1;
        if (!b.dataset.date) return -1;
        return b.dataset.date.localeCompare(a.dataset.date);
      });
      sorted.forEach((card) => grid.appendChild(card));
    } else {
      addedOrder.forEach((card) => grid.appendChild(card));
    }
  }

  function applyFilter() {
    const fitVal = fitFilter.value;
    // "unclear" isolates the listings the extractor couldn't score (fit 0,
    // shown as a "?"); otherwise the value is a numeric minimum.
    const minFit = fitVal && fitVal !== "unclear" ? parseFloat(fitVal) : null;
    const relevantOnly = locationFilter.value === "relevant";
    let shown = 0;

    cards.forEach((card) => {
      const fit = card.dataset.fit ? parseFloat(card.dataset.fit) : null;
      let visible = fitVal === "unclear"
        ? fit === 0
        : minFit === null || (fit !== null && fit >= minFit);
      if (relevantOnly) visible = visible && card.dataset.relevant === "true";
      card.classList.toggle("hidden", !visible);
      if (visible) shown++;
    });

    countEl.textContent = shown + " / " + total + " jobs shown";
    noResultsEl.style.display = shown === 0 ? "block" : "none";
  }

  fitFilter.addEventListener("change", applyFilter);
  locationFilter.addEventListener("change", applyFilter);
  sortBy.addEventListener("change", applySort);
  clearBtn.addEventListener("click", () => {
    fitFilter.value = "";
    locationFilter.value = "relevant";
    sortBy.value = "added";
    applySort();
    applyFilter();
  });

  // "Relevant" is the default selection in the markup, so apply it on load
  // rather than showing every listing until the user first touches a filter.
  applyFilter();

  // Fit-details popovers: the Popover API handles light-dismiss + keyboard;
  // click still toggles (for touch), and here we also open on hover. A short
  // close delay lets the pointer travel from the label onto the panel without
  // it vanishing. On open we anchor the panel to its trigger (flipping up /
  // clamping to the viewport) and spin the trigger chevron.
  document.querySelectorAll(".fit-pop").forEach((pop) => {
    const card = pop.closest(".card");
    const trigger = document.querySelector('[popovertarget="' + pop.id + '"]');
    // The "Fit info" link and the corner score bubble both open the popover;
    // it anchors to whichever one you hovered.
    const badge = card ? card.querySelector(".fit-badge") : null;
    let showTimer, hideTimer, anchor = trigger || badge;
    function position() {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = r.left;
      let top = r.bottom + 6;
      if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - 8 - pw;
      if (left < 8) left = 8;
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
    pop.addEventListener("toggle", (e) => {
      const open = e.newState === "open";
      if (trigger) trigger.classList.toggle("is-open", open);
      if (open) position();
    });
    const openFrom = (el) => {
      anchor = el;
      clearTimeout(hideTimer);
      if (pop.matches(":popover-open")) position();
      else { try { pop.showPopover(); } catch (e) {} }
    };
    const scheduleHide = () => {
      clearTimeout(showTimer);
      hideTimer = setTimeout(() => {
        if (pop.matches(":popover-open")) { try { pop.hidePopover(); } catch (e) {} }
      }, 150);
    };
    [trigger, badge].forEach((el) => {
      if (!el) return;
      el.addEventListener("mouseenter", () => { showTimer = setTimeout(() => openFrom(el), 90); });
      el.addEventListener("mouseleave", () => { clearTimeout(showTimer); scheduleHide(); });
    });
    pop.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    pop.addEventListener("mouseleave", scheduleHide);
  });

  // Only wired up when the report is served (see lib/server.js) — clicking
  // this against the static job-listings.html file has nothing to fetch()
  // against and will just show the "Failed" state.
  document.querySelectorAll(".cv-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.classList.remove("done", "error");
      btn.textContent = "Generating…";
      try {
        const res = await fetch("/customize-cv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link: btn.dataset.link }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Something went wrong.");
        btn.textContent = "Done ✓";
        btn.classList.add("done");
      } catch (err) {
        btn.textContent = "Failed — retry";
        btn.classList.add("error");
        btn.title = err.message;
        btn.disabled = false;
      }
    });
  });
`;

// Exported so lib/server.js can serve this straight from the sheet, live,
// rather than re-reading the static file this module also writes to disk.
export function renderReport(rows) {
  // Newest additions first — matches the order they were appended in.
  const cards = [...rows].reverse().map((row, i) => renderCard(row, i)).join("\n");
  const lastRun = lastRunText();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>My job board</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>%F0%9F%92%BC</text></svg>">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
<div class="page">
  ${renderSidebar(rows.length, lastRun)}
  <div class="main">
    <div class="main-body">
      ${cards ? `<div class="grid">${cards}</div>` : "<p>Nothing here yet.</p>"}
      <p class="no-results" id="noResults">No listings match these filters.</p>
    </div>
  </div>
</div>
<script>${SCRIPT}</script>
</body>
</html>`;
}

export async function generateReport() {
  const rows = await getAllRows();
  fs.writeFileSync(FILE_PATH, renderReport(rows));
  return FILE_PATH;
}

export function openReport(filePath = FILE_PATH) {
  execFile("open", [filePath], (err) => {
    if (err) console.warn("Couldn't open the report automatically:", err.message);
  });
}
