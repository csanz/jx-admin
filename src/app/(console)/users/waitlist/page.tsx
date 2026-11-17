import { gatedPage } from "@/components/AdminGate";
import { AdminWaitlist } from "./AdminWaitlist";

export const dynamic = "force-dynamic";
export const metadata = { title: "Waitlist" };

export default function WaitlistPage() {
  return gatedPage(() => <AdminWaitlist />);
}
