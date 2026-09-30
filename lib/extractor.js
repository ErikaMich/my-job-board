// lib/extractor.js
// Sends a whole day's worth of new listings to Claude in a single request
// and gets back validated data matching our schema exactly — this is the
// only step in the whole pipeline that costs money.

import { CANDIDATE_PROFILE, FIT_PRIORITIES } from "../config.js";
import { getField, getRestOfText } from "./rawText.js";

// The candidate-specific parts of this prompt — who the candidate is and what
// they weight in a role — come from CANDIDATE_PROFILE and FIT_PRIORITIES in
// config.js, so this file holds only the generic scoring mechanics. To retune
// the scoring to your own profile, edit those two constants in config.js; you
// shouldn't need to touch the wording here.
const SYSTEM_PROMPT = `You are extracting structured data from job listings for a personal job-search tracker, and scoring how well each one fits a specific candidate. You will be given several listings at once, each labeled with an ID. For every listing, fill in every field of the schema.

Here is the candidate's background and what they're looking for:
"""
${CANDIDATE_PROFILE}
"""

Here is what matters most to this candidate when judging a role — use it as the basis for both the fit score and the pros/cons:
"""
${FIT_PRIORITIES}
"""

Rules:
- If the source text doesn't contain the information for a field (e.g. no salary listed), return an empty string for that field. Never invent, guess, or infer a value that isn't actually stated.
- For job_description: write a tight 2-3 sentence summary of the role's core responsibilities and requirements. Do not copy sentences from the original posting — rewrite in your own words.
- For company_description: one sentence on what the company actually builds or does, in plain language.
- For date_published: convert to YYYY-MM-DD format. If the listing says something relative like "posted 3 days ago," calculate the actual date from today's date, which will be provided. If there's no date signal at all, leave it blank.
- For fit_score: an integer rating how well this specific listing fits the candidate, based only on what the listing actually states. Use 0 as a special "can't be assessed" value when the listing gives too little to judge fit at all — e.g. essentially just a bare title and company with no responsibilities, requirements, team, culture, seniority, salary, or location signals to go on. Use 0 only for genuinely unassessable listings; a listing with mixed or partial signals still gets a real 1-10 score (mostly-absent signals land in the middle, not 0). When you do score 1-10, judge the listing against the candidate's priorities above: score low (1-3) if it actively contradicts the primary criteria, score in the middle (4-6) when signals are mixed or mostly absent, and reserve 8-10 for listings with clear, explicit matches on multiple primary criteria. Don't inflate the score just because information is missing, and apply the "boosts" only on top of the primary criteria, never as a substitute — a listing that contradicts the primary criteria but has a great salary should still score low overall, not jump to an 8 on compensation alone.
- For fit_notes: one short sentence (under 15 words) stating the main reason for the score.
- For pros and cons: evaluate the listing against the candidate's priorities above. Note both what's genuinely present in the listing and what's notably absent or unclear — don't pad the list with generic filler ("good benefits") if the posting doesn't actually support it.
- Keep pros and cons as short, specific phrases (5-10 words each), not full sentences.`;

const SCHEMA = {
  type: "object",
  properties: {
    listings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source_id: { type: "string" },
          company_name: { type: "string" },
          job_link: { type: "string" },
          role_name: { type: "string" },
          fit_score: { type: "integer" },
          fit_notes: { type: "string" },
          location: { type: "string" },
          salary: { type: "string" },
          company_description: { type: "string" },
          job_description: { type: "string" },
          other_notes: { type: "string" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
          date_published: { type: "string" },
        },
        required: [
          "source_id",
          "company_name",
          "job_link",
          "role_name",
          "fit_score",
          "fit_notes",
          "location",
          "salary",
          "company_description",
          "job_description",
          "other_notes",
          "pros",
          "cons",
          "date_published",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["listings"],
  additionalProperties: false,
};

// Used when no ANTHROPIC_API_KEY is set — pulls the fields sources.js already
// labeled in rawText, with no rewriting or judgment calls. No salary/company
// description/pros/cons: those require the AI step, so they're left blank
// rather than guessed.
export function basicListings(listings) {
  return listings.map((l) => ({
    source_id: l.id,
    source: l.source,
    company_name: getField(l.rawText, ["Company"]),
    job_link: l.applyUrl,
    role_name: getField(l.rawText, ["Title"]),
    fit_score: "",
    fit_notes: "Requires an API key to score.",
    location: getField(l.rawText, ["Location", "Location required"]),
    salary: getField(l.rawText, ["Salary", "Compensation"]),
    company_description: "",
    job_description: getRestOfText(l.rawText, "Description").slice(0, 1000),
    other_notes: "No ANTHROPIC_API_KEY set — raw listing only, no AI summary or pros/cons.",
    pros: [],
    cons: [],
    date_published: getField(l.rawText, ["Posted"]),
  }));
}

// Kept small enough that a chunk's worth of output (every field, for every
// listing, including free-text description/pros/cons) reliably fits under
// max_tokens. A single request covering the whole day's listings used to
// work when there were only a couple of sources — now that there are
// several, a busy day's batch can run into the hundreds, and one oversized
// request just gets its JSON truncated mid-string (an unparseable response,
// and a crashed run) rather than failing cleanly. Chunking keeps this
// working regardless of how large a single run's batch gets.
const CHUNK_SIZE = 15;

export async function extractListings(listings) {
  if (listings.length === 0) return [];

  const results = [];
  for (let i = 0; i < listings.length; i += CHUNK_SIZE) {
    const chunk = listings.slice(i, i + CHUNK_SIZE);
    try {
      results.push(...(await extractBatch(chunk)));
    } catch (err) {
      // Don't let one bad chunk take down every other listing in the run —
      // these listings' URLs were never written to the sheet, so they're
      // simply picked up again (and re-attempted) on the next run.
      console.warn(
        `Extraction failed for listings ${i + 1}-${i + chunk.length} of ${listings.length}: ${err.message}`
      );
    }
  }
  return results;
}

async function extractBatch(listings) {
  const today = new Date().toISOString().slice(0, 10);
  const batchText = listings
    .map((l) => `--- Listing ${l.id} ---\n${l.rawText}`)
    .join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Today's date: ${today}\n\n${batchText}` }],
      output_config: {
        format: {
          type: "json_schema",
          schema: SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = data.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock.text);
  return parsed.listings;
}
