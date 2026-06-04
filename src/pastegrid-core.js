const DELIMITERS = [
  { name: "tab", value: "\t" },
  { name: "pipe", value: "|" },
  { name: "comma", value: "," },
  { name: "semicolon", value: ";" }
];

const DEFAULT_ORDER = [
  "item",
  "owner",
  "email",
  "date",
  "amount",
  "url",
  "status",
  "tags",
  "note"
];

const KEY_ALIASES = new Map([
  ["task", "item"],
  ["todo", "item"],
  ["item", "item"],
  ["title", "item"],
  ["name", "item"],
  ["description", "note"],
  ["note", "note"],
  ["notes", "note"],
  ["owner", "owner"],
  ["assignee", "owner"],
  ["person", "owner"],
  ["who", "owner"],
  ["contact", "owner"],
  ["email", "email"],
  ["mail", "email"],
  ["date", "date"],
  ["due", "date"],
  ["deadline", "date"],
  ["amount", "amount"],
  ["cost", "amount"],
  ["price", "amount"],
  ["budget", "amount"],
  ["url", "url"],
  ["link", "url"],
  ["source", "url"],
  ["status", "status"],
  ["state", "status"],
  ["tag", "tags"],
  ["tags", "tags"],
  ["category", "tags"]
]);

const STATUS_WORDS = [
  "todo",
  "open",
  "next",
  "waiting",
  "blocked",
  "review",
  "done",
  "paid",
  "unpaid",
  "urgent",
  "later"
];

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const URL_RE = /https?:\/\/[^\s,;|)]+/g;
const AMOUNT_RE = /(?:[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|gbp|cny|rmb)\b)/gi;
const DATE_RE = new RegExp(
  "\\b(?:20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}|\\d{1,2}[-/]\\d{1,2}(?:[-/]\\d{2,4})?|(?:" +
    MONTHS +
    ")\\.?\\s+\\d{1,2}(?:,\\s*20\\d{2})?)\\b",
  "gi"
);
const TAG_RE = /#[a-zA-Z0-9_-]+/g;
const OWNER_RE = /(^|\s)@([a-zA-Z][a-zA-Z0-9_.-]{1,30})\b/g;

export const SAMPLE_INPUTS = {
  inbox:
    "owner: Mina, task: renew design-system audit, due: 2026-06-03, status: waiting, #frontend\n" +
    "Rahul - vendor security questionnaire - rahul@example.com - May 31 - blocked\n" +
    "[ ] update invoice tracker https://example.com/invoice $420 due 2026-06-07\n" +
    "done: send launch checklist to @nora #release",
  leads:
    "Name, Email, Plan, Amount, Status\n" +
    "Acme Ops, ops@acme.test, Team, $240, review\n" +
    "North Lab, hello@north.test, Starter, $29, open\n" +
    "Delta Studio, studio@delta.test, Team, $240, waiting",
  reading:
    "- https://example.com/local-first-notes privacy spreadsheet #research\n" +
    "- Ask Sam about CSV import bug before 2026-06-02 urgent\n" +
    "- @lee compare three onboarding examples for docs review"
};

export function parseInput(input, options = {}) {
  const mode = options.mode || "auto";
  const firstRowHeader = Boolean(options.firstRowHeader);
  const lines = normalizeLines(input);

  if (lines.length === 0) {
    const columns = ["item", "note"];
    return buildResult(columns, [], ["Paste at least one non-empty line."], "empty");
  }

  const delimiter = detectDelimiter(lines, mode);
  if (delimiter) {
    return parseDelimited(lines, delimiter.value, firstRowHeader, mode, delimiter.name);
  }

  return parseHeuristic(lines);
}

export function rowsToCsv(columns, rows) {
  return [
    columns.map(escapeCsv).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(row[column] || "")).join(","))
  ].join("\n");
}

