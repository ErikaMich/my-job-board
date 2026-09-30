// config.js
// Everything you're likely to want to tweak lives here, in one place,
// so you never need to touch the actual logic files just to change a
// keyword or add a company.

// ------->  EDIT HERE  <-------

export const TITLE_KEYWORDS = [
  "product designer",
  "senior product designer",
  "ux designer",
  "senior ux designer",
  "ux/ui designer",
  "senior ux/ui designer",
  "ui designer",
  "AI designer",
  "AI product designer",
  "AI ux designer",
  "AI ux/ui designer",
  "ai designer",
  "ai product designer",
  "ai ux designer",
  "ai ux/ui designer",
  "AI builder",
  "design engineer",
  "senior design engineer",
  "product design engineer",
  "senior product design engineer",
];

// Used to decide whether a listing counts as "remote in Europe" or
// "Ireland." This is a best-effort text match against whatever the source
// gave us — not a guarantee. Job boards describe location very
// inconsistently (some say "Europe," some say "Remote - Anywhere," some
// just list a city), so expect to occasionally prune a false positive
// from the sheet by hand, and add new keywords here as you notice gaps.

// ------->  EDIT HERE  <-------

export const EUROPE_LOCATION_KEYWORDS = [
  "europe",
  "eu",
  "emea",
  "worldwide",
  "anywhere",
  "global",
  "remote - global",
  "remote - anywhere",
  "remote - europe",
  "remote - eu",
  "remote - emea",
  "remote - world",
  "remote - worldwide",
  "ireland",
  "uk",
  "united kingdom",
  "germany",
  "france",
  "spain",
  "portugal",
  "netherlands",
  "italy",
  "austria",
  "belgium",
  "switzerland",
  "sweden",
  "denmark",
  "norway",
  "finland",
  // City names — many listings give a city with no country ("London",
  // "Berlin"), which country/region matching alone would miss.
  "dublin",
  "cork",
  "london",
  "milan",
];

// Watchlist: companies you specifically want to track, pulled directly
// from their applicant tracking system (ATS) instead of a search engine.
//
// `ats` is which system they run on, and `token` is the identifier from
// their careers page URL:
//   Greenhouse -> boards.greenhouse.io/{token}
//   Lever      -> jobs.lever.co/{token}
//   Ashby      -> jobs.ashbyhq.com/{token}
//   Rippling   -> ats.rippling.com/{token}/jobs
//   Teamtailor -> {token}.teamtailor.com
//   BreezyHR   -> {token}.breezy.hr
//   Personio   -> {token}.jobs.personio.de
//   Pinpoint   -> {token}.pinpointhq.com
//
// Every entry below is pre-filled with a confirmed `ats` and `token`, so the
// watchlist works out of the box — you don't have to look any of these up.
// Tokens do drift over time (a company migrates ATS, or renames its board),
// so if a run reports a watchlist failure for one, check that company's
// careers page against the URL patterns above and fix or delete its line.
// To add your own company: find it on one of the ATS domains above and copy
// the `{token}` from its careers URL. If a company runs on something else
// entirely (Workable, a custom-built careers page, etc.), skip it — you'll
// still catch its postings through the broad-search boards.
//
// A few inline notes flag cases where the obvious token points at a
// different, unrelated company — leave those as-is unless you know better.

// ------->  EDIT HERE  <-------

