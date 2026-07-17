import { verifySession, isAdmin } from "@/lib/dal";
import { DashboardChrome } from "@/components/DashboardChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await verifySession(); // redirects to /login if not authenticated
  return <DashboardChrome isAdmin={isAdmin(session.email)}>{children}</DashboardChrome>;
}
