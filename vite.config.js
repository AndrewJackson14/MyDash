import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// Manual chunks split out heavy dependencies that change rarely so the
// browser can cache them across deploys. The main index chunk was 529 KB
// (audit P-1) because React, Supabase, Stripe, and DOMPurify all landed
// in it. Splitting pushes vendor code into its own long-cached chunks
// and shrinks the boot-critical path.
//
// pdfjs-dist and pdf-lib are already dynamic-imported from
// EditionManager so Vite code-splits them automatically into pdf-*.js.
//
// Bundle visualizer (audit Q4): runs only when ANALYZE=1 to avoid
// slowing the deploy build. After running:
//   ANALYZE=1 npm run build
// Open dist/stats.html in a browser to see the dependency treemap.
export default defineConfig({
  plugins: [
    react(),
    process.env.ANALYZE && visualizer({
      filename: "dist/stats.html",
      template: "treemap",   // treemap | sunburst | network
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  build: {
    // Filter the modulepreload <link> graph so genuinely-lazy chunks
    // don't get pulled into the cold-load critical path. The treemap
    // (audit Q4) showed tiptap (~117 KB gzip) was being preloaded
    // even though the only consumer is the lazy StoryEditor — most
    // users never need it on first paint. Keep the chunk split, just
    // don't advertise it for preload until something actually imports.
    //
    // DriverApp (1.8 MB / 500 KB gzip) is the same shape: lazy-imported,
    // only mounts on /driver*, but was still being preloaded for every
    // publisher/sales user on cold load. Excluded here.
    modulePreload: {
      resolveDependencies: (filename, deps) => {
        return deps.filter(dep => !/\/tiptap-/.test(dep) && !/\/DriverApp-/.test(dep));
      },
    },
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
