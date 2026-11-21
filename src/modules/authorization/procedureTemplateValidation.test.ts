import { describe, expect, it } from "vitest";
import { validateProcedureTemplate } from "./procedureTemplateValidation";

const validInput = {
  templateName: " General Surgery Bundle ",
  procedureId: "procedure-1",
  items: [
    { description: " Theatre fee ", quantity: 2, unitCharge: 125.25 },
    { description: "Consumables", quantity: "3", unitCharge: "10.10" },
  ],
};

describe("procedure template validation", () => {
  it("normalizes names and calculates totals in integer minor units", () => {
    const result = validateProcedureTemplate(validInput, { procedureIds: ["procedure-1"] });
    expect(result.template_name).toBe("General Surgery Bundle");
    expect(result.items[0].description).toBe("Theatre fee");
    expect(result.total_amount).toBe(280.8);
  });

  it("rejects empty cost lines instead of silently dropping them", () => {
    expect(() => validateProcedureTemplate({
      ...validInput,
      items: [...validInput.items, { description: " ", quantity: 1, unitCharge: 0 }],
    })).toThrow("needs a description");
  });

  it("rejects fractional quantities, negative prices and excess decimal precision", () => {
    expect(() => validateProcedureTemplate({ ...validInput, items: [{ description: "Bed", quantity: 1.5, unitCharge: 10 }] })).toThrow("positive whole number");
    expect(() => validateProcedureTemplate({ ...validInput, items: [{ description: "Bed", quantity: 1, unitCharge: -10 }] })).toThrow("non-negative amount");
    expect(() => validateProcedureTemplate({ ...validInput, items: [{ description: "Bed", quantity: 1, unitCharge: "10.123" }] })).toThrow("up to two decimal places");
  });

  it("rejects duplicate template names but allows the record being edited", () => {
    const existing = [{ id: "template-1", template_name: "general   surgery bundle" }];
    expect(() => validateProcedureTemplate(validInput, { existing })).toThrow("already exists");
    expect(validateProcedureTemplate(validInput, { existing, editingId: "template-1" }).template_name)
      .toBe("General Surgery Bundle");
  });

  it("detects duplicate names among rows staged in the same bulk import", () => {
    expect(() => validateProcedureTemplate(validInput, {
      existing: [{ template_name: "General Surgery Bundle" }],
    })).toThrow("already exists");
  });

  it("rejects a procedure reference that is no longer available", () => {
    expect(() => validateProcedureTemplate(validInput, { procedureIds: ["procedure-2"] }))
      .toThrow("selected procedure no longer exists");
  });

  it("parses explicit archived values rather than treating the string No as true", () => {
    expect(validateProcedureTemplate({ ...validInput, archived: "No" }).archived).toBe(false);
    expect(validateProcedureTemplate({ ...validInput, archived: "Yes" }).archived).toBe(true);
    expect(() => validateProcedureTemplate({ ...validInput, archived: "maybe" })).toThrow("Archived must be Yes or No");
  });

  it("rejects malformed JSON and empty item arrays", () => {
    expect(() => validateProcedureTemplate({ ...validInput, items: "not json" })).toThrow("valid JSON");
    expect(() => validateProcedureTemplate({ ...validInput, items: [] })).toThrow("at least one cost item");
  });
});
