import type { OkrSummaryRow, PlProjectMeta, ProjectDayRow, ProjectMeta } from "./types";

// Header-driven parsing: we match column headers by text (case/space-insensitive,
// tried against a list of likely aliases) instead of hardcoding column letters, so a
// reordered sheet column is a config edit here, not a code change.
//
// NOTE: exact header text/order is unverified against live data (built from
// screenshots only) — see the "Open items" section of the project plan. Any
// alias list below may need adjusting once a real pull is inspected.

function normalizeHeader(h: unknown): string {
  return typeof h === "string" ? h.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function indexHeaders(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key) map.set(key, i);
  });
  return map;
}

function findCol(headerMap: Map<string, number>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const idx = headerMap.get(alias);
    if (idx !== undefined) return idx;
  }
  return undefined;
}

function cell(row: unknown[], idx: number | undefined): unknown {
  if (idx === undefined) return undefined;
  return row[idx];
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[,$%]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

/** Google Sheets returns actual booleans for checkbox cells, or the literal
 * string "TRUE"/"FALSE" for plain text — handle both. Null (blank/unrecognized)
 * means "no opinion", which callers treat as "include" by default. */
function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return null;
}

/** Sheets serial date (days since 1899-12-30) or a date-like string -> ISO yyyy-mm-dd. */
function toIsoDate(v: unknown): string | null {
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

interface ParseResult<T> {
  rows: T[];
  warnings: string[];
}

function requireColumns(
  headerMap: Map<string, number>,
  required: Record<string, string[]>,
  tabName: string,
  warnings: string[]
): Record<string, number | undefined> {
  const found: Record<string, number | undefined> = {};
  for (const [field, aliases] of Object.entries(required)) {
    const idx = findCol(headerMap, aliases);
    found[field] = idx;
    if (idx === undefined) {
      warnings.push(`[${tabName}] Could not find a column for "${field}" (tried: ${aliases.join(", ")})`);
    }
  }
  return found;
}

export function parseAdsCampaignDetails(values: unknown[][]): ParseResult<ProjectMeta> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      project: ["campaigns", "campaign", "project", "projects", "campaign name", "column 1"],
      commission: ["% commission", "commission", "% comission"],
      adAccount: ["ad account"],
      googleAdAccount: ["google ad account"],
      guru: ["guru name(s)", "guru names", "guru"],
      sourceUrl: ["source of data"],
      include: ["include"],
    },
    "Ads Campaign details",
    warnings
  );
  // Some tabs (e.g. "Ads Campaign details") leave the first header cell blank, which
  // Google Sheets reports back as a literal "Column 1" — but project name always
  // lives in column A regardless of what (if anything) its header says.
  const projectCol = col.project ?? 0;

  const rows: ProjectMeta[] = [];
  for (const raw of values.slice(1)) {
    const project = toStringOrNull(cell(raw, projectCol));
    if (!project) continue;

    rows.push({
      project,
      commissionPct: toNumber(cell(raw, col.commission)),
      adAccount: toStringOrNull(cell(raw, col.adAccount)),
      googleAdAccount: toStringOrNull(cell(raw, col.googleAdAccount)),
      guru: toStringOrNull(cell(raw, col.guru)),
      type: null,
      sourceUrl: toStringOrNull(cell(raw, col.sourceUrl)),
      include: toBool(cell(raw, col.include)),
    });
  }

  return { rows, warnings };
}

export function parseLeadFullKickOff(values: unknown[][]): ParseResult<ProjectMeta> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      project: ["campaigns", "campaign", "project", "projects", "cord"],
      commission: ["% commission", "commission"],
      adAccount: ["ad account"],
      type: ["type"],
      guru: ["guru name(s)", "guru names", "guru"],
      sourceUrl: ["source of data"],
      include: ["include"],
    },
    "Lead- Full- Kick off",
    warnings
  );

  const rows: ProjectMeta[] = [];
  for (const raw of values.slice(1)) {
    const project = toStringOrNull(cell(raw, col.project));
    if (!project) continue;

    const typeRaw = toStringOrNull(cell(raw, col.type))?.toLowerCase();
    const type: ProjectMeta["type"] =
      typeRaw === "lead" ? "Lead" : typeRaw === "full" ? "Full" : null;

    rows.push({
      project,
      commissionPct: toNumber(cell(raw, col.commission)),
      adAccount: toStringOrNull(cell(raw, col.adAccount)),
      googleAdAccount: null,
      guru: toStringOrNull(cell(raw, col.guru)),
      type,
      sourceUrl: toStringOrNull(cell(raw, col.sourceUrl)),
      include: toBool(cell(raw, col.include)),
    });
  }

  return { rows, warnings };
}

/** PL's "Commission" column is free text — either a percentage ("20%") or a
 * flat fixed fee ("$1250 fixed fee") — instead of a clean numeric %. */