export const WATCHLIST = [
  { name: "Supabase", ats: "ashby", token: "supabase" },
  { name: "Linear", ats: "ashby", token: "linear" },
  { name: "Help Scout", ats: "ashby", token: "helpscout" },
  { name: "Automattic", ats: "greenhouse", token: "automatticcareers" },
  { name: "Raycast", ats: "ashby", token: "raycast" },
  { name: "Canonical", ats: "greenhouse", token: "canonical" },
  { name: "Runway", ats: "ashby", token: "runway-ml" },
  { name: "ElevenLabs", ats: "ashby", token: "elevenlabs" },
  { name: "Checkly", ats: "ashby", token: "checkly" },
  { name: "Attio", ats: "ashby", token: "attio" },
  // Wave Mobile Money (African fintech), not Myanmar's unrelated "Wave Money".
  { name: "Wave Mobile Money", ats: "greenhouse", token: "wavemm1" },
  // Circle.so (community platform), not Circle Internet Financial (USDC, on Workday).
  { name: "Circle", ats: "greenhouse", token: "circleso" },
  { name: "Form3", ats: "greenhouse", token: "form3" },
  { name: "Assured", ats: "ashby", token: "assured" },
  { name: "Qualio", ats: "greenhouse", token: "qualio" },
  { name: "RevenueCat", ats: "ashby", token: "revenuecat" },
  { name: "AssemblyAI", ats: "greenhouse", token: "assemblyai" },
  { name: "Goodnotes", ats: "greenhouse", token: "goodnotes" },
  { name: "Customer.io", ats: "greenhouse", token: "customerio" },
  { name: "Phantom", ats: "ashby", token: "phantom" },
  { name: "DuckDuckGo", ats: "ashby", token: "duck-duck-go" },
  { name: "Maze", ats: "ashby", token: "mazehq" },
  { name: "Postscript", ats: "greenhouse", token: "postscript" },
  { name: "Kalepa", ats: "greenhouse", token: "kalepa" },
  { name: "Pulumi", ats: "greenhouse", token: "pulumicorporation" },
  { name: "Kong", ats: "ashby", token: "kong" },
  { name: "Quora", ats: "ashby", token: "quora" },
  { name: "Hightouch", ats: "greenhouse", token: "hightouch" },
  { name: "Synthesia", ats: "ashby", token: "synthesia" },
  { name: "Tide", ats: "greenhouse", token: "tide" },
  { name: "Remote", ats: "greenhouse", token: "remotecom" },
  { name: "Prisma", ats: "greenhouse", token: "prisma" },
  // careers.sumsub.com redirects to this Teamtailor board.
  { name: "Sumsub", ats: "teamtailor", token: "sumsub" },
  { name: "Federato", ats: "greenhouse", token: "federato" },
  { name: "Ramp", ats: "ashby", token: "ramp" },
  { name: "Nory", ats: "ashby", token: "nory" },
  { name: "Mercury", ats: "greenhouse", token: "mercury" },
  { name: "Brex", ats: "greenhouse", token: "brex" },
  { name: "Vanta", ats: "ashby", token: "vanta" },
  { name: "Modern Treasury", ats: "ashby", token: "moderntreasury" },
  { name: "Owner.com", ats: "ashby", token: "owner" },
  { name: "Toast", ats: "greenhouse", token: "toast" },
  { name: "Anrok", ats: "ashby", token: "anrok" },
  { name: "Flexport", ats: "greenhouse", token: "flexport" },
  { name: "Homebound", ats: "ashby", token: "homebound" },
  { name: "Aurora Solar", ats: "ashby", token: "aurorasolar" },
  { name: "Podium", ats: "greenhouse", token: "podium81" },
  // Climate-accounting Watershed on Ashby; Greenhouse "watershed" is an unrelated bioinformatics company.
  { name: "Watershed", ats: "ashby", token: "watershed" },
  // Cedar's board is under its legal entity "careportalinc" ("cedar" is an unrelated company).
  { name: "Cedar", ats: "greenhouse", token: "careportalinc" },
  // ironcladapp.com's careers page links to this Ashby board.
  { name: "Ironclad", ats: "ashby", token: "ironcladhq" },
  { name: "Squire", ats: "lever", token: "getsquire" },
  { name: "Abridge", ats: "ashby", token: "abridge" },
  { name: "Airbnb", ats: "greenhouse", token: "airbnb" },
  { name: "Airwallex", ats: "ashby", token: "airwallex" },
  { name: "Anduril", ats: "greenhouse", token: "andurilindustries" },
  { name: "Anthropic", ats: "greenhouse", token: "anthropic" },
  { name: "Applied Compute", ats: "ashby", token: "Applied Compute" },
  { name: "Applied Intuition", ats: "ashby", token: "applied" },
  // Base Power (energy) at "base-power"; "base" is an unrelated hospitality company.
  { name: "Base", ats: "ashby", token: "base-power" },
  { name: "BaseTen", ats: "ashby", token: "baseten" },
  // Basis (AI accounting) on Ashby as "basis-ai"; Lever "basis" is unrelated ad-tech.
  { name: "Basis", ats: "ashby", token: "basis-ai" },
  { name: "Bedrock Robotics", ats: "ashby", token: "bedrock-robotics" },
  { name: "Black Forest Labs", ats: "greenhouse", token: "blackforestlabs" },
  { name: "Chai Discovery", ats: "ashby", token: "chaidiscovery" },
  { name: "Chainguard", ats: "greenhouse", token: "chainguard" },
  { name: "Clay", ats: "ashby", token: "claylabs" },
  { name: "ClickHouse", ats: "greenhouse", token: "clickhouse" },
  // Live board is on Ashby (Greenhouse "cognitionlabs" returns zero jobs).
  { name: "Cognition", ats: "ashby", token: "cognition" },
  { name: "CoreWeave", ats: "greenhouse", token: "coreweave" },
  { name: "Crusoe", ats: "ashby", token: "crusoe" },
  { name: "Cursor", ats: "ashby", token: "cursor" },
  { name: "Databricks", ats: "greenhouse", token: "databricks" },
  { name: "Decagon", ats: "ashby", token: "decagon" },
  { name: "Etched", ats: "ashby", token: "etched" },
  { name: "Exa", ats: "ashby", token: "exa" },
  { name: "Factory", ats: "ashby", token: "factory" },
  { name: "Fal", ats: "ashby", token: "fal-ai" },
  { name: "Figma", ats: "greenhouse", token: "figma" },
  // Figure (humanoid robotics) at "figureai"; "figure" is Figure Lending.
  { name: "Figure", ats: "greenhouse", token: "figureai" },
  { name: "Fireworks", ats: "ashby", token: "fireworks" },
  { name: "Gamma", ats: "ashby", token: "gamma" },
  { name: "Genspark", ats: "ashby", token: "genspark" },
  { name: "Glean", ats: "greenhouse", token: "gleanwork" },
  { name: "Granola", ats: "ashby", token: "granola" },
  { name: "Handshake", ats: "ashby", token: "handshake" },
  { name: "Harvey", ats: "ashby", token: "harvey" },
  { name: "Helsing", ats: "greenhouse", token: "helsing" },
  { name: "Hex", ats: "greenhouse", token: "hextechnologies" },
  // Live board is on Ashby (Greenhouse "kalshi" is stale).
  { name: "Kalshi", ats: "ashby", token: "kalshi" },
  { name: "Lambda", ats: "ashby", token: "lambda" },
  { name: "LangChain", ats: "ashby", token: "langchain" },
  { name: "Legora", ats: "ashby", token: "legora" },
  { name: "Liquid AI", ats: "ashby", token: "liquid-ai" },
  { name: "LlamaIndex", ats: "ashby", token: "llamaindex" },
  // Live board is on Ashby (Greenhouse "lovable" is stale).
  { name: "Lovable", ats: "ashby", token: "lovable" },
  { name: "Mercor", ats: "ashby", token: "mercor" },
  { name: "Mistral AI", ats: "ashby", token: "mistral.ai" },
  { name: "Modal", ats: "ashby", token: "modal" },
  { name: "n8n", ats: "ashby", token: "n8n" },
  { name: "Notion", ats: "ashby", token: "notion" },
  { name: "OpenAI", ats: "ashby", token: "openai" },
  { name: "OpenEvidence", ats: "ashby", token: "openevidence" },
  { name: "Palantir", ats: "lever", token: "palantir" },
  // Parallel Web Systems on Ashby; Greenhouse "parallel" is an unrelated company.
  { name: "Parallel Web Systems", ats: "ashby", token: "parallel" },
  { name: "Periodic Labs", ats: "ashby", token: "periodic-labs" },
  { name: "Physical Intelligence", ats: "ashby", token: "physicalintelligence" },
  { name: "Polymarket", ats: "ashby", token: "polymarket" },
  { name: "PostHog", ats: "ashby", token: "posthog" },
  { name: "Prime Intellect", ats: "ashby", token: "primeintellect" },
  // AI-brand-visibility Profound on Ashby; Greenhouse "profound" is unrelated pharma.
  { name: "Profound", ats: "ashby", token: "profound" },
  { name: "Reflection AI", ats: "ashby", token: "reflectionai" },
  { name: "Replit", ats: "ashby", token: "replit" },
  { name: "Saronic", ats: "ashby", token: "saronic" },
  { name: "Shield AI", ats: "lever", token: "shieldai" },
  { name: "Sierra", ats: "ashby", token: "sierra" },
  { name: "Skild", ats: "greenhouse", token: "skildai-careers" },
  { name: "SpaceX", ats: "greenhouse", token: "spacex" },
  { name: "Stripe", ats: "greenhouse", token: "stripe" },
  { name: "Sunday Robotics", ats: "ashby", token: "sunday" },
  { name: "Surge AI", ats: "ashby", token: "surge-ai" },
  { name: "Temporal", ats: "greenhouse", token: "temporaltechnologies" },
  { name: "Thinking Machines", ats: "ashby", token: "thinkingmachines" },
  { name: "Together", ats: "greenhouse", token: "togetherai" },
  { name: "Turbopuffer", ats: "ashby", token: "turbopuffer" },
  { name: "Vercel", ats: "greenhouse", token: "vercel" },
  { name: "Waymo", ats: "greenhouse", token: "waymo" },
  { name: "Wispr Flow", ats: "ashby", token: "wispr-flow" },
  { name: "WorkOS", ats: "ashby", token: "workos" },
  { name: "World Labs", ats: "greenhouse", token: "worldlabs" },
  { name: "Zapier", ats: "ashby", token: "zapier" },
  { name: "Toggl", ats: "ashby", token: "toggl" },
  { name: "Buffer", ats: "ashby", token: "buffer" },
  // Board confirmed but currently has no open roles.
  { name: "Whereby", ats: "lever", token: "whereby" },
  { name: "Kinsta", ats: "lever", token: "kinsta" },
  { name: "Contra", ats: "ashby", token: "contra" },
  { name: "SafetyWing", ats: "pinpoint", token: "safetywing" },
  { name: "Kit", ats: "ashby", token: "kit" },
  { name: "TestGorilla", ats: "ashby", token: "testgorilla" },
];

