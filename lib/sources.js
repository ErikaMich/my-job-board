// lib/sources.js
// Functions that fetch raw job listings from each source. Every function
// returns an array of plain objects shaped like:
//   { id, source, applyUrl, rawText }
// `rawText` bundles together everything we already know about the listing
// (title, company, location, description) — that's what gets handed to
// Claude later so it can fill in the rest of the table's fields.

import Parser from "rss-parser";
import { matchesTitle, matchesLocation } from "./filter.js";

const rssParser = new Parser();

// A single unresponsive source would otherwise hang the whole run forever —
// Promise.all in index.js waits for every source, and a plain fetch() has
// no built-in timeout.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemoteOK() {
  const res = await fetchWithTimeout("https://remoteok.com/api");
  const data = await res.json();
  // The first entry in RemoteOK's response is a metadata blob, not a job —
  // filtering on `job.id` drops it automatically.
  return data
    .filter((job) => job.id)
    .map((job) => ({
      id: `remoteok-${job.id}`,
      source: "RemoteOK",
      applyUrl: job.url,
      rawText: [
        `Title: ${job.position}`,
        `Company: ${job.company}`,
        `Location: ${job.location || "Not specified"}`,
        `Tags: ${(job.tags || []).join(", ")}`,
        `Salary: ${job.salary_min ? `$${job.salary_min}-${job.salary_max}` : "Not listed"}`,
        `Posted: ${job.date}`,
        `Description: ${(job.description || "").slice(0, 4000)}`,
      ].join("\n"),
    }));
}

export async function fetchRemotive() {
  const res = await fetchWithTimeout("https://remotive.com/api/remote-jobs?category=design");
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `remotive-${job.id}`,
    source: "Remotive",
    applyUrl: job.url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${job.company_name}`,
      `Location required: ${job.candidate_required_location}`,
      `Salary: ${job.salary || "Not listed"}`,
      `Posted: ${job.publication_date}`,
      `Description: ${(job.description || "").slice(0, 4000)}`,
    ].join("\n"),
  }));
}

export async function fetchWeWorkRemotely() {
  const feed = await rssParser.parseURL(
    "https://weworkremotely.com/categories/remote-design-jobs.rss"
  );
  return feed.items.map((item, i) => {
    const description = item.contentSnippet || item.content || "";
    // Every WWR listing opens its description with "Headquarters: <region>"
    // — that's the closest thing to a structured location this feed gives
    // us, so pull it out into its own field rather than leaving location
    // buried in free text.
    const hq = description.match(/^Headquarters:\s*(.*)$/m);
    return {
      id: `wwr-${item.guid || i}`,
      source: "We Work Remotely",
      applyUrl: item.link,
      rawText: [
        `Title: ${item.title}`,
        `Location: ${hq ? hq[1].trim() : "Not specified"}`,
        `Posted: ${item.pubDate}`,
        `Description: ${description.slice(0, 4000)}`,
      ].join("\n"),
    };
  });
}

export async function fetchJobicy() {
  // 100 is the effective cap — the API silently clamps count above that.
  const res = await fetchWithTimeout("https://jobicy.com/api/v2/remote-jobs?count=100&tag=design");
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `jobicy-${job.id}`,
    source: "Jobicy",
    applyUrl: job.url,
    rawText: [
      `Title: ${job.jobTitle}`,
      `Company: ${job.companyName}`,
      `Location: ${job.jobGeo || "Not specified"}`,
      `Salary: ${
        job.salaryMin ? `${job.salaryCurrency} ${job.salaryMin}-${job.salaryMax}/${job.salaryPeriod}` : "Not listed"
      }`,
      `Posted: ${job.pubDate}`,
      `Description: ${stripHtml(job.jobDescription || job.jobExcerpt || "").slice(0, 4000)}`,
    ].join("\n"),
  }));
}

// weloveproduct.co's public API gives good structured data (salary,
// location, category, seniority) but doesn't expose full listing text —
// individual job pages inconsistently redirect to a "premium" paywall, with
// no reliable public endpoint for the description either way. So there's no
// Description field here, and the placeholder text below tells Claude not
// to penalize fit_score for the resulting lack of culture/team signals —
// that's a data-availability gap, not something the listing itself failed
// to mention.
export async function fetchWeLoveProduct() {
  const res = await fetchWithTimeout("https://api.weloveproduct.co/jobs");
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `weloveproduct-${job.id}`,
    source: "We Love Product",
    applyUrl: `https://weloveproduct.co/jobs/${job.slug}-${job.hash}`,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${job.company?.title || "Not specified"}`,
      `Location: ${formatWeLoveProductLocations(job.locations)}`,
      `Salary: ${formatWeLoveProductSalary(job.salary)}`,
      `Category: ${job.job_category?.title || "Not specified"}`,
      `Seniority: ${job.seniority || "Not specified"}`,
      `Posted: ${job.published_at}`,
      `Description: [No description text available — this source only exposes structured fields (above) via its public API, not full listing text. Do not treat the absence of culture, team-size, or autonomy signals as a negative for this listing; base fit_score only on the fields above.]`,
    ].join("\n"),
  }));
}

function formatWeLoveProductLocations(locations) {
  if (!locations || locations.length === 0) return "Not specified";
  return locations.map((l) => [l.city, l.country].filter(Boolean).join(", ")).join(" | ");
}

function formatWeLoveProductSalary(salary) {
  if (!salary || (!salary.min && !salary.max)) return "Not listed";
  const range = salary.min && salary.max ? `${salary.min}-${salary.max}` : salary.min || salary.max;
  return `${salary.currency || ""} ${range}/${salary.period || "yearly"}`.trim();
}

