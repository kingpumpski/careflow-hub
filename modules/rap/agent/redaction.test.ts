import { describe, expect, it } from "vitest";
import { redactOutbound } from "./redaction";

describe("RAP outbound redaction", () => {
  it("redacts sensitive keys recursively", () => {
    const result = redactOutbound({ claimId: "claim-123", nested: [{ email: "person@example.com" }] });
    expect(result.redacted).toBe(true);
    expect(result.value).toEqual({ claimId: "[REDACTED]", nested: [{ email: "[REDACTED]" }] });
  });

  it("redacts secrets repeatedly across fields without regex state leakage", () => {
    const result = redactOutbound({
      first: "Authorization: Bearer abc.def.ghi",
      second: "token sk-abc123",
      third: "another sk-def456",
    });
    expect(result.value).toEqual({
      first: "Authorization: [REDACTED]",
      second: "token [REDACTED]",
      third: "another [REDACTED]",
    });
    expect(result.redacted).toBe(true);
  });

  it("does not modify ordinary text", () => {
    const result = redactOutbound({ description: "routine claims review" });
    expect(result.redacted).toBe(false);
    expect(result.value).toEqual({ description: "routine claims review" });
  });
});
