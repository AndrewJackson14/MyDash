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
    return [{
      tag: "div.story-gallery",
      getAttrs: (el) => {
        const anchors = el.querySelectorAll("a[href]");
        const images = Array.from(anchors).map(a => {
          const img = a.querySelector("img");
          return {
            url: a.getAttribute("href") || img?.getAttribute("src") || "",
            alt: img?.getAttribute("alt") || "",
            caption: a.getAttribute("data-title") || img?.getAttribute("title") || "",
          };
        }).filter(i => i.url);
        return {
          images,
          columns: Number(el.getAttribute("data-columns")) || 3,
          galleryId: el.getAttribute("data-gallery-id") || null,
        };
      },
    }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const images = node.attrs.images || [];
    const columns = Math.max(2, Math.min(6, node.attrs.columns || 3));
    const gid = node.attrs.galleryId || newGalleryId();
    // Inline styles so the mosaic renders even if the consuming site
    // hasn't added .story-gallery CSS (or strips class attributes in
    // its HTML sanitizer). GLightbox hydration still depends on the
    // .glightbox class + data-gallery being allowed through.
    const containerStyle = `display:grid;grid-template-columns:repeat(${columns},1fr);gap:6px;margin:1.5em 0;`;
    const anchorStyle = "display:block;overflow:hidden;border-radius:4px;";
    const imgStyle = "width:100%;aspect-ratio:1/1;object-fit:cover;display:block;margin:0;";
    const attrs = mergeAttributes(HTMLAttributes, {
      class: "story-gallery",
      "data-columns": String(columns),
      "data-gallery-id": gid,
      style: containerStyle,
    });
    const children = images.map(img => [
      "a",
      {
        class: "glightbox",
        "data-gallery": gid,
        href: img.url,
        "data-title": img.caption || "",
        style: anchorStyle,
      },
      ["img", { src: img.url, alt: img.alt || "", title: img.caption || "", loading: "lazy", style: imgStyle }],
    ]);
    return ["div", attrs, ...children];
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
