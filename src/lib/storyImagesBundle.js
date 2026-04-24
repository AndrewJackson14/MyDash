// ============================================================
// storyImagesBundle — bundle a story's image originals into a zip
// with a Word .docx caption sheet at the root.
//
// Output structure inside the zip:
//   <story-slug>-originals.zip
//   ├── captions.docx          ← table: file_name | caption
//   └── images/
//       ├── photo1.jpg
//       ├── photo2.jpg
//       └── …
//
// The .docx is built by hand (jszip-only) instead of pulling in the
// `docx` npm package (~280KB) — captions.docx only needs a single
// table, so the minimal Open Office XML payload is shorter than the
// library would be.
// ============================================================
import JSZip from "jszip";

function escXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function safeFilename(name, fallback = "image") {
  const base = String(name || fallback).trim();
  // Slug: keep dots, dashes, alphanumerics; collapse the rest.
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || fallback;
}

// Word document XML for a 2-column table — story title + image rows.
function buildCaptionDocxXml({ storyTitle, rows }) {
  const titlePara = `
    <w:p>
      <w:pPr><w:pStyle w:val="Title"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${escXml(storyTitle || "Story Images")}</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:i/><w:color w:val="6B7280"/></w:rPr><w:t xml:space="preserve">Generated ${new Date().toLocaleString()}</w:t></w:r>
    </w:p>
    <w:p/>`;

  const headerRow = `
    <w:tr>
      <w:trPr><w:tblHeader/></w:trPr>
      <w:tc>
        <w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr>
        <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>File name</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr>
        <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Caption</w:t></w:r></w:p>
      </w:tc>
    </w:tr>`;

  const bodyRows = rows.map(r => `
    <w:tr>
      <w:tc>
        <w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr>
        <w:p><w:r><w:t xml:space="preserve">${escXml(r.fileName)}</w:t></w:r></w:p>
      </w:tc>
      <w:tc>
        <w:tcPr><w:tcW w:w="6000" w:type="dxa"/></w:tcPr>
        <w:p><w:r><w:t xml:space="preserve">${escXml(r.caption || "(no caption)")}</w:t></w:r></w:p>
      </w:tc>
    </w:tr>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${titlePara}
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="9000" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>
        </w:tblBorders>
      </w:tblPr>
      ${headerRow}
      ${bodyRows}
    </w:tbl>
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
}

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Assemble the caption sheet as a self-contained .docx Blob.
async function buildCaptionDocx({ storyTitle, rows }) {
  const docxZip = new JSZip();
  docxZip.file("[Content_Types].xml", DOCX_CONTENT_TYPES);
  docxZip.folder("_rels").file(".rels", DOCX_RELS);
  docxZip.folder("word").file("document.xml", buildCaptionDocxXml({ storyTitle, rows }));
  return docxZip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

// Public entry — pass the story title + an array of:
//   { url, file_name, caption }
// Triggers a download of <slug>-originals.zip (caption sheet + images/).
export async function downloadStoryImagesBundle({ storyTitle, images }) {
  if (!images?.length) return;
  const slug = safeFilename((storyTitle || "story").toLowerCase().replace(/\s+/g, "-").slice(0, 60), "story");
  const zip = new JSZip();

  // Caption sheet first, at the zip root.
  const captionRows = images.map(i => ({
    fileName: safeFilename(i.file_name || "image", "image"),
    caption: i.caption || "",
  }));
  const docxBlob = await buildCaptionDocx({ storyTitle, rows: captionRows });
  zip.file("captions.docx", docxBlob);

  // Images folder. Fetch each, deduplicate names if a collision occurs.
  const imagesFolder = zip.folder("images");
  const seen = new Map();
  for (const img of images) {
    let name = safeFilename(img.file_name || "image", "image");
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    if (count > 1) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`;
    }
    try {
      const res = await fetch(img.url, { credentials: "omit" });
      if (!res.ok) continue;
      const blob = await res.blob();
      imagesFolder.file(name, blob);
    } catch {
      // skip — single failed fetch shouldn't kill the rest
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}-originals.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
