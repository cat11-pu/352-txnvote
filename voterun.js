// voterun.js：按处理预算处理并留账
import { joinOf, castOf } from "./vote.js";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function codeBook(spec) {
  const src = spec || {};
  return {
    badEvent: src.event_error_code || "E_BAD_EVENT",
    badTxn: src.bad_txn_code || "E_BAD_TXN",
    badParty: src.bad_party_code || "E_BAD_PARTY",
    dupParty: src.dup_party_code || "E_DUP_PARTY",
    noTxn: src.no_txn_code || "E_NO_TXN",
    noParty: src.no_party_code || "E_NO_PARTY",
    dupVote: src.dup_vote_code || "E_DUP_VOTE",
    pending: src.pending_code || "E_PENDING",
    done: src.done_code || "E_DONE"
  };
}

function cloneState(state) {
  const src = state || {};
  return {
    txns: (src.txns || []).map(function (row) {
      return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
    }),
    verdicts: (src.verdicts || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (row) { return row.slice(); }),
    applied: (src.applied || []).map(function (key) { return key && key.slice ? key.slice() : key; })
  };
}

function compactOf(event) {
  if (event.kind === "join") { return ["join", event.txn, event.party]; }
  if (event.kind === "vote") { return ["vote", event.txn, event.party, event.yes ? 1 : 0]; }
  if (event.kind === "settle") { return ["settle", event.txn]; }
  return null;
}

function eventOf(compact) {
  if (!Array.isArray(compact)) { return null; }
  if (compact[0] === "join") { return { kind: "join", txn: compact[1], party: compact[2] }; }
  if (compact[0] === "vote") { return { kind: "vote", txn: compact[1], party: compact[2], yes: !!compact[3] }; }
  if (compact[0] === "settle") { return { kind: "settle", txn: compact[1] }; }
  return null;
}

function checkEvent(event, codes) {
  if (!event || typeof event !== "object") { fail(codes.badEvent); }
  const kind = event.kind;
  if (kind !== "join" && kind !== "vote" && kind !== "settle") { fail(codes.badEvent); }
  if (kind === "join" || kind === "vote") {
    if (typeof event.party !== "string") { fail(codes.badEvent); }
  }
  if (kind === "vote" && typeof event.yes !== "boolean") { fail(codes.badEvent); }
  if (!Number.isInteger(event.txn) || event.txn <= 0) { fail(codes.badTxn); }
  if ((kind === "join" || kind === "vote") && event.party.length === 0) { fail(codes.badParty); }
}

function applyEvent(state, event, codes) {
  checkEvent(event, codes);
  if (event.kind === "join") {
    const existing = state.txns.find(function (row) { return row[0] === event.txn; });
    if (existing && existing[1].some(function (cell) { return cell[0] === event.party; })) {
      fail(codes.dupParty);
    }
    state.txns = joinOf(state.txns, event.txn, event.party);
    return;
  }
  const row = state.txns.find(function (candidate) { return candidate[0] === event.txn; });
  if (!row) { fail(codes.noTxn); }
  if (event.kind === "vote") {
    const cell = row[1].find(function (candidate) { return candidate[0] === event.party; });
    if (!cell) { fail(codes.noParty); }
    if (cell[1] !== "wait") { fail(codes.dupVote); }
    state.txns = castOf(state.txns, event.txn, event.party, event.yes);
    return;
  }
  if (state.verdicts.some(function (verdict) { return verdict[0] === event.txn; })) {
    fail(codes.done);
  }
  if (row[1].some(function (cell) { return cell[1] === "wait"; })) { fail(codes.pending); }
  const commit = row[1].every(function (cell) { return cell[1] === "yes"; });
  state.verdicts = state.verdicts.concat([[event.txn, commit ? "commit" : "abort"]]);
}

export function step(spec) {
  const codes = codeBook(spec);
  const state = cloneState(spec && spec.state);
  const events = (spec && spec.events) || [];
  const budget = Math.max(0, Math.floor(Number(spec && spec.budget) || 0));
  const seen = new Set(state.applied.map(function (key) { return JSON.stringify(key); }));
  let served = 0;
  for (const event of events) {
    const compact = event && typeof event === "object" ? compactOf(event) : null;
    const hasId = event && event.id !== undefined && event.id !== null;
    const idKey = hasId ? JSON.stringify(["id", event.id]) : null;
    const sigKey = compact ? JSON.stringify(compact) : null;
    if ((idKey && seen.has(idKey)) || (sigKey && seen.has(sigKey))) { continue; }
    if (served >= budget) {
      state.ledger.push(compact || [event && event.kind, event && event.txn, event && event.party]);
      continue;
    }
    applyEvent(state, event, codes);
    const stored = hasId ? ["id", event.id] : compact;
    state.applied.push(stored);
    seen.add(JSON.stringify(stored));
    served += 1;
  }
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: served,
    judged_bound: events.length
  };
}

export function close(spec) {
  const codes = codeBook(spec);
  const state = cloneState(spec && spec.state);
  const pending = state.ledger;
  state.ledger = [];
  let catchup = 0;
  for (const entry of pending) {
    const event = eventOf(entry);
    if (!event) { fail(codes.badEvent); }
    applyEvent(state, event, codes);
    state.applied.push(entry.slice());
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
