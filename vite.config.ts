import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the application below /careflow-hub/; local and
  // external hosts continue to use /. This is only a static-hosting concern.
  base: process.env.GITHUB_ACTIONS ? "/careflow-hub/" : "/",
  appType: "spa",
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@/lib/exportUtils": path.resolve(__dirname, "./src/lib/exportUtils.lazy.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Let Rollup preserve the dependency graph instead of manually forcing
    // framework/vendor modules into shared chunks. The previous manual split
    // could produce a static-hosting initialization cycle where React's
    // createContext was accessed before the React runtime was initialized.
    // Route-level React.lazy() and explicit heavy-library imports still provide
    // natural code splitting without risking framework execution order.
    chunkSizeWarningLimit: 1000,
  },
}));
