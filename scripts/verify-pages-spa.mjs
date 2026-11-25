import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");
const legacyFallbackPath = resolve(distDir, "404.html");
const appSourcePath = resolve(process.cwd(), "src/App.tsx");

const [indexHtml, legacyFallback, appSource, assetNames] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(legacyFallbackPath, "utf8"),
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
const jsBundles = assetNames.filter((name) => name.endsWith(".js"));
if (!jsBundles.length) throw new Error("No JavaScript bundles were emitted.");
const bundleContents = await Promise.all(jsBundles.map((name) => readFile(resolve(distDir, "assets", name), "utf8")));
if (!bundleContents.some((content) => content.includes("HashRouter"))) {
  throw new Error("Built application does not contain the expected HashRouter runtime.");
}
console.log("GitHub Pages hash routing verified: app routes stay in the URL fragment; legacy paths redirect to #/ routes.");
