"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSnapshot } from "@/lib/hooks/useSnapshot";
import {
  aggregateByDate,
  aggregateByProject,
  DATE_RANGE_PRESETS,
  filterByDateRange,
  platformBreakdown,
  sumKpis,
  type CustomRange,
  type DateRangeKey,
} from "@/lib/aggregate";
import type { ProjectDayRow, Section } from "@/lib/types";

const METRICS = [
  { key: "spend", label: "Spend" },
  { key: "raise", label: "Raise" },
  { key: "revenue", label: "TCF Revenue" },
  { key: "roas", label: "ROAS" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];
const LEAD_STYLE_METRICS = METRICS.filter((m) => m.key === "spend" || m.key === "revenue");
const DEFAULT_AD_METRICS: MetricKey[] = ["spend", "raise", "revenue"];
const DEFAULT_LEAD_METRICS: MetricKey[] = ["spend", "revenue"];

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? "rounded-lg border-2 border-primary bg-primary/10 p-4"
          : "rounded-lg border border-black/10 bg-bg-grey p-4 dark:border-white/10 dark:bg-white/5"
      }
    >
      <div
        className={
          highlight
            ? "text-xs font-semibold uppercase tracking-wide text-primary"
            : "text-xs uppercase tracking-wide text-black/50 dark:text-white/50"
        }
      >
        {label}
      </div>
      <div className={highlight ? "mt-1 text-2xl font-bold text-secondary dark:text-primary" : "mt-1 text-2xl font-semibold"}>
        {value}
      </div>
    </div>
  );
}

