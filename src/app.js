const { $, $$, h, esc, busy, toast, md, rng } = Kit;
let SQL, db, last = null, lastQuestion = '';
const history = [];

/* ---------------- sample database ---------------- */
function buildSample() {
  db = new SQL.Database();
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const first = ['Ava', 'Liam', 'Mia', 'Noah', 'Zara', 'Ethan', 'Priya', 'Mateo', 'Yuki', 'Omar', 'Chloe', 'Leo', 'Amara', 'Lucas', 'Sofia', 'Kai', 'Nina', 'Arjun', 'Elena', 'Theo'];
  const last = ['Smith', 'Patel', 'Garcia', 'Kim', 'Nguyen', 'Brown', 'Rossi', 'Müller', 'Okafor', 'Silva', 'Chen', 'Dubois', 'Khan', 'Lopez', 'Tanaka'];
  const cities = [['Toronto', 'Canada'], ['Vancouver', 'Canada'], ['New York', 'USA'], ['Austin', 'USA'], ['Seattle', 'USA'], ['London', 'UK'], ['Manchester', 'UK'], ['Berlin', 'Germany'], ['Paris', 'France'], ['Tokyo', 'Japan'], ['Sydney', 'Australia'], ['Mumbai', 'India']];
  const cats = { Electronics: [['Wireless Earbuds', 79], ['Mechanical Keyboard', 119], ['4K Monitor', 349], ['USB-C Hub', 45], ['Webcam Pro', 89], ['Smart Speaker', 99], ['Portable SSD', 129]], Books: [['Clean Code', 38], ['The Pragmatic Programmer', 42], ['Atomic Habits', 22], ['Dune', 18], ['Sapiens', 24]], Home: [['Desk Lamp', 39], ['Ergonomic Chair', 289], ['Standing Desk', 499], ['Coffee Grinder', 69], ['Air Purifier', 159], ['Plant Pot Set', 29]], Sports: [['Yoga Mat', 35], ['Running Shoes', 129], ['Dumbbell Set', 149], ['Water Bottle', 25], ['Fitness Tracker', 99]], Toys: [['Lego Space Set', 89], ['Puzzle 1000pc', 24], ['RC Car', 59], ['Board Game Night', 44]] };
  db.run(`CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, city TEXT, country TEXT, signup_date TEXT);
CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id), order_date TEXT, status TEXT);
CREATE TABLE order_items (order_id INTEGER REFERENCES orders(id), product_id INTEGER REFERENCES products(id), quantity INTEGER, unit_price REAL);`);
  const day = (start, span) => new Date(Date.UTC(2023, 0, 1) + (start + Math.floor(r() * span)) * 864e5).toISOString().slice(0, 10);
  db.run('BEGIN');
  const ins = db.prepare('INSERT INTO customers VALUES (?,?,?,?,?)');
  for (let i = 1; i <= 220; i++) { const [c, k] = pick(cities); ins.run([i, pick(first) + ' ' + pick(last), c, k, day(0, 900)]); }
  ins.free();
  const ip = db.prepare('INSERT INTO products VALUES (?,?,?,?)');
  const prods = [];
  let pid = 1;
  for (const [cat, items] of Object.entries(cats)) for (const [n, p] of items) { ip.run([pid, n, cat, p]); prods.push([pid++, p, cat]); }
  ip.free();
  const io = db.prepare('INSERT INTO orders VALUES (?,?,?,?)');
  const ii = db.prepare('INSERT INTO order_items VALUES (?,?,?,?)');
  for (let o = 1; o <= 1500; o++) {
    const d = day(365, 730 - 30 * (r() < 0.3 ? 0 : 1));
    const month = +d.slice(5, 7);
    const status = r() < 0.06 ? 'refunded' : r() < 0.05 ? 'cancelled' : 'delivered';
    io.run([o, 1 + Math.floor(Math.pow(r(), 1.6) * 220), d, status]);
    const n = 1 + Math.floor(r() * (month >= 11 ? 4 : 3));
    for (let j = 0; j < n; j++) {
      const [p, price, cat] = pick(prods);
      const disc = month === 11 && cat === 'Electronics' ? 0.8 : 1;
      ii.run([o, p, 1 + Math.floor(r() * r() * 4), +(price * disc).toFixed(2)]);
    }
  }
  io.free(); ii.free();
  db.run('COMMIT');
}

