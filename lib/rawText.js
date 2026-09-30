// lib/rawText.js
// Pulls a single labeled field (e.g. "Title: ...") out of the rawText blob
// sources.js builds. Shared by filter.js (match the relevant field, not the
// whole listing) and extractor.js's no-AI fallback.
export function getField(rawText, labels) {
  for (const label of labels) {
    const match = rawText.match(new RegExp(`^${label}: (.*)$`, "m"));
    if (match && match[1] !== "Not specified" && match[1] !== "Not listed") {
      return match[1].trim();
    }
  }
  return "";
}

// For fields that span multiple lines (only Description does, currently) —
// getField's `(.*)$` deliberately stops at the first newline, which is
// correct for single-line fields but would silently truncate a multi-line
// one down to just its first line. Description is always the last labeled
// field sources.js writes, so "everything after the label" is safe here.
export function getRestOfText(rawText, label) {
  const match = rawText.match(new RegExp(`^${label}: ([\\s\\S]*)$`, "m"));
  return match ? match[1].trim() : "";
}