// hiringcafe.com has no public API, but its search page (loaded normally,
// no login) embeds real results via a `searchState` URL param, server-side
// rendered into a __NEXT_DATA__ payload — the same category of technique as
// reading any public page's content, just structured JSON instead of HTML.
//
// That payload also contains a data-exposure bug on hiringcafe.com's end:
// each result's `job_information` object carries internal fields
// (viewedByUsers, hiddenFromUsers, appliedFromUsers, savedFromUsers, and
// view/apply/save counts) that look like other users' activity data, not
// meant to be public. This was reported to them. To make sure none of that
// ever enters this pipeline, this function uses a strict allow-list: it
// only ever reads from `v5_processed_job_data` and `enriched_company_data`
// (verified clean — job/company metadata only) plus a couple of top-level
// scalar fields. `job_information` — the object where every leaked field
// lives — is never touched, parsed, or logged, even incidentally.
//
// Separately, hiringcafe.com's *location* processing has its own bug: for
// companies with many global offices, the company's whole office list
// bleeds into every individual job's location data, regardless of what
// that specific posting says (confirmed on two unrelated companies via two
// different ATS platforms — same shape both times: a scattered list of
// cities spanning several continents). So `formatted_workplace_location`
// isn't trusted directly — see resolveHiringCafeLocation below.
const HIRINGCAFE_PAGES = 3;

export async function fetchHiringCafe() {
  const searchState = encodeURIComponent(JSON.stringify({ searchQuery: "product designer" }));
  const hits = [];
  for (let page = 0; page < HIRINGCAFE_PAGES; page++) {
    const res = await fetchWithTimeout(`https://hiringcafe.com/?searchState=${searchState}&page=${page}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) break;
    const html = await res.text();
    const match = html.match(/__NEXT_DATA__[^>]*>(.*?)<\/script>/s);
    if (!match) break;
    const pageHits = JSON.parse(match[1])?.props?.pageProps?.ssrHits || [];
    if (pageHits.length === 0) break;
    hits.push(...pageHits);
  }

  const results = [];
  for (const hit of hits) {
    const job = await formatHiringCafeHit(hit);
    if (job) results.push(job);
  }
  return results;
}

// Deliberately takes only `v5_processed_job_data`, `enriched_company_data`,
// and `apply_url`/`id` off the hit — never the hit object itself or
// `job_information`, so a future edit can't accidentally start reading a
// leaked field just because it's sitting right there on the same object.
async function formatHiringCafeHit(hit) {
  const v5 = hit.v5_processed_job_data;
  if (!v5 || !hit.apply_url) return null;
  // Cheap title check before spending a location-verification request on a
  // listing that wouldn't pass anyway.
  if (!matchesTitle(`Title: ${v5.core_job_title || ""}`)) return null;

  const location = await resolveHiringCafeLocation(hit, v5);
  if (location === null) return null;

  const company = hit.enriched_company_data || {};
  return {
    id: `hiringcafe-${hit.id}`,
    source: "HiringCafe",
    applyUrl: hit.apply_url,
    rawText: [
      `Title: ${v5.core_job_title || "Not specified"}`,
      `Company: ${company.name || v5.company_name || "Not specified"}`,
      `Location: ${location}`,
      `Salary: ${formatHiringCafeSalary(v5)}`,
      `Posted: ${v5.estimated_publish_date || "Not specified"}`,
      `Description: ${formatHiringCafeDescription(v5, company)}`,
    ].join("\n"),
  };
}

// hiringcafe.com's own location fields aren't trustworthy (see above), so
// this resolves the real location a different way per source:
//   - Greenhouse/Lever/Ashby-sourced listings (~half of all listings) get
//     verified against that ATS's own API directly — the same authoritative
//     source the watchlist companies use — completely replacing
//     hiringcafe.com's claim.
//   - Everything else has no independent source to check. Rather than trust
//     an unverifiable claim, this only accepts it when the claimed
//     countries are few (real per-role remote eligibility is almost always
//     one coherent region); a long, scattered, multi-continent list is
//     exactly the shape the bug produces, so that's treated as
//     untrustworthy and the listing is dropped entirely instead of passed
//     through with a possibly-fabricated location.
// Returns the resolved location string, or null if the listing should be
// dropped.
const HIRINGCAFE_MAX_UNVERIFIED_COUNTRIES = 2;
const ashbyBoardCache = new Map();

async function resolveHiringCafeLocation(hit, v5) {
  const [source, boardToken, jobId] = (hit.id || "").split("___");

  try {
    if (source === "grnhse" && boardToken && jobId) {
      const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`);
      if (res.ok) {
        const job = await res.json();
        if (job.location?.name) return job.location.name;
      }
    } else if (source === "lever" && boardToken && jobId) {
      const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${boardToken}/${jobId}?mode=json`);
      if (res.ok) {
        const job = await res.json();
        if (job.categories?.location) return job.categories.location;
      }
    } else if (source === "ashby" && boardToken && jobId) {
      if (!ashbyBoardCache.has(boardToken)) {
        ashbyBoardCache.set(
          boardToken,
          fetchWithTimeout(`https://api.ashbyhq.com/posting-api/job-board/${boardToken}`)
            .then((r) => (r.ok ? r.json() : { jobs: [] }))
            .catch(() => ({ jobs: [] }))
        );
      }
      const board = await ashbyBoardCache.get(boardToken);
      const job = (board.jobs || []).find((j) => j.id === jobId);
      if (job?.location) return job.location;
    }
  } catch {
    // Fall through to the unverified-listing check below.
  }

  const countryCount = (v5.workplace_countries || []).length;
  if (countryCount > HIRINGCAFE_MAX_UNVERIFIED_COUNTRIES) return null;
  return v5.formatted_workplace_location || "Not specified";
}

function formatHiringCafeSalary(v5) {
  if (!v5.yearly_min_compensation && !v5.yearly_max_compensation) return "Not listed";
  const range =
    v5.yearly_min_compensation && v5.yearly_max_compensation
      ? `${v5.yearly_min_compensation}-${v5.yearly_max_compensation}`
      : v5.yearly_min_compensation || v5.yearly_max_compensation;
  return `${v5.listed_compensation_currency || ""} ${range}/yearly`.trim();
}

