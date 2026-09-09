import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the application below /careflow-hub/; local and
  // external hosts continue to use /. This is only a static-hosting concern.
  base: process.env.GITHUB_ACTIONS ? "/careflow-hub/" : "/",
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // Keep the React runtime together. Broad substring matching such as
          // `id.includes("react")` can incorrectly pull react-* integrations,
          // react-router, lucide-react and @tanstack/react-query into the same
          // runtime chunk and create circular initialization order failures in
          // static production builds (e.g. React.createContext undefined).
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          if (id.includes("node_modules/recharts/") || id.includes("node_modules/d3-")) return "charts";
          if (id.includes("node_modules/jspdf/") || id.includes("node_modules/html2canvas/")) return "document-export";
          if (id.includes("node_modules/xlsx/")) return "spreadsheet";
          if (id.includes("node_modules/@radix-ui/") || id.includes("node_modules/lucide-react/")) return "ui-vendor";
          if (id.includes("node_modules/@tanstack/")) return "query-vendor";

          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 450,
  },
}));
