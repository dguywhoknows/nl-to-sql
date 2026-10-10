/* core.js — pure helpers for SQL Copilot (no DOM, no sql.js; unit-tested). */

/* RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF, blank-line skipping. */
function parseCSV(text) {
  var rows = [], row = [], cur = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(function (c) { return c !== ''; })) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some(function (c) { return c !== ''; })) rows.push(row);
  return rows;
}

/* Turn arbitrary header cells into unique, safe SQL identifiers. */
function sqlIdentifiers(header) {
  var seen = {};
  return header.map(function (c, i) {
    var n = String(c).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'col' + (i + 1);
    if (/^\d/.test(n)) n = 'c_' + n;
    while (seen[n]) n += '_';
    seen[n] = 1;
    return n;
  });
}

/* INTEGER if every non-empty value is an integer, REAL if numeric, else TEXT. */
function inferColumnTypes(rows, ncols) {
  var types = [];
  for (var i = 0; i < ncols; i++) {
    var vals = rows.map(function (r) { return String(r[i] == null ? '' : r[i]).trim(); }).filter(function (v) { return v !== ''; });
    if (vals.length && vals.every(function (v) { return /^-?\d+$/.test(v); })) types.push('INTEGER');
    else if (vals.length && vals.every(function (v) { return /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(v); })) types.push('REAL');
    else types.push('TEXT');
  }
  return types;
}

/* Guardrail for AI-written SQL: allow only SELECT / WITH … SELECT / EXPLAIN, single statement. */
function isReadOnlySQL(sql) {
  var s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:[^']|'')*'/g, "''").trim();
  if (!s) return false;
  var stmts = s.split(';').map(function (x) { return x.trim(); }).filter(Boolean);
  if (stmts.length !== 1) return false;
  if (!/^(select|with|explain)\b/i.test(stmts[0])) return false;
  return !/\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i.test(stmts[0]);
}

/* Decide how to chart a result set. Returns null if not chartable. */
function chartSpec(cols, values) {
  if (!values.length) return null;
  var num = cols.map(function (_, i) { return i; }).filter(function (i) { return values.every(function (r) { return r[i] === null || typeof r[i] === 'number'; }); });
  var lab = cols.findIndex(function (_, i) { return num.indexOf(i) < 0; });
  if (!num.length || (lab < 0 && num.length < 2)) return null;
  var li = lab >= 0 ? lab : num.shift();
  var series = num.filter(function (i) { return i !== li; }).slice(0, 3);
  if (!series.length) return null;
  var isTime = values.every(function (r) { return /^\d{4}(-\d{2})?(-\d{2})?$/.test(String(r[li])); });
  var rows = isTime ? values.slice().sort(function (a, b) { return String(a[li]).localeCompare(String(b[li])); }) : values.slice(0, 25);
  var max = Math.max.apply(null, [0].concat(rows.reduce(function (acc, r) { return acc.concat(series.map(function (i) { return +r[i] || 0; })); }, []))) || 1;
  return { kind: isTime ? 'line' : 'bar', label: li, series: series, rows: rows, max: max };
}

/* Compact number formatting for axes. */
function fmtNum(v) {
  v = +v;
  return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : v.toFixed(v % 1 ? 1 : 0);
}

/* Result set -> CSV text with proper quoting. */
function toCSV(cols, values) {
  var q = function (v) { if (v === null || v === undefined) return ''; var s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.map(q).join(',')].concat(values.map(function (r) { return r.map(q).join(','); })).join('\n');
}

/* EXPLAIN QUERY PLAN rows [id, parent, notused, detail] -> nested tree, plus warnings for full scans. */
function planTree(rows) {
  var byId = {}, roots = [];
  rows.forEach(function (r) { byId[r[0]] = { id: r[0], detail: String(r[3]), children: [] }; });
  rows.forEach(function (r) { var n = byId[r[0]]; if (byId[r[1]]) byId[r[1]].children.push(n); else roots.push(n); });
  var warnings = rows.filter(function (r) { return /^SCAN\b/.test(String(r[3])) && !/USING (COVERING )?INDEX/.test(String(r[3])); })
    .map(function (r) { var m = String(r[3]).match(/^SCAN (?:TABLE )?(\w+)/); return m ? m[1] : String(r[3]); });
  return { roots: roots, warnings: warnings };
}

/* Foreign keys (from PRAGMA foreign_key_list) -> unique edges {from, to, col}. */
function relationEdges(tables) {
  var out = [];
  tables.forEach(function (t) { (t.fks || []).forEach(function (fk) { out.push({ from: t.name, to: fk.table, col: fk.from }); }); });
  return out;
}

/* Grid layout for the ER diagram: tables with most relations in the middle. */
function erLayout(tables, edges, colW, gap) {
  colW = colW || 200; gap = gap || 60;
  var deg = {};
  edges.forEach(function (e) { deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1; });
  var sorted = tables.slice().sort(function (a, b) { return (deg[b.name] || 0) - (deg[a.name] || 0) || a.name.localeCompare(b.name); });
  var cols = Math.min(3, Math.ceil(Math.sqrt(sorted.length)));
  var pos = {}, colH = [];
  sorted.forEach(function (t, i) {
    var c = i % cols, h = 34 + t.columns.length * 20;
    var y = colH[c] || 0;
    pos[t.name] = { x: c * (colW + gap), y: y, w: colW, h: h };
    colH[c] = y + h + gap / 2;
  });
  return pos;
}

/* Column profiling SQL for one table. */
function profileSQL(table, cols) {
  var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
  return 'SELECT COUNT(*) AS n' + cols.map(function (c, i) {
    return ', SUM(' + q(c.name) + ' IS NULL) AS null_' + i + ', COUNT(DISTINCT ' + q(c.name) + ') AS distinct_' + i + ', MIN(' + q(c.name) + ') AS min_' + i + ', MAX(' + q(c.name) + ') AS max_' + i;
  }).join('') + ' FROM ' + q(table);
}

/* Unicode-safe base64 for shareable query links. */
function b64encode(str) {
  var bytes = new TextEncoder().encode(str), bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