function formatHiringCafeDescription(v5, company) {
  return [
    v5.requirements_summary,
    v5.role_activities?.length ? `Key activities: ${v5.role_activities.join(", ")}` : "",
    v5.seniority_level ? `Seniority: ${v5.seniority_level}` : "",
    v5.workplace_type ? `Workplace type: ${v5.workplace_type}` : "",
    company.tagline ? `About the company: ${company.tagline}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// jobs.workable.com is Workable's public job board search — a plain,
// unauthenticated JSON API (no login, no browser/JS rendering needed,
// verified directly with curl). We run a handful of broad title queries
// rather than one per TITLE_KEYWORDS entry (16 queries × multiple pages
// each is excessive) and let filter.js do the real narrowing afterward,
// same division of labor as the CareerVault/HiringCafe sources below.
const WORKABLE_QUERIES = ["product designer", "ux designer", "ui designer", "ai designer"];
const WORKABLE_PAGES_PER_QUERY = 2;

export async function fetchWorkable() {
  const seen = new Set();
  const results = [];
  for (const query of WORKABLE_QUERIES) {
    let pageToken;
    for (let page = 0; page < WORKABLE_PAGES_PER_QUERY; page++) {
      const url = new URL("https://jobs.workable.com/api/v1/jobs");
      url.searchParams.set("query", query);
      if (pageToken) url.searchParams.set("token", pageToken);
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) break;
      const data = await res.json();
      for (const job of data.jobs || []) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        results.push(formatWorkableJob(job));
      }
      pageToken = data.nextPageToken;
      if (!pageToken || (data.jobs || []).length === 0) break;
    }
  }
  return results;
}

function formatWorkableJob(job) {
  return {
    id: `workable-${job.id}`,
    source: "Workable",
    applyUrl: job.url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${job.company?.title || "Not specified"}`,
      `Location: ${formatWorkableLocation(job)}`,
      `Employment type: ${job.employmentType || "Not specified"}`,
      `Posted: ${job.created || "Not specified"}`,
      `Description: ${stripHtml(job.description || "").slice(0, 4000)}`,
    ].join("\n"),
  };
}

function formatWorkableLocation(job) {
  if (job.locations?.length) return job.locations.join(" | ");
  const loc = job.location || {};
  return [loc.city, loc.countryName].filter(Boolean).join(", ") || "Not specified";
}

// jobgether.com's /astroapi/ai/jobs is a public, unauthenticated JSON API
// explicitly built (and robots.txt-allowlisted) for AI-agent consumption —
// see /astroapi/ai/jobs/docs. `locations` filters server-side (valid slugs
// are an undocumented enum — "ireland", "europe", and "anywhere" are
// confirmed working; "worldwide"/"global"/"remote" all 400 despite showing
// up as examples elsewhere in their own docs).
//
// The API's own `url` field only points at Jobgether's listing page, and
// its `postedAt` turned out to be unreliable — checked one listing against
// its real origin (Ashby) and found a ~2.5 month gap between the two, so
// it's evidently "last synced by Jobgether," not the real posting date.
// Each listing's offer page, though, embeds the real external apply link
// (no login needed to see it — only their personalized match score is
// gated) via a stable `data-role="apply-guest"` anchor attribute. So for
// every job, that page is fetched once to recover the real apply URL; when
// that URL turns out to be a Greenhouse or Lever posting — both of which
// expose a clean single-job-by-ID public endpoint — one more request pulls
// the verified real description and posting date straight from the source.
// For every other ATS (Ashby, Rippling, Teamtailor, Workable, a custom
// career page, etc.), building a same bespoke single-job lookup isn't
// worth it for every platform, so the fallback there is Jobgether's own
// rendered "Job description" section (still real, full text — just
// Jobgether's copy of it rather than the origin's) and no posting date,
// since none can be verified. Either way, the real external URL always
// replaces Jobgether's own listing page as applyUrl — a better outcome
// even when the deeper enrichment isn't available for that ATS.
const JOBGETHER_QUERIES = ["product designer", "ux designer", "ui designer", "ai designer"];
const JOBGETHER_PAGES_PER_QUERY = 2;

// Only the offer page (not the /astroapi/ai/jobs search endpoint above) is
// picky about this — a bare "Mozilla/5.0" gets a 403, a fuller
// browser-shaped UA string doesn't.
const JOBGETHER_OFFER_PAGE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export async function fetchJobgether() {
  const seen = new Set();
  const baseJobs = [];
  for (const keyword of JOBGETHER_QUERIES) {
    for (let page = 1; page <= JOBGETHER_PAGES_PER_QUERY; page++) {
      const url = new URL("https://jobgether.com/astroapi/ai/jobs");
      url.searchParams.set("keyword", keyword);
      url.searchParams.set("locations", "ireland,europe,anywhere");
      url.searchParams.set("limit", "25");
      url.searchParams.set("page", String(page));
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) break;
      const data = await res.json();
      for (const job of data.jobs || []) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        baseJobs.push(job);
      }
      if (!data.pagination?.hasMore) break;
    }
  }

  const results = [];
  for (const job of baseJobs) {
    try {
      results.push(await formatJobgetherJob(job));
    } catch (err) {
      console.warn(`Jobgether: couldn't enrich ${job.url}: ${err.message}`);
      results.push(formatJobgetherJobFallback(job));
    }
  }
  return results;
}

async function formatJobgetherJob(job) {
  const offerRes = await fetchWithTimeout(job.url, { headers: { "User-Agent": JOBGETHER_OFFER_PAGE_USER_AGENT } });
  const offerHtml = offerRes.ok ? await offerRes.text() : "";
  const realApplyUrl = extractJobgetherApplyUrl(offerHtml);

  let description;
  let postedAt = "Not specified";

  const greenhouse = realApplyUrl && parseGreenhouseUrl(realApplyUrl);
  const lever = realApplyUrl && parseLeverUrl(realApplyUrl);
  if (greenhouse) {
    const origin = await fetchGreenhouseJobById(greenhouse.token, greenhouse.jobId);
    if (origin) {
      description = origin.description;
      postedAt = origin.updatedAt || postedAt;
    }
  } else if (lever) {
    const origin = await fetchLeverJobById(lever.token, lever.postingId);
    if (origin) {
      description = origin.description;
      postedAt = origin.createdAt || postedAt;
    }
  }

  if (!description) {
    description = extractJobgetherDescription(offerHtml) || "";
  }

  return {
    id: `jobgether-${job.id}`,
    source: "Jobgether",
    applyUrl: realApplyUrl || job.url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${job.company || "Not specified"}`,
      `Location: ${job.location || "Not specified"}`,
      `Employment type: ${job.contractType || "Not specified"}`,
      `Experience level: ${job.experience || "Not specified"}`,
      `Salary: ${job.salaryRange || "Not listed"}`,
      `Posted: ${postedAt}`,
      `Description: ${description.slice(0, 4000) || "[No description text available.]"}`,
    ].join("\n"),
  };
}

// Used only if fetching/parsing the offer page itself throws (network
// error, unexpected markup) — falls all the way back to the search API's
// own fields, same shape the original unenriched version of this source
// used, so one bad listing can't take down the rest of the run.
function formatJobgetherJobFallback(job) {
  return {
    id: `jobgether-${job.id}`,
    source: "Jobgether",
    applyUrl: job.url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${job.company || "Not specified"}`,
      `Location: ${job.location || "Not specified"}`,
      `Employment type: ${job.contractType || "Not specified"}`,
      `Experience level: ${job.experience || "Not specified"}`,
      `Salary: ${job.salaryRange || "Not listed"}`,
      `Posted: Not specified`,
      `Description: [No description text available — couldn't reach this listing's offer page. Do not treat this as a negative signal; base fit_score only on the fields above.]`,
    ].join("\n"),
  };
}

