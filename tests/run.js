import assert from "node:assert";
import { joinOf, castOf } from "../vote.js";
import { step, close } from "../voterun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { txns: [], verdicts: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "join", txn: 1, party: "a" }],
  bad_txn_code: "E_BAD_TXN", bad_party_code: "E_BAD_PARTY",
  dup_party_code: "E_DUP_PARTY", no_txn_code: "E_NO_TXN",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("joinOf returns a list", () => {
  assert.ok(Array.isArray(joinOf([], 1, "a")));
});

check("castOf returns a list", () => {
  assert.ok(Array.isArray(castOf([], 1, "a", true)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
