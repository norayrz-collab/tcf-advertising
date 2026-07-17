"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { inviteEmailAction } from "@/app/actions/invites";

export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteEmailAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.saved) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="name@company.com"
          className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>
      <div>
        <label htmlFor="invite-password" className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          className="rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-secondary disabled:opacity-50"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.saved && <p className="w-full text-sm text-green-700 dark:text-green-400">Invited.</p>}
    </form>
  );
}
