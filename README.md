# nl-to-sql

[![tests](https://github.com/dguywhoknows/nl-to-sql/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/nl-to-sql/actions/workflows/tests.yml)

Ask questions about data in plain English. A real SQLite engine runs in your browser while AI writes, repairs and explains the SQL.

Live: https://dguywhoknows.github.io/nl-to-sql/

## Overview

SQL Copilot loads SQLite (compiled to WebAssembly) into the page, seeds a realistic e-commerce database (customers, products, orders, line items, with seasonality and refunds), and lets you query it in English. The AI sees the live schema plus sample rows, writes a query, and if SQLite rejects it, gets the exact error back and repairs the query automatically. You can also import your own CSV files.

## Pages

- **Query**
- **Settings**

## Features

- Real SQLite via sql.js/WebAssembly, with no server
- Seeded, reproducible sample DB with 1,500 orders across 2 years
- English → SQL with schema-aware prompting and an automatic error-repair loop (up to 3 tries)
- Guardrail that refuses to run non-read-only AI queries
- Auto chart: line chart for time series, grouped bars for categories
- CSV import with RFC-4180 parsing and column type inference
- AI query explainer and AI result insights
- Editable SQL editor (Ctrl+Enter) with query history
- Query-plan tab: EXPLAIN QUERY PLAN rendered as a tree with full-scan warnings and AI index suggestions
- Schema explorer: auto-laid-out ER diagram drawn from real foreign keys
- One-click column profiling (null %, distinct count, uniqueness, min/max) via generated SQL
- Shareable links that encode the query in the URL (Unicode-safe base64url)
- Export any result to CSV
- Stricter guardrail: single-statement, comment- and string-aware read-only check

## How it works

LLM calls are used for:

- JSON-mode NL→SQL generation grounded on the live schema + sample rows
- Self-repair: SQLite error messages are fed back to the model
- Query explanations and data insights over the actual result set
- Index recommendations grounded in the actual query plan

Everything else (the database engine, sample-data generation, CSV parsing/type inference, charting) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/nl-to-sql.git
cd nl-to-sql
python -m http.server 8000
```

Then open http://localhost:8000.

### Configuration

Without an API key the app runs in demo mode with sample model output. To use a live model, open
**Settings → Configure provider** and paste a key for [Groq](https://console.groq.com/keys) or
[OpenRouter](https://openrouter.ai/keys). The key is stored in this browser's `localStorage` (namespaced to
this app) and is sent only to the selected provider.

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 13 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/nl-to-sql/tests/)).

## Project structure

```
index.html           markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- sql.js (SQLite WASM) from cdnjs
- Hand-rolled SVG charts
- mulberry32 seeded PRNG for reproducible data
- Pure helpers (CSV parser, type inference, SQL guard, chart spec, plan tree, ER layout) in core.js with CI tests
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
