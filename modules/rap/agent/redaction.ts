const SENSITIVE_KEYS = /^(patient|member|claim|medical|diagnosis|dob|phone|email|address|national|nhis|secret|token|password|authorization|internal.?id)/i;
const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]+/g, /Bearer\s+[A-Za-z0-9._-]+/gi, /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g];

export interface RapRedactionResult {
  value: unknown;
  redacted: boolean;
  reasons: string[];
}

export function redactOutbound(value: unknown): RapRedactionResult {
  const reasons = new Set<string>();
  const walk = (input: unknown): unknown => {
    if (typeof input === "string") {
      let output = input;
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(output)) {
          reasons.add("SECRET_PATTERN");
          output = output.replace(pattern, "[REDACTED]");
          pattern.lastIndex = 0;
        }
      }
      return output;
    }
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input).map(([key, entry]) => {
        if (SENSITIVE_KEYS.test(key)) {
          reasons.add(`SENSITIVE_KEY:${key}`);
          return [key, "[REDACTED]"];
        }
        return [key, walk(entry)];
      }));
    }
    return input;
  };

  const result = walk(value);
  return { value: result, redacted: reasons.size > 0, reasons: [...reasons] };
}