function extractJobgetherApplyUrl(html) {
  const match = html.match(/<a href="([^"]+)"[^>]*data-role="apply-guest"/);
  return match ? match[1] : null;
}

// The offer page renders a "Job description" heading followed by the full
// original posting text, ending at the next <h2> section ("About the
// company"). Bounding on that next heading, rather than a fixed length,
// avoids bleeding into unrelated page content.
function extractJobgetherDescription(html) {
  const start = html.search(/<h2[^>]*>\s*Job description\s*<\/h2>/i);
  if (start === -1) return null;
  const rest = html.slice(start);
  const nextHeading = rest.slice(1).search(/<h2[^>]*>/i);
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
  return decodeHtmlEntities(stripHtml(section));
}

function parseGreenhouseUrl(url) {
  let match = url.match(/(?:job-boards|boards)\.greenhouse\.io\/([^/?]+)\/jobs\/(\d+)/);
  if (match) return { token: match[1], jobId: match[2] };
  match = url.match(/(?:job-boards|boards)\.greenhouse\.io\/embed\/job_app\?for=([^&]+)&token=(\d+)/);
  return match ? { token: match[1], jobId: match[2] } : null;
}

async function fetchGreenhouseJobById(token, jobId) {
  const res = await fetchWithTimeout(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${jobId}?content=true`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    description: stripHtml(data.content || "").slice(0, 4000),
    updatedAt: data.updated_at || null,
  };
}

function parseLeverUrl(url) {
  const match = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]{36})/);
  return match ? { token: match[1], postingId: match[2] } : null;
}

async function fetchLeverJobById(token, postingId) {
  const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${token}/${postingId}?mode=json`);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    description: stripHtml(data.descriptionPlain || data.description || "").slice(0, 4000),
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : null,
  };
}

// CareerVault's list endpoint (?category=design) gives good structured data
// but no description — that lives behind a per-job detail endpoint, one
// extra request each. Rather than fetching details for every design-tagged
// listing (most won't be Product/UX/UI Designer roles, or won't be
// Europe-eligible), we pre-filter on the cheap list data first and only
// pay for a detail fetch on listings that already pass — same reasoning as
// why filter.js runs before the Claude API call, just one layer earlier.
// This is the one source function that reaches into filter.js.
const CAREERVAULT_PAGES = 3;

