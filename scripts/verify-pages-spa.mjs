import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const distDir = resolve(process.cwd(), "dist");
const indexPath = resolve(distDir, "index.html");
const legacyFallbackPath = resolve(distDir, "404.html");
const appSourcePath = resolve(process.cwd(), "src/App.tsx");
const authClientPath = resolve(process.cwd(), "src/integrations/supabase/client.ts");
const authPagePath = resolve(process.cwd(), "src/pages/AuthPage.tsx");
const userMenuPath = resolve(process.cwd(), "src/components/layout/UserMenu.tsx");

const [indexHtml, legacyFallback, appSource, authClient, authPage, userMenu, assetNames] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(legacyFallbackPath, "utf8"),
  readFile(appSourcePath, "utf8"),
  readFile(authClientPath, "utf8"),
  readFile(authPagePath, "utf8"),
  readFile(userMenuPath, "utf8"),
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
if (!authClient.includes("flowType: 'pkce'")) {
  throw new Error("Supabase auth must use PKCE so callback codes do not conflict with the router fragment.");
}
if (!authPage.includes('${import.meta.env.BASE_URL}#/auth')
  || !userMenu.includes('${import.meta.env.BASE_URL}#/auth')) {
  throw new Error("Signup, OAuth, and password-reset callbacks must target the hash-based auth route.");
}
if (!assetNames.some((name) => name.endsWith(".js"))) {
  throw new Error("No JavaScript bundles were emitted.");
}

// Execute the published legacy bridge against a representative old clean URL.
// It must preserve the route and query in the URL fragment at the project base.
const inlineScript = legacyFallback.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) throw new Error("Legacy 404 compatibility script is missing.");
let redirectedTo = "";
const fakeWindow = {
  location: {
    pathname: "/careflow-hub/reports",
    search: "?month=2026-11",
    hash: "",
    replace: (url) => { redirectedTo = url; },
  },
};
runInNewContext(inlineScript, { window: fakeWindow });
if (redirectedTo !== "/careflow-hub/#/reports?month=2026-11") {
  throw new Error(`Legacy route bridge produced an unexpected URL: ${redirectedTo}`);
}

console.log("GitHub Pages hash routing verified: routes remain in URL fragments, legacy clean paths are bridged, and Supabase callbacks use PKCE.");