function parsePlCommission(v: unknown): { commissionPct: number | null; commissionFixed: number | null } {
  const text = toStringOrNull(v);
  if (!text) return { commissionPct: null, commissionFixed: null };

  const pctMatch = text.match(/([\d.]+)\s*%/);
  if (pctMatch) {
    return { commissionPct: Number(pctMatch[1]) / 100, commissionFixed: null };
  }

  const fixedMatch = text.match(/([\d,.]+)/);
  if (fixedMatch) {
    return { commissionPct: null, commissionFixed: Number(fixedMatch[1].replace(/,/g, "")) };
  }

  return { commissionPct: null, commissionFixed: null };
}

/** "PL Ads" tab — one row per Prelaunch project, its own dedicated tab (not
 * "Ads Campaign details"). Feeds project metadata + the "Performance sheet"
 * link to each project's own "Live Ads" tab, same as CF Full/Ecom. */
export function parsePlAds(values: unknown[][]): ParseResult<PlProjectMeta> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      project: ["project name", "project", "campaigns", "campaign"],
      commission: ["commission"],
      adAccount: ["ad account"],
      guru: ["guru name(s)", "guru names", "guru"],
      status: ["status"],
      startDate: ["start date"],
      endDate: ["end date"],
      sourceUrl: ["performance sheet", "source of data"],
      include: ["include"],
    },
    "PL Ads",
    warnings
  );

  const rows: PlProjectMeta[] = [];
  for (const raw of values.slice(1)) {
    const project = toStringOrNull(cell(raw, col.project));
    if (!project) continue;

    const { commissionPct, commissionFixed } = parsePlCommission(cell(raw, col.commission));

    rows.push({
      project,
      commissionPct,
      commissionFixed,
      adAccount: toStringOrNull(cell(raw, col.adAccount)),
      guru: toStringOrNull(cell(raw, col.guru)),
      status: toStringOrNull(cell(raw, col.status)),
      startDate: toIsoDate(cell(raw, col.startDate)),
      endDate: toIsoDate(cell(raw, col.endDate)),
      sourceUrl: toStringOrNull(cell(raw, col.sourceUrl)),
      include: toBool(cell(raw, col.include)),
    });
  }

  return { rows, warnings };
}

/** Per-project "Lead Generation" tab, found inside each Leadgen project's own
 * spreadsheet (linked from Lead- Full- Kick off's "Source of data" for Type =
 * "Lead" rows). Leadgen has no ad-platform raise/ROAS — it's measured in
 * leads/reservations generated instead, so those columns are always null
 * here. `revenue` (TCF's own cut) is left null and filled in by the caller
 * once it knows the project's commission. */
export function parseLeadGenerationTab(
  values: unknown[][],
  project: string,
  sourceTab: string,
  guru: string | null = null
): ParseResult<ProjectDayRow> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      date: ["date"],
      currency: ["currency", "currency1"],
      spend: ["daily spent all platforms"],
      leads: ["daily # of leads all platforms", "daily # of leads"],
      reservations: ["daily # of reservations all platforms", "daily # of reservations"],
      costPerLead: ["daily cost per lead"],
      costPerReservation: ["daily cost per reservation"],
    },
    sourceTab,
    warnings
  );
  // Same broken-header-cell quirk as "Live Ads" — Date is consistently column A.
  const dateCol = col.date ?? 0;

  const rows: ProjectDayRow[] = [];
  for (const raw of values.slice(1)) {
    const date = toIsoDate(cell(raw, dateCol));
    if (!date) continue;

    rows.push({
      date,
      project,
      section: "LEADGEN",
      currency: toStringOrNull(cell(raw, col.currency)),
      spend: toNumber(cell(raw, col.spend)),
      raise: null,
      revenue: null,
      roas: null,
      conversions: null,
      leads: toNumber(cell(raw, col.leads)),
      reservations: toNumber(cell(raw, col.reservations)),
      costPerLead: toNumber(cell(raw, col.costPerLead)),
      costPerReservation: toNumber(cell(raw, col.costPerReservation)),
      fbSpend: null,
      fbRaise: null,
      fbConversions: null,
      fbRoas: null,
      googleSpend: null,
      googleRaise: null,
      googleConversions: null,
      googleRoas: null,
      sourceTab,
      guru,
    });
  }

  return { rows, warnings };
}

/** Per-project "Live Ads" tab, found inside each individual project's own
 * spreadsheet — used for both CF Full (linked from Lead- Full- Kick off's
 * "Source of data") and Ecom (linked from Ads Campaign details' "Source of
 * data" for project names containing "Ecom"). One project per sheet, so
 * there's no project-name column here — the caller passes it in.
 *
 * This tab has no TCF-revenue column at all, only the gross ad-platform revenue
 * (the "raise"), split by combined/Facebook/Google — `revenue` (TCF's own cut)
 * is left null here and filled in by the caller once it knows the project's
 * commission % (raise * commissionPct). */
