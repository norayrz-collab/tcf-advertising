import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession, isAdmin } from "@/lib/dal";
import { listInvitedEmails } from "@/lib/allowlist";
import { revokeEmailAction } from "@/app/actions/invites";
import { InviteForm } from "@/components/InviteForm";

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
        Each invited person signs in with their own email and password, set here when you invite them.
      </p>

      <InviteForm />

      <ul className="mt-6 divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {invited.length === 0 && (
          <li className="px-4 py-3 text-sm text-black/50 dark:text-white/50">No invited emails yet.</li>
        )}
        {invited.map(({ email, source }) => (
          <li key={email} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>{email}</span>
            {source === "env" ? (
              <span className="text-xs text-black/40 dark:text-white/40">admin (shared password)</span>
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
