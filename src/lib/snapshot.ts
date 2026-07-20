import "server-only";
import { z } from "zod";
import { extractSpreadsheetId, fetchExternalTabValues, fetchRawTabs } from "./googleSheets";
import { mapWithConcurrency } from "./concurrency";
import { getFullCampaignsSinceDate } from "./store";
import {
  parseAdsCampaignDetails,
  parseLeadFullKickOff,
  parseLeadGenerationTab,
  parseLiveAdsTab,
  parseOkr,
  parsePlAds,
} from "./tabSchemas";
import type { PlProjectMeta, ProjectDayRow, ProjectMeta, Section, Snapshot } from "./types";

const INDIVIDUAL_SHEET_FETCH_CONCURRENCY = 4;

const projectDayRowSchema = z.object({
  date: z.string().nullable(),
  project: z.string().min(1),
  section: z.enum(["CF", "ECOM", "CF_FULL", "LEADGEN", "PL"]),
  currency: z.string().nullable(),
  spend: z.number().nullable(),
  raise: z.number().nullable(),
  revenue: z.number().nullable(),
  roas: z.number().nullable(),
  conversions: z.number().nullable(),
  leads: z.number().nullable(),
  reservations: z.number().nullable(),
  costPerLead: z.number().nullable(),
  costPerReservation: z.number().nullable(),
  fbSpend: z.number().nullable(),
  fbRaise: z.number().nullable(),
  fbConversions: z.number().nullable(),
  fbRoas: z.number().nullable(),
  googleSpend: z.number().nullable(),
  googleRaise: z.number().nullable(),
  googleConversions: z.number().nullable(),
  googleRoas: z.number().nullable(),
  sourceTab: z.string(),
});

function mergeProjectMeta(...sources: ProjectMeta[][]): ProjectMeta[] {
  const map = new Map<string, ProjectMeta>();
  for (const m of sources.flat()) {
    const key = m.project.trim().toLowerCase();
    const existing = map.get(key);
    map.set(key, {
      project: existing?.project ?? m.project,
      commissionPct: m.commissionPct ?? existing?.commissionPct ?? null,
      adAccount: m.adAccount ?? existing?.adAccount ?? null,
      googleAdAccount: m.googleAdAccount ?? existing?.googleAdAccount ?? null,
      guru: m.guru ?? existing?.guru ?? null,
      type: m.type ?? existing?.type ?? null,
      sourceUrl: m.sourceUrl ?? existing?.sourceUrl ?? null,
      include: m.include ?? existing?.include ?? null,
    });
  }
  return [...map.values()];
}

/** CF/Ecom classification by project name, for entries whose source tab
 * doesn't itself carry a Lead/Full type (Ads Campaign details). PL is never
 * inferred this way — it has its own dedicated "PL Ads" tab. */
function classifySection(project: string): Section {
  const lower = project.toLowerCase();
  if (lower.includes("ecom")) return "ECOM";
  return "CF";
}

interface IndividualSheetTarget {
  project: string;
  sourceUrl: string;
  section: Section;
  tabNames: string[];
  /** From THIS target's own source row (Ads Campaign details for CF/Ecom,
   * Lead- Full- Kick off for CF Full) — never a cross-tab merged lookup. A
   * project name can exist in both tabs (e.g. a stale/closed duplicate in
   * the other one), and merging by name alone can silently let the wrong
   * tab's commission win. */
  commissionPct: number | null;
}

/** Fetches each project's own "Live Ads"/"Advertising Performance"-style tab
 * (linked via a "Source of data" column) and merges their daily rows, with
 * limited concurrency since this can mean hundreds of external spreadsheet
 * reads — every project (CF/Ecom/CF Full) is sourced this way, not from
 * "2026 Total", since that tab has had confirmed data-accuracy issues for at
 * least one project (its formulas are the same fragile ones this whole
 * dashboard exists to route around).
 *
 * These tabs have no TCF-revenue column at all, only the gross ad-platform
 * revenue (the "raise") — TCF's own cut is computed here as raise *
 * commissionPct using the merged project metadata. */