// Fed to Claude alongside each listing so it can score fit — see
// SHEET_HEADERS' "Fit Score" column and lib/extractor.js. This is the one
// thing you MUST edit: replace the example below with your own background and
// what you're looking for, and keep it updated as either changes. The fit
// score is only as useful as this description, so be specific — years of
// experience, tools, the kind of team and role you want, and what you'd
// rather avoid. Together with FIT_PRIORITIES below, this is what the scoring
// depends on.

// ------->  EDIT HERE  <-------

export const CANDIDATE_PROFILE = `Senior Product Designer, 8 years of experience across a couple of SaaS startups. Based in Europe, open to remote or hybrid.
Core strengths: end-to-end product design (research through shipped UI), working closely with engineers and PMs in a small cross-functional team, and comfort with Figma plus a working knowledge of HTML/CSS. Some experience with design systems and shipping features iteratively.
Explicitly looking for: a small-to-mid product team with a clear mission, where the role is broad and close to users, and there's room to own problems end-to-end. Wants an individual-contributor design role, not a people-management track. Prefers to avoid large, layered, process-heavy organizations.`;

// How Claude weights a listing when it assigns the 1-10 fit score and writes
// the pros/cons. CANDIDATE_PROFILE above says who you are; this says what
// matters most about a *role*. These defaults are one person's priorities —
// a senior IC design role, small teams, hands-on-with-code, decent pay, EU
// location flexibility — and almost certainly aren't yours, so rewrite them.
// The generic scoring mechanics (the 0-10 scale, "don't inflate," etc.) live
// in lib/extractor.js and don't need touching; only the priorities do.

