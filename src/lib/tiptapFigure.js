// ============================================================
// tiptapFigure.js — semantic <figure><figcaption> for image inserts
//
// Replaces the legacy "<img> + <em>caption</em>" pattern. Renders to
// a figure element so the caption travels as a child of the same
// node, screen readers announce them as a unit, and StellarPress can
// style figcaptions via CSS without parsing two adjacent paragraphs.
//
// Backward compatibility: existing stories still load via TipTap's
// Image extension; this extension only governs new inserts triggered
// by editor.insertFigure(...).
// ============================================================
import { Node, mergeAttributes } from "@tiptap/core";

export const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "image figcaption?",
  draggable: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "figure" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { class: "story-figure" }), 0];
  },

  addCommands() {
    return {
      insertFigure: ({ src, alt, caption }) => ({ chain }) =>
        chain()
          .insertContent({
            type: "figure",
            content: [
              { type: "image", attrs: { src, alt: alt || "", title: alt || "" } },
              ...(caption
                ? [{ type: "figcaption", content: [{ type: "text", text: caption }] }]
                : []),
            ],
          })
          .run(),
    };
  },
});

export const Figcaption = Node.create({
  name: "figcaption",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: "figcaption" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figcaption", mergeAttributes(HTMLAttributes), 0];
  },
});
