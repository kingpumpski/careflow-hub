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
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@supabase")) return "supabase";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("jspdf") || id.includes("html2canvas")) return "document-export";
          if (id.includes("xlsx")) return "spreadsheet";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          if (id.includes("@radix-ui") || id.includes("lucide-react")) return "ui-vendor";
          if (id.includes("@tanstack")) return "query-vendor";

          return "vendor";
        },
      },
    },
    chunkSizeWarningLimit: 450,
  },
}));
