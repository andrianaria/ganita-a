import DashboardView from "../../components/dashboard-view";
import { apiRequest } from "../../lib/server-session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const meResponse = await apiRequest("/v1/auth/me");
  if (meResponse.status === 409) redirect("/onboarding");
  if ([401, 403].includes(meResponse.status)) redirect("/sign-in");
  if (!meResponse.ok) throw new Error("Profil belum dapat dimuat.");
  const me = await meResponse.json();
  const outletsResponse = await apiRequest("/v1/outlets");
  if (!outletsResponse.ok) throw new Error("Outlet belum dapat dimuat.");
  const outlets = await outletsResponse.json();
  return <DashboardView userName={me.data.user.name} timezone={me.data.organization.timezone} initialOutlets={outlets.data} />;
}
