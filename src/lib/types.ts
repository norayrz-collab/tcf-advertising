export type Section = "CF" | "ECOM" | "CF_FULL" | "LEADGEN" | "PL";

export interface ProjectDayRow {
  date: string | null; // ISO yyyy-mm-dd
  project: string;
  section: Section;
  currency: string | null;
  spend: number | null;
  /** Gross ad-platform revenue (the client's raise/return), NOT TCF's own cut. */
  raise: number | null;
  /** TCF's own commission-based revenue. Computed from each project's own "Live
   * Ads" tab (which has no TCF-revenue column of its own) as raise * commissionPct
   * for CF/Ecom/CF Full — see snapshot.ts's fetchIndividualSheetRows. PL uses a
   * different formula (spend * commissionPct, or a flat fixed fee) — see
   * fetchPlAdsRows. */
  revenue: number | null;
  roas: number | null;
  conversions: number | null;
  leads: number | null;
  reservations: number | null;
  costPerLead: number | null;
  costPerReservation: number | null;
  /** Facebook/Google breakdown — only populated for rows sourced from an individual
   * project's own "Live Ads"-style tab (CF Full, Ecom individual sheets), which
   * splits spend/raise/conversions/roas by platform. Null where not available. */
  fbSpend: number | null;
  fbRaise: number | null;
  fbConversions: number | null;
  fbRoas: number | null;
  googleSpend: number | null;
  googleRaise: number | null;
  googleConversions: number | null;
  googleRoas: number | null;
  sourceTab: string;
}

export interface ProjectMeta {
  project: string;
  commissionPct: number | null;
  adAccount: string | null;
  googleAdAccount: string | null;
  guru: string | null;
  type: "Lead" | "Full" | null;
  /** Link to the project's own spreadsheet (Lead- Full- Kick off's "Source of data" column). */
  sourceUrl: string | null;
  /** "Include" column (TRUE/FALSE) — FALSE means skip fetching this project's
   * individual sheet entirely (old/closed/irrelevant projects). Null if the
   * column is missing or blank for this row; treated as "include" by default
   * so a blank cell never silently drops a real project. */
  include: boolean | null;
}

/** "PL Ads" tab metadata — kept separate from ProjectMeta because PL's
 * commission model is free-text (either a percentage or a flat fixed fee),
 * not a clean numeric commission %. */
export interface PlProjectMeta {
  project: string;
  /** Fraction (e.g. 0.2 for "20%"), null if this project uses a fixed fee instead. */
  commissionPct: number | null;
  /** Flat dollar amount (e.g. 1250 for "$1250 fixed fee"), null if this project uses a % instead. */
  commissionFixed: number | null;
  adAccount: string | null;
  guru: string | null;
  status: string | null;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null; // ISO yyyy-mm-dd
  sourceUrl: string | null;
  /** "Include" column (TRUE/FALSE) — only an explicit TRUE gets fetched, same
   * opt-in semantics as the other tabs' Include column. */
  include: boolean | null;
}

export interface OkrSummaryRow {
  project: string;
  category: string | null;
  raiseFb: number | null;
  raiseGoogle: number | null;
  raiseTiktok: number | null;
  live: string | null;
  inDemand: string | null;
}

export interface Snapshot {
  fetchedAt: string;
  rows: ProjectDayRow[];
  projectMeta: ProjectMeta[];
  okr: OkrSummaryRow[];
  warnings: string[];
}
