// voterun.js：按处理预算处理并留账
import { joinOf, castOf } from "./vote.js";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function codesOf(spec) {
  return {
    badEvent: spec.event_error_code || "E_BAD_EVENT",
    badTxn: spec.bad_txn_code || "E_BAD_TXN",
    badParty: spec.bad_party_code || "E_BAD_PARTY",
    dupParty: spec.dup_party_code || "E_DUP_PARTY",
    noTxn: spec.no_txn_code || "E_NO_TXN",
    noParty: spec.no_party_code || "E_NO_PARTY",
    dupVote: spec.dup_vote_code || "E_DUP_VOTE",
    pending: spec.pending_code || "E_PENDING",
    done: spec.done_code || "E_DONE"
  };
}

function copyState(state) {
  const source = state || {};
  return {
    txns: (source.txns || []).map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
    }),
    verdicts: (source.verdicts || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (source.ledger || []).map(function (entry) { return entry.slice(); }),
    applied: (source.applied || []).slice()
  };
}

function findRow(txns, txn) {
  for (const row of txns) { if (row[0] === txn) return row; }
  return null;
}

function validate(event, codes) {
  if (!event || typeof event !== "object" || Array.isArray(event)) fail(codes.badEvent);
  const kind = event.kind;
  if (kind !== "join" && kind !== "vote" && kind !== "settle") fail(codes.badEvent);
  if (event.txn === undefined) fail(codes.badEvent);
  if (kind !== "settle" && event.party === undefined) fail(codes.badEvent);
  if (kind === "vote" && typeof event.yes !== "boolean") fail(codes.badEvent);
  if (!Number.isInteger(event.txn) || event.txn <= 0) fail(codes.badTxn);
  if (kind !== "settle" && (typeof event.party !== "string" || event.party.length === 0)) {
    fail(codes.badParty);
  }
}

function apply(event, state, codes) {
  validate(event, codes);
  if (event.kind === "join") {
    const row = findRow(state.txns, event.txn);
    if (row && row[1].some(function (cell) { return cell[0] === event.party; })) {
      fail(codes.dupParty);
    }
    state.txns = joinOf(state.txns, event.txn, event.party);
    return;
  }
  if (event.kind === "vote") {
    const row = findRow(state.txns, event.txn);
    if (!row) fail(codes.noTxn);
    const cell = row[1].find(function (entry) { return entry[0] === event.party; });
    if (!cell) fail(codes.noParty);
    if (cell[1] !== "wait") fail(codes.dupVote);
    state.txns = castOf(state.txns, event.txn, event.party, event.yes);
    return;
  }
  const row = findRow(state.txns, event.txn);
  if (!row) fail(codes.noTxn);
  if (state.verdicts.some(function (verdict) { return verdict[0] === event.txn; })) {
    fail(codes.done);
  }
  if (row[1].some(function (cell) { return cell[1] === "wait"; })) fail(codes.pending);
  const allYes = row[1].every(function (cell) { return cell[1] === "yes"; });
  state.verdicts = state.verdicts.concat([[event.txn, allYes ? "commit" : "abort"]])
    .sort(function (a, b) { return a[0] - b[0]; });
}

function ledgerEntry(event) {
  if (event && event.kind === "join") return ["join", event.txn, event.party];
  if (event && event.kind === "vote") return ["vote", event.txn, event.party, event.yes ? 1 : 0];
  if (event && event.kind === "settle") return ["settle", event.txn];
  return ["bad"];
}

function eventFromLedger(entry) {
  if (entry[0] === "join") return { kind: "join", txn: entry[1], party: entry[2] };
  if (entry[0] === "vote") return { kind: "vote", txn: entry[1], party: entry[2], yes: entry[3] === 1 };
  if (entry[0] === "settle") return { kind: "settle", txn: entry[1] };
  return { kind: "bad" };
}

export function step(spec) {
  const state = copyState(spec.state);
  const events = spec.events || [];
  const codes = codesOf(spec);
  let budget = typeof spec.budget === "number" ? spec.budget : events.length;
  let served = 0;
  let judged = 0;
  for (const event of events) {
    const id = event && typeof event === "object" && !Array.isArray(event) ? event.id : undefined;
    if (id !== undefined && state.applied.indexOf(id) !== -1) continue;
    judged += 1;
    if (budget > 0) {
      apply(event, state, codes);
      budget -= 1;
      served += 1;
    } else {
      state.ledger.push(ledgerEntry(event));
    }
    if (id !== undefined) state.applied.push(id);
  }
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = copyState(spec.state);
  const codes = codesOf(spec);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const entry = state.ledger.shift();
    apply(eventFromLedger(entry), state, codes);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
