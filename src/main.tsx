import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Claims Informatics root element was not found. Check index.html.");
  // throw new Error("CareFlow root element was not found. Check index.html.");
}

createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
