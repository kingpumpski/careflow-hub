import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Claims Informatics root element was not found. Check index.html.");
  // throw new Error("CareFlow root element was not found. Check index.html.");
}

// GitHub Pages redirects unknown deep links through public/404.html. Restore
// the original application route before BrowserRouter reads the location.
if (typeof window !== "undefined") {
  const params = new URLSearchParams(window.location.search);
  const restoredRoute = params.get("cf_route");
  if (restoredRoute) {
    const cleanRoute = restoredRoute.startsWith("/") ? restoredRoute : `/${restoredRoute}`;
    window.history.replaceState(null, "", `${cleanRoute}${window.location.hash}`);
  }
}

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
