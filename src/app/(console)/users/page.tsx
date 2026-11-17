import { gatedPage } from "@/components/AdminGate";
import { portalUrlIfSet } from "@/lib/env";
import { UsersConsole } from "./UsersConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export default function UsersPage() {
  return gatedPage((actor) => <UsersConsole adminEmail={actor.email} adminId={actor.id} portalUrl={portalUrlIfSet()} />);
}