export function parseLiveAdsTab(
  values: unknown[][],
  project: string,
  section: ProjectDayRow["section"],
  sourceTab: string,
  guru: string | null = null
): ParseResult<ProjectDayRow> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  // Individual project sheets aren't perfectly templated — some use "Daily Spent
  // All Platforms"/"Daily Revenue All Platforms", others use shorter names like
  // "Daily Ad Spent"/"Daily Tracked Revenue" for the same concept. Try both.
  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      date: ["date"],
      currency: ["currency", "currency1"],
      spend: ["daily spent all platforms", "daily ad spent"],
      raise: ["daily revenue all platforms", "daily tracked revenue"],
      roas: ["daily roas all platforms", "daily roas"],
      conversions: ["daily # of conversions all platforms", "daily conversions", "daily # of conversions"],
      fbSpend: ["fb daily spent", "fb daily ad spent"],
      fbRaise: ["fb ads daily revenue", "fb daily revenue", "fb daily tracked revenue"],
      fbRoas: ["fb daily roas"],
      fbConversions: ["fb daily # of conversions", "fb daily conversions"],
      googleSpend: ["google ads daily spent", "google daily spent", "google ads daily ad spent"],
      googleRaise: ["google ads daily revenue", "google daily revenue"],
      googleRoas: ["google ads daily roas", "google daily roas"],
      googleConversions: ["google daily conversions", "google ads daily # of conversions", "google daily # of conversions"],
    },
    sourceTab,
    warnings
  );
  // Some individual sheets have a broken/blank header cell in column A (e.g. a
  // stray number instead of the text "Date"), even though every row's actual
  // data is a valid date there — Date is consistently the first column across
  // every per-project Live Ads/Advertising Performance sheet seen so far.
  const dateCol = col.date ?? 0;

  const rows: ProjectDayRow[] = [];
  for (const raw of values.slice(1)) {
    const date = toIsoDate(cell(raw, dateCol));
    if (!date) continue;

    rows.push({
      date,
      project,
      section,
      currency: toStringOrNull(cell(raw, col.currency)),
      spend: toNumber(cell(raw, col.spend)),
      raise: toNumber(cell(raw, col.raise)),
      revenue: null,
      roas: toNumber(cell(raw, col.roas)),
      conversions: toNumber(cell(raw, col.conversions)),
      leads: null,
      reservations: null,
      costPerLead: null,
      costPerReservation: null,
      fbSpend: toNumber(cell(raw, col.fbSpend)),
      fbRaise: toNumber(cell(raw, col.fbRaise)),
      fbConversions: toNumber(cell(raw, col.fbConversions)),
      fbRoas: toNumber(cell(raw, col.fbRoas)),
      googleSpend: toNumber(cell(raw, col.googleSpend)),
      googleRaise: toNumber(cell(raw, col.googleRaise)),
      googleConversions: toNumber(cell(raw, col.googleConversions)),
      googleRoas: toNumber(cell(raw, col.googleRoas)),
      sourceTab,
      guru,
    });
  }

  return { rows, warnings };
}

// Group-label rows seen in the OKR tab screenshot ("Ads campaigns CF", "E-commerce
// names", "Ads Google", "TOTAL"). Unverified beyond the screenshot — a row is only
// treated as a project row if at least one raise column has a numeric value.
const OKR_CATEGORY_LABELS = new Set(
  ["ads campaigns cf", "e-commerce names", "ads google", "total"].map((s) => s)
);

export function parseOkr(values: unknown[][]): ParseResult<OkrSummaryRow> {
  const warnings: string[] = [];
  if (values.length === 0) return { rows: [], warnings };

  const headerMap = indexHeaders(values[0]);
  const col = requireColumns(
    headerMap,
    {
      project: ["projects", "project"],
      raiseFb: ["raise in fb"],
      raiseGoogle: ["raise in google"],
      raiseTiktok: ["raise in tiktok"],
      live: ["live"],
      indemand: ["indemand"],
    },
    "OKR",
    warnings
  );

  const rows: OkrSummaryRow[] = [];
  let currentCategory: string | null = null;

  for (const raw of values.slice(1)) {
    const project = toStringOrNull(cell(raw, col.project));
    if (!project) continue;

    const raiseFb = toNumber(cell(raw, col.raiseFb));
    const raiseGoogle = toNumber(cell(raw, col.raiseGoogle));
    const raiseTiktok = toNumber(cell(raw, col.raiseTiktok));

    if (OKR_CATEGORY_LABELS.has(project.toLowerCase())) {
      currentCategory = project;
      continue;
    }

    // Note: a real project can legitimately have no raise numbers yet (e.g. not
    // live), so we only skip rows matching a known category label above — we do
    // NOT treat "no raise data" itself as a sign of a section header, since that
    // silently swallowed real in-progress projects during testing.

    rows.push({
      project,
      category: currentCategory,
      raiseFb,
      raiseGoogle,
      raiseTiktok,
      live: toStringOrNull(cell(raw, col.live)),
      inDemand: toStringOrNull(cell(raw, col.indemand)),
    });
  }

  return { rows, warnings };
}