function ProjectFilterDropdown({
  projects,
  selected,
  onToggle,
  onClear,
}: {
  projects: string[];
  selected: Set<string>;
  onToggle: (project: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const label =
    selected.size === 0
      ? "All projects"
      : selected.size === 1
        ? [...selected][0]
        : `${selected.size} projects selected`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
          selected.size === 0 ? "bg-primary text-secondary" : "border border-black/15 dark:border-white/15"
        }`}
      >
        {label}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="shrink-0">
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border border-black/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-secondary">
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
              selected.size === 0
                ? "bg-primary/15 font-medium text-secondary dark:text-primary"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            All projects
          </button>
          <div className="my-1 border-t border-black/10 dark:border-white/10" />
          {projects.map((project) => (
            <label
              key={project}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10"
            >
              <input
                type="checkbox"
                checked={selected.has(project)}
                onChange={() => onToggle(project)}
                className="accent-primary"
              />
              {project}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SectionDashboard({ section, title }: { section: Section; title: string }) {
  const { data: snapshot, isLoading, isError, error } = useSnapshot();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Leadgen/PL have no ad-platform raise/ROAS/conversions — those are always
  // 0 there, so hide the metric toggle, KPI cards, and table columns for them.
  const showAdMetrics = section !== "LEADGEN" && section !== "PL";
  // Leads/Reservations are only meaningful for Leadgen and PL — everywhere
  // else they're always 0, so showing them is just noise.
  const showLeadMetrics = !showAdMetrics;
  const availableMetrics = showAdMetrics ? METRICS : LEAD_STYLE_METRICS;

  const range = (searchParams.get("range") as DateRangeKey) || "30d";
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const customRange: CustomRange | null = useMemo(
    () => (range === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : null),
    [range, customFrom, customTo]
  );
  const metricsParam = searchParams.get("metrics");
  const defaultMetrics = showAdMetrics ? DEFAULT_AD_METRICS : DEFAULT_LEAD_METRICS;
  const activeMetrics = new Set<MetricKey>(
    ((metricsParam ? metricsParam.split(",") : defaultMetrics) as MetricKey[]).filter((k) =>
      availableMetrics.some((m) => m.key === k)
    )
  );

  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

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

  function toggleMetric(key: MetricKey) {
    const next = new Set(activeMetrics);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === 0) next.add(key);
    updateParam("metrics", [...next].join(","));
  }

  function toggleProject(project: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }

  const sectionRows = useMemo<ProjectDayRow[]>(
    () => (snapshot ? snapshot.rows.filter((r) => r.section === section) : []),
    [snapshot, section]
  );

  const distinctProjects = useMemo(
    () => [...new Set(sectionRows.map((r) => r.project))].sort(),
    [sectionRows]
  );

  const filteredRows = useMemo(() => {
    let rows = filterByDateRange(sectionRows, range, customRange);
    if (selectedProjects.size > 0) {
      rows = rows.filter((r) => selectedProjects.has(r.project));
    }
    return rows;
  }, [sectionRows, range, customRange, selectedProjects]);

  const kpis = useMemo(() => sumKpis(filteredRows), [filteredRows]);
  const projectTotals = useMemo(() => aggregateByProject(filteredRows), [filteredRows]);
  const dailyTotals = useMemo(() => aggregateByDate(filteredRows), [filteredRows]);
  const platforms = useMemo(() => platformBreakdown(filteredRows), [filteredRows]);
  const hasPlatformBreakdown = platforms.facebook.spend > 0 || platforms.google.spend > 0;

  if (isLoading) {
    return <p className="text-sm text-black/50 dark:text-white/50">Loading…</p>;
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {(error as Error).message}
      </div>
    );
  }

  if (distinctProjects.length === 0) {
    return (
      <p className="text-sm text-black/50 dark:text-white/50">
        No {title.toLowerCase()} rows in the latest snapshot yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex flex-wrap gap-1">
          {availableMetrics.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMetric(m.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                activeMetrics.has(m.key)
                  ? "bg-secondary text-white"
                  : "border border-black/15 dark:border-white/15"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <ProjectFilterDropdown
        projects={distinctProjects}
        selected={selectedProjects}
        onToggle={toggleProject}
        onClear={() => setSelectedProjects(new Set())}
      />

      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${showAdMetrics ? "lg:grid-cols-5" : "lg:grid-cols-3"}`}>
        <KpiCard label="Spend" value={currency.format(kpis.spend)} />
        {showAdMetrics && <KpiCard label="Raise" value={currency.format(kpis.raise)} />}
        <KpiCard label="TCF Revenue" value={currency.format(kpis.revenue)} highlight />
        {showAdMetrics && <KpiCard label="ROAS" value={kpis.roas !== null ? number.format(kpis.roas) : "—"} />}
        {showAdMetrics && <KpiCard label="Conversions" value={number.format(kpis.conversions)} />}
        {showLeadMetrics && <KpiCard label="Leads" value={number.format(kpis.leads)} />}
      </div>

      {hasPlatformBreakdown && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[.03] dark:border-white/10 dark:bg-white/[.05]">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Platform</th>
                <th className="px-3 py-2 text-right font-medium">Spend</th>
                <th className="px-3 py-2 text-right font-medium">Raise</th>
                <th className="px-3 py-2 text-right font-medium">ROAS</th>
                <th className="px-3 py-2 text-right font-medium">Conversions</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="px-3 py-2">Facebook</td>
                <td className="px-3 py-2 text-right">{currency.format(platforms.facebook.spend)}</td>
                <td className="px-3 py-2 text-right">{currency.format(platforms.facebook.raise)}</td>
                <td className="px-3 py-2 text-right">
                  {platforms.facebook.roas !== null ? number.format(platforms.facebook.roas) : "—"}
                </td>
                <td className="px-3 py-2 text-right">{number.format(platforms.facebook.conversions)}</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Google</td>
                <td className="px-3 py-2 text-right">{currency.format(platforms.google.spend)}</td>
                <td className="px-3 py-2 text-right">{currency.format(platforms.google.raise)}</td>
                <td className="px-3 py-2 text-right">
                  {platforms.google.roas !== null ? number.format(platforms.google.roas) : "—"}
                </td>
                <td className="px-3 py-2 text-right">{number.format(platforms.google.conversions)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {dailyTotals.length > 0 && (
        <div className="h-72 w-full rounded-lg border border-black/10 p-4 dark:border-white/10">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyTotals}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {activeMetrics.has("spend") && <Bar dataKey="spend" name="Spend" fill="#1e1e1e" />}
              {activeMetrics.has("raise") && <Line dataKey="raise" name="Raise" stroke="#faa61a" strokeWidth={2} />}
              {activeMetrics.has("revenue") && <Line dataKey="revenue" name="TCF Revenue" stroke="#00ad48" strokeWidth={2} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="border-b border-black/10 bg-black/[.03] dark:border-white/10 dark:bg-white/[.05]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Project</th>
              <th className="px-3 py-2 text-right font-medium">Spend</th>
              {showAdMetrics && <th className="px-3 py-2 text-right font-medium">Raise</th>}
              <th className="px-3 py-2 text-right font-semibold text-primary">TCF Revenue</th>
              {showAdMetrics && <th className="px-3 py-2 text-right font-medium">ROAS</th>}
              {showAdMetrics && <th className="px-3 py-2 text-right font-medium">Conversions</th>}
              {showLeadMetrics && (
                <>
                  <th className="px-3 py-2 text-right font-medium">Leads</th>
                  <th className="px-3 py-2 text-right font-medium">Reservations</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {projectTotals.map((row) => (
              <tr key={row.project} className="border-b border-black/5 last:border-0 dark:border-white/5">
                <td className="px-3 py-2">{row.project}</td>
                <td className="px-3 py-2 text-right">{currency.format(row.spend)}</td>
                {showAdMetrics && <td className="px-3 py-2 text-right">{currency.format(row.raise)}</td>}
                <td className="px-3 py-2 text-right font-semibold text-secondary dark:text-primary">
                  {currency.format(row.revenue)}
                </td>
                {showAdMetrics && (
                  <td className="px-3 py-2 text-right">{row.roas !== null ? number.format(row.roas) : "—"}</td>
                )}
                {showAdMetrics && <td className="px-3 py-2 text-right">{number.format(row.conversions)}</td>}
                {showLeadMetrics && (
                  <>
                    <td className="px-3 py-2 text-right">{number.format(row.leads)}</td>
                    <td className="px-3 py-2 text-right">{number.format(row.reservations)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