export async function fetchCareerVault() {
  const candidates = [];
  for (let page = 1; page <= CAREERVAULT_PAGES; page++) {
    const res = await fetchWithTimeout(`https://careervault.io/api/jobs?category=design&page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    if (!data.data || data.data.length === 0) break;
    candidates.push(...data.data);
  }

  const results = [];
  for (const job of candidates) {
    const previewText = [`Title: ${job.jobtitle}`, `Location: ${job.location || "Not specified"}`].join("\n");
    if (!matchesTitle(previewText) || !matchesLocation(previewText)) continue;

    let description = "";
    let applyUrl = `https://careervault.io/jobs/${job.slug}`;
    try {
      const detailRes = await fetchWithTimeout(`https://careervault.io/api/jobs/${job.slug}`);
      if (detailRes.ok) {
        const detail = await detailRes.json();
        description = stripHtml(detail.description || "");
        applyUrl = detail.url || applyUrl;
      }
    } catch {
      // Fall back to the list-only data below rather than dropping the
      // listing entirely over one failed detail request.
    }

    results.push({
      id: `careervault-${job.jobid}`,
      source: "CareerVault",
      applyUrl,
      rawText: [
        `Title: ${job.jobtitle}`,
        `Company: ${job.companyname || job.companies?.companyname || "Not specified"}`,
        `Location: ${job.location || "Not specified"}`,
        `Salary: ${formatCareerVaultSalary(job)}`,
        `Posted: ${job.dateposted}`,
        `Description: ${description.slice(0, 4000)}`,
      ].join("\n"),
    });
  }
  return results;
}

function formatCareerVaultSalary(job) {
  if (!job.salaryrangestart && !job.salaryrangeend) return "Not listed";
  const range =
    job.salaryrangestart && job.salaryrangeend
      ? `${job.salaryrangestart}-${job.salaryrangeend}`
      : job.salaryrangestart || job.salaryrangeend;
  return `${job.currency || ""} ${range}${job.salaryinterval ? `/${job.salaryinterval}` : ""}`.trim();
}

// productjobsanywhere.com is a plain server-rendered page (Astro/Netlify,
// no anti-bot, no login) with every listing on one page per category — no
// pagination to walk. Each card's "apply" link already points straight at
// the original ATS posting (Greenhouse, Ashby, a company's own careers
// page, etc.), so applyUrl here is the real destination, not a redirect
// through this site. There's no separate description text on this page —
// same data-availability gap as We Love Product above, so Claude is told
// not to penalize fit_score for it.
const PRODUCTJOBSANYWHERE_CARD_RE =
  /<a class="absolute inset-0[^"]*" href="([^"]+)"[^>]*data-fast-goal="click_job_card" data-fast-goal-company="([^"]*)" data-fast-goal-job-title="([^"]*)"/g;

export async function fetchProductJobsAnywhere() {
  const res = await fetchWithTimeout("https://productjobsanywhere.com/jobs/product-designers/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return [];
  const html = await res.text();

  const results = [];
  let match;
  while ((match = PRODUCTJOBSANYWHERE_CARD_RE.exec(html))) {
    const [, href, company, title] = match;
    const locationSection = html.slice(
      PRODUCTJOBSANYWHERE_CARD_RE.lastIndex,
      PRODUCTJOBSANYWHERE_CARD_RE.lastIndex + 1500
    );
    const locMatch = locationSection.match(/class="flex text-base">([\s\S]*?)<\/div>/);
    const location = locMatch ? stripHtml(locMatch[1]) : "Not specified";

    results.push({
      id: `productjobsanywhere-${hashString(href)}`,
      source: "ProductJobsAnywhere",
      applyUrl: decodeHtmlEntities(href),
      rawText: [
        `Title: ${decodeHtmlEntities(title)}`,
        `Company: ${decodeHtmlEntities(company) || "Not specified"}`,
        `Location: ${location}`,
        `Description: [No description text available — this source only lists title/company/location, not full listing text. Do not treat the absence of culture, team-size, or autonomy signals as a negative for this listing; base fit_score only on the fields above and, if useful, the company name itself.]`,
      ].join("\n"),
    });
  }
  return results;
}

// flexa.careers' job search page itself is client-rendered (no embedded
// data, confirmed by checking its network traffic directly), but every
// individual job page is server-rendered with a schema.org JobPosting
// JSON-LD block for SEO/Google Jobs — the same structured data Google
// itself reads. Their public sitemap.xml lists every job page's URL, so
// rather than trying to reverse-engineer whatever internal API the search
// page calls, we do what a search engine would: read the sitemap, keep
// only URLs whose slug looks design-related (a cheap pre-filter — the real
// title/location filtering still happens in filter.js afterward, same
// division of labor as CareerVault), and fetch just those job pages.
const FLEXA_SLUG_KEYWORDS = /designer|[-_]ux[-_]|[-_]ui[-_]|product-design/i;
const FLEXA_MAX_JOBS = 200;

export async function fetchFlexa() {
  const sitemapRes = await fetchWithTimeout("https://flexa.careers/sitemap.xml", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!sitemapRes.ok) return [];
  const sitemapXml = await sitemapRes.text();

  const jobUrls = [...sitemapXml.matchAll(/<loc>(https:\/\/flexa\.careers\/jobs\/[^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((url) => FLEXA_SLUG_KEYWORDS.test(url))
    .slice(0, FLEXA_MAX_JOBS);

  const results = [];
  for (const url of jobUrls) {
    try {
      const job = await fetchFlexaJob(url);
      if (job) results.push(job);
    } catch (err) {
      console.warn(`Flexa: couldn't fetch ${url}: ${err.message}`);
    }
  }
  return results;
}

async function fetchFlexaJob(url) {
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!match) return null;
  const posting = JSON.parse(match[1]);
  if (posting["@type"] !== "JobPosting") return null;

  return {
    id: `flexa-${url}`,
    source: "Flexa",
    applyUrl: url,
    rawText: [
      `Title: ${decodeHtmlEntities(posting.title || "Not specified")}`,
      `Company: ${decodeHtmlEntities(posting.hiringOrganization?.name || "Not specified")}`,
      `Location: ${formatFlexaLocation(posting.jobLocation)}`,
      `Employment type: ${posting.employmentType || "Not specified"}`,
      `Posted: ${posting.datePosted || "Not specified"}`,
      `Description: ${decodeHtmlEntities(stripHtml(posting.description || "")).slice(0, 4000)}`,
    ].join("\n"),
  };
}

function formatFlexaLocation(jobLocation) {
  const address = jobLocation?.address;
  if (!address) return "Not specified";
  return [address.addressLocality, address.addressRegion, address.addressCountry]
    .filter(Boolean)
    .join(", ") || "Not specified";
}

// speedrun-talent-network.com (a16z speedrun's talent network) publishes a
// public, unauthenticated, read-only API explicitly built for agent
// consumption (documented at /developers, spec at /api/v1/openapi.json) —
// same category as Jobgether's astroapi/ai/jobs above. `fn=design` is the
// closest built-in filter to our title keywords; the list endpoint's
// title/location fields get the usual cheap pre-filter before paying for a
// per-job detail fetch, same division of labor as CareerVault above. The
// detail endpoint also resolves the real external apply link
// (Ashby/Greenhouse/etc. directly) — no separate enrichment step needed the
// way Jobgether requires. `page_size` is fixed at 50 server-side (not
// caller-adjustable), so pagination just walks `total_pages`.
//
// The docs ask integrations to pass `?source=<name>` so they can see agent
// traffic — harmless (it's just echoed back and appended to job URLs as a
// UTM tag), so it's included here as asked.
const SPEEDRUN_SOURCE_TAG = "my-job-board";

export async function fetchSpeedrun() {
  const candidates = [];
  for (let page = 0; ; page++) {
    const url = new URL("https://speedrun-talent-network.com/api/v1/jobs");
    url.searchParams.set("fn", "design");
    url.searchParams.set("page", String(page));
    url.searchParams.set("source", SPEEDRUN_SOURCE_TAG);
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) break;
    const data = await res.json();
    candidates.push(...(data.jobs || []));
    if (page + 1 >= (data.total_pages || 1) || (data.jobs || []).length === 0) break;
  }

  const results = [];
  for (const job of candidates) {
    const previewText = [`Title: ${job.title}`, `Location: ${job.location || "Not specified"}`].join("\n");
    if (!matchesTitle(previewText) || !matchesLocation(previewText)) continue;

    let description = "";
    let applyUrl = job.url;
    try {
      const detailUrl = new URL(`https://speedrun-talent-network.com/api/v1/jobs/${job.id}`);
      detailUrl.searchParams.set("source", SPEEDRUN_SOURCE_TAG);
      const detailRes = await fetchWithTimeout(detailUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (detailRes.ok) {
        const detail = (await detailRes.json()).job;
        description = detail?.description_text || "";
        applyUrl = detail?.apply?.url || applyUrl;
      }
    } catch {
      // Fall back to the list-only data below rather than dropping the
      // listing entirely over one failed detail request.
    }

    results.push({
      id: `speedrun-${job.id}`,
      source: "Speedrun Talent Network",
      applyUrl,
      rawText: [
        `Title: ${job.title}`,
        `Company: ${job.company || "Not specified"}`,
        `Location: ${job.location || "Not specified"}`,
        `Employment type: ${job.employment_type || "Not specified"}`,
        `Seniority: ${job.seniority || "Not specified"}`,
        `Salary: ${formatSpeedrunSalary(job)}`,
        `Posted: ${job.published_at || "Not specified"}`,
        `Description: ${description.slice(0, 4000)}`,
      ].join("\n"),
    });
  }
  return results;
}

function formatSpeedrunSalary(job) {
  if (!job.comp_min && !job.comp_max) return "Not listed";
  const range = job.comp_min && job.comp_max ? `${job.comp_min}-${job.comp_max}` : job.comp_min || job.comp_max;
  return `${job.comp_currency || ""} ${range}${job.comp_period ? `/${job.comp_period}` : ""}`.trim();
}

// Small, fast, non-cryptographic hash — just needs to be a stable, unique-
// enough id per URL for dedup purposes, not collision-proof.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#39;/g, "'")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Watchlist companies, via the ATS platform each one runs on ---

async function fetchGreenhouse(token, companyName) {
  const res = await fetchWithTimeout(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `greenhouse-${token}-${job.id}`,
    source: `Watchlist: ${companyName}`,
    applyUrl: job.absolute_url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${companyName}`,
      `Location: ${job.location?.name || "Not specified"}`,
      `Posted: ${job.updated_at}`,
      `Description: ${stripHtml(job.content || "").slice(0, 4000)}`,
    ].join("\n"),
  }));
}

async function fetchLever(token, companyName) {
  const res = await fetchWithTimeout(`https://api.lever.co/v0/postings/${token}?mode=json`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((job) => ({
    id: `lever-${token}-${job.id}`,
    source: `Watchlist: ${companyName}`,
    applyUrl: job.hostedUrl,
    rawText: [
      `Title: ${job.text}`,
      `Company: ${companyName}`,
      `Location: ${job.categories?.location || "Not specified"}`,
      `Posted: ${job.createdAt ? new Date(job.createdAt).toISOString() : "Not specified"}`,
      `Description: ${stripHtml(job.descriptionPlain || job.description || "").slice(0, 4000)}`,
    ].join("\n"),
  }));
}

async function fetchAshby(token, companyName) {
  const res = await fetchWithTimeout(
    `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `ashby-${token}-${job.id}`,
    source: `Watchlist: ${companyName}`,
    applyUrl: job.jobUrl,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${companyName}`,
      `Location: ${job.location || "Not specified"}`,
      `Compensation: ${job.compensation?.summary || "Not listed"}`,
      `Posted: ${job.publishedAt}`,
      `Description: ${stripHtml(job.descriptionPlain || "").slice(0, 4000)}`,
    ].join("\n"),
  }));
}

// Rippling's careers pages (ats.rippling.com/{token}/jobs) are a Next.js
// app — the job list is embedded in the page's own __NEXT_DATA__ payload
// (a react-query "dehydrated" cache, not a documented API), same
// discovery method as Flexa above. The list itself only carries
// title/department/location, not description text, so — like Greenhouse's
// ?content=true — we fetch each job's own page too, whose __NEXT_DATA__
// carries the full description. Only the first page (up to 20 postings) is
// read; fine for a single watchlisted company, which rarely has more open
// roles than that.
function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
  return match ? JSON.parse(match[1]) : null;
}

