// lib/filter.js
// Two cheap, keyword-based checks that run BEFORE anything gets sent to
// Claude — no point spending tokens analyzing a listing we already know
// doesn't match. These are best-effort text matches, not perfect logic;
// tune the keyword lists in config.js as you notice gaps.
//
// Both checks match against the specific labeled field (Title, Location),
// not the whole rawText blob — matching the whole blob previously let
// unrelated roles through whenever a keyword happened to appear anywhere in
// the description (e.g. a software engineering role mentioning "our product
// designers" in a team-overview paragraph, or a US-only listing mentioning
// "global" while describing the company).

import { TITLE_KEYWORDS, EUROPE_LOCATION_KEYWORDS } from "../config.js";
import { getField } from "./rawText.js";

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match, not a bare substring check — otherwise short
// keywords like "eu" or "uk" match inside unrelated words ("Deutsche",
// "Duke").
function matchesAnyKeyword(text, keywords) {
  return keywords.some((kw) => new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text));
}

// Non-restrictive filler words that can surround "remote" without adding an
// actual region — stripping them (plus punctuation) reduces "Fully Remote",
// "100% Remote", "Remote Only", "Remote-First" etc. all down to "remote".
// A location that ISN'T just this — "Remote USA", "Remote - US" — still
// reduces to something else ("remoteusa", "remoteus") and correctly falls
// through to keyword matching instead.
const REMOTE_FILLER_WORDS = /\b(fully|100%|only|friendly|first|based|work|role)\b/gi;

function isUnqualifiedRemote(location) {
  const stripped = location.toLowerCase().replace(REMOTE_FILLER_WORDS, "").replace(/[^a-z]/g, "");
  return stripped === "remote";
}

// Broad catch-all terms are legitimate signals when they're what the
// Location field itself says ("Location: Worldwide"), but too risky to also
// check against the title — job titles routinely carry team/product names
// like "Global Payments" or "Worldwide Games" that have nothing to do with
// where the role is based. Country/city names and region abbreviations
// (EMEA, UK, Germany, ...) don't have this problem, so those stay checked
// in both places.
const TITLE_UNSAFE_KEYWORDS = new Set(["worldwide", "anywhere", "global", "remote - global"]);
const TITLE_SAFE_LOCATION_KEYWORDS = EUROPE_LOCATION_KEYWORDS.filter((kw) => !TITLE_UNSAFE_KEYWORDS.has(kw));

export function matchesTitle(rawText) {
  const title = getField(rawText, ["Title"]);
  return matchesAnyKeyword(title, TITLE_KEYWORDS);
}

export function matchesLocation(rawText) {
  const title = getField(rawText, ["Title"]);
  const location = getField(rawText, ["Location", "Location required"]);
  if (location) {
    // "Remote" with no region attached doesn't actually restrict anything —
    // give it the benefit of the doubt rather than rejecting it for not
    // literally naming a European region, the same way we'd read it
    // ourselves.
    if (isUnqualifiedRemote(location)) return true;
    if (matchesAnyKeyword(location, EUROPE_LOCATION_KEYWORDS)) return true;
    // Some listings put region eligibility in the title itself (e.g.
    // "(USA/EMEA - Remote)") even when the location field only names
    // company HQ — but only check the title-safe subset (see above).
    return matchesAnyKeyword(title, TITLE_SAFE_LOCATION_KEYWORDS);
  }
  // No location field at all — fall back to the full text as a
  // lower-confidence signal rather than rejecting every listing outright.
  return matchesAnyKeyword(rawText, EUROPE_LOCATION_KEYWORDS);
}

export function passesFilters(listing) {
  return matchesTitle(listing.rawText) && matchesLocation(listing.rawText);
}
