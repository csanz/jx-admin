import { Suspense } from "react";
import { gatedPage } from "@/components/AdminGate";
import { portalUrlIfSet } from "@/lib/env";
import { UsersConsole } from "./UsersConsole";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

/** The list reads its state (search, order, filters) from the URL, which needs a Suspense boundary around it. */
export default function UsersPage() {
  return gatedPage((actor) => (
    <Suspense fallback={null}>
      <UsersConsole adminEmail={actor.email} adminId={actor.id} portalUrl={portalUrlIfSet()} />
    </Suspense>
  ));
}
