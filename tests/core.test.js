test('parseCSV handles quotes, escaped quotes, commas and CRLF', () => {
  const rows = parseCSV('name,quote\r\n"Smith, J","He said ""hi"""\r\n\r\nLee,ok\n');
  assert.deepEq(rows, [['name', 'quote'], ['Smith, J', 'He said "hi"'], ['Lee', 'ok']]);
});

test('parseCSV keeps embedded newlines inside quotes', () => {
  assert.deepEq(parseCSV('a,b\n"line1\nline2",x'), [['a', 'b'], ['line1\nline2', 'x']]);
});

test('sqlIdentifiers sanitizes, dedupes and fixes leading digits', () => {
  assert.deepEq(sqlIdentifiers(['First Name', 'first name', '2024 Sales', '', '#']), ['first_name', 'first_name_', 'c_2024_sales', 'col4', 'col5']);
});

test('inferColumnTypes', () => {
  const rows = [['1', '1.5', 'x', ''], ['-2', '3', 'y', ''], ['10', '2e3', '4', '']];
  assert.deepEq(inferColumnTypes(rows, 4), ['INTEGER', 'REAL', 'TEXT', 'TEXT']);
});

test('isReadOnlySQL allows SELECT/WITH/EXPLAIN only', () => {
  assert.ok(isReadOnlySQL('SELECT * FROM t'));
  assert.ok(isReadOnlySQL('  with x as (select 1) select * from x;'));
  assert.ok(isReadOnlySQL("SELECT 'drop table t' AS s"), 'keywords inside strings are fine');
  assert.ok(isReadOnlySQL('-- comment\nSELECT 1'));
  assert.ok(!isReadOnlySQL('DELETE FROM t'));
  assert.ok(!isReadOnlySQL('SELECT 1; DROP TABLE t'), 'stacked statements rejected');
  assert.ok(!isReadOnlySQL('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x'));
  assert.ok(!isReadOnlySQL('PRAGMA table_info(t)'));
  assert.ok(!isReadOnlySQL(''));
});

test('chartSpec picks bar for categories, line for dates', () => {
  const bar = chartSpec(['cat', 'n'], [['a', 3], ['b', 5]]);
  assert.eq(bar.kind, 'bar');
  assert.eq(bar.label, 0);
  assert.deepEq(bar.series, [1]);
  assert.eq(bar.max, 5);
  const line = chartSpec(['month', 'rev'], [['2025-02', 10], ['2025-01', 4]]);
  assert.eq(line.kind, 'line');
  assert.eq(line.rows[0][0], '2025-01', 'time series sorted');
});

test('chartSpec returns null when nothing is numeric or empty', () => {
  assert.eq(chartSpec(['a', 'b'], [['x', 'y']]), null);
  assert.eq(chartSpec(['a'], []), null);
});

test('fmtNum', () => {
  assert.eq(fmtNum(1500), '1.5k');
  assert.eq(fmtNum(2500000), '2.5M');
  assert.eq(fmtNum(12), '12');
  assert.eq(fmtNum(0.5), '0.5');
});

test('toCSV quotes only when needed and renders NULL as empty', () => {
  assert.eq(toCSV(['a', 'b'], [['x,y', null], ['say "hi"', 3]]), 'a,b\n"x,y",\n"say ""hi""",3');
});

test('planTree nests by parent id and flags full scans', () => {
  const p = planTree([[2, 0, 0, 'SCAN o'], [5, 0, 0, 'SEARCH oi USING INDEX idx (order_id=?)'], [9, 0, 0, 'SCAN c USING COVERING INDEX x'], [12, 2, 0, 'USE TEMP B-TREE FOR GROUP BY']]);
  assert.eq(p.roots.length, 3);
  assert.eq(p.roots[0].children[0].detail, 'USE TEMP B-TREE FOR GROUP BY');
  assert.deepEq(p.warnings, ['o']);
});

test('relationEdges + erLayout place every table without overlap in a column', () => {
  const tables = [
    { name: 'orders', columns: [1, 2, 3], fks: [{ table: 'customers', from: 'customer_id' }] },
    { name: 'customers', columns: [1, 2], fks: [] },
    { name: 'items', columns: [1, 2, 3, 4], fks: [{ table: 'orders', from: 'order_id' }, { table: 'products', from: 'product_id' }] },
    { name: 'products', columns: [1], fks: [] },
  ];
  const edges = relationEdges(tables);
  assert.eq(edges.length, 3);
  const pos = erLayout(tables, edges);
  assert.eq(Object.keys(pos).length, 4);
  const sameCol = Object.values(pos).filter((p) => p.x === 0).sort((a, b) => a.y - b.y);
  for (let i = 1; i < sameCol.length; i++) assert.ok(sameCol[i].y >= sameCol[i - 1].y + sameCol[i - 1].h, 'no vertical overlap');
});

test('profileSQL quotes identifiers', () => {
  const q = profileSQL('my "t"', [{ name: 'a b' }]);
  assert.ok(q.includes('FROM "my ""t"""'));
  assert.ok(q.includes('COUNT(DISTINCT "a b")'));
});

test('b64encode / b64decode round-trip unicode and are URL-safe', () => {
  const s = "SELECT name FROM t WHERE city = 'Zürich' -- ✓ ? & /";
  const e = b64encode(s);
  assert.ok(!/[+/=]/.test(e));
  assert.eq(b64decode(e), s);
});
