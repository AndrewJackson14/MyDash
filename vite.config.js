import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Manual chunks split out heavy dependencies that change rarely so the
// browser can cache them across deploys. The main index chunk was 529 KB
// (audit P-1) because React, Supabase, Stripe, and DOMPurify all landed
// in it. Splitting pushes vendor code into its own long-cached chunks
// and shrinks the boot-critical path.
//
// pdfjs-dist and pdf-lib are already dynamic-imported from
// EditionManager so Vite code-splits them automatically into pdf-*.js.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Path-matching function is more reliable than the dict form,
        // which missed react/react-dom because their JSX runtime imports
        // land in Vite's internal prebuild graph under different paths.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) return "react";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@stripe")) return "stripe";
          if (id.includes("dompurify")) return "dompurify";
          if (id.includes("@tiptap")) return "tiptap";
          if (id.includes("framer-motion")) return "framer";
          if (id.includes("@dnd-kit")) return "dnd_kit";
        },
      },
    },
  },
});