/* ---------------- schema ---------------- */
function tables() { return db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]?.values.map((v) => v[0]) || []; }
function columns(t) { return db.exec(`PRAGMA table_info("${t}")`)[0]?.values.map((v) => ({ name: v[1], type: v[2] || 'TEXT' })) || []; }
function rowCount(t) { return db.exec(`SELECT COUNT(*) FROM "${t}"`)[0].values[0][0]; }

function renderSchema() {
  $('#schema').innerHTML = tables().map((t) => `<details open><summary>${esc(t)} <span class="muted">· ${rowCount(t).toLocaleString()} rows</span> <a href="#" class="prof small" data-t="${esc(t)}">profile</a></summary><ul>${columns(t).map((c) => `<li><b>${esc(c.name)}</b><span>${esc(c.type)}</span></li>`).join('')}</ul></details>`).join('');
  $$('#schema .prof').forEach((a) => (a.onclick = (e) => { e.preventDefault(); profile(a.dataset.t); }));
}

function schemaPrompt() {
  return tables().map((t) => {
    const cols = columns(t);
    const sample = db.exec(`SELECT * FROM "${t}" LIMIT 3`)[0];
    const rows = sample ? sample.values.map((r) => r.map((v) => (typeof v === 'string' ? `'${v.slice(0, 30)}'` : v)).join(', ')).join('\n  ') : '';
    return `TABLE ${t} (${cols.map((c) => c.name + ' ' + c.type).join(', ')}) -- ${rowCount(t)} rows\n  sample rows:\n  ${rows}`;
  }).join('\n\n');
}

/* ---------------- run + render ---------------- */
function runSQL(sql) {
  const t0 = performance.now();
  const res = db.exec(sql);
  const ms = performance.now() - t0;
  const out = res[res.length - 1] || { columns: ['result'], values: [['OK — statement executed (' + db.getRowsModified() + ' rows modified)']] };
  last = { ...out, sql, ms };
  if (!history.includes(sql)) { history.unshift(sql); history.length = Math.min(history.length, 25); }
  renderHistory();
  renderResults();
  if (/^\s*(create|drop|alter|insert)/i.test(sql)) renderSchema();
  return out;
}

