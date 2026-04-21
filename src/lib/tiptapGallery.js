// Tiptap Gallery node — a block of images rendered as a CSS-grid mosaic
// that hydrates into a GLightbox shadowbox on StellarPress. Emits the
// markup GLightbox's default selector (`.glightbox`) picks up
// automatically; the only thing StellarPress needs on its end is
// enqueuing the GLightbox CSS/JS and running `GLightbox()` once per
// page load.
//
// In-editor: renders the same HTML so writers preview the mosaic;
// GLightbox isn't loaded in the editor so clicks are no-ops.
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import GalleryNodeView from "../components/editor/GalleryNodeView.jsx";

const newGalleryId = () => "gal-" + Math.random().toString(36).slice(2, 9);

export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      images: { default: [] },
      columns: { default: 3 },
      galleryId: { default: null },
    };
  },

  parseHTML() {
    // Accept both the current figure-based markup and the legacy
    // div.story-gallery so edits on older stories migrate cleanly.
    const fromEl = (el) => {
      const anchors = el.querySelectorAll("a[href]");
      const images = (anchors.length
        ? Array.from(anchors).map(a => {
            const img = a.querySelector("img");
            return {
              url: a.getAttribute("href") || img?.getAttribute("src") || "",
              alt: img?.getAttribute("alt") || "",
              caption: a.getAttribute("data-title") || img?.getAttribute("title") || img?.getAttribute("alt") || "",
            };
          })
        : Array.from(el.querySelectorAll("img")).map(img => ({
            url: img.getAttribute("src") || "",
            alt: img.getAttribute("alt") || "",
            caption: img.getAttribute("title") || "",
          }))
      ).filter(i => i.url);
      return {
        images,
        columns: Number(el.getAttribute("data-columns")) || 3,
        galleryId: el.getAttribute("data-gallery-id") || null,
      };
    };
    return [
      { tag: "figure.story-gallery", getAttrs: fromEl },
      { tag: "div.story-gallery", getAttrs: fromEl },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const images = node.attrs.images || [];
    const columns = Math.max(2, Math.min(6, node.attrs.columns || 3));
    const gid = node.attrs.galleryId || newGalleryId();
    // Use <figure> instead of <div> — figure is in almost every HTML
    // sanitizer's default allowlist, while <div class="…"> often gets
    // dropped subtree-and-all. Each item is also a nested <figure> so
    // that if the outer wrapper ever does get stripped, each image
    // still renders stacked rather than vanishing.
    // Inline styles so the mosaic lays out without any consumer CSS.
    // GLightbox hydration still depends on the .glightbox class
    // surviving — if StellarPress drops classes, we still have a
    // visible clickable-image grid (clicks open the CDN URL directly).
    const containerStyle = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:6px;margin:1.5em 0;padding:0;`;
    const itemStyle = "margin:0;padding:0;";
    const anchorStyle = "display:block;overflow:hidden;border-radius:4px;";
    const imgStyle = "width:100%;aspect-ratio:1/1;object-fit:cover;display:block;margin:0;";
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "story-gallery",
      "data-columns": String(columns),
      "data-gallery-id": gid,
      style: containerStyle,
    });
    const children = images.map(img => [
      "figure",
      { class: "story-gallery-item", style: itemStyle },
      [
        "a",
        {
          class: "glightbox",
          "data-gallery": gid,
          href: img.url,
          "data-title": img.caption || "",
          style: anchorStyle,
        },
        ["img", { src: img.url, alt: img.alt || "", title: img.caption || "", loading: "lazy", style: imgStyle }],
      ],
    ]);
    return ["figure", attrs, ...children];
  },

  addCommands() {
    return {
      insertGallery: (attrs) => ({ commands }) =>
        commands.insertContent({
          type: this.name,
          attrs: {
            images: attrs?.images || [],
            columns: attrs?.columns || 3,
            galleryId: attrs?.galleryId || newGalleryId(),
          },
        }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryNodeView);
  },
});

export default Gallery;
