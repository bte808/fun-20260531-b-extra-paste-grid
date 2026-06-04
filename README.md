# PasteGrid

PasteGrid turns messy copied text into a clean table you can copy as CSV, Markdown, or JSON. It runs fully in the browser and has no build step, account, tracking, or network dependency.

Live demo: <https://bte808.github.io/fun-20260531-b-extra-paste-grid/>

## Why this exists

Small teams keep losing time between chat notes, link dumps, task lists, spreadsheet rows, and issue descriptions. Recent public product launches keep circling the same need: less app switching, faster lightweight spreadsheets, and cleaner structure from messy input. PasteGrid keeps that workflow local and simple.

Inspiration came from public browsing on 2026-05-31:

- Product Hunt's productivity category, where the framing centers on automating work and reducing switching: <https://www.producthunt.com/categories/productivity>
- HuntScreens listings around quick spreadsheets and messy-input structuring: <https://huntscreens.com/en/products/quicksheet> and <https://huntscreens.com/en/products/dodoform>
- Better Launch's small calculator/tool pattern for one focused workflow: <https://betterlaunch.net/products/calcfi>

Only the idea shape was borrowed. The code, UI, sample data, and copy in this repo are original.

## What it does

- Paste CSV, TSV, pipe tables, semicolon tables, bullets, checklists, task snippets, URLs, emails, amounts, dates, tags, and `key: value` notes.
- Auto-detect table delimiters and likely headers.
- Extract common fields from loose text: item, owner, email, date, amount, URL, status, tags, and note.
- Preview the result as a table.
- Copy or download CSV, Markdown, or JSON.
- Copy a plain-language cleanup brief for issue comments, handoffs, and quick review notes.
- Keep the last local input in `localStorage` for quick retry.

## Why it is useful

PasteGrid is for the awkward moment before data becomes a spreadsheet, GitHub issue, CRM import, report table, or planning note. It is faster than opening a spreadsheet for tiny cleanup jobs, and safer than sending private notes to a hosted AI service for formatting.

## Why it may be worth starring

- Local-first and dependency-free.
- One page, one job, no setup.
- Copyable brief makes the cleaned result easy to explain before sharing the table.
- Useful for operators, students, support teams, founders, and developers.
- Easy to fork because the parser is isolated in `src/pastegrid-core.js`.
- Works as a static GitHub Pages site.

## Demo input

```text
owner: Mina, task: renew design-system audit, due: 2026-06-03, status: waiting, #frontend
Rahul - vendor security questionnaire - rahul@example.com - May 31 - blocked
[ ] update invoice tracker https://example.com/invoice $420 due 2026-06-07
done: send launch checklist to @nora #release
```

## Demo output

| Item | Owner | Email | Date | Amount | Url | Status | Tags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| renew design-system audit | Mina |  | 2026-06-03 |  |  | waiting | #frontend |
| Rahul vendor security questionnaire |  | rahul@example.com | May 31 |  |  | blocked |  |
| update invoice tracker |  |  | 2026-06-07 | $420 | https://example.com/invoice | todo |  |
| send launch checklist to | @nora |  |  |  |  | done | #release |

## Run locally

```bash
npm test
npm run serve
```

Then open:

```text
http://localhost:5178/
```

Because the app is static, you can also serve it with any local static server.

## Core usage

1. Paste messy text.
2. Keep `Auto` mode, or force CSV/TSV/Pipe/Semicolon/Loose lines.
3. Click `Clean table`.
4. Pick CSV, Markdown, or JSON.
5. Copy or download the result, or click `Copy brief` to share a short summary of what PasteGrid detected.

## Verification

This repo includes a lightweight Node smoke test:

```bash
npm test
```

It checks the parser, output formats, static file wiring, mobile CSS breakpoint presence, README/license presence, and that no runtime dependencies were added. With a local server running, `npm run verify:browser` launches a temporary headless Chrome session and checks a desktop flow plus a 390 x 844 mobile viewport.

Local acceptance used:

- `npm test`
- `python3 -m http.server 5178`
- `curl -I 'http://localhost:5178/index.html?v=20260531-b-extra-paste-grid'`
- `npm run verify:browser`
- Desktop browser interaction
- 390 x 844 mobile viewport check

## Later extensions

- Import from clipboard automatically after a permission prompt.
- Let users save reusable extraction recipes.
- Add column rename and hide controls.
- Add a small browser extension wrapper for selected text.

## License

MIT
