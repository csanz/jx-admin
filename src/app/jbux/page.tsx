import { gatedPage } from "@/components/AdminGate";
import { JbuxConsole } from "./JbuxConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "JBux" };

export default function JbuxPage() {
  return gatedPage((actor) => <JbuxConsole adminEmail={actor.email} />);
}
