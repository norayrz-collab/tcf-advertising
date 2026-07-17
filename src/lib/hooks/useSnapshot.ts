"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Snapshot } from "@/lib/types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export function useSnapshot() {
  return useQuery({
    queryKey: ["snapshot"],
    queryFn: () => fetchJson<Snapshot>("/api/snapshot"),
    retry: false,
  });
}

export function useRefreshSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<Snapshot>("/api/refresh", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["snapshot"], data);
    },
  });
}

export interface RefreshStatus {
  inProgress: boolean;
  startedAt: string | null;
}

/** Polls server-side refresh status so any tab/user can see "a refresh is
 * running" regardless of who triggered it — a single refresh can take up to
 * 30 minutes given the ~600+ individual sheets fetched, so this can't just be
 * local mutation-pending state, which resets on page reload. */
export function useRefreshStatus() {
  return useQuery({
    queryKey: ["refreshStatus"],
    queryFn: () => fetchJson<RefreshStatus>("/api/refresh-status"),
    refetchInterval: (query) => (query.state.data?.inProgress ? 10_000 : 20_000),
    retry: false,
  });
}
