import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession, isAdmin } from "@/lib/dal";
import { getFullCampaignsSinceDate } from "@/lib/store";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsAdminPage() {
  const session = await verifySession();
  if (!isAdmin(session.email)) {
    redirect("/");
  }

  const currentDate = await getFullCampaignsSinceDate();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/"
        className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-xl font-semibold">Refresh Settings</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        CF Full projects&apos; daily data is pulled fresh from each project&apos;s own spreadsheet on every
        Refresh. This date controls how far back that pull goes — rows before it are dropped as historical
        noise from older tooling. It&apos;s separate from the date-range filter on each dashboard section, which
        only changes what you&apos;re viewing from data already fetched.
      </p>

      <SettingsForm currentDate={currentDate} />
    </div>
  );
}