async function fetchIndividualSheetRows(
  targets: IndividualSheetTarget[],
  sinceDate: string
): Promise<{ rows: ProjectDayRow[]; warnings: string[] }> {
  const results = await mapWithConcurrency(targets, INDIVIDUAL_SHEET_FETCH_CONCURRENCY, async (target) => {
    const spreadsheetId = extractSpreadsheetId(target.sourceUrl);
    if (!spreadsheetId) {
      return {
        project: target.project,
        rows: [] as ProjectDayRow[],
        error: "could not parse sheet URL",
        missingCommission: false,
        columnWarnings: [] as string[],
      };
    }
    try {
      const values = await fetchExternalTabValues(spreadsheetId, target.tabNames);
      const parsed = parseLiveAdsTab(values, target.project, target.section, `${target.section} (${target.project})`);
      const commissionPct = target.commissionPct;

      const rows = parsed.rows
        .filter((r) => (r.date ?? "") >= sinceDate)
        .map((r) => ({
          ...r,
          revenue: commissionPct !== null && r.raise !== null ? r.raise * commissionPct : null,
        }));

      const missingCommission = commissionPct === null && rows.some((r) => r.raise !== null);
      return { project: target.project, rows, error: undefined, missingCommission, columnWarnings: parsed.warnings };
    } catch (err) {
      return {
        project: target.project,
        rows: [] as ProjectDayRow[],
        error: err instanceof Error ? err.message : "unknown error",
        missingCommission: false,
        columnWarnings: [] as string[],
      };
    }
  });

  const rows = results.flatMap((r) => r.rows);
  const failures = results.filter((r) => r.error);
  const missingCommission = results.filter((r) => r.missingCommission);
  const columnIssues = results.filter((r) => r.columnWarnings.length > 0);

  const warnings: string[] = [];
  if (failures.length > 0) {
    const examples = failures
      .slice(0, 5)
      .map((f) => `${f.project} (${f.error})`)
      .join("; ");
    warnings.push(
      `[Individual sheets] Could not read ${failures.length} of ${targets.length} project sheets — likely need Viewer access shared with the service account. Examples: ${examples}${
        failures.length > 5 ? ", …" : ""
      }`
    );
  }
  if (columnIssues.length > 0) {
    warnings.push(
      `[Individual sheets] ${columnIssues.length} project(s)' performance tab didn't match expected column names (that project's numbers may be partly blank). Examples: ${columnIssues
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${columnIssues.length > 5 ? ", …" : ""}`
    );
  }
  if (missingCommission.length > 0) {
    warnings.push(
      `[Individual sheets] Unknown commission % for ${missingCommission.length} project(s) — TCF Revenue left blank for them (Raise/Spend/ROAS still shown). Examples: ${missingCommission
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${missingCommission.length > 5 ? ", …" : ""}`
    );
  }

  return { rows, warnings };
}

/** "PL Ads" tab: each project's own "Live Ads" tab, same shape as CF
 * Full/Ecom, but TCF revenue is computed differently depending on the PL
 * "Commission" free-text column — from SPEND (not raise) for a % commission,
 * or as a single flat fee attributed to the project's Start Date for a
 * fixed-fee commission (the fee isn't earned per-day, so it only shows up in
 * date ranges that include that day, consistent with how every other row is
 * filtered). Same opt-in "Include" semantics as the other tabs — only an
 * explicit TRUE is fetched. PL has too few projects to need a "fetch since"
 * cutoff, so every included row with a link is fetched in full. */
