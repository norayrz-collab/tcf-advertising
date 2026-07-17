"use client";

import { useActionState } from "react";
import { updateFullCampaignsSinceDateAction } from "@/app/actions/settings";

export function SettingsForm({ currentDate }: { currentDate: string }) {
  const [state, formAction, pending] = useActionState(updateFullCampaignsSinceDateAction, undefined);

  return (
    <form action={formAction} className="mt-6 flex items-end gap-2">
      <div>
        <label htmlFor="sinceDate" className="mb-1 block text-sm font-medium">
          Fetch Full-campaign data since
        </label>
        <input
          id="sinceDate"
          name="sinceDate"
          type="date"
          defaultValue={currentDate}
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-secondary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.saved && <p className="text-sm text-green-700 dark:text-green-400">Saved.</p>}
    </form>
  );
}
