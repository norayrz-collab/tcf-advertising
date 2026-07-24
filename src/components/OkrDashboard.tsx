"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSnapshot } from "@/lib/hooks/useSnapshot";
import {
  DATE_RANGE_PRESETS,
  filterByDateRange,
  guruBreakdown,
  guruProjectBreakdown,
  platformBreakdown,
  sumKpis,
  type CustomRange,
  type DateRangeKey,
} from "@/lib/aggregate";
import type { ProjectDayRow, Section } from "@/lib/types";

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const SECTION_LABELS: Record<Section, string> = {
  CF: "CF Ads",
  ECOM: "Ecom Ads",
  CF_FULL: "CF Full",
  LEADGEN: "Leadgen Ads",
  PL: "PL Ads",
};
// Only these sections have a Facebook/Google split — Leadgen/PL don't track by platform.
const HAS_PLATFORM_SPLIT: Section[] = ["CF", "ECOM", "CF_FULL"];

function GuruProjectDrilldown({ guru, rows, onBack }: { guru: string; rows: ProjectDayRow[]; onBack: () => void }) {
  const projects = useMemo(() => guruProjectBreakdown(rows, guru), [rows, guru]);

  const bySection = useMemo(() => {
    const map = new Map<Section, typeof projects>();
    for (const p of projects) {
      const list = map.get(p.section) ?? [];
      list.push(p);
      map.set(p.section, list);
    }
    return map;
  }, [projects]);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
      >
        ← Back to all gurus
      </button>
      <h3 className="text-base font-semibold">{guru}</h3>
      {[...bySection.entries()].map(([section, projs]) => {
        const hasPlatform = HAS_PLATFORM_SPLIT.includes(section);
        return (
          <div key={section} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            <div className="border-b border-black/10 bg-black/[.03] px-4 py-2 font-medium dark:border-white/10 dark:bg-white/[.05]">
              {SECTION_LABELS[section]}
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-black/10 dark:border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-black/50 dark:text-white/50">Project</th>
                  <th className="px-3 py-2 text-right font-medium">Spend</th>
                  {hasPlatform && (
                    <>
                      <th className="px-3 py-2 text-right font-medium">FB Spend</th>
                      <th className="px-3 py-2 text-right font-medium">Google Spend</th>
                      <th className="px-3 py-2 text-right font-semibold text-primary">Raise</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {projs.map((p) => (
                  <tr key={p.project} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="px-3 py-2">{p.project}</td>
                    <td className="px-3 py-2 text-right">{currency.format(p.spend)}</td>
                    {hasPlatform && (
                      <>
                        <td className="px-3 py-2 text-right">{currency.format(p.fbSpend)}</td>
                        <td className="px-3 py-2 text-right">{currency.format(p.googleSpend)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-secondary dark:text-primary">
                          {currency.format(p.raise)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function GuruSection({ rows }: { rows: ProjectDayRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const gurus = useMemo(() => guruBreakdown(rows), [rows]);

  if (gurus.length === 0) return null;

  if (selected) {
    return <GuruProjectDrilldown guru={selected} rows={rows} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 dark:border-white/10">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-black/50 dark:text-white/50">Guru</th>
            <th className="px-3 py-2 text-right font-medium">Spend</th>
            <th className="px-3 py-2 text-right font-medium">FB Spend</th>
            <th className="px-3 py-2 text-right font-medium">Google Spend</th>
            <th className="px-3 py-2 text-right font-semibold text-primary">Raise</th>
          </tr>
        </thead>
        <tbody>
          {gurus.map((g) => {
            const spend = g.cf.spend + g.ecom.spend + g.full.spend + g.leadgen.spend + g.pl.spend;
            const fbSpend = g.cf.fbSpend + g.ecom.fbSpend + g.full.fbSpend;
            const googleSpend = g.cf.googleSpend + g.ecom.googleSpend + g.full.googleSpend;
            // Leadgen/PL have no raise concept — they contribute 0 here, which is correct.
            const raise = g.cf.raise + g.ecom.raise + g.full.raise;
            return (
              <tr key={g.guru} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSelected(g.guru)}
                    className="font-medium text-secondary hover:underline dark:text-primary"
                  >
                    {g.guru}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">{currency.format(spend)}</td>
                <td className="px-3 py-2 text-right">{currency.format(fbSpend)}</td>
                <td className="px-3 py-2 text-right">{currency.format(googleSpend)}</td>
                <td className="px-3 py-2 text-right font-semibold text-secondary dark:text-primary">
                  {currency.format(raise)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({ label, rows }: { label: string; rows: ProjectDayRow[] }) {
  const kpis = sumKpis(rows);
  const platforms = platformBreakdown(rows);

  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
      <div className="border-b border-black/10 bg-black/[.03] px-4 py-2 font-medium dark:border-white/10 dark:bg-white/[.05]">
        {label}
      </div>
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 dark:border-white/10">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-black/50 dark:text-white/50"></th>
            <th className="px-3 py-2 text-right font-semibold text-primary">Total</th>
            <th className="px-3 py-2 text-right font-medium">Facebook</th>
            <th className="px-3 py-2 text-right font-medium">Google</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black/5 dark:border-white/5">
            <td className="px-3 py-2 text-black/60 dark:text-white/60">Spend</td>
            <td className="px-3 py-2 text-right font-semibold">{currency.format(kpis.spend)}</td>
            <td className="px-3 py-2 text-right">{currency.format(platforms.facebook.spend)}</td>
            <td className="px-3 py-2 text-right">{currency.format(platforms.google.spend)}</td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-semibold text-primary">Raise</td>
            <td className="px-3 py-2 text-right font-semibold text-primary">{currency.format(kpis.raise)}</td>
            <td className="px-3 py-2 text-right font-semibold">{currency.format(platforms.facebook.raise)}</td>
            <td className="px-3 py-2 text-right font-semibold">{currency.format(platforms.google.raise)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function OkrDashboard() {
  const { data: snapshot, isLoading, isError, error } = useSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = (searchParams.get("range") as DateRangeKey) || "all";
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const customRange: CustomRange | null = useMemo(
    () => (range === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : null),
    [range, customFrom, customTo]
  );

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function selectCustomRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    if (!params.get("from") || !params.get("to")) {
      const today = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);
      params.set("from", monthAgo.toISOString().slice(0, 10));
      params.set("to", today);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function updateCustomDate(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set(key, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const bySection = useMemo(() => {
    if (!snapshot) return null;
    const filtered = filterByDateRange(snapshot.rows, range, customRange);
    const ecom = filtered.filter((r) => r.section === "ECOM");
    const cf = filtered.filter((r) => r.section === "CF");
    const full = filtered.filter((r) => r.section === "CF_FULL");
    // "Overall" here matches OKR's original definition: Ads service (CF) +
    // Ecom ads service + Full campaigns — Leadgen/PL aren't part of it.
    const overall = [...ecom, ...cf, ...full];
    return { ecom, cf, full, overall, filtered };
  }, [snapshot, range, customRange]);

  if (isLoading) return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {(error as Error).message}
      </div>
    );
  }

  if (!bySection) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">OKR — Spend &amp; Raise by Platform</h1>

      <div className="flex flex-wrap items-center gap-1">
        {DATE_RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => updateParam("range", preset.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              range === preset.key
                ? "bg-primary text-secondary"
                : "border border-black/15 dark:border-white/15"
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={selectCustomRange}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            range === "custom" ? "bg-primary text-secondary" : "border border-black/15 dark:border-white/15"
          }`}
        >
          Custom
        </button>
        {range === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => updateCustomDate("from", e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <span className="text-sm text-black/40 dark:text-white/40">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => updateCustomDate("to", e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable label="Ecom Projects" rows={bySection.ecom} />
        <BreakdownTable label="CF Projects" rows={bySection.cf} />
        <BreakdownTable label="Full Projects" rows={bySection.full} />
        <BreakdownTable label="Overall (Ecom + CF + Full)" rows={bySection.overall} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">By Guru</h2>
        <GuruSection rows={bySection.filtered} />
      </div>
    </div>
  );
}
