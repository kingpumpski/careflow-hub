import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GlobalTableSort from "./GlobalTableSort";

afterEach(() => {
  document.querySelectorAll("table.data-table").forEach((table) => table.remove());
});

function addTable(container: HTMLElement, rows: Array<[string, string]>) {
  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<thead><tr><th>Name</th><th>Value</th></tr></thead><tbody></tbody>";
  const body = table.tBodies[0];
  rows.forEach(([name, value]) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    row.insertCell().textContent = value;
  });
  container.appendChild(table);
  return table;
}

function firstColumn(table: HTMLTableElement) {
  return Array.from(table.tBodies[0].rows, (row) => row.cells[0].textContent);
}

describe("GlobalTableSort", () => {
  it("does not re-sort React-updated rows after the table has been initialized", async () => {
    const { container } = render(<GlobalTableSort />);
    const table = addTable(container, [["Bravo", "2"], ["Charlie", "3"], ["Delta", "4"]]);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(firstColumn(table)).toEqual(["Bravo", "Charlie", "Delta"]);
    expect(table.getAttribute("data-cf-sort-ready")).toBe("true");

    await act(async () => {
      const row = table.tBodies[0].insertRow();
      row.insertCell().textContent = "Alpha";
      row.insertCell().textContent = "1";
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The observer must not take ownership of React's row order or repeatedly
    // mutate the table whenever data rows are inserted or updated.
    expect(firstColumn(table)).toEqual(["Bravo", "Charlie", "Delta", "Alpha"]);
  });

  it("initializes and sorts a complete table inserted after startup", async () => {
    const { container } = render(<GlobalTableSort />);
    let table!: HTMLTableElement;

    await act(async () => {
      table = addTable(container, [["Zulu", "9"], ["Alpha", "1"], ["Mike", "5"]]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(table.getAttribute("data-cf-sort-ready")).toBe("true");
    expect(firstColumn(table)).toEqual(["Alpha", "Mike", "Zulu"]);
  });

  it("sorts only after a user activates a sortable header", async () => {
    const { container } = render(<GlobalTableSort />);
    const table = addTable(container, [["Bravo", "2"], ["Alpha", "1"]]);

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const header = table.tHead!.rows[0].cells[0];
    await act(async () => { header.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(firstColumn(table)).toEqual(["Bravo", "Alpha"]);
    expect(table.getAttribute("data-cf-sort-state")).toBe("0:desc");
  });
});
