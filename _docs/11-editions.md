---
id: editions
module: Editorial
audience: editor
last_verified: 2026-04-19
---

# Uploading and featuring print editions

**To upload a new edition:** Go to **Editorial → Editions → Upload New Edition**. Then:

1. **Drop a PDF** into the dropzone (or click to browse). Files up to 100MB.
2. **Publication** — pick from the dropdown.
3. **Publish Date** — sets the slug and title automatically.
4. **Set as this week's edition** — toggle on to feature this edition on the public site. Only one featured edition per publication; turning this on automatically unfeatures the previous one.
5. (Optional) Expand **Compression settings** to shrink large PDFs: None, Light (200 DPI), Medium (150 DPI), Aggressive (120 DPI), or Custom.
6. Click **Publish Edition**.

**What happens on publish:**
- Compresses the PDF (if a preset is chosen)
- Uploads the PDF to BunnyCDN
- Generates a cover image from page 1
- Extracts each page as a WebP image for the magazine flipper reader
- Saves the edition record and marks it as ready

**To feature or unfeature an edition:** in the edition list, click the **Feature** / **Unfeature** button on that row. Featuring a different edition automatically unfeatures the current one for that publication.

**To edit an edition:** click any row to open the edit panel. You can replace the PDF, change the publish date, or re-feature.

**To delete an edition:** click **Delete** on the row and confirm. The database record is removed; the PDF and cover stay on the CDN.
