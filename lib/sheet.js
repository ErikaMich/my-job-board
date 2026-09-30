// lib/sheet.js
// Reads and writes the local spreadsheet file that holds your table. It
// also doubles as our record of what's already been added — we just check
// the "Link to Job Post" column for anything we've seen before, so there's
// no separate database to maintain.
//
// This is a real .xlsx file sitting in this project folder — open it
// directly in Excel or Numbers, or drag it into Google Sheets any time.
// It's created automatically the first time the script runs.

// Default import, not `* as XLSX` — the xlsx package adds readFile/writeFile
// as dynamic Node-only extensions rather than static exports, so a namespace
// import silently omits readFile (present only on the default export, i.e.
// the real module.exports object).
import XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { SHEET_HEADERS, SPREADSHEET_FILE } from "../config.js";

const FILE_PATH = path.join(process.cwd(), SPREADSHEET_FILE);
const SHEET_NAME = "Jobs";

function loadWorkbook() {
  if (fs.existsSync(FILE_PATH)) {
    return XLSX.readFile(FILE_PATH);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([SHEET_HEADERS]);
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

function getRowsAsObjects(wb) {
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

export async function getExistingLinks() {
  const wb = loadWorkbook();
  const rows = getRowsAsObjects(wb);
  return new Set(rows.map((r) => r["Link to Job Post"]).filter(Boolean));
}

// Full contents of the sheet, as plain row objects — used by the HTML
// report to render every listing, not just what changed this run.
export async function getAllRows() {
  const wb = loadWorkbook();
  return getRowsAsObjects(wb);
}

export async function appendListings(listings) {
  if (listings.length === 0) return;

  const wb = loadWorkbook();
  const existingRows = getRowsAsObjects(wb);

  const newRows = listings.map((l) => ({
    "Company Name": l.company_name,
    "Source": l.source || "",
    "Link to Job Post": l.job_link,
    "Role Name": l.role_name,
    "Fit Score": l.fit_score,
    "Fit Notes": l.fit_notes,
    "Location": l.location,
    "Salary": l.salary,
    "Company Description": l.company_description,
    "Job Description": l.job_description,
    "Other Notes": l.other_notes,
    "Pros": (l.pros || []).join("\n"),
    "Cons": (l.cons || []).join("\n"),
    "Date Published": l.date_published,
    "Raw Job Text": l.raw_description || "",
  }));

  const allRows = [...existingRows, ...newRows];
  const ws = XLSX.utils.json_to_sheet(allRows, { header: SHEET_HEADERS });

  wb.Sheets[SHEET_NAME] = ws;
  if (!wb.SheetNames.includes(SHEET_NAME)) wb.SheetNames.push(SHEET_NAME);

  // Rewrites the whole file each run. Fine at the volumes this project
  // deals with (tens to low hundreds of rows) — if this ever grew into the
  // thousands, a real database would be a better fit than a spreadsheet
  // anyway.
  XLSX.writeFile(wb, FILE_PATH);
}
