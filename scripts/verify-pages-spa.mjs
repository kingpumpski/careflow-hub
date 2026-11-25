import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");
const legacyFallbackPath = resolve(distDir, "404.html");
const appSourcePath = resolve(process.cwd(), "src/App.tsx");

const [indexHtml, legacyFallback, appSource, assetNames] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(legacyFallbackPath, "utf8"),
  readFile(appSourcePath, "utf8"),
  readdir(resolve(distDir, "assets")),
]);

if (!indexHtml.includes('<div id="root"></div>')) {
  throw new Error("Built application entry point is missing the React root.");
}
if (!legacyFallback.includes('base + "#" + route')) {
  throw new Error("Legacy deep-link compatibility page must redirect to a hash route.");
}
if (legacyFallback.includes("cf_route")) {
  throw new Error("Obsolete cf_route query-string routing must not be published.");
}
if (!appSource.includes("HashRouter") || appSource.includes("BrowserRouter")) {
  throw new Error("Application source must use HashRouter rather than BrowserRouter.");
}
if (!assetNames.some((name) => name.endsWith(".js"))) {
  throw new Error("No JavaScript bundles were emitted.");
}
console.log("GitHub Pages hash routing verified: app routes stay in the URL fragment; legacy paths redirect to #/ routes.");
