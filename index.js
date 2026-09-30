// index.js
// The daily run, start to finish:
//   1. Gather listings from every source
//   2. Drop anything that doesn't match your titles/location
//   3. Skip anything already sitting in the sheet
//   4. Send what's left to Claude, in one batch
//   5. Write the results as new rows

import {
  fetchRemoteOK,
  fetchRemotive,
  fetchWeWorkRemotely,
  fetchJobicy,
  fetchWeLoveProduct,
  fetchCareerVault,
  fetchHiringCafe,
  fetchWorkable,
  fetchProductJobsAnywhere,
  fetchFlexa,
  fetchJobgether,
  fetchSpeedrun,
  fetchHimalayas,
  fetchWorkingNomads,
  fetchNoDesk,
  fetchLandingJobs,
  fetchWatchlist,
} from "./lib/sources.js";
import { passesFilters } from "./lib/filter.js";
import { extractListings, basicListings } from "./lib/extractor.js";
import { getRestOfText } from "./lib/rawText.js";
import { getExistingLinks, appendListings } from "./lib/sheet.js";
import { generateReport, openReport } from "./lib/report.js";
import { startServer } from "./lib/server.js";
import { saveSourceStatus } from "./lib/sourceStatus.js";
import { WATCHLIST, CV_SERVER_PORT } from "./config.js";

// Loads .env if it exists; running without one (no API key) is a supported
// mode, so a missing file is not an error — anything else still is.
try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

// Runs one source, records whether it came back clean or not (for the
// report's sidebar), and never lets a single source's failure take down
// the rest of the run.
const sourceStatuses = [];
function track(name, promise) {
  return promise
    .then((jobs) => {
      sourceStatuses.push({ name, ok: true });
      return jobs;
    })
    .catch((e) => {
      console.warn(`${name} failed:`, e.message);
      sourceStatuses.push({ name, ok: false, reason: e.message });
      return [];
    });
}

async function run() {
  console.log("Fetching from all sources...");
  const [
    remoteok,
    remotive,
    wwr,
    jobicy,
    weloveproduct,
    careervault,
    hiringcafe,
    workable,
    productjobsanywhere,
    flexa,
    jobgether,
    speedrun,
    himalayas,
    workingnomads,
    nodesk,
    landingjobs,
    watchlist,
  ] = await Promise.all([
    track("RemoteOK", fetchRemoteOK()),
    track("Remotive", fetchRemotive()),
    track("We Work Remotely", fetchWeWorkRemotely()),
    track("Jobicy", fetchJobicy()),
    track("We Love Product", fetchWeLoveProduct()),
    track("CareerVault", fetchCareerVault()),
    track("HiringCafe", fetchHiringCafe()),
    track("Workable", fetchWorkable()),
    track("ProductJobsAnywhere", fetchProductJobsAnywhere()),
    track("Flexa", fetchFlexa()),
    track("Jobgether", fetchJobgether()),
    track("Speedrun Talent Network", fetchSpeedrun()),
    track("Himalayas", fetchHimalayas()),
    track("Working Nomads", fetchWorkingNomads()),
    track("NoDesk", fetchNoDesk()),
    track("Landing.jobs", fetchLandingJobs()),
    fetchWatchlist(WATCHLIST).catch((e) => {
      console.warn("Watchlist fetch failed:", e.message);
      return { jobs: [], failures: WATCHLIST.map((c) => ({ name: c.name, reason: e.message })) };
    }),
  ]);

  const all = [
    ...remoteok,
    ...remotive,
    ...wwr,
    ...jobicy,
    ...weloveproduct,
    ...careervault,
    ...hiringcafe,
    ...workable,
    ...productjobsanywhere,
    ...flexa,
    ...jobgether,
    ...speedrun,
    ...himalayas,
    ...workingnomads,
    ...nodesk,
    ...landingjobs,
    ...watchlist.jobs,
  ];
  console.log(`Fetched ${all.length} raw listings.`);

  saveSourceStatus({
    sources: sourceStatuses,
    watchlist: { total: WATCHLIST.length, failures: watchlist.failures },
  });

  const filtered = all.filter(passesFilters);
  console.log(`${filtered.length} match your title/location filters.`);

  console.log("Checking against what's already in the sheet...");
  const existingLinks = await getExistingLinks();
  const fresh = filtered.filter((l) => l.applyUrl && !existingLinks.has(l.applyUrl));
  console.log(`${fresh.length} are new.`);

  if (fresh.length === 0) {
    console.log("Nothing new today.");
  } else {
    let extracted;
    if (process.env.ANTHROPIC_API_KEY) {
      console.log(`Sending ${fresh.length} listings to Claude for extraction...`);
      extracted = await extractListings(fresh);
    } else {
      console.log("No ANTHROPIC_API_KEY set — saving raw listings without AI summaries or pros/cons.");
      extracted = basicListings(fresh);
    }

    // Use the URL and source name we already fetched ourselves, rather than
    // trusting Claude to have copied them exactly — safer for links that need
    // to match character-for-character, and source is deterministic data
    // Claude never needs to see in the first place.
    const freshById = Object.fromEntries(fresh.map((l) => [l.id, l]));
    const finalRows = extracted.map((e) => {
      const rawText = freshById[e.source_id]?.rawText || "";
      return {
        ...e,
        job_link: freshById[e.source_id]?.applyUrl || e.job_link,
        source: freshById[e.source_id]?.source || "",
        // The real posting text, not Claude's paraphrase of it (job_description
        // above) — kept only for CV tailoring, which needs the posting's own
        // wording, not a summary of it. Capped well short of what could
        // meaningfully bloat the sheet or a tailoring prompt.
        raw_description: getRestOfText(rawText, "Description").slice(0, 4000),
      };
    });

    console.log(`Writing ${finalRows.length} rows to the sheet...`);
    await appendListings(finalRows);
  }

  console.log("Building the HTML report...");
  await generateReport();

  // Serving it (rather than just opening the static file) is what lets the
  // "Custom CV" button on each card call back into this process.
  startServer(CV_SERVER_PORT);
  openReport(`http://localhost:${CV_SERVER_PORT}`);
}

run().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
