/**
 * Auth.js's own endpoints (sign-in, callback, sign-out, session). This is the one API route that is NOT behind the
 * admin gate: it is how a person becomes signed in at all. Being signed in grants nothing by itself.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
