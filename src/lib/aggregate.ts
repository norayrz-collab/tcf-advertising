import type { ProjectDayRow } from "./types";

export const DATE_RANGE_PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

export type DateRangeKey = (typeof DATE_RANGE_PRESETS)[number]["key"] | "custom";

export interface CustomRange {
  from: string; // ISO yyyy-mm-dd
  to: string; // ISO yyyy-mm-dd
}

export function filterByDateRange(
  rows: ProjectDayRow[],
  rangeKey: DateRangeKey,
  customRange: CustomRange | null = null,
  referenceDate: Date = new Date()
): ProjectDayRow[] {
  if (rangeKey === "custom") {
    if (!customRange) return rows;
    return rows.filter((r) => r.date === null || (r.date >= customRange.from && r.date <= customRange.to));
  }

  const preset = DATE_RANGE_PRESETS.find((p) => p.key === rangeKey);
  if (!preset || preset.days === null) return rows;

  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - preset.days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  return rows.filter((r) => r.date === null || r.date >= cutoffIso);
}

export interface ProjectTotals {
  project: string;
  spend: number;
  raise: number;
  revenue: number;
  roas: number | null;
  conversions: number;
  leads: number;
  reservations: number;
}

// ROAS is intentionally NOT computed as revenue/spend here: "revenue" in this app
// is TCF's own (commission-based) revenue, a different scale entirely from ad
// revenue, so dividing the two produces a meaningless number. Each row already
// carries the sheet's own correct ROAS (ad revenue / ad spend) where available —
// we spend-weight-average that instead of recomputing it from the wrong inputs.
function weightedRoas(rows: ProjectDayRow[]): number | null {
  let numerator = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.roas === null || !row.spend) continue;
    numerator += row.roas * row.spend;
    weight += row.spend;
  }
  return weight > 0 ? numerator / weight : null;
}

export function aggregateByProject(rows: ProjectDayRow[]): ProjectTotals[] {
  const map = new Map<string, ProjectTotals>();
  const rowsByProject = new Map<string, ProjectDayRow[]>();

  for (const row of rows) {
    const existing =
      map.get(row.project) ??
      ({
        project: row.project,
        spend: 0,
        raise: 0,
        revenue: 0,
        roas: null,
        conversions: 0,
        leads: 0,
        reservations: 0,
      } satisfies ProjectTotals);

    existing.spend += row.spend ?? 0;
    existing.raise += row.raise ?? 0;
    existing.revenue += row.revenue ?? 0;
    existing.conversions += row.conversions ?? 0;
    existing.leads += row.leads ?? 0;
    existing.reservations += row.reservations ?? 0;
    map.set(row.project, existing);

    const group = rowsByProject.get(row.project) ?? [];
    group.push(row);
    rowsByProject.set(row.project, group);
  }

  const list = [...map.values()];
  for (const totals of list) {
    totals.roas = weightedRoas(rowsByProject.get(totals.project) ?? []);
  }
  return list.sort((a, b) => b.spend - a.spend);
}

export interface DailyTotals {
  date: string;
  spend: number;
  raise: number;
  revenue: number;
}

export function aggregateByDate(rows: ProjectDayRow[]): DailyTotals[] {
  const map = new Map<string, DailyTotals>();

  for (const row of rows) {
    if (!row.date) continue;
    const existing = map.get(row.date) ?? { date: row.date, spend: 0, raise: 0, revenue: 0 };
    existing.spend += row.spend ?? 0;
    existing.raise += row.raise ?? 0;
    existing.revenue += row.revenue ?? 0;
    map.set(row.date, existing);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function sumKpis(rows: ProjectDayRow[]) {
  let spend = 0;
  let raise = 0;
  let revenue = 0;
  let conversions = 0;
  let leads = 0;
  let reservations = 0;
  for (const row of rows) {
    spend += row.spend ?? 0;
    raise += row.raise ?? 0;
    revenue += row.revenue ?? 0;
    conversions += row.conversions ?? 0;
    leads += row.leads ?? 0;
    reservations += row.reservations ?? 0;
  }
  return { spend, raise, revenue, roas: weightedRoas(rows), conversions, leads, reservations };
}

export interface PlatformTotals {
  spend: number;
  raise: number;
  conversions: number;
  roas: number | null;
}

/** Facebook/Google breakdown — only meaningful for rows sourced from an individual
 * project's own "Live Ads" tab (CF Full, Ecom individual sheets); rows without
 * this breakdown simply contribute nothing here. */
export function platformBreakdown(rows: ProjectDayRow[]): { facebook: PlatformTotals; google: PlatformTotals } {
  function sumPlatform(
    spendKey: "fbSpend" | "googleSpend",
    raiseKey: "fbRaise" | "googleRaise",
    conversionsKey: "fbConversions" | "googleConversions",
    roasKey: "fbRoas" | "googleRoas"
  ): PlatformTotals {
    let spend = 0;
    let raise = 0;
    let conversions = 0;
    let roasNumerator = 0;
    let roasWeight = 0;
    for (const row of rows) {
      spend += row[spendKey] ?? 0;
      raise += row[raiseKey] ?? 0;
      conversions += row[conversionsKey] ?? 0;
      if (row[roasKey] !== null && row[spendKey]) {
        roasNumerator += row[roasKey]! * row[spendKey]!;
        roasWeight += row[spendKey]!;
      }
    }
    return { spend, raise, conversions, roas: roasWeight > 0 ? roasNumerator / roasWeight : null };
  }

  return {
    facebook: sumPlatform("fbSpend", "fbRaise", "fbConversions", "fbRoas"),
    google: sumPlatform("googleSpend", "googleRaise", "googleConversions", "googleRoas"),
  };
}
