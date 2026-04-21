// React NodeView for the tiptap Gallery node.
//
// The node persists as plain HTML (see lib/tiptapGallery.js — that's the
// markup StellarPress + GLightbox consume). This component controls what
// the writer sees while editing: a live mosaic preview with a column
// chooser, drag-to-reorder handles, per-image captions, and an image
// removal button.
import { NodeViewWrapper } from "@tiptap/react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Z, COND, Ri, R, INV } from "../../lib/theme";

const COLS = [2, 3, 4, 5, 6];

function SortableTile({ id, img, columns, onCaption, onAlt, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: "relative",
    background: Z.sa,
    borderRadius: 4,
    overflow: "hidden",
  };

  // Stop mouse events inside inputs from triggering the parent drag listener
  // (otherwise typing in the caption field starts a sort drag).
  const stopDrag = (e) => e.stopPropagation();

  return (
    <div ref={setNodeRef} style={style} contentEditable={false}>
      {/* Drag handle overlaid in the top-left corner */}
      <div
        {...attributes}
        {...listeners}
        title="Drag to reorder"
        style={{
          position: "absolute", top: 4, left: 4, zIndex: 2,
          width: 22, height: 22, borderRadius: Ri,
          background: "rgba(0,0,0,0.55)", color: INV.light,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "grab", fontSize: 14, userSelect: "none",
        }}
      >⋮⋮</div>

      {/* Remove button overlaid in the top-right */}
      <button
        type="button"
        onClick={onRemove}
        onMouseDown={stopDrag}
        title="Remove from gallery"
        style={{
          position: "absolute", top: 4, right: 4, zIndex: 2,
          width: 22, height: 22, borderRadius: Ri,
          background: "rgba(0,0,0,0.55)", color: INV.light, border: "none",
          cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
        }}
      >×</button>

      <img
        src={img.url}
        alt={img.alt || ""}
        style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
      />

      <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          value={img.caption || ""}
          onChange={e => onCaption(e.target.value)}
          onMouseDown={stopDrag}
          onClick={stopDrag}
          placeholder="Caption (optional)"
          style={{
            width: "100%", padding: "4px 6px", borderRadius: Ri,
            border: "1px solid " + Z.bd, background: Z.sf, color: Z.tx,
            fontSize: 11, fontFamily: COND,
          }}
        />
        {columns <= 3 && (
          <input
            value={img.alt || ""}
            onChange={e => onAlt(e.target.value)}
            onMouseDown={stopDrag}
            onClick={stopDrag}
            placeholder="Alt text (accessibility)"
            style={{
              width: "100%", padding: "4px 6px", borderRadius: Ri,
              border: "1px solid " + Z.bd, background: Z.sf, color: Z.tm,
              fontSize: 10, fontFamily: COND,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function GalleryNodeView({ node, updateAttributes, selected, deleteNode }) {
  const images = node.attrs.images || [];
  const columns = Math.max(2, Math.min(6, node.attrs.columns || 3));

  const setImages = (next) => updateAttributes({ images: next });
  const setColumns = (n) => updateAttributes({ columns: n });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = images.findIndex((_, i) => String(i) === active.id);
    const to = images.findIndex((_, i) => String(i) === over.id);
    if (from < 0 || to < 0) return;
    setImages(arrayMove(images, from, to));
  };

  const updateAt = (i, patch) =>
    setImages(images.map((img, j) => j === i ? { ...img, ...patch } : img));

  const removeAt = (i) => setImages(images.filter((_, j) => j !== i));

  return (
    <NodeViewWrapper
      as="div"
      className="story-gallery-wrap"
      style={{
        border: `1px solid ${selected ? Z.ac : Z.bd}`,
        borderRadius: R,
        padding: 10,
        margin: "1.5em 0",
        background: Z.bg,
      }}
    >
      {/* Toolbar */}
      <div
        contentEditable={false}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          marginBottom: 8, fontFamily: COND,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: Z.tm }}>
          Gallery · {images.length} image{images.length !== 1 ? "s" : ""}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: Z.tm }}>
          Columns:
          <select
            value={columns}
            onChange={e => setColumns(Number(e.target.value))}
            style={{
              padding: "2px 6px", borderRadius: Ri, border: "1px solid " + Z.bd,
              background: Z.sa, color: Z.tx, fontSize: 11, fontFamily: COND,
            }}
          >
            {COLS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={deleteNode}
          style={{
            padding: "3px 10px", borderRadius: Ri, border: `1px solid ${Z.da}40`,
            background: "transparent", color: Z.da, fontSize: 11,
            fontFamily: COND, fontWeight: 600, cursor: "pointer",
          }}
        >
          Remove Gallery
        </button>
      </div>

      {/* Mosaic */}
      {images.length === 0 ? (
        <div style={{
          padding: 24, textAlign: "center", color: Z.tm,
          fontSize: 12, fontFamily: COND, border: "1px dashed " + Z.bd, borderRadius: R,
        }}>
          No images in this gallery. Remove it and re-insert from the library.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((_, i) => String(i))} strategy={rectSortingStrategy}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: 6,
              }}
            >
              {images.map((img, i) => (
                <SortableTile
                  key={i}
                  id={String(i)}
                  img={img}
                  columns={columns}
                  onCaption={(caption) => updateAt(i, { caption })}
                  onAlt={(alt) => updateAt(i, { alt })}
                  onRemove={() => removeAt(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </NodeViewWrapper>
  );
}