export function rowsToMarkdown(columns, rows) {
  const header = `| ${columns.map(titleize).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => {
    return `| ${columns.map((column) => escapeMarkdown(row[column] || "")).join(" | ")} |`;
  });
  return [header, divider, ...body].join("\n");
}

export function rowsToJson(columns, rows) {
  const normalized = rows.map((row) => {
    return columns.reduce((acc, column) => {
      acc[column] = row[column] || "";
      return acc;
    }, {});
  });
  return JSON.stringify(normalized, null, 2);
}

export function resultToBrief(result) {
  const columns = result?.columns || [];
  const rows = result?.rows || [];
  const warnings = result?.warnings || [];
  const rowCount = rows.length;
  const columnCount = columns.length;
  const rowLabel = rowCount === 1 ? "row" : "rows";
  const columnLabel = columnCount === 1 ? "column" : "columns";
  const fields = columns.length ? columns.map(titleize).join(", ") : "none";
  const sourceType = result?.sourceType || "input";
  const warningText = warnings.length ? warnings.join(" ") : "No warnings.";

  return [
    `PasteGrid cleaned ${rowCount} ${rowLabel} into ${columnCount} ${columnLabel} from ${sourceType}.`,
    `Fields: ${fields}.`,
    `Warnings: ${warningText}`,
    "Ready to paste as CSV, Markdown, or JSON."
  ].join("\n");
}

export function summarizeResult(result) {
  if (!result.rows.length) {
    return "0 rows";
  }
  const warningText = result.warnings.length ? `, ${result.warnings.length} warning` : "";
  const plural = result.rows.length === 1 ? "" : "s";
  return `${result.rows.length} row${plural}, ${result.columns.length} columns${warningText}`;
}

function normalizeLines(input) {
  return String(input || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function detectDelimiter(lines, mode) {
  if (mode && mode !== "auto" && mode !== "lines") {
    const found = DELIMITERS.find((delimiter) => delimiter.name === mode);
    return found || null;
  }
  if (mode === "lines") {
    return null;
  }

  const sample = lines.slice(0, 8);
  let best = null;
  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => splitDelimitedLine(line, delimiter.value).length);
    const useful = counts.filter((count) => count > 1);
    if (useful.length < Math.min(2, sample.length)) {
      continue;
    }
    const mostCommon = modeCount(useful);
    const consistency = useful.filter((count) => count === mostCommon).length / useful.length;
    if (consistency >= 0.75) {
      const score = mostCommon * consistency;
      if (!best || score > best.score) {
        best = { ...delimiter, score };
      }
    }
  }
  return best;
}

function parseDelimited(lines, delimiter, firstRowHeader, mode, delimiterName) {
  const matrix = lines.map((line) => splitDelimitedLine(line, delimiter));
  const width = Math.max(...matrix.map((row) => row.length));
  const ragged = matrix.some((row) => row.length !== width);
  const autoHeader = mode === "auto" && looksLikeHeader(matrix[0], matrix.slice(1));
  const hasHeader = firstRowHeader || autoHeader;
  const rawHeaders = hasHeader ? matrix[0] : inferColumnNames(matrix);
  const columns = makeUniqueColumns(rawHeaders.map(cleanHeader));
  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const rows = dataRows
    .map((cells) => {
      const row = {};
      columns.forEach((column, index) => {
        row[column] = cleanCell(cells[index] || "");
      });
      return row;
    })
    .filter((row) => columns.some((column) => row[column]));

  const warnings = [];
  if (ragged) {
    warnings.push("Rows had uneven cell counts; missing cells were left blank.");
  }
  if (!hasHeader) {
    warnings.push("No header row detected; column names were inferred.");
  }
  return buildResult(columns, rows, warnings, `${delimiterName} table`);
}

function parseHeuristic(lines) {
  const rows = lines.map(parseLooseLine).filter((row) => Object.keys(row).length > 0);
  const columns = chooseColumns(rows);
  const warnings = [];
  if (rows.some((row) => row.note && !row.item)) {
    warnings.push("Some lines stayed in note because no clear item was found.");
  }
  if (columns.length <= 2) {
    warnings.push("Only a few fields were detected; try CSV, TSV, or key: value labels for more structure.");
  }
  return buildResult(columns, rows, warnings, "loose lines");
}

function parseLooseLine(line) {
  let text = stripBullet(line);
  const row = {};

  const checkbox = text.match(/^\[(x|X| )\]\s*/);
  if (checkbox) {
    row.status = checkbox[1].trim() ? "done" : "todo";
    text = text.replace(/^\[(x|X| )\]\s*/, "");
  }

  const leadingStatus = text.match(new RegExp(`^(${STATUS_WORDS.join("|")})\\s*[:=-]\\s*`, "i"));
  if (leadingStatus) {
    row.status = leadingStatus[1].toLowerCase();
    text = text.replace(leadingStatus[0], "");
  }

  const pairResult = extractKeyValuePairs(text);
  Object.assign(row, pairResult.values);
  text = pairResult.leftover;

  collectFirst(text, URL_RE, row, "url");
  text = removeMatches(text, URL_RE);

  collectFirst(text, EMAIL_RE, row, "email");
  text = removeMatches(text, EMAIL_RE);

  collectFirst(text, AMOUNT_RE, row, "amount");
  text = removeMatches(text, AMOUNT_RE);

  collectFirst(text, DATE_RE, row, "date");
  text = removeMatches(text, DATE_RE);
  text = text.replace(/\b(?:due|deadline|by)\b/gi, " ");

  const tags = collectAll(text, TAG_RE);
  if (tags.length && !row.tags) {
    row.tags = tags.join(" ");
  }
  text = removeMatches(text, TAG_RE);

  const owner = collectOwner(text);
  if (owner && !row.owner) {
    row.owner = owner;
  }
  text = removeMatches(text, OWNER_RE);

  const status = collectStatus(text);
  if (status && !row.status) {
    row.status = status;
  }
  text = text.replace(new RegExp(`\\b(${STATUS_WORDS.join("|")})\\b`, "i"), " ");

  const item = cleanCell(
    text
      .replace(/\s+-\s+/g, " ")
      .replace(/(^|\s)-(\s|$)/g, " ")
      .replace(/[-\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
  );
  if (item && !row.item) {
    row.item = item;
  } else if (item && row.item && !row.note) {
    row.note = item;
  }

  if (!row.item && !row.note) {
    row.note = cleanCell(stripBullet(line));
  }

  return row;
}

function extractKeyValuePairs(text) {
  const values = {};
  const leftovers = [];
  const chunks = text
    .split(/\s*[;,|]\s*/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const match = chunk.match(/^([a-zA-Z][a-zA-Z _-]{1,24})\s*[:=]\s*(.+)$/);
    if (!match) {
      leftovers.push(chunk);
      continue;
    }
    const normalizedKey = normalizeKey(match[1]);
    const column = KEY_ALIASES.get(normalizedKey);
    if (!column) {
      leftovers.push(chunk);
      continue;
    }
    values[column] = cleanCell(match[2]);
  }

  if (chunks.length <= 1 && Object.keys(values).length === 0) {
    return { values, leftover: text };
  }
  return { values, leftover: leftovers.join(" ") };
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(cleanCell(current));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(cleanCell(current));
  return cells;
}

function looksLikeHeader(headerCells, rows) {
  if (!headerCells || !rows.length) {
    return false;
  }
  const headerScore = headerCells.filter((cell) => {
    const value = cleanCell(cell);
    return value && /[a-zA-Z]/.test(value) && !looksLikeData(value);
  }).length;
  const dataScore = rows
    .flat()
    .slice(0, headerCells.length * 3)
    .filter((cell) => looksLikeData(cell)).length;
  return headerScore >= Math.ceil(headerCells.length * 0.6) && dataScore > 0;
}

function inferColumnNames(matrix) {
  const width = Math.max(...matrix.map((row) => row.length));
  return Array.from({ length: width }, (_, index) => {
    const values = matrix.map((row) => row[index] || "");
    if (values.some((value) => regexTest(EMAIL_RE, value))) return "email";
    if (values.some((value) => regexTest(URL_RE, value))) return "url";
    if (values.some((value) => regexTest(AMOUNT_RE, value))) return "amount";
    if (values.some((value) => regexTest(DATE_RE, value))) return "date";
    if (values.some((value) => collectStatus(value))) return "status";
    return index === 0 ? "item" : `col_${index + 1}`;
  });
}

function chooseColumns(rows) {
  const found = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((column) => {
      if (row[column]) {
        found.add(column);
      }
    });
  });

  const ordered = DEFAULT_ORDER.filter((column) => found.has(column));
  const extras = [...found].filter((column) => !ordered.includes(column)).sort();
  return [...ordered, ...extras].length ? [...ordered, ...extras] : ["item", "note"];
}

function buildResult(columns, rows, warnings, sourceType) {
  const normalizedRows = rows.map((row) => {
    return columns.reduce((acc, column) => {
      acc[column] = row[column] || "";
      return acc;
    }, {});
  });
  return {
    columns,
    rows: normalizedRows,
    warnings,
    sourceType,
    stats: {
      rowCount: normalizedRows.length,
      columnCount: columns.length,
      sourceType
    },
    formats: {
      csv: rowsToCsv(columns, normalizedRows),
      markdown: rowsToMarkdown(columns, normalizedRows),
      json: rowsToJson(columns, normalizedRows)
    }
  };
}

function cleanHeader(value) {
  const cleaned = normalizeKey(value || "");
  return KEY_ALIASES.get(cleaned) || cleaned || "column";
}

function makeUniqueColumns(columns) {
  const seen = new Map();
  return columns.map((column) => {
    const safe = column || "column";
    const count = seen.get(safe) || 0;
    seen.set(safe, count + 1);
    return count === 0 ? safe : `${safe}_${count + 1}`;
  });
}

function cleanCell(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function stripBullet(value) {
  return String(value || "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .trim();
}

function collectFirst(text, regex, row, key) {
  regex.lastIndex = 0;
  const match = regex.exec(text);
  if (match && !row[key]) {
    row[key] = cleanCell(match[0]);
  }
  regex.lastIndex = 0;
}

function collectAll(text, regex) {
  regex.lastIndex = 0;
  const values = [...String(text).matchAll(regex)].map((match) => match[0]);
  regex.lastIndex = 0;
  return values;
}

function collectOwner(text) {
  OWNER_RE.lastIndex = 0;
  const match = OWNER_RE.exec(text);
  OWNER_RE.lastIndex = 0;
  return match ? `@${match[2]}` : "";
}

function collectStatus(text) {
  const match = String(text || "").match(new RegExp(`\\b(${STATUS_WORDS.join("|")})\\b`, "i"));
  return match ? match[1].toLowerCase() : "";
}

function removeMatches(text, regex) {
  regex.lastIndex = 0;
  const result = String(text || "").replace(regex, " ");
  regex.lastIndex = 0;
  return result;
}

function looksLikeData(value) {
  const text = String(value || "");
  return (
    regexTest(EMAIL_RE, text) ||
    regexTest(URL_RE, text) ||
    regexTest(AMOUNT_RE, text) ||
    regexTest(DATE_RE, text) ||
    /\d/.test(text)
  );
}

function regexTest(regex, value) {
  regex.lastIndex = 0;
  const matched = regex.test(String(value || ""));
  regex.lastIndex = 0;
  return matched;
}

function modeCount(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function escapeCsv(value) {
  const text = String(value || "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function titleize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