// ------->  EDIT HERE  <-------

export const FIT_PRIORITIES = `Primary criteria, most important first:
1. Seniority match — a senior individual-contributor design role, not junior/mid, and not a people-management track.
2. Team/culture fit — a small, tight-knit, autonomous team over a large, layered org (the top priority). Values low bureaucracy and startup/scale-up energy over corporate structure.
3. Role/skill overlap — values end-to-end ownership, building alongside engineers, and ideally AI-native or hands-on-with-code design work.

Boosts — count these only when explicitly stated, and only on top of the primary criteria above (never as a substitute for them):
- Compensation: a stated salary whose low end is roughly 90k or higher in its own currency (e.g. €90k, $90k, £90k — compare the number as stated, don't convert currencies).
- Location flexibility: explicitly allows working from anywhere in Europe (not tied to one country), or explicitly permits working abroad temporarily (workation / digital-nomad policies). Being eligible for one specific country doesn't count.
- Nice-to-have: location-independent pay (the same salary regardless of where you live).`;

// The local spreadsheet file that acts as your table. It's created
// automatically in this folder the first time the script runs — open it
// directly in Excel or Numbers, or drag it into Google Sheets any time.
export const SPREADSHEET_FILE = "job-listings.xlsx";

// The HTML report is the actual reading view — regenerated from the full
// spreadsheet and opened automatically at the end of every run. The xlsx
// stays a plain, unformatted data store (dedupe source + hand-editable
// table); this file is where long text fields are actually readable.
export const REPORT_FILE = "job-listings.html";

