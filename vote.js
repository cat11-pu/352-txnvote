// vote.js：参与方与票的登记
export function joinOf(txns, txn, party) {
  const next = txns.map(function (row) {
    return [row[0], row[1].map(function (cell) { return [cell[0], cell[1]]; })];
  });
  let row = null;
  for (const candidate of next) {
    if (candidate[0] === txn) { row = candidate; break; }
  }
  if (!row) { row = [txn, []]; next.push(row); }
  const joined = row[1].some(function (cell) { return cell[0] === party; });
  if (!joined) {
    row[1].push([party, "wait"]);
    row[1].sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
  }
  return next;
}

export function castOf(txns, txn, party, yes) {
  return txns.map(function (row) {
    return [row[0], row[1].map(function (cell) {
      if (row[0] === txn && cell[0] === party) { return [cell[0], yes ? "yes" : "no"]; }
      return [cell[0], cell[1]];
    })];
  });
}
