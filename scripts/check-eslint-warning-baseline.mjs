import { ESLint } from "eslint";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

const baselinePath = new URL("./eslint-warning-baseline.json", import.meta.url);
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
const actual = new Map();
const errors = [];

for (const result of results) {
  const file = relative(process.cwd(), result.filePath).replace(/\\\\/g, "/");
  for (const message of result.messages) {
    if (message.severity === 2) {
      errors.push({ file, line: message.line, column: message.column, rule: message.ruleId ?? "unknown", message: message.message });
      continue;
    }
    if (message.severity !== 1) continue;
    const key = JSON.stringify([file, message.ruleId ?? "unknown", message.message]);
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
}

const baselineCounts = baseline.warningCounts ?? {};
const regressions = [...actual.entries()]
  .filter(([key, count]) => count > (baselineCounts[key] ?? 0))
  .map(([key, count]) => ({
    signature: JSON.parse(key),
    baseline: baselineCounts[key] ?? 0,
    current: count,
  }));
const baselineTotal = Object.values(baselineCounts).reduce((sum, count) => sum + count, 0);
const currentTotal = [...actual.values()].reduce((sum, count) => sum + count, 0);

if (errors > 0 || regressions.length > 0) {
  console.error(`ESLint baseline failed: ${errors.length} errors, ${regressions.length} warning regressions.`);\n  for (const item of errors) {\n    console.error(`  ${item.file}:${item.line}:${item.column} [${item.rule}]: ${item.message}`);\n  }
  for (const item of regressions) {
    console.error(`  ${item.signature[0]} [${item.signature[1]}] baseline=${item.baseline}, current=${item.current}: ${item.signature[2]}`);
  }
  process.exitCode = 1;
} else {
  console.log(`ESLint baseline passed: ${currentTotal}/${baselineTotal} warnings; ${baselineTotal - currentTotal} removed; no new warning signatures.`);
}
