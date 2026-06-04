import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  SAMPLE_INPUTS,
  parseInput,
  resultToBrief,
  rowsToCsv,
  rowsToJson,
  rowsToMarkdown,
  summarizeResult
} from "../src/pastegrid-core.js";

const root = new URL("../", import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), "utf8");
}

const [html, app, styles, readme, license, pkg] = await Promise.all([
  text("index.html"),
  text("app.js"),
  text("styles.css"),
  text("README.md"),
  text("LICENSE"),
  text("package.json")
]);

assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
assert.match(html, /data-testid="source-input"/);
assert.match(html, /data-testid="brief-button"/);
assert.match(app, /parseInput/);
assert.match(app, /resultToBrief/);
assert.match(styles, /@media \(max-width: 860px\)/);
assert.match(readme, /PasteGrid/);
assert.match(license, /MIT License/);
assert.equal(JSON.parse(pkg).dependencies, undefined);

const loose = parseInput(SAMPLE_INPUTS.inbox);
assert.equal(loose.rows.length, 4);
assert.ok(loose.columns.includes("owner"));
assert.ok(loose.columns.includes("date"));
assert.ok(loose.columns.includes("status"));
assert.match(rowsToCsv(loose.columns, loose.rows), /Mina/);
assert.match(rowsToMarkdown(loose.columns, loose.rows), /\| Item \|/);
assert.doesNotThrow(() => JSON.parse(rowsToJson(loose.columns, loose.rows)));
assert.match(summarizeResult(loose), /4 rows/);
assert.match(resultToBrief(loose), /PasteGrid cleaned 4 rows into \d+ columns from loose lines/);
assert.match(resultToBrief(loose), /Fields: .*Owner.*Date.*Status/);
assert.match(resultToBrief(loose), /Ready to paste as CSV, Markdown, or JSON/);

const delimited = parseInput(SAMPLE_INPUTS.leads);
assert.equal(delimited.rows.length, 3);
assert.deepEqual(delimited.columns.slice(0, 3), ["item", "email", "plan"]);
assert.match(delimited.formats.csv, /Acme Ops/);

const forced = parseInput("task|owner|status\nShip docs|Mina|done", {
  mode: "pipe",
  firstRowHeader: true
});
assert.equal(forced.rows[0].owner, "Mina");

const empty = parseInput("");
assert.equal(empty.rows.length, 0);
assert.ok(empty.warnings.length > 0);

console.log("verify ok: parser, static files, no dependencies");
