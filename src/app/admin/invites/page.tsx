import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession, isAdmin } from "@/lib/dal";
import { listInvitedEmails } from "@/lib/allowlist";
import { inviteEmailAction, revokeEmailAction } from "@/app/actions/invites";

export default async function InvitesAdminPage() {
  const session = await verifySession();
  if (!isAdmin(session.email)) {
    redirect("/");
  }

  const invited = await listInvitedEmails();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Invited Emails</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Anyone on this list can sign in with the shared dashboard password.
      </p>

      <form action={inviteEmailAction} className="mt-6 flex gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="name@company.com"
          className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
        />
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-secondary"
        >
          Invite
        </button>
      </form>

      <ul className="mt-6 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {invited.length === 0 && (
          <li className="px-4 py-3 text-sm text-black/50 dark:text-white/50">No invited emails yet.</li>
        )}
        {invited.map(({ email, source }) => (
          <li key={email} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{email}</span>
            {source === "env" ? (
              <span className="text-xs text-black/40 dark:text-white/40">env var (remove there)</span>
            ) : (
              <form action={revokeEmailAction}>
                <input type="hidden" name="email" value={email} />
                <button type="submit" className="text-xs text-red-600 hover:underline">
                  Revoke
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
