import { useEffect } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type Direction = "asc" | "desc";

type SortState = {
  column: number;
  direction: Direction;
};

const SORT_READY = "data-cf-sort-ready";
const SORT_STATE = "data-cf-sort-state";
const SORTABLE = "data-cf-sortable";
const SORT_INDICATOR = "data-cf-sort-indicator";

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseValue(value: string): { type: "number" | "date" | "text"; value: number | string } {
  const text = normalize(value);
  if (!text || text === "—" || text === "-") return { type: "text", value: "" };

  const numeric = text
    .replace(/GH¢|GHS|USD|₵|%/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
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

function getRows(table: HTMLTableElement) {
  return Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
}

function setIndicator(header: HTMLTableCellElement, direction?: Direction) {
  const indicator = header.querySelector<HTMLElement>(`[${SORT_INDICATOR}]`);
  if (!indicator) return;
  indicator.replaceChildren();
  if (direction === "asc") indicator.appendChild(ArrowUpDown ? document.createTextNode("↑") : document.createTextNode(""));
  else if (direction === "desc") indicator.appendChild(document.createTextNode("↓"));
  else indicator.appendChild(document.createTextNode("↕"));
}

function sortTable(table: HTMLTableElement, state: SortState) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const header = headers[state.column];
  if (!header) return;

  const rows = getRows(table);
  const decorated = rows.map((row, index) => ({ row, index }));
  decorated.sort((a, b) => {
    const left = a.row.cells[state.column]?.textContent || "";
    const right = b.row.cells[state.column]?.textContent || "";
    const result = compareCells(left, right);
    return result === 0 ? a.index - b.index : state.direction === "asc" ? result : -result;
  });

  const tbody = table.tBodies[0];
  if (!tbody) return;
  const fragment = document.createDocumentFragment();
  decorated.forEach(({ row }) => fragment.appendChild(row));
  tbody.appendChild(fragment);

  headers.forEach((cell, index) => setIndicator(cell as HTMLTableCellElement, index === state.column ? state.direction : undefined));
  table.setAttribute(SORT_STATE, `${state.column}:${state.direction}`);
}

function setupTable(table: HTMLTableElement) {
  if (table.getAttribute(SORT_READY) === "true") return;
  const headerCells = Array.from(table.tHead?.rows[0]?.cells || []) as HTMLTableCellElement[];
  if (!headerCells.length) return;

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
      const current = table.getAttribute(SORT_STATE)?.split(":");
      const currentColumn = current ? Number(current[0]) : -1;
      const currentDirection = current?.[1] as Direction | undefined;
      const direction: Direction = currentColumn === column && currentDirection === "asc" ? "desc" : "asc";
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

export default function GlobalTableSort() {
  useEffect(() => {
    const scan = () => document.querySelectorAll<HTMLTableElement>("table.data-table").forEach(setupTable);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
