// vite.config.portal.js — separate Vite build for portal.13stars.media.
//
// The customer portal ships as its own bundle so we can deploy it to
// a different webroot/host without dragging the staff app along.
// Source still lives in this repo at src/portal/* and shares the
// Supabase client + utilities under src/lib/*.
//
// Output: dist-portal/ (gitignored). Staff build keeps producing dist/
// from the unchanged vite.config.js.
//
// Spec: docs/specs/client-portal-spec.md.md §1.2 (single-bundle v1
// path). Workspace refactor is v2 cleanup.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir:      "dist-portal",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        portal: path.resolve(__dirname, "portal.html"),
      },
    },
  },
  server: {
    port: 5174, // staff dev runs on 5173 by default; portal dev gets 5174
    open: "/portal.html",
  },
});