async function fetchPlAdsRows(plRows: PlProjectMeta[]): Promise<{ rows: ProjectDayRow[]; warnings: string[] }> {
  const included = plRows.filter((m) => m.include === true);
  const targets = included.filter((m) => m.sourceUrl);
  const warnings: string[] = [];

  const noUrlCount = included.length - targets.length;
  if (noUrlCount > 0) {
    warnings.push(`[PL Ads] ${noUrlCount} project(s) have no "Performance sheet" link, skipped.`);
  }

  const results = await mapWithConcurrency(targets, INDIVIDUAL_SHEET_FETCH_CONCURRENCY, async (m) => {
    const spreadsheetId = extractSpreadsheetId(m.sourceUrl!);
    if (!spreadsheetId) {
      return {
        project: m.project,
        rows: [] as ProjectDayRow[],
        error: "could not parse sheet URL",
        missingCommission: false,
        missingStartDate: false,
        columnWarnings: [] as string[],
      };
    }
    try {
      const values = await fetchExternalTabValues(spreadsheetId, ["Live Ads", "Advertising Performance"]);
      const parsed = parseLiveAdsTab(values, m.project, "PL", `PL Ads (${m.project})`);
      const sourceTab = `PL Ads (${m.project})`;

      let rows = parsed.rows;
      let missingStartDate = false;

      if (m.commissionPct !== null) {
        const pct = m.commissionPct;
        rows = rows.map((r) => ({ ...r, revenue: r.spend !== null ? r.spend * pct : null }));
      } else if (m.commissionFixed !== null) {
        const fixedFee = m.commissionFixed;
        rows = rows.map((r) => ({ ...r, revenue: null }));
        if (!m.startDate) {
          missingStartDate = true;
        } else {
          const matchIdx = rows.findIndex((r) => r.date === m.startDate);
          if (matchIdx >= 0) {
            rows[matchIdx] = { ...rows[matchIdx], revenue: fixedFee };
          } else {
            rows.push({
              date: m.startDate,
              project: m.project,
              section: "PL",
              currency: null,
              spend: null,
              raise: null,
              revenue: fixedFee,
              roas: null,
              conversions: null,
              leads: null,
              reservations: null,
              costPerLead: null,
              costPerReservation: null,
              fbSpend: null,
              fbRaise: null,
              fbConversions: null,
              fbRoas: null,
              googleSpend: null,
              googleRaise: null,
              googleConversions: null,
              googleRoas: null,
              sourceTab,
            });
          }
        }
      }

      const missingCommission = m.commissionPct === null && m.commissionFixed === null;
      return { project: m.project, rows, error: undefined, missingCommission, missingStartDate, columnWarnings: parsed.warnings };
    } catch (err) {
      return {
        project: m.project,
        rows: [] as ProjectDayRow[],
        error: err instanceof Error ? err.message : "unknown error",
        missingCommission: false,
        missingStartDate: false,
        columnWarnings: [] as string[],
      };
    }
  });

  const rows = results.flatMap((r) => r.rows);
  const failures = results.filter((r) => r.error);
  const missingCommission = results.filter((r) => r.missingCommission);
  const missingStartDate = results.filter((r) => r.missingStartDate);
  const columnIssues = results.filter((r) => r.columnWarnings.length > 0);

  if (failures.length > 0) {
    const examples = failures
      .slice(0, 5)
      .map((f) => `${f.project} (${f.error})`)
      .join("; ");
    warnings.push(
      `[PL Ads] Could not read ${failures.length} of ${targets.length} project sheets — likely need Viewer access shared with the service account. Examples: ${examples}${
        failures.length > 5 ? ", …" : ""
      }`
    );
  }
  if (columnIssues.length > 0) {
    warnings.push(
      `[PL Ads] ${columnIssues.length} project(s)' performance tab didn't match expected column names (that project's numbers may be partly blank). Examples: ${columnIssues
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${columnIssues.length > 5 ? ", …" : ""}`
    );
  }
  if (missingCommission.length > 0) {
    warnings.push(
      `[PL Ads] Unknown commission format for ${missingCommission.length} project(s) — TCF Revenue left blank for them. Examples: ${missingCommission
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${missingCommission.length > 5 ? ", …" : ""}`
    );
  }
  if (missingStartDate.length > 0) {
    warnings.push(
      `[PL Ads] ${missingStartDate.length} fixed-fee project(s) have no Start date to attribute the fee to — TCF Revenue left blank for them. Examples: ${missingStartDate
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${missingStartDate.length > 5 ? ", …" : ""}`
    );
  }

  return { rows, warnings };
}

