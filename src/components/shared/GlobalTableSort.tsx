import { useEffect } from "react";

type Direction = "asc" | "desc";

type SortState = {
  column: number;
  direction: Direction;
};

const SORT_READY = "data-cf-sort-ready";
const SORT_STATE = "data-cf-sort-state";
const SORTABLE = "data-cf-sortable";
const SORT_INDICATOR = "data-cf-sort-indicator";
const sortingTables = new WeakSet<HTMLTableElement>();

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseValue(value: string): { type: "number" | "date" | "text"; value: number | string } {
  const text = normalize(value);
  if (!text || text === "—" || text === "-") return { type: "text", value: "" };

  const numeric = text.replace(/GH¢|GHS|USD|₵|%/gi, "").replace(/,/g, "").replace(/\s+/g, "").trim();
  if (/^-?\d+(?:\.\d+)?$/.test(numeric)) return { type: "number", value: Number(numeric) };

  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}(?:,?\s+\d{1,2}:\d{2})?/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text)) {
    const time = Date.parse(text);
    if (!Number.isNaN(time)) return { type: "date", value: time };
  }

  return { type: "text", value: text.toLocaleLowerCase() };
}

function compareCells(a: string, b: string) {
  const left = parseValue(a);
  const right = parseValue(b);
  if (left.type === right.type && left.type !== "text") return Number(left.value) - Number(right.value);
  if (left.type === "text" && right.type === "text") return String(left.value).localeCompare(String(right.value), undefined, { numeric: true, sensitivity: "base" });
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function setIndicator(header: HTMLTableCellElement, direction?: Direction) {
  const indicator = header.querySelector<HTMLElement>(`[${SORT_INDICATOR}]`);
  if (!indicator) return;
  indicator.textContent = direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕";
}

function readSortState(table: HTMLTableElement): SortState | null {
  const value = table.getAttribute(SORT_STATE)?.split(":");
  if (!value || value.length !== 2) return null;
  const column = Number(value[0]);
  const direction = value[1];
  if (!Number.isInteger(column) || column < 0 || (direction !== "asc" && direction !== "desc")) return null;
  return { column, direction };
}

function sortTable(table: HTMLTableElement, state: SortState) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const header = headers[state.column];
  if (!header) return;

  const rows = Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
  const decorated = rows.map((row, index) => ({ row, index }));
  decorated.sort((a, b) => {
    const left = a.row.cells[state.column]?.textContent || "";
    const right = b.row.cells[state.column]?.textContent || "";
    const result = compareCells(left, right);
    return result === 0 ? a.index - b.index : state.direction === "asc" ? result : -result;
  });

  const tbody = table.tBodies[0];
  if (!tbody) return;
  sortingTables.add(table);
  const fragment = document.createDocumentFragment();
  decorated.forEach(({ row }) => fragment.appendChild(row));
  tbody.appendChild(fragment);

  headers.forEach((cell, index) => setIndicator(cell as HTMLTableCellElement, index === state.column ? state.direction : undefined));
  table.setAttribute(SORT_STATE, `${state.column}:${state.direction}`);
  window.setTimeout(() => sortingTables.delete(table), 0);
}

function setupTable(table: HTMLTableElement) {
  const headerCells = Array.from(table.tHead?.rows[0]?.cells || []) as HTMLTableCellElement[];
  if (!headerCells.length) return;

  if (table.getAttribute(SORT_READY) !== "true") {
    headerCells.forEach((header, column) => {
      const label = normalize(header.textContent || "");
      if (!label || /^(actions?|action\/s)$/i.test(label)) return;

      header.classList.add("cursor-pointer", "select-none", "hover:bg-muted/50", "transition-colors");
      header.setAttribute(SORTABLE, "true");
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("title", `Sort ${label}`);
      header.setAttribute("aria-label", `Sort ${label}`);

      const content = document.createElement("div");
      content.className = "flex items-center gap-1";
      while (header.firstChild) content.appendChild(header.firstChild);
      const indicator = document.createElement("span");
      indicator.setAttribute(SORT_INDICATOR, "true");
      indicator.className = "text-xs text-muted-foreground/60";
      indicator.textContent = "↕";
      content.appendChild(indicator);
      header.appendChild(content);

      const activate = () => {
        const current = readSortState(table);
        const direction: Direction = current?.column === column && current.direction === "asc" ? "desc" : "asc";
        sortTable(table, { column, direction });
      };

      header.addEventListener("click", activate);
      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });

    table.setAttribute(SORT_READY, "true");
  }

  const current = readSortState(table);
  if (current && !sortingTables.has(table)) sortTable(table, current);
}

export default function GlobalTableSort() {
  useEffect(() => {
    const scan = () => document.querySelectorAll<HTMLTableElement>("table.data-table").forEach(setupTable);
    scan();
    const observer = new MutationObserver((mutations) => {
      const tables = new Set<HTMLTableElement>();
      mutations.forEach((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target.closest("table.data-table") : null;
        if (target) tables.add(target as HTMLTableElement);
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          const table = node.matches("table.data-table") ? node : node.querySelector("table.data-table");
          if (table) tables.add(table as HTMLTableElement);
        });
      });
      tables.forEach(setupTable);
      scan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