// Local port the report is served on, so the "Custom CV" button on each
// card has a running server to call. Only needs changing if something else
// on your machine is already using this port.
export const CV_SERVER_PORT = 5757;

// Job boards we looked at but aren't wired into the script — no public API,
// or they actively block scraping/require login. Shown in the report's
// sidebar as a reminder to check these by hand. Purely informational: this
// list isn't fetched from, so nothing here affects a run.
export const UNAVAILABLE_SOURCES = [
  // Where possible the URL is a pre-filtered search (product/design roles) so
  // the page opens straight to relevant listings rather than a generic home.
  { name: "LinkedIn Jobs", url: "https://www.linkedin.com/jobs/" },
  { name: "Wellfound", url: "https://wellfound.com/role/r/product-designer" },
  { name: "Authentic Jobs", url: "https://authenticjobs.com/" },
  { name: "FlexJobs", url: "https://www.flexjobs.com/" },
  { name: "Remote.co", url: "https://remote.co/remote-jobs/" },
  { name: "YC Jobs (Work at a Startup)", url: "https://www.workatastartup.com/jobs/v2?role=design" },
  { name: "Arc.dev", url: "https://arc.dev/" },
  { name: "JustRemote", url: "https://justremote.co/remote-design-jobs" },
  { name: "DailyRemote", url: "https://dailyremote.com/remote-jobs?search=product+designer&page=1#main" },
  { name: "Remote.com Jobs", url: "https://remote.com/jobs/all?query=product+designer" },
  { name: "Lenny's Jobs", url: "https://www.lennysjobs.com/" },
];

// Your master CV, kept outside git (see .gitignore) since it's a personal
// document. "Custom CV" writes a tailored copy per job into CV_OUTPUT_DIR,
// named after the company/role, without ever touching this file.
export const CV_MASTER_FILE = "cv/master-cv.docx";
export const CV_OUTPUT_DIR = "cv/generated";

// Prefix for each generated CV's filename — put your own name here. Files come
// out as "<prefix>_CV_<company>_<role>.docx". Letters/digits only; anything
// else is stripped.

// ------->  EDIT HERE  <-------

export const CV_NAME_PREFIX = "YourName";

// Expanded background detail the CV summary is drafted from — far more
// specific than CANDIDATE_PROFILE above (exact metrics, tool names, project
// stories), since the 1-page CV and the short fit-scoring profile both
// necessarily leave most of it out. Optional: if this file doesn't exist,
// the customizer just falls back to CANDIDATE_PROFILE alone.
export const CV_NOTES_FILE = "cv/experience-notes.md";

// Column order in the spreadsheet.
export const SHEET_HEADERS = [
  "Company Name",
  "Source",
  "Link to Job Post",
  "Role Name",
  "Fit Score",
  "Fit Notes",
  "Location",
  "Salary",
  "Company Description",
  "Job Description",
  "Other Notes",
  "Pros",
  "Cons",
  "Date Published",
  // Internal — the real posting text, used only by the "Custom CV" button,
  // not meant for the report/reading view (that's what Job Description is).
  "Raw Job Text",
];