/** "Lead- Full- Kick off" tab, Type = "Lead" rows: each project's own "Lead
 * Generation" tab (spend/leads/reservations — no ad-platform raise/ROAS,
 * measured in leads generated instead). Same opt-in "Include" semantics as
 * every other tab. TCF revenue is computed from SPEND (not raise), per
 * business direction. The Commission column mixes percentages (a plain
 * fraction, e.g. 0.2 for "20%") with an occasional flat fixed fee (a bare
 * number over 1 — clearly not a %, e.g. "1000") — treated as a fixed fee
 * attributed to the project's first day with spend data (no Start Date
 * column here to anchor it to, unlike PL Ads). */
async function fetchLeadgenRows(leadRows: ProjectMeta[]): Promise<{ rows: ProjectDayRow[]; warnings: string[] }> {
  const targets = leadRows.filter((m) => m.type === "Lead" && m.sourceUrl && m.include === true);
  const warnings: string[] = [];

  const results = await mapWithConcurrency(targets, INDIVIDUAL_SHEET_FETCH_CONCURRENCY, async (m) => {
    const spreadsheetId = extractSpreadsheetId(m.sourceUrl!);
    if (!spreadsheetId) {
      return {
        project: m.project,
        rows: [] as ProjectDayRow[],
        error: "could not parse sheet URL",
        missingCommission: false,
        columnWarnings: [] as string[],
      };
    }
    try {
      const values = await fetchExternalTabValues(spreadsheetId, ["Lead Generation"]);
      const parsed = parseLeadGenerationTab(values, m.project, `Leadgen (${m.project})`);

      let rows = parsed.rows;
      const missingCommission = m.commissionPct === null;

      if (m.commissionPct !== null) {
        if (m.commissionPct <= 1) {
          const pct = m.commissionPct;
          rows = rows.map((r) => ({ ...r, revenue: r.spend !== null ? r.spend * pct : null }));
        } else {
          const fixedFee = m.commissionPct;
          rows = rows.map((r) => ({ ...r, revenue: null }));
          const firstSpendDate = rows
            .filter((r) => r.spend !== null && r.date)
            .map((r) => r.date!)
            .sort()[0];
          if (firstSpendDate) {
            const idx = rows.findIndex((r) => r.date === firstSpendDate);
            if (idx >= 0) rows[idx] = { ...rows[idx], revenue: fixedFee };
          }
        }
      }

      return { project: m.project, rows, error: undefined, missingCommission, columnWarnings: parsed.warnings };
    } catch (err) {
      return {
        project: m.project,
        rows: [] as ProjectDayRow[],
        error: err instanceof Error ? err.message : "unknown error",
        missingCommission: false,
        columnWarnings: [] as string[],
      };
    }
  });

  const rows = results.flatMap((r) => r.rows);
  const failures = results.filter((r) => r.error);
  const missingCommission = results.filter((r) => r.missingCommission);
  const columnIssues = results.filter((r) => r.columnWarnings.length > 0);

  if (failures.length > 0) {
    const examples = failures
      .slice(0, 5)
      .map((f) => `${f.project} (${f.error})`)
      .join("; ");
    warnings.push(
      `[Leadgen] Could not read ${failures.length} of ${targets.length} project sheets — likely need Viewer access shared with the service account. Examples: ${examples}${
        failures.length > 5 ? ", …" : ""
      }`
    );
  }
  if (columnIssues.length > 0) {
    warnings.push(
      `[Leadgen] ${columnIssues.length} project(s)' performance tab didn't match expected column names (that project's numbers may be partly blank). Examples: ${columnIssues
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${columnIssues.length > 5 ? ", …" : ""}`
    );
  }
  if (missingCommission.length > 0) {
    warnings.push(
      `[Leadgen] Unknown commission % for ${missingCommission.length} project(s) — TCF Revenue left blank for them. Examples: ${missingCommission
        .slice(0, 5)
        .map((f) => f.project)
        .join(", ")}${missingCommission.length > 5 ? ", …" : ""}`
    );
  }

  return { rows, warnings };
}

