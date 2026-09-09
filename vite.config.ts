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
        // Only isolate genuinely heavy, independently useful libraries. Keep
        // React, router, Radix, TanStack and the general dependency graph under
        // Rollup's normal chunking so static builds cannot create framework
        // initialization cycles (the previous broad vendor split caused
        // React.createContext to be read before the React runtime initialized).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("node_modules/recharts/") || id.includes("node_modules/d3-")) return "charts";
          if (id.includes("node_modules/jspdf/") || id.includes("node_modules/html2canvas/")) return "document-export";
          if (id.includes("node_modules/xlsx/")) return "spreadsheet";
          if (id.includes("node_modules/@supabase/")) return "supabase";
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 450,
  },
}));