async function fetchRippling(token, companyName) {
  const listRes = await fetchWithTimeout(`https://ats.rippling.com/${token}/jobs`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!listRes.ok) return [];
  const listData = extractNextData(await listRes.text());
  const queries = listData?.props?.pageProps?.dehydratedState?.queries || [];
  const jobPostsQuery = queries.find((q) => q.queryKey?.[2] === "job-posts");
  const items = jobPostsQuery?.state?.data?.items || [];

  const results = [];
  for (const item of items) {
    try {
      const detailRes = await fetchWithTimeout(item.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!detailRes.ok) continue;
      const detailData = extractNextData(await detailRes.text());
      const jobPost = detailData?.props?.pageProps?.apiData?.jobPost;
      results.push({
        id: `rippling-${token}-${item.id}`,
        source: `Watchlist: ${companyName}`,
        applyUrl: item.url,
        rawText: [
          `Title: ${item.name}`,
          `Company: ${companyName}`,
          `Location: ${formatRipplingLocations(item.locations)}`,
          `Employment type: ${jobPost?.employmentType?.id || "Not specified"}`,
          `Posted: ${jobPost?.createdOn || "Not specified"}`,
          `Description: ${decodeHtmlEntities(stripHtml(formatRipplingDescription(jobPost?.description))).slice(0, 4000)}`,
        ].join("\n"),
      });
    } catch (err) {
      console.warn(`Rippling: couldn't fetch ${item.url}: ${err.message}`);
    }
  }
  return results;
}

function formatRipplingLocations(locations) {
  if (!locations?.length) return "Not specified";
  return locations.map((l) => l.name).join(" | ");
}

// description is split into two rich-text sections: "company" (boilerplate
// intro, same across all of a company's postings) and "role" (the actual
// job content) — both are useful context for Claude, role more so.
function formatRipplingDescription(description) {
  if (!description) return "";
  return [description.role, description.company].filter(Boolean).join("\n\n");
}