export async function buildSnapshot(): Promise<Snapshot> {
  const raw = await fetchRawTabs();
  const warnings: string[] = [];

  // "Ads Campaign details" is a project metadata tab (commission %, ad
  // account, guru, source link) despite the "Campaigns" name. Every Ecom
  // project already appears here too (identifiable by "Ecom" in its name),
  // so "Ecom Campaigns" is redundant and not used. "2026 Total" is also
  // intentionally NOT used as a data source — its numbers have a confirmed
  // accuracy bug for at least one project, and every project's real daily
  // performance lives in its own individual sheet instead (linked from this
  // tab's "Source of data" column).
  const campaignDetails = parseAdsCampaignDetails(raw.adsCampaignDetails);
  const leadFull = parseLeadFullKickOff(raw.leadFullKickOff);
  const plAds = parsePlAds(raw.plAds);
  const okr = parseOkr(raw.okr);

  warnings.push(
    ...campaignDetails.warnings,
    ...leadFull.warnings,
    ...plAds.warnings,
    ...okr.warnings
  );

  const projectMeta = mergeProjectMeta(campaignDetails.rows, leadFull.rows);

  const sinceDate = await getFullCampaignsSinceDate();

  // Build targets per SOURCE TAB, not from the merged/deduped projectMeta — a
  // project name can legitimately point to two different individual sheets
  // across tabs (e.g. its own CF sheet linked from "Ads Campaign details" plus
  // a separate Leadgen sheet linked from "Lead- Full- Kick off"), and merging
  // by name alone silently keeps only one sourceUrl, dropping the other sheet
  // entirely. Only dedupe when project+sourceUrl are BOTH identical (the same
  // sheet referenced twice, not two different campaigns for one product).
  interface Candidate {
    project: string;
    sourceUrl: string;
    section: Section;
    commissionPct: number | null;
  }
  const candidates: Candidate[] = [];

  // "Include" (TRUE/FALSE) lets the sheet owner opt a project into being
  // fetched. Only an explicit TRUE counts — blank and FALSE are both
  // treated as excluded, since most rows are old/closed and haven't been
  // marked either way.
  const isIncluded = (m: ProjectMeta) => m.include === true;

  for (const m of campaignDetails.rows) {
    if (m.sourceUrl && isIncluded(m)) {
      candidates.push({
        project: m.project,
        sourceUrl: m.sourceUrl,
        section: classifySection(m.project),
        commissionPct: m.commissionPct,
      });
    }
  }
  for (const m of leadFull.rows) {
    // Leadgen (Type = "Lead") is handled separately below by fetchLeadgenRows,
    // since it reads a differently-shaped "Lead Generation" tab and computes
    // revenue from spend, not raise. Only "Full" entries feed CF_FULL here.
    if (m.type === "Full" && m.sourceUrl && isIncluded(m)) {
      candidates.push({
        project: m.project,
        sourceUrl: m.sourceUrl,
        section: "CF_FULL",
        commissionPct: m.commissionPct,
      });
    }
  }

  const seenTargets = new Set<string>();
  const targets: IndividualSheetTarget[] = [];
  for (const c of candidates) {
    const key = `${c.project.trim().toLowerCase()}::${c.sourceUrl.trim()}`;
    if (seenTargets.has(key)) continue;
    seenTargets.add(key);
    targets.push({
      project: c.project,
      sourceUrl: c.sourceUrl,
      section: c.section,
      commissionPct: c.commissionPct,
      // Ecom individual sheets more often use "Advertising Performance" as
      // the tab name instead of "Live Ads" — try that first for Ecom.
      tabNames: c.section === "ECOM" ? ["Advertising Performance", "Live Ads"] : ["Live Ads"],
    });
  }

  const individual = await fetchIndividualSheetRows(targets, sinceDate);
  warnings.push(...individual.warnings);

  const pl = await fetchPlAdsRows(plAds.rows);
  warnings.push(...pl.warnings);

  const leadgen = await fetchLeadgenRows(leadFull.rows);
  warnings.push(...leadgen.warnings);

  const candidateRows = [...individual.rows, ...pl.rows, ...leadgen.rows];

  const rows: ProjectDayRow[] = [];
  for (const row of candidateRows) {
    const parsed = projectDayRowSchema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data as ProjectDayRow);
    } else {
      warnings.push(
        `[${row.sourceTab}] Dropped a row for "${row.project}": ${parsed.error.issues
          .map((i) => i.message)
          .join("; ")}`
      );
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    rows,
    projectMeta,
    okr: okr.rows,
    warnings,
  };
}
