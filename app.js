import {
  SAMPLE_INPUTS,
  parseInput,
  rowsToCsv,
  rowsToJson,
  rowsToMarkdown,
  summarizeResult
} from "./src/pastegrid-core.js";

const storageKey = "pastegrid-input-v1";
const state = {
  result: null,
  format: "csv"
};

const els = {
  input: document.querySelector("#sourceInput"),
  mode: document.querySelector("#mode"),
  firstRowHeader: document.querySelector("#firstRowHeader"),
  clean: document.querySelector("#cleanButton"),
  reset: document.querySelector("#resetButton"),
  sampleButtons: document.querySelectorAll("[data-sample]"),
  summary: document.querySelector("#summary"),
  warningList: document.querySelector("#warningList"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  output: document.querySelector("#outputText"),
  copy: document.querySelector("#copyButton"),
  download: document.querySelector("#downloadButton"),
  tabs: document.querySelectorAll("[data-format]"),
  sourceType: document.querySelector("#sourceType"),
  rowCount: document.querySelector("#rowCount"),
  columnCount: document.querySelector("#columnCount")
};

function init() {
  const saved = localStorage.getItem(storageKey);
  els.input.value = saved || SAMPLE_INPUTS.inbox;
  bindEvents();
  runClean();
}

function bindEvents() {
  els.clean.addEventListener("click", runClean);
  els.reset.addEventListener("click", () => {
    els.input.value = SAMPLE_INPUTS.inbox;
    localStorage.removeItem(storageKey);
    runClean();
  });
  els.input.addEventListener("input", () => {
    localStorage.setItem(storageKey, els.input.value);
  });
  els.mode.addEventListener("change", runClean);
  els.firstRowHeader.addEventListener("change", runClean);
  els.sampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const sample = button.dataset.sample;
      els.input.value = SAMPLE_INPUTS[sample] || SAMPLE_INPUTS.inbox;
      localStorage.setItem(storageKey, els.input.value);
      runClean();
    });
  });
  els.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      setFormat(button.dataset.format);
    });
  });
  els.copy.addEventListener("click", copyOutput);
  els.download.addEventListener("click", downloadOutput);
}

function runClean() {
  state.result = parseInput(els.input.value, {
    mode: els.mode.value,
    firstRowHeader: els.firstRowHeader.checked
  });
  render();
}

function setFormat(format) {
  state.format = format;
  els.tabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.format === format);
  });
  renderOutput();
}

function render() {
  renderStats();
  renderWarnings();
  renderTable();
  renderOutput();
}

function renderStats() {
  const { result } = state;
  els.summary.textContent = summarizeResult(result);
  els.sourceType.textContent = result.sourceType;
  els.rowCount.textContent = result.stats.rowCount;
  els.columnCount.textContent = result.stats.columnCount;
}

function renderWarnings() {
  els.warningList.replaceChildren();
  if (!state.result.warnings.length) {
    const item = document.createElement("li");
    item.textContent = "Ready";
    els.warningList.append(item);
    return;
  }
  state.result.warnings.forEach((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    els.warningList.append(item);
  });
}

function renderTable() {
  const { columns, rows } = state.result;
  els.tableHead.replaceChildren();
  els.tableBody.replaceChildren();

  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = titleize(column);
    headRow.append(cell);
  });
  els.tableHead.append(headRow);

  if (!rows.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns.length;
    cell.textContent = "No rows yet";
    row.append(cell);
    els.tableBody.append(row);
    return;
  }

  rows.forEach((rowData) => {
    const row = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      cell.textContent = rowData[column] || "";
      row.append(cell);
    });
    els.tableBody.append(row);
  });
}

function renderOutput() {
  if (!state.result) return;
  const { columns, rows } = state.result;
  const formatters = {
    csv: () => rowsToCsv(columns, rows),
    markdown: () => rowsToMarkdown(columns, rows),
    json: () => rowsToJson(columns, rows)
  };
  els.output.value = formatters[state.format]();
}

async function copyOutput() {
  try {
    await navigator.clipboard.writeText(els.output.value);
    flashButton(els.copy, "Copied");
  } catch {
    els.output.select();
    document.execCommand("copy");
    flashButton(els.copy, "Copied");
  }
}

function downloadOutput() {
  const extension = state.format === "markdown" ? "md" : state.format;
  const blob = new Blob([els.output.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pastegrid.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function flashButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

function titleize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

init();
