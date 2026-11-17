import { test } from "node:test";
import assert from "node:assert/strict";
import { JBUX_FUNDINGS, POT_SHARE, REPORT_KINDS, ReportInputError, emptyFundingTotals, ledgerMatch, parseReportFilter } from "../src/lib/repo/jbux-report.ts";

test("parseReportFilter validates the four filters the portal's way", () => {
  assert.deepEqual(JBUX_FUNDINGS, ["real", "test", "promo"]);
  assert.deepEqual(REPORT_KINDS, ["grant", "purchase", "spend", "refund", "reversal", "adjust"]);
  assert.deepEqual(parseReportFilter(), { funding: null, kind: null, from: null, to: null });
  assert.deepEqual(parseReportFilter({ funding: null, kind: "", from: undefined }), { funding: null, kind: null, from: null, to: null });
  const f = parseReportFilter({ funding: "test", kind: "grant", from: "2026-11-01", to: "2026-12-01" });
  assert.equal(f.funding, "test");
  assert.equal(f.kind, "grant");
  assert.equal(f.from.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(f.to.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.throws(() => parseReportFilter({ funding: "cash" }), ReportInputError);
  assert.throws(() => parseReportFilter({ kind: "steal" }), /kind must be one of/);
  assert.throws(() => parseReportFilter({ from: "yesterday" }), /from is not a date/);
});

test("ledgerMatch: kind, date window [from, to), and funding on the row's pot OR a split share in it", () => {
  assert.deepEqual(ledgerMatch(parseReportFilter()), {});
  const from = new Date("2026-11-01T00:00:00Z");
  const to = new Date("2026-12-01T00:00:00Z");
  assert.deepEqual(ledgerMatch({ funding: "real", kind: "spend", from, to }), {
    kind: "spend", at: { $gte: from, $lt: to }, $or: [{ funding: "real" }, { "split.real": { $gt: 0 } }],
  });
  assert.deepEqual(ledgerMatch({ funding: null, kind: null, from: null, to }), { at: { $lt: to } });
});

test("POT_SHARE takes the split's share when the row has one, else the whole amount on its funding", () => {
  assert.deepEqual(POT_SHARE("test"), {
    $cond: [{ $ifNull: ["$split", false] }, { $ifNull: ["$split.test", 0] }, { $cond: [{ $eq: ["$funding", "test"] }, "$amount", 0] }],
  });
  assert.deepEqual(emptyFundingTotals(), { real: { credited: 0, debited: 0 }, test: { credited: 0, debited: 0 }, promo: { credited: 0, debited: 0 } });
});
