"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useRefreshSnapshot, useRefreshStatus, useSnapshot } from "@/lib/hooks/useSnapshot";
import { logout } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/cf-ads", label: "CF Ads" },
  { href: "/ecom-ads", label: "Ecom Ads" },
  { href: "/cf-full", label: "CF Full" },
  { href: "/leadgen-ads", label: "Leadgen Ads" },
  { href: "/pl-ads", label: "PL Ads" },
  { href: "/okr", label: "OKR" },
];

function formatFetchedAt(iso: string | undefined) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsedMinutes(startedAt: string | null) {
  if (!startedAt) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  return minutes;
}

export function DashboardChrome({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: snapshot } = useSnapshot();
  const refresh = useRefreshSnapshot();
  const { data: refreshStatus } = useRefreshStatus();
  const wasInProgress = useRef(false);

  // A refresh can be triggered from any tab/user and takes up to 30 minutes —
  // once server-side status flips from running to done, pull the fresh
  // snapshot automatically instead of leaving the page showing stale data
  // until someone happens to reload.
  useEffect(() => {
    if (wasInProgress.current && !refreshStatus?.inProgress) {
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
    }
    wasInProgress.current = !!refreshStatus?.inProgress;
  }, [refreshStatus?.inProgress, queryClient]);

  const isRefreshing = refresh.isPending || !!refreshStatus?.inProgress;
  const elapsedMinutes = formatElapsedMinutes(refreshStatus?.startedAt ?? null);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <Image src="/tcf-logo.webp" alt="TCF" width={28} height={28} className="rounded" unoptimized />
              <span className="text-sm font-semibold">TCF Advertising</span>
            </Link>
            <nav className="flex flex-wrap gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-secondary"
                        : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-black/50 dark:text-white/50">
              Last refreshed: {formatFetchedAt(snapshot?.fetchedAt)}
            </span>
            {refreshStatus?.inProgress && (
              <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Refresh running{elapsedMinutes !== null ? ` (started ${elapsedMinutes}m ago, up to 30m)` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={isRefreshing}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-secondary disabled:opacity-50"
            >
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
            {isAdmin && (
              <>
                <Link
                  href="/admin/invites"
                  className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Manage invites
                </Link>
                <Link
                  href="/admin/settings"
                  className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
                >
                  Settings
                </Link>
              </>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        {refresh.isError && (
          <div className="bg-red-50 px-6 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {(refresh.error as Error).message}
          </div>
        )}
        {snapshot?.warnings && snapshot.warnings.length > 0 && (
          <details className="bg-amber-50 px-6 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <summary className="cursor-pointer">
              {snapshot.warnings.length} data warning{snapshot.warnings.length > 1 ? "s" : ""} from the last refresh
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {snapshot.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
