import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");
const fallbackPath = resolve(distDir, "404.html");

const [indexHtml, fallbackHtml] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(fallbackPath, "utf8"),
]);

if (!indexHtml.trim()) throw new Error("dist/index.html is empty.");
if (!fallbackHtml.trim()) throw new Error("dist/404.html is empty.");
if (indexHtml !== fallbackHtml) {
  throw new Error("GitHub Pages SPA fallback drifted: dist/404.html must match dist/index.html.");
}

console.log("GitHub Pages SPA fallback verified: dist/404.html matches dist/index.html.");
