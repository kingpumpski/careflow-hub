export interface ProcedureTemplateItem {
  description: string;
  quantity: number;
  unitCharge: number;
}

export interface ProcedureTemplateInput {
  templateName: unknown;
  procedureId?: unknown;
  items: unknown;
  notes?: unknown;
  archived?: unknown;
}

export interface ExistingProcedureTemplate {
  id?: string;
  template_name?: string | null;
}

export interface ValidatedProcedureTemplate {
  template_name: string;
  procedure_id: string | null;
  items: ProcedureTemplateItem[];
  total_amount: number;
  notes: string | null;
  archived: boolean;
  diagnosis_code_id: null;
  diagnosis_code_ids: string[];
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["yes", "y", "true", "1", "active"].includes(normalized)) return true;
    if (["no", "n", "false", "0", "inactive"].includes(normalized)) return false;
  }
  throw new Error("Archived must be Yes or No.");
}

function parseItems(raw: unknown): unknown[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Items must be valid JSON.");
    }
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Add at least one cost item.");
  }
  if (value.length > 100) throw new Error("A template cannot contain more than 100 cost items.");
  return value;
}

/** Validates a reusable procedure bundle and calculates its total using integer minor units. */
export function validateProcedureTemplate(
  input: ProcedureTemplateInput,
  options: {
    existing?: ExistingProcedureTemplate[];
    editingId?: string;
    procedureIds?: string[];
  } = {},
): ValidatedProcedureTemplate {
  const templateName = typeof input.templateName === "string"
    ? input.templateName.trim().replace(/\\s+/g, " ")
    : "";
  if (!templateName) throw new Error("Template name is required.");
  if (templateName.length > 120) throw new Error("Template name must be 120 characters or fewer.");

  const normalizedName = templateName.toLocaleLowerCase();
  const duplicate = (options.existing || []).some((record) =>
    record.id !== options.editingId
    && String(record.template_name || "").trim().replace(/\\s+/g, " ").toLocaleLowerCase() === normalizedName
  );
  if (duplicate) throw new Error("A procedure template with this name already exists.");

  const procedureId = typeof input.procedureId === "string" ? input.procedureId.trim() : "";
  if (procedureId && options.procedureIds && !options.procedureIds.includes(procedureId)) {
    throw new Error("The selected procedure no longer exists. Refresh the procedure list and try again.");
  }

  const parsedItems = parseItems(input.items);
  let totalCents = 0;
  const items = parsedItems.map((rawItem, index): ProcedureTemplateItem => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error("Cost item " + (index + 1) + " must be an object.");
    }
    const item = rawItem as Record<string, unknown>;
    const description = typeof item.description === "string"
      ? item.description.trim().replace(/\\s+/g, " ")
      : "";
    if (!description) throw new Error("Cost item " + (index + 1) + " needs a description.");
    if (description.length > 200) throw new Error("Cost item descriptions must be 200 characters or fewer.");

    const quantityText = String(item.quantity ?? "").trim();
    if (!/^\\d+$/.test(quantityText)) {
      throw new Error("Quantity for " + description + " must be a positive whole number.");
    }
    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) {
      throw new Error("Quantity for " + description + " must be between 1 and 100,000.");
    }

    const priceText = String(item.unitCharge ?? "").trim();
    if (!/^\\d+(?:\\.\\d{1,2})?$/.test(priceText)) {
      throw new Error("Unit charge for " + description + " must be a non-negative amount with up to two decimal places.");
    }
    const unitCharge = Number(priceText);
    const unitCents = Math.round(unitCharge * 100);
    if (!Number.isSafeInteger(unitCents) || unitCents < 0) {
      throw new Error("Unit charge for " + description + " is outside the supported amount range.");
    }
    const lineCents = unitCents * quantity;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(totalCents + lineCents)) {
      throw new Error("The template total exceeds the supported amount range.");
    }
    totalCents += lineCents;
    return { description, quantity, unitCharge: unitCents / 100 };
  });

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > 2000) throw new Error("Notes must be 2,000 characters or fewer.");

  return {
    template_name: templateName,
    procedure_id: procedureId || null,
    items,
    total_amount: totalCents / 100,
    notes: notes || null,
    archived: parseBoolean(input.archived),
    diagnosis_code_id: null,
    diagnosis_code_ids: [],
  };
}
