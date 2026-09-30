// lib/sourceStatus.js
// Records which sources fetched cleanly on the last run and which didn't, so
// the report's sidebar can show it — including when the report is re-rendered
// by the server long after the fetch step (a fresh process, no run in memory).

import path from "node:path";
import fs from "node:fs";

const FILE_PATH = path.join(process.cwd(), "source-status.json");

export function saveSourceStatus(status) {
  fs.writeFileSync(FILE_PATH, JSON.stringify({ ...status, checkedAt: new Date().toISOString() }, null, 2));
}

export function loadSourceStatus() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
  } catch {
    return null;
  }
}
