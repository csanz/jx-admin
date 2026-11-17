import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_TIMEOUT_MS, PORTAL_PUBLIC_URL, RESEND_URL, approvalEmail, firstName, resendRequest, sendEmail } from "../src/lib/email.ts";

const CFG = { resendApiKey: "re_test_key", from: "Jazaix <hello@updates.jazaix.com>", replyTo: null };
const MSG = { to: "pat@example.com", subject: "s", text: "t", html: "<p>h</p>", idempotencyKey: "waitlist-approved-x-1" };

function recording(status, body) {
  const calls = [];
  const doFetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); };
  return { calls, doFetch };
}

test("no config -> not-configured, and nothing is fetched", async () => {
  const { calls, doFetch } = recording(200, { id: "x" });
  assert.deepEqual(await sendEmail(MSG, null, doFetch), { status: "not-configured" });
  assert.equal(calls.length, 0);
});

test("Resend: bearer key, from, to, reply_to, idempotency key; sent with the id", async () => {
  const { calls, doFetch } = recording(200, { id: "em_1" });
  const r = await sendEmail(MSG, { ...CFG, replyTo: "support@jazaix.com" }, doFetch);
  assert.deepEqual(r, { status: "sent", id: "em_1" });
  assert.equal(calls[0].url, RESEND_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer re_test_key");
  assert.equal(calls[0].init.headers["idempotency-key"], "waitlist-approved-x-1");
  assert.deepEqual(JSON.parse(calls[0].init.body), { from: CFG.from, to: ["pat@example.com"], subject: "s", text: "t", html: "<p>h</p>", reply_to: "support@jazaix.com" });
  const plain = resendRequest({ ...MSG, idempotencyKey: undefined }, CFG);
  assert.equal("reply_to" in plain.body, false);
  assert.equal("idempotency-key" in plain.headers, false);
  assert.equal(EMAIL_TIMEOUT_MS, 8000);
});

test("a Resend error, a network error and a bad recipient are failed with a short reason, never a throw", async () => {
  assert.deepEqual(await sendEmail(MSG, CFG, recording(422, { name: "validation_error" }).doFetch), { status: "failed", error: "validation_error" });
  assert.deepEqual(await sendEmail(MSG, CFG, recording(500, {}).doFetch), { status: "failed", error: "http-500" });
  assert.deepEqual(await sendEmail(MSG, CFG, async () => { throw new TypeError("fetch failed"); }), { status: "failed", error: "network" });
  assert.deepEqual(await sendEmail({ ...MSG, to: "not an address" }, CFG, recording(200, { id: "x" }).doFetch), { status: "failed", error: "invalid-recipient" });
});

test("approvalEmail is the portal's 'You're in' email, linking the portal, names escaped", () => {
  const e = approvalEmail({ email: "pat@example.com", name: "Pat <b>Example</b>" });
  assert.equal(e.to, "pat@example.com");
  assert.equal(e.subject, "You're in: welcome to Jazaix");
  assert.match(e.text, /^Hi Pat,\n\nGood news: you're off the waitlist/);
  assert.ok(e.text.includes(`${PORTAL_PUBLIC_URL}/`));
  assert.ok(e.html.includes(`href="${PORTAL_PUBLIC_URL}/"`));
  assert.ok(e.html.includes("See you in a game.<br>The Jazaix team"));
  assert.equal(e.html.includes("<b>"), false);
  assert.match(approvalEmail({ email: "a@b.co", name: "" }).text, /^Hi,\n/);
  assert.ok(approvalEmail({ email: "a@b.co" }, "https://portal.example").text.includes("https://portal.example/"));
  assert.equal(firstName("  Wanda Maximoff "), "Wanda");
  assert.equal(firstName("x".repeat(60)).length, 40);
  assert.equal(PORTAL_PUBLIC_URL, "https://play.jazaix.com");
});