function renderResults() {
  const { columns: cols, values, ms } = last;
  $('#meta').textContent = `${values.length.toLocaleString()} row${values.length === 1 ? '' : 's'} · ${ms.toFixed(1)} ms`;
  const shown = values.slice(0, 500);
  $('#tab-table').innerHTML = `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${shown
    .map((r) => `<tr>${r.map((v) => (typeof v === 'number' ? `<td class="num">${Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>` : `<td>${v === null ? '<span class="muted">NULL</span>' : esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody></table>${values.length > 500 ? '<p class="small muted">Showing first 500 rows.</p>' : ''}`;
  renderChart();
  if (!$('#tab-plan').classList.contains('hidden')) renderPlan();
  $('#insight').innerHTML = '';
}

function showError(msg) {
  $('#tab-table').innerHTML = `<div class="err">⚠ ${esc(msg)}</div>`;
  $('#meta').textContent = '';
  switchTab('table');
}

function renderHistory() {
  const box = $('#history');
  box.innerHTML = '';
  history.forEach((q) => box.append(h('button', { title: q, onclick: () => { $('#sql').value = q; runFromEditor(); } }, q.replace(/\s+/g, ' '))));
}

/* ---------------- auto chart ---------------- */
function renderChart() {
  const box = $('#tab-chart');
  const { columns: cols, values } = last;
  const spec = chartSpec(cols, values);
  if (!spec) { box.innerHTML = '<div class="empty">No chartable shape. Need a label column plus at least one numeric column.</div>'; return; }
  const { label: li, series, rows, max } = spec, isTime = spec.kind === 'line';
  const colors = ['var(--accent)', '#e2703a', '#7c5cd6'];
  const W = 760, H = isTime ? 300 : Math.max(160, rows.length * 26 + 40), padL = isTime ? 56 : 170, padB = isTime ? 40 : 20, padT = 14, padR = 20;
  let body = '';
  if (isTime) {
    const x = (i) => padL + (i * (W - padL - padR)) / Math.max(1, rows.length - 1);
    const y = (v) => H - padB - (v / max) * (H - padT - padB);
    for (let g = 0; g <= 4; g++) { const v = (max * g) / 4; body += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${fmtNum(v)}</text>`; }
    const step = Math.ceil(rows.length / 10);
    rows.forEach((r, i) => { if (i % step === 0) body += `<text x="${x(i)}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(r[li])}</text>`; });
    series.forEach((s, k) => { body += `<polyline fill="none" stroke="${colors[k]}" stroke-width="2.5" points="${rows.map((r, i) => x(i) + ',' + y(+r[s] || 0)).join(' ')}"/>`; });
  } else {
    const bh = (26 - 6) / series.length;
    rows.forEach((r, i) => {
      const y0 = padT + i * 26;
      body += `<text x="${padL - 8}" y="${y0 + 14}" text-anchor="end" font-size="12" fill="var(--text)">${esc(String(r[li]).slice(0, 24))}</text>`;
      series.forEach((s, k) => {
        const w = ((+r[s] || 0) / max) * (W - padL - padR - 50);
        body += `<rect x="${padL}" y="${y0 + k * bh}" width="${Math.max(0, w)}" height="${bh - 1}" rx="3" fill="${colors[k]}"><title>${esc(cols[s])}: ${r[s]}</title></rect><text x="${padL + w + 6}" y="${y0 + k * bh + bh - 3}" font-size="11" fill="var(--muted)">${fmtNum(+r[s] || 0)}</text>`;
      });
    });
  }
  const legend = series.map((s, k) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[k]}"></span> ${esc(cols[s])}</span>`).join(' &nbsp; ');
  box.innerHTML = `<div class="chart"><div class="small muted" style="margin-bottom:6px">${isTime ? 'Line' : 'Bar'} chart of <b>${esc(cols[li])}</b> · ${legend}</div><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Result chart">${body}</svg></div>`;
}

function switchTab(t) {
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  ['table', 'chart', 'plan', 'insight'].forEach((k) => $('#tab-' + k).classList.toggle('hidden', k !== t));
  if (t === 'plan') renderPlan();
}
$$('.tabs button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));

/* ---------------- AI: NL -> SQL with self-repair ---------------- */
const SUGGEST = [
  'Top 5 products by revenue in 2025',
  'Monthly revenue trend',
  'Which country has the most customers?',
  'Refund rate by product category',
  'Customers who ordered more than 15 times',
];
const DEMO_SQL = {
  [SUGGEST[0]]: `SELECT p.name, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM order_items oi\nJOIN orders o ON o.id = oi.order_id\nJOIN products p ON p.id = oi.product_id\nWHERE o.status = 'delivered' AND strftime('%Y', o.order_date) = '2025'\nGROUP BY p.id ORDER BY revenue DESC LIMIT 5;`,
  [SUGGEST[1]]: `SELECT strftime('%Y-%m', o.order_date) AS month, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM orders o JOIN order_items oi ON oi.order_id = o.id\nWHERE o.status = 'delivered'\nGROUP BY month ORDER BY month;`,
  [SUGGEST[2]]: `SELECT country, COUNT(*) AS customers\nFROM customers GROUP BY country ORDER BY customers DESC;`,
  [SUGGEST[3]]: `SELECT p.category,\n  ROUND(100.0 * COUNT(DISTINCT CASE WHEN o.status = 'refunded' THEN o.id END) / COUNT(DISTINCT o.id), 2) AS refund_rate_pct\nFROM orders o\nJOIN order_items oi ON oi.order_id = o.id\nJOIN products p ON p.id = oi.product_id\nGROUP BY p.category ORDER BY refund_rate_pct DESC;`,
  [SUGGEST[4]]: `SELECT c.name, c.city, COUNT(o.id) AS orders\nFROM customers c JOIN orders o ON o.customer_id = c.id\nGROUP BY c.id HAVING orders > 15 ORDER BY orders DESC;`,
};

$('#suggestions').append(...SUGGEST.map((s) => h('button', { class: 'btn sm ghost', onclick: () => { $('#question').value = s; $('#ask').click(); } }, s)));

async function ask() {
  const q = $('#question').value.trim();
  if (!q) return toast('Type a question first', 'err');
  lastQuestion = q;
  $('#explanation').classList.add('hidden');
  const sys = `You are an expert SQLite analyst. Write ONE read-only SQLite query (SELECT/WITH only) that answers the user's question using this schema:\n\n${schemaPrompt()}\n\nRules: use only these tables/columns; SQLite date functions (strftime); readable aliases; ROUND money to 2 decimals; LIMIT large outputs to 100 rows.\nReturn JSON {"sql":"...","assumptions":"one short sentence or empty"}.`;
  const msgs = [{ role: 'system', content: sys }, { role: 'user', content: q }];
  const demoFor = () => ({ sql: DEMO_SQL[q] || `-- Demo mode can only answer the suggested questions.\n-- Add a free Groq key for any question.\nSELECT * FROM orders ORDER BY order_date DESC LIMIT 20;`, assumptions: DEMO_SQL[q] ? 'Revenue counts delivered orders only.' : '' });
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await AI.chat(msgs, { json: true, temperature: 0.1, demo: demoFor });
    const sql = String(out.sql || '').trim();
    $('#sql').value = sql;
    if (!isReadOnlySQL(sql)) { showError('Refused to run a non-read-only or multi-statement AI query:\n\n' + sql); return; }
    try {
      runSQL(sql);
      switchTab(last.values.length > 1 && $('#tab-chart svg') ? 'chart' : 'table');
      if (out.assumptions) toast('Assumption: ' + out.assumptions);
      return;
    } catch (e) {
      if (attempt === 2) { showError(e.message + '\n\n(AI could not repair the query after 3 tries.)'); return; }
      toast(`SQL error, asking AI to fix (try ${attempt + 2}/3)…`);
      msgs.push({ role: 'assistant', content: JSON.stringify(out) }, { role: 'user', content: `That query failed in SQLite with: ${e.message}\nReturn a corrected JSON.` });
    }
  }
}

function runFromEditor() {
  try { runSQL($('#sql').value); } catch (e) { showError(e.message); }
}

async function explain() {
  const sql = $('#sql').value.trim();
  if (!sql) return;
  const text = await AI.chat([
    { role: 'system', content: 'Explain SQL to a junior analyst. Markdown: one-sentence summary, then a short numbered walkthrough of each clause, then one possible performance or correctness gotcha. Max 160 words.' },
    { role: 'user', content: `Schema:\n${schemaPrompt()}\n\nQuery:\n${sql}` },
  ], { temperature: 0.3, demo: `**Summary:** this query aggregates rows and ranks the result.\n\n1. **FROM / JOIN** connects the tables through their foreign keys.\n2. **WHERE** filters rows *before* grouping.\n3. **GROUP BY** collapses rows into one per group.\n4. **ORDER BY / LIMIT** sorts and trims the output.\n\n**Gotcha:** joining orders to order_items multiplies order rows. Use \`COUNT(DISTINCT o.id)\` when counting orders.\n\n*(Demo explanation. Add a key for one tailored to your query.)*` });
  const el = $('#explanation');
  el.innerHTML = md(text);
  el.classList.remove('hidden');
}

async function insight() {
  if (!last) return toast('Run a query first', 'err');
  const csv = [last.columns.join(','), ...last.values.slice(0, 60).map((r) => r.join(','))].join('\n');
  const text = await AI.chat([
    { role: 'system', content: 'You are a sharp data analyst. Given a query result, give 3-4 bullet insights with concrete numbers, then one suggested follow-up question. Markdown. Max 130 words. Do not invent data not in the table.' },
    { role: 'user', content: `Question: ${lastQuestion || '(manual query)'}\nSQL: ${last.sql}\nResult (${last.values.length} rows, first 60 shown):\n${csv}` },
  ], { temperature: 0.4, demo: () => demoInsight() });
  $('#insight').innerHTML = md(text);
}
function demoInsight() {
  const { columns: c, values: v } = last;
  const num = c.findIndex((_, i) => v.length && typeof v[0][i] === 'number');
  if (num < 0) return `- The result has **${v.length} rows** and ${c.length} columns.\n\n**Follow-up:** add a numeric aggregate to compare groups.`;
  const vals = v.map((r) => +r[num] || 0), tot = vals.reduce((a, b) => a + b, 0);
  const top = v.reduce((a, r) => (+r[num] > +a[num] ? r : a), v[0]);
  return `- **${top[0]}** leads with **${(+top[num]).toLocaleString()}** ${c[num]}, ${((100 * +top[num]) / (tot || 1)).toFixed(1)}% of the total.\n- The total across ${v.length} rows is **${tot.toLocaleString(undefined, { maximumFractionDigits: 2 })}**.\n- The average per row is **${(tot / v.length).toLocaleString(undefined, { maximumFractionDigits: 2 })}**.\n\n**Follow-up:** how does this break down by month?\n\n*(Computed demo insight. Add a key for AI analysis.)*`;
}

/* ---------------- CSV import ---------------- */
$('#csv').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const rows = parseCSV(await f.text());
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row');
    const name = sqlIdentifiers([f.name.replace(/\.csv$/i, '')])[0] || 'imported';
    const header = sqlIdentifiers(rows[0]);
    const data = rows.slice(1).map((r) => header.map((_, i) => r[i] ?? ''));
    const types = inferColumnTypes(data, header.length);
    db.run(`DROP TABLE IF EXISTS "${name}"`);
    db.run(`CREATE TABLE "${name}" (${header.map((c, i) => `"${c}" ${types[i]}`).join(', ')})`);
    db.run('BEGIN');
    const st = db.prepare(`INSERT INTO "${name}" VALUES (${header.map(() => '?').join(',')})`);
    data.forEach((r) => st.run(r.map((v, i) => (String(v).trim() === '' ? null : types[i] === 'TEXT' ? v : Number(v)))));
    st.free();
    db.run('COMMIT');
    renderSchema();
    $('#sql').value = `SELECT * FROM "${name}" LIMIT 50;`;
    runFromEditor();
    toast(`Imported ${data.length.toLocaleString()} rows into table "${name}"`);
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
};

/* ---------------- query plan ---------------- */
function renderPlan() {
  const box = $('#tab-plan');
  const sql = $('#sql').value.trim().replace(/;\s*$/, '');
  if (!sql || !isReadOnlySQL(sql) || /^explain/i.test(sql)) { box.innerHTML = '<div class="empty">Run a SELECT query to see how SQLite executes it.</div>'; return; }
  try {
    const res = db.exec('EXPLAIN QUERY PLAN ' + sql)[0];
    const p = planTree(res ? res.values : []);
    const node = (n) => `<li><code>${esc(n.detail)}</code>${/^SCAN/.test(n.detail) && !/INDEX/.test(n.detail) ? ' <span class="tag warn">full scan</span>' : /INDEX/.test(n.detail) ? ' <span class="tag good">index</span>' : ''}${n.children.length ? `<ul>${n.children.map(node).join('')}</ul>` : ''}</li>`;
    box.innerHTML = `<ul class="plan">${p.roots.map(node).join('')}</ul>` + (p.warnings.length ? `<p class="small" style="margin-top:10px">Full table scan on <b>${p.warnings.map(esc).join(', ')}</b>. For big tables, an index on the filtered/joined column helps. <button class="btn sm" id="idxAdvice">Suggest indexes</button></p><div id="idxOut" class="prose"></div>` : '<p class="small muted" style="margin-top:10px">No full table scans. 👍</p>');
    $('#idxAdvice')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const text = await AI.chat([{ role: 'system', content: 'You are a SQLite performance expert. Given a query and its plan, propose at most 3 CREATE INDEX statements that would remove the full scans, each with a one-line reason. Markdown with a ```sql block.' }, { role: 'user', content: `Schema:\n${schemaPrompt()}\n\nQuery:\n${sql}\n\nPlan:\n${res.values.map((r) => r[3]).join('\n')}` }], { temperature: 0.2, demo: "```sql\nCREATE INDEX idx_orders_date ON orders(order_date);\nCREATE INDEX idx_items_order ON order_items(order_id);\n```\n- **orders(order_date)** turns the date filter into a range search.\n- **order_items(order_id)** turns the join into an index lookup.\n\n*(demo)*" });
      $('#idxOut').innerHTML = md(text);
    }));
  } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

/* ---------------- ER diagram + profiling ---------------- */
function schemaInfo() { return tables().map((t) => ({ name: t, columns: columns(t), fks: (db.exec(`PRAGMA foreign_key_list("${t}")`)[0]?.values || []).map((v) => ({ table: v[2], from: v[3], to: v[4] })) })); }
function showER() {
  const info = schemaInfo(), edges = relationEdges(info), pos = erLayout(info, edges, 190, 70);
  const W = Math.max(...Object.values(pos).map((p) => p.x + p.w)) + 20, H = Math.max(...Object.values(pos).map((p) => p.y + p.h)) + 20;
  const colY = (t, c) => { const i = info.find((x) => x.name === t).columns.findIndex((k) => k.name === c); return pos[t].y + 44 + Math.max(0, i) * 20; };
  let s = edges.map((e) => { const a = pos[e.from], b = pos[e.to]; if (!b) return ''; const y1 = colY(e.from, e.col), y2 = b.y + 16; const x1 = a.x < b.x ? a.x + a.w : a.x, x2 = a.x < b.x ? b.x : b.x + b.w; return `<path d="M${x1 + 10},${y1} C${(x1 + x2) / 2 + 10},${y1} ${(x1 + x2) / 2 + 10},${y2} ${x2 + 10},${y2}" fill="none" stroke="var(--accent)" stroke-width="1.6" marker-end="url(#er-arr)"/>`; }).join('');
  s += info.map((t) => { const p = pos[t.name]; return `<g transform="translate(${p.x + 10},${p.y + 10})"><rect width="${p.w}" height="${p.h}" rx="8" fill="var(--panel)" stroke="var(--line)"/><rect width="${p.w}" height="28" rx="8" fill="var(--accent)"/><text x="10" y="19" fill="#fff" font-weight="700" font-size="13">${esc(t.name)}</text>${t.columns.map((c, i) => `<text x="10" y="${48 + i * 20}" font-size="12" fill="var(--text)" font-family="var(--mono)">${t.fks.some((f) => f.from === c.name) ? '🔗 ' : c.name === 'id' ? '🔑 ' : ''}${esc(c.name)}</text><text x="${p.w - 10}" y="${48 + i * 20}" font-size="11" fill="var(--muted)" text-anchor="end">${esc(c.type)}</text>`).join('')}</g>`; }).join('');
  $('#erOut').innerHTML = `<svg viewBox="0 0 ${W + 20} ${H + 20}" width="100%" role="img" aria-label="Entity relationship diagram"><defs><marker id="er-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker></defs>${s}</svg>`;
  $('#erCard').classList.remove('hidden');
  $('#erCard').scrollIntoView({ behavior: 'smooth' });
}
function profile(t) {
  const cols = columns(t);
  const r = db.exec(profileSQL(t, cols))[0];
  const row = Object.fromEntries(r.columns.map((c, i) => [c, r.values[0][i]]));
  const n = row.n;
  $('#erOut').innerHTML = `<h3 style="text-transform:none;letter-spacing:0;color:var(--text)">Profile of <code>${esc(t)}</code> · ${n.toLocaleString()} rows</h3><div class="table-wrap"><table><tr><th>Column</th><th>Type</th><th>Nulls</th><th>Distinct</th><th>Min</th><th>Max</th></tr>${cols.map((c, i) => `<tr><td class="mono">${esc(c.name)}</td><td>${esc(c.type)}</td><td>${n ? Math.round((100 * row['null_' + i]) / n) : 0}%</td><td>${row['distinct_' + i].toLocaleString()}${row['distinct_' + i] === n ? ' <span class="tag good">unique</span>' : ''}</td><td class="mono">${esc(String(row['min_' + i] ?? '').slice(0, 24))}</td><td class="mono">${esc(String(row['max_' + i] ?? '').slice(0, 24))}</td></tr>`).join('')}</table></div>`;
  $('#erCard').classList.remove('hidden');
  $('#erCard').scrollIntoView({ behavior: 'smooth' });
}

/* ---------------- share + export ---------------- */
function share() {
  const url = location.origin + location.pathname + '#q=' + b64encode($('#sql').value);
  navigator.clipboard.writeText(url).then(() => toast('Share link copied: it reopens this exact query'), () => prompt('Copy this link', url));
}
function exportCSV() { if (!last) return toast('Run a query first', 'err'); Kit.download('query-result.csv', toCSV(last.columns, last.values), 'text/csv'); }

/* ---------------- wiring ---------------- */
$('#ask').onclick = (e) => busy(e.currentTarget, ask);
$('#question').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ask').click(); });
$('#run').onclick = runFromEditor;
$('#sql').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runFromEditor(); } });
$('#explain').onclick = (e) => busy(e.currentTarget, explain);
$('#insightBtn').onclick = (e) => busy(e.currentTarget, insight);
$('#erBtn').onclick = showER;
$('#closeEr').onclick = () => $('#erCard').classList.add('hidden');
$('#shareBtn').onclick = share;
$('#csvBtn').onclick = exportCSV;
$('#reset').onclick = () => { buildSample(); renderSchema(); history.length = 0; renderHistory(); toast('Sample database rebuilt'); };

initSqlJs({ locateFile: (f) => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.14.2/' + f }).then((S) => {
  SQL = S;
  buildSample();
  renderSchema();
  $('#dbStatus').textContent = 'SQLite ready';
  $('#dbStatus').classList.add('good');
  const m = location.hash.match(/^#q=([\w-]+)/);
  if (m) { try { $('#sql').value = b64decode(m[1]); toast('Loaded shared query'); } catch {} }
  runFromEditor();
}).catch((e) => { $('#dbStatus').textContent = 'failed to load'; toast('Could not load SQLite: ' + e.message, 'err'); });
