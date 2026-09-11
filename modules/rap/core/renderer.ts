import type { RapRenderedDocument, RapRenderChange, RapTabularDocument } from "./types";

const FORMULA_PREFIX = /^[=+\-@]/;

function guardCellValue(value: string | number | boolean | null): string | number | boolean | null {
  if (typeof value !== "string" || !FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

/**
 * Produces a structural copy and changes only the explicitly supplied target cells.
 * Binary serialization is intentionally separated from this pure renderer so that
 * approval, audit and storage boundaries cannot be bypassed by document generation.
 */
export function renderTargetColumn(
  document: RapTabularDocument,
  changes: readonly RapRenderChange[],
): RapRenderedDocument {
  const rows = document.rows.map((row) => row.map((cell) => ({ ...cell })));
  const normalizedChanges = changes.map((change) => ({
    ...change,
    value: guardCellValue(change.value),
  }));

  for (const change of normalizedChanges) {
    const row = rows[change.row];
    if (!row || !row[change.column]) throw new Error(`RAP render target ${change.row}:${change.column} is outside the source document.`);
    row[change.column] = { ...row[change.column], value: change.value };
  }

  return { format: document.format, rows, changes: normalizedChanges };
}

export function changedCoordinates(document: RapTabularDocument, rendered: RapRenderedDocument): string[] {
  const coordinates: string[] = [];
  for (let row = 0; row < document.rows.length; row += 1) {
    for (let column = 0; column < document.rows[row].length; column += 1) {
      if (document.rows[row][column].value !== rendered.rows[row]?.[column]?.value) {
        coordinates.push(`${row}:${column}`);
      }
    }
  }
  return coordinates;
}
