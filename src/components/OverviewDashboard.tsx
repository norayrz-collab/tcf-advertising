"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSnapshot } from "@/lib/hooks/useSnapshot";
import {
  DATE_RANGE_PRESETS,
  filterByDateRange,
  sumKpis,
  type CustomRange,
  type DateRangeKey,
} from "@/lib/aggregate";
import type { Section } from "@/lib/types";

const SECTIONS: { key: Section; label: string; href: string }[] = [
  { key: "CF", label: "CF Ads Projects", href: "/cf-ads" },
  { key: "ECOM", label: "Ecom Ads Projects", href: "/ecom-ads" },
  { key: "CF_FULL", label: "CF Full Projects", href: "/cf-full" },
  { key: "LEADGEN", label: "Leadgen Ads Projects", href: "/leadgen-ads" },
  { key: "PL", label: "PL Ads Projects", href: "/pl-ads" },
];

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function rangeCaption(range: DateRangeKey): string {
  const preset = DATE_RANGE_PRESETS.find((p) => p.key === range);
  if (preset) return preset.key === "all" ? "all time" : `last ${preset.days} days`;
  return "selected range";
}

export function OverviewDashboard() {
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

  const filteredRows = useMemo(
    () => (snapshot ? filterByDateRange(snapshot.rows, range, customRange) : null),
    [snapshot, range, customRange]
  );

  const bySection = useMemo(() => {
    if (!filteredRows) return null;
    return SECTIONS.map((s) => ({
      ...s,
      kpis: sumKpis(filteredRows.filter((r) => r.section === s.key)),
    }));
  }, [filteredRows]);

  // Combined across every section — CF/Ecom/CF Full contribute real raise/ROAS,
  // Leadgen/PL contribute 0 raise (they have none), so this stays a valid total.
  const allTotal = useMemo(() => (filteredRows ? sumKpis(filteredRows) : null), [filteredRows]);

  const caption = rangeCaption(range);

  if (isLoading) return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Ads Department Overview</h1>

      <div className="flex flex-wrap items-center gap-1">
        {DATE_RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => updateParam("range", preset.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              range === preset.key ? "bg-primary text-secondary" : "border border-black/15 dark:border-white/15"
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bySection?.map((s) => {
          // Leadgen/PL have no ad-platform raise/ROAS — lead with TCF Revenue instead.
          const hasRaise = s.key !== "LEADGEN" && s.key !== "PL";
          return (
            <Link
              key={s.key}
              href={s.href}
              className="rounded-lg border border-black/10 p-4 transition-colors hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
            >
              <div className="text-sm font-medium text-black/60 dark:text-white/60">{s.label}</div>
              {hasRaise ? (
                <>
                  <div className="mt-2 text-2xl font-semibold">{currency.format(s.kpis.raise)}</div>
                  <div className="text-xs text-black/50 dark:text-white/50">total raise, {caption}</div>
                </>
              ) : (
                <>
                  <div className="mt-2 text-2xl font-semibold text-secondary dark:text-primary">
                    {currency.format(s.kpis.revenue)}
                  </div>
                  <div className="text-xs text-black/50 dark:text-white/50">total TCF revenue, {caption}</div>
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>Spend: {currency.format(s.kpis.spend)}</span>
                {hasRaise && (
                  <>
                    <span className="font-semibold text-secondary dark:text-primary">
                      TCF Revenue: {currency.format(s.kpis.revenue)}
                    </span>
                    <span>ROAS: {s.kpis.roas !== null ? number.format(s.kpis.roas) : "—"}</span>
                  </>
                )}
              </div>
            </Link>
          );
        })}

        {allTotal && (
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
            <div className="text-sm font-medium text-black/60 dark:text-white/60">All Total</div>
            <div className="mt-2 text-2xl font-semibold">{currency.format(allTotal.raise)}</div>
            <div className="text-xs text-black/50 dark:text-white/50">total raise, {caption}</div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>Spend: {currency.format(allTotal.spend)}</span>
              <span className="font-semibold text-secondary dark:text-primary">
                TCF Revenue: {currency.format(allTotal.revenue)}
              </span>
              <span>ROAS: {allTotal.roas !== null ? number.format(allTotal.roas) : "—"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
