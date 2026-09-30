// lib/cvCustomizer.js
// Produces a copy of the master CV with just the summary section (the 3
// free-text sentences under the header) rewritten to speak to one specific
// job — everything else in the document (bullets, layout, fonts) is left
// untouched. Shells out to the system unzip/zip like we did by hand the
// first time: a docx is just a zip of XML, and this project has no other
// reason to carry a zip-handling dependency.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CANDIDATE_PROFILE, CV_MASTER_FILE, CV_NOTES_FILE, CV_OUTPUT_DIR, CV_NAME_PREFIX } from "../config.js";

const execFileP = promisify(execFile);

// Sonnet, not the Haiku used for the fit-scoring pipeline — this text goes
// straight to a recruiter, so it's worth the extra cost for better prose.
const MODEL = "claude-sonnet-5";

function escapeXml(str) {
  return String(str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Strips everything but letters/digits and keeps the source casing, so
// "Perry Street Software" becomes "PerryStreetSoftware" — matches the
// "<CV_NAME_PREFIX>_CV_companyName" naming convention the CV files use.
function toNameSegment(str) {
  return String(str).replace(/[^a-zA-Z0-9]+/g, "") || "Company";
}

// The summary is the run of single-run paragraphs between the contact-info
// line ("Portfolio: ...") and the "Experience" heading. Locating it by
// structure, rather than matching the current wording, means this keeps
// working if you edit your own summary text later.
function locateSummaryParagraphs(xml) {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const contactIdx = paragraphs.findIndex((p) => p.includes(">Portfolio<"));
  const experienceIdx = paragraphs.findIndex(
    (p) => p.includes('w:val="Heading1"') && p.includes(">Experience<")
  );
  if (contactIdx === -1 || experienceIdx === -1 || experienceIdx <= contactIdx + 1) {
    throw new Error(
      "Couldn't find the summary section in cv/master-cv.docx (expected single-run paragraphs between the contact line and the 'Experience' heading). If you've restructured the CV, this needs updating."
    );
  }
  const summary = paragraphs.slice(contactIdx + 1, experienceIdx);
  for (const p of summary) {
    const runs = p.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [];
    if (runs.length !== 1) {
      throw new Error(
        "A summary paragraph in cv/master-cv.docx doesn't have exactly one text run — can't safely rewrite it without risking formatting."
      );
    }
  }
  return summary;
}

const PDF_EXPORT_SCRIPT = `
on run argv
  set srcPath to POSIX file (item 1 of argv)
  set outPath to (item 2 of argv)
  tell application "Pages"
    set theDoc to open srcPath
    delay 1
    export theDoc to (POSIX file outPath) as PDF
    close theDoc saving no
  end tell
end run
`;

// PDF is the format you'd actually attach to an application, but it's a
// bonus, not the source of truth — Pages isn't guaranteed to be installed,
// so a failure here is a warning, not a reason to fail the whole request.
async function exportPdf(docxPath) {
  const pdfPath = docxPath.replace(/\.docx$/, ".pdf");
  try {
    await execFileP("osascript", ["-e", PDF_EXPORT_SCRIPT, docxPath, pdfPath]);
    return pdfPath;
  } catch (err) {
    console.warn("Couldn't export a PDF (is Pages installed?):", err.message);
    return null;
  }
}

function readParagraphText(paragraph) {
  const match = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
  return match[1];
}

function withParagraphText(paragraph, newText) {
  return paragraph.replace(/(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/, (_, open, _old, close) => `${open}${escapeXml(newText)}${close}`);
}

// Optional — most listings won't need it, and the file may not exist at
// all if it hasn't been set up yet.
function readNotesFile() {
  const notesPath = path.join(process.cwd(), CV_NOTES_FILE);
  if (!fs.existsSync(notesPath)) return "";
  return fs.readFileSync(notesPath, "utf-8");
}

async function draftSummary(originalSentences, row) {
  const notes = readNotesFile();
  const notesBlock = notes
    ? `\n\nExpanded background detail — much more specific than the summary above (exact metrics, tool names, project stories). Same rule applies: never go beyond what's stated here either, and it's still bounded by Step 2 below — a specific detail from here only belongs in the summary if it answers one of the posting's own criteria. This file also contains direct quotes from colleagues (marked as such) — draw on them only as evidence for a claim you're already making in your own words, never quote or paraphrase a person's praise directly into the CV:\n"""\n${notes}\n"""`
    : "";

  const system = `You are rewriting the 3-sentence professional summary at the top of a candidate's CV so a recruiter skimming for seconds immediately sees this candidate fits THIS specific job. Optimize for scanning, not for reading as a nice paragraph.

Candidate's actual background (do not go beyond this — never invent skills, experience, or achievements not stated here):
"""
${CANDIDATE_PROFILE}
"""${notesBlock}

Work in two steps.

STEP 1 — Identify the posting's own success criteria. Look specifically for a requirements/qualifications section — headers like "What you'll need to be successful," "What we're looking for," "Requirements," "Qualifications" — since that's the clearest, most literal statement of what this employer is screening for, more reliable than tone inferred from the rest of the posting. If there's no explicit section, pull the 3-4 clearest asks from the posting as a whole. List these criteria first, before drafting anything.

STEP 2 — For each criterion, check whether the candidate's real background genuinely satisfies it, and only then use it.
- Every specific claim (a tool, a metric, a way of working) must be there because it answers one of the criteria you identified in Step 1 — not because it's true and sitting in the candidate background. If a tool or fact from the candidate's background isn't something this posting asked for, leave it out, even if it's impressive or accurate. Padding with unrequested specifics dilutes the ones that actually matter to this reader.
- Never use comparative or "rather than" framing that implies the candidate avoids, dislikes, or is worse-suited to something the posting itself values (e.g. working within a design team, collaborating with other designers, process, structure). Check what the posting's own culture/collaboration cues actually ask for, and don't contradict them just because a phrase like that exists in the candidate background above — rephrase affirmatively in terms of what the candidate does, only using a contrast if the posting itself explicitly frames it that way.

Rules:
- Return exactly 3 sentences, one per array item, in the same order/role as the originals (who I am → how I work → what I'm looking for).
- Sentence 1 must lead with the single strongest match from Step 1 — not a generic opener.
- Echo the posting's own distinctive words and phrases (not generic synonyms) for the criteria the candidate genuinely satisfies — the raw posting text is the actual wording a recruiter or ATS will pattern-match against.
- Every sentence should read as a scannable claim a recruiter can verify in one glance, not scene-setting. Cut throat-clearing phrases ("I'm a generalist who...", "I've navigated...") in favor of direct, concrete statements.
- Similar length to the originals. First person. No em-dash abuse.
- Never claim experience, tools, or achievements beyond what's in the candidate background above — mirroring the posting's language is about word choice, not inventing overlap that isn't real.`;

  const jobText = row["Raw Job Text"] || row["Job Description"] || "";

  const user = `Original summary sentences:
1. ${originalSentences[0]}
2. ${originalSentences[1]}
3. ${originalSentences[2]}

Job posting to tailor for:
Company: ${row["Company Name"] || ""}
Role: ${row["Role Name"] || ""}
Company description: ${row["Company Description"] || ""}
Fit notes: ${row["Fit Notes"] || ""}

Actual posting text (use its specific wording, not a paraphrase of it):
"""
${jobText}
"""`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      // Generous headroom: Sonnet 5 uses extended thinking by default, which
      // eats into this budget before it writes the actual JSON output — too
      // low a cap here truncates the response before any text block lands.
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              // Listed first so the model works through Step 1 (what this
              // posting actually asks for) before committing to sentences —
              // also lets us sanity-check its reasoning while tuning this.
              criteria: { type: "array", items: { type: "string" } },
              sentences: { type: "array", items: { type: "string" } },
            },
            required: ["criteria", "sentences"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const textBlock = data.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock.text);
  console.log("Success criteria identified from the posting:", parsed.criteria);
  return parsed.sentences;
}

export async function customizeCvForRow(row) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY isn't set — needed to draft the tailored summary.");
  }
  const masterPath = path.join(process.cwd(), CV_MASTER_FILE);
  if (!fs.existsSync(masterPath)) {
    throw new Error(`No master CV found at ${CV_MASTER_FILE} — add your CV there first.`);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cv-customize-"));
  const unpackedDir = path.join(workDir, "unpacked");
  try {
    await execFileP("unzip", ["-q", masterPath, "-d", unpackedDir]);

    const docPath = path.join(unpackedDir, "word", "document.xml");
    let xml = fs.readFileSync(docPath, "utf-8");

    const summaryParagraphs = locateSummaryParagraphs(xml);
    const originalSentences = summaryParagraphs.map(readParagraphText);
    const newSentences = await draftSummary(originalSentences, row);
    if (newSentences.length !== 3) {
      throw new Error("Claude didn't return exactly 3 summary sentences.");
    }

    summaryParagraphs.forEach((oldParagraph, i) => {
      const newParagraph = withParagraphText(oldParagraph, newSentences[i]);
      const occurrences = xml.split(oldParagraph).length - 1;
      if (occurrences !== 1) {
        throw new Error("Summary paragraph text wasn't unique in the document — refusing to guess which one to replace.");
      }
      xml = xml.replace(oldParagraph, newParagraph);
    });

    fs.writeFileSync(docPath, xml);

    fs.mkdirSync(path.join(process.cwd(), CV_OUTPUT_DIR), { recursive: true });
    const fileName = `${toNameSegment(CV_NAME_PREFIX)}_CV_${toNameSegment(row["Company Name"])}_${toNameSegment(row["Role Name"])}.docx`;
    const outPath = path.join(process.cwd(), CV_OUTPUT_DIR, fileName);
    fs.rmSync(outPath, { force: true });
    await execFileP("zip", ["-Xrq", outPath, "."], { cwd: unpackedDir });

    const pdfPath = await exportPdf(outPath);
    return { docxPath: outPath, pdfPath };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
