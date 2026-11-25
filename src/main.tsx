import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("CareFlow root element was not found. Check index.html.");
}

// Hash-based routing keeps application routes in the URL fragment, so
// GitHub Pages always receives the project entry-point path rather than a
// route-specific document request. Convert legacy project-prefixed paths to
// hash routes when the app is served from the root (for example, Codespaces).
if (typeof window !== "undefined"
  && import.meta.env.BASE_URL === "/"
  && (window.location.pathname === "/careflow-hub" || window.location.pathname.startsWith("/careflow-hub/"))) {
  const legacyRoute = window.location.pathname.slice("/careflow-hub".length) || "/";
  window.history.replaceState(null, "", `/${window.location.search}#${legacyRoute}`);
}

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
