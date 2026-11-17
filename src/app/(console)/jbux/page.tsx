import { gatedPage } from "@/components/AdminGate";
import { portalLinked } from "@/lib/env";
import { JbuxConsole } from "./JbuxConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "JBux" };

export default function JbuxPage() {
  // The report reads MongoDB; the two money actions need the portal link (JX_PORTAL_URL + JX_ADMIN_API_TOKEN).
  return gatedPage(() => <JbuxConsole portalLinked={portalLinked()} />);
}