// Teamtailor exposes a standard public JSON Feed (jsonfeed.org) at
// {token}.teamtailor.com/jobs.json — no auth, full HTML description
// included per item, one request covers everything.
async function fetchTeamtailor(token, companyName) {
  const res = await fetchWithTimeout(`https://${token}.teamtailor.com/jobs.json`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map((job) => ({
    id: `teamtailor-${token}-${job.id}`,
    source: `Watchlist: ${companyName}`,
    applyUrl: job.url,
    rawText: [
      `Title: ${job.title}`,
      `Company: ${companyName}`,
      `Posted: ${job.date_published || "Not specified"}`,
      `Description: ${decodeHtmlEntities(stripHtml(job.content_html || "")).slice(0, 4000)}`,
    ].join("\n"),
  }));
}

// BreezyHR's {token}.breezy.hr/json gives clean structured list data
// (title, location, salary, department, url) but no description text —
// that only lives on each job's own HTML page, behind markup that isn't
// consistent enough across companies to parse reliably (verified against
// a real listing: template placeholders and nested layout markup bleed
// into any simple description-container scrape). Rather than ship a
// scraper likely to silently mangle text on some companies' pages, this
// stays list-only, same data-availability tradeoff as We Love Product and
// ProductJobsAnywhere above.
async function fetchBreezyHR(token, companyName) {
  const res = await fetchWithTimeout(`https://${token}.breezy.hr/json`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((job) => ({
    id: `breezyhr-${token}-${job.id}`,
    source: `Watchlist: ${companyName}`,
    applyUrl: job.url,
    rawText: [
      `Title: ${job.name}`,
      `Company: ${companyName}`,
      `Location: ${job.location?.name || "Not specified"}`,
      `Salary: ${job.salary || "Not listed"}`,
      `Posted: ${job.published_date || "Not specified"}`,
      `Description: [No description text available — this source's list endpoint only exposes structured fields (above), not full listing text. Do not treat the absence of culture, team-size, or autonomy signals as a negative for this listing; base fit_score only on the fields above.]`,
    ].join("\n"),
  }));
}

// Personio's public careers feed ({token}.jobs.personio.de/xml — .com also
// works, .de is just what got verified) is a custom XML schema, not RSS, so
// rss-parser (built for RSS/Atom) doesn't apply here — same reasoning as the
// regex-based extraction used for Rippling/Flexa's embedded JSON above.
// Each <position> nests several <jobDescription> sections (a heading +
// CDATA-wrapped HTML value each, e.g. "Your Tasks", "Your Profile") rather
// than one description field — concatenated below into a single readable
// block, heading included since the headings carry real structure.
function xmlField(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

async function fetchPersonio(token, companyName) {
  const res = await fetchWithTimeout(`https://${token}.jobs.personio.de/xml`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const positions = xml.match(/<position>[\s\S]*?<\/position>/g) || [];
  return positions.map((pos) => {
    const id = xmlField(pos, "id");
    return {
      id: `personio-${token}-${id}`,
      source: `Watchlist: ${companyName}`,
      // Personio's feed carries no direct apply link — the position's own
      // page on the company's careers site is built from this id.
      applyUrl: `https://${token}.jobs.personio.de/job/${id}`,
      rawText: [
        `Title: ${xmlField(pos, "name")}`,
        `Company: ${companyName}`,
        `Location: ${xmlField(pos, "office") || "Not specified"}`,
        `Department: ${xmlField(pos, "department") || "Not specified"}`,
        `Description: ${formatPersonioDescription(pos)}`,
      ].join("\n"),
    };
  });
}

function formatPersonioDescription(positionXml) {
  const sections = [...positionXml.matchAll(
    /<jobDescription>\s*<name>([\s\S]*?)<\/name>\s*<value>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/value>\s*<\/jobDescription>/g
  )];
  return sections
    .map(([, heading, value]) => `${decodeHtmlEntities(stripHtml(heading))}: ${decodeHtmlEntities(stripHtml(value))}`)
    .join("\n\n")
    .slice(0, 4000);
}

// Pinpoint's public job board ({token}.pinpointhq.com/jobs.rss) is a
// standard RSS 2.0 feed — the same rss-parser dependency already used for
// We Work Remotely above handles it directly. The plain <description> is
// thin; the richer <content:encoded> field labels Department/Employment
// Type/Location/Compensation as "<strong>Label: </strong>value" paragraphs
// ahead of the real description text, so those are pulled out individually
// rather than left buried in one undifferentiated block.
function extractPinpointField(html, label, fallback) {
  const match = html.match(new RegExp(`<strong>${label}:\\s*</strong>\\s*([^<]*)`, "i"));
  return match ? match[1].trim() : fallback;
}

async function fetchPinpoint(token, companyName) {
  const feed = await rssParser.parseURL(`https://${token}.pinpointhq.com/jobs.rss`);
  return feed.items.map((item, i) => {
    const encoded = item["content:encoded"] || "";
    return {
      id: `pinpoint-${token}-${item.guid || i}`,
      source: `Watchlist: ${companyName}`,
      applyUrl: item.link,
      rawText: [
        `Title: ${item.title}`,
        `Company: ${companyName}`,
        `Location: ${extractPinpointField(encoded, "Location", "Not specified")}`,
        `Employment type: ${extractPinpointField(encoded, "Employment Type", "Not specified")}`,
        `Compensation: ${extractPinpointField(encoded, "Compensation", "Not listed")}`,
        `Posted: ${item.pubDate || item.isoDate || "Not specified"}`,
        `Description: ${formatPinpointDescription(encoded).slice(0, 4000)}`,
      ].join("\n"),
    };
  });
}

// content:encoded opens with a title/label recap (Department, Employment
// Type, Location, Compensation) before the real description — those are
// already pulled out into their own rawText fields above, so this trims
// down to just the body under the "Description" heading to avoid Claude
// reading the same handful of facts twice.
function formatPinpointDescription(encoded) {
  const headingMatch = encoded.match(/<h3>\s*Description\s*<\/h3>/i);
  const body = headingMatch ? encoded.slice(headingMatch.index + headingMatch[0].length) : encoded;
  return decodeHtmlEntities(stripHtml(body));
}

// Himalayas exposes a clean public JSON API (the human-facing pages are
// bot-walled, but this endpoint isn't). It caps each page at 20 and can't
// filter by category, so we page through the most-recent listings (cursor
// pagination, per the API's own guidance) and keep the Design/Product ones;
// the title filter narrows those to product/design roles from there.
export async function fetchHimalayas() {
  const RELEVANT_PARENTS = new Set(["Design", "Product"]);
  const collected = [];
  let cursor = "";
  for (let page = 0; page < 8; page++) {
    const url = `https://himalayas.app/jobs/api?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await res.json();
    const jobs = data.jobs || [];
    collected.push(...jobs);
    cursor = data.nextCursor;
    if (!cursor || jobs.length === 0) break;
  }
  return collected
    .filter((job) => (job.parentCategories || []).some((c) => RELEVANT_PARENTS.has(c)))
    .map((job) => {
      const location = (job.locationRestrictions || []).join(", ");
      const salary = job.minSalary
        ? `${job.currency || ""} ${job.minSalary}-${job.maxSalary}/${job.salaryPeriod || "year"}`.trim()
        : "Not listed";
      // pubDate is a Unix timestamp (seconds) — hand Claude a real ISO date.
      const posted = job.pubDate ? new Date(job.pubDate * 1000).toISOString() : "";
      return {
        id: `himalayas-${job.guid}`,
        source: "Himalayas",
        applyUrl: job.applicationLink,
        rawText: [
          `Title: ${job.title}`,
          `Company: ${job.companyName || "Not specified"}`,
          `Location: ${location || "Not specified"}`,
          `Salary: ${salary}`,
          `Seniority: ${(job.seniority || []).join(", ") || "Not specified"}`,
          `Posted: ${posted}`,
          `Description: ${stripHtml(job.description || job.excerpt || "").slice(0, 4000)}`,
        ].join("\n"),
      };
    });
}

// Working Nomads' public JSON API returns its currently-listed jobs tagged
// with a category — we keep the "Design" ones (the title filter then narrows
// to product/design roles specifically).
export async function fetchWorkingNomads() {
  const res = await fetchWithTimeout("https://www.workingnomads.com/api/exposed_jobs/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const data = await res.json();
  const jobs = Array.isArray(data) ? data : [];
  return jobs
    .filter((job) => (job.category_name || "").toLowerCase() === "design")
    .map((job, i) => ({
      id: `workingnomads-${job.url || i}`,
      source: "Working Nomads",
      applyUrl: job.url,
      rawText: [
        `Title: ${job.title}`,
        `Company: ${job.company_name || "Not specified"}`,
        `Location: ${job.location || "Not specified"}`,
        `Posted: ${job.pub_date}`,
        `Description: ${stripHtml(job.description || "").slice(0, 4000)}`,
      ].join("\n"),
    }));
}

// NoDesk publishes a design-specific RSS feed. Titles read "Role at Company",
// so split on the last " at " to separate them; there's no structured
// location field, so location falls back to the description text.
export async function fetchNoDesk() {
  const res = await fetchWithTimeout("https://nodesk.co/remote-jobs/design/index.xml", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const feed = await rssParser.parseString(await res.text());
  return feed.items.map((item, i) => {
    const title = item.title || "";
    const atIdx = title.lastIndexOf(" at ");
    const role = atIdx > -1 ? title.slice(0, atIdx) : title;
    const company = atIdx > -1 ? title.slice(atIdx + 4) : "Not specified";
    const description = item.contentSnippet || stripHtml(item.content || "");
    return {
      id: `nodesk-${item.guid || item.link || i}`,
      source: "NoDesk",
      applyUrl: item.link,
      rawText: [
        `Title: ${role}`,
        `Company: ${company}`,
        `Posted: ${item.pubDate}`,
        `Description: ${description.slice(0, 4000)}`,
      ].join("\n"),
    };
  });
}

// Landing.jobs (a Europe-focused board) publishes an Atom "offers" feed of all
// roles. Titles read "Company - Role"; the location sits in the description as
// "..., in <City>, <Country>". The title filter narrows to design/product.
export async function fetchLandingJobs() {
  const res = await fetchWithTimeout("https://landing.jobs/feed", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const feed = await rssParser.parseString(await res.text());
  return feed.items.map((item, i) => {
    const title = item.title || "";
    const dashIdx = title.indexOf(" - ");
    const company = dashIdx > -1 ? title.slice(0, dashIdx) : "Not specified";
    const role = dashIdx > -1 ? title.slice(dashIdx + 3) : title;
    const description = item.contentSnippet || stripHtml(item.content || "");
    const locMatch = description.match(/,\s*in\s+(.+?)(?:\s*(?:Expires|Remote policy)|\n|$)/i);
    return {
      id: `landingjobs-${item.id || item.link || i}`,
      source: "Landing.jobs",
      applyUrl: item.link,
      rawText: [
        `Title: ${role}`,
        `Company: ${company}`,
        `Location: ${locMatch ? locMatch[1].trim() : "Not specified"}`,
        `Posted: ${item.pubDate}`,
        `Description: ${description.slice(0, 4000)}`,
      ].join("\n"),
    };
  });
}

// Returns both the jobs found and, per company, why a fetch didn't happen —
// the caller uses `failures` to tell the user which watchlist companies need
// a manual check (not configured yet, unknown ATS, or the request failed).
export async function fetchWatchlist(watchlist) {
  const results = [];
  const failures = [];
  for (const company of watchlist) {
    if (company.ats === "TODO" || company.token === "TODO") {
      console.warn(`Skipping ${company.name} — fill in its ATS/token in config.js`);
      failures.push({ name: company.name, reason: "not configured yet" });
      continue;
    }
    try {
      let jobs = [];
      if (company.ats === "greenhouse") jobs = await fetchGreenhouse(company.token, company.name);
      else if (company.ats === "lever") jobs = await fetchLever(company.token, company.name);
      else if (company.ats === "ashby") jobs = await fetchAshby(company.token, company.name);
      else if (company.ats === "rippling") jobs = await fetchRippling(company.token, company.name);
      else if (company.ats === "teamtailor") jobs = await fetchTeamtailor(company.token, company.name);
      else if (company.ats === "breezyhr") jobs = await fetchBreezyHR(company.token, company.name);
      else if (company.ats === "personio") jobs = await fetchPersonio(company.token, company.name);
      else if (company.ats === "pinpoint") jobs = await fetchPinpoint(company.token, company.name);
      else {
        console.warn(`Unknown ATS "${company.ats}" for ${company.name}`);
        failures.push({ name: company.name, reason: `unknown ATS "${company.ats}"` });
        continue;
      }
      results.push(...jobs);
    } catch (err) {
      console.warn(`Couldn't fetch ${company.name}: ${err.message}`);
      failures.push({ name: company.name, reason: err.message });
    }
  }
  return { jobs: results, failures };
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
