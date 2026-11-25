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
// route-specific document request. Normalize legacy project-prefixed links
// when the app is served from the root (for example, Codespaces previews).
if (typeof window !== "undefined"
  && import.meta.env.BASE_URL === "/"
  && window.location.pathname.startsWith("/careflow-hub")) {
  const normalizedPath = window.location.pathname.replace(/^\\/careflow-hub(?=\\/|$)/, "") || "/";
  window.history.replaceState(null, "", `${normalizedPath}${window.location.search}${window.location.hash}`);
}

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
