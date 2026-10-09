import type { RapRenderedDocument, RapRenderChange, RapTabularDocument } from "./types";

const FORMULA_PREFIX = /^[=+\-@]/;

function guardCellValue(value: string | number | boolean | null): string | number | boolean | null {
  if (typeof value !== "string" || !FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

/**
 * Produces a structural copy and changes only explicitly supplied cells.
 * When targetColumn is supplied, every mutation must remain inside that column.
 * Binary serialization is intentionally separate so approval/audit/storage
 * boundaries cannot be bypassed by document generation.
 */
export function renderTargetColumn(
  document: RapTabularDocument,
  changes: readonly RapRenderChange[],
  targetColumn?: number,
): RapRenderedDocument {
  if (targetColumn !== undefined && (!Number.isInteger(targetColumn) || targetColumn < 0)) {
    throw new Error("RAP target column must be a non-negative integer.");
  }

  const rows = document.rows.map((row) => row.map((cell) => ({ ...cell })));
  const normalizedChanges = changes.map((change) => {
    if (targetColumn !== undefined && change.column !== targetColumn) {
      throw new Error(`RAP render attempted to modify non-target column ${change.column}.`);
    }
    return { ...change, value: guardCellValue(change.value) };
  });

  const coordinates = new Set<string>();
  for (const change of normalizedChanges) {
    const coordinate = `${change.row}:${change.column}`;
    if (coordinates.has(coordinate)) throw new Error(`RAP render contains duplicate target ${coordinate}.`);
    coordinates.add(coordinate);

    const row = rows[change.row];
    if (!row || !row[change.column]) {
      throw new Error(`RAP render target ${change.row}:${change.column} is outside the source document.`);
    }
    row[change.column] = { ...row[change.column], value: change.value };
  }

  return { format: document.format, sheetName: document.sheetName, rows, changes: normalizedChanges };
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
