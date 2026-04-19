---
id: design-studio-basics
module: Design Studio
audience: designer
last_verified: 2026-04-19
---

# Design Studio — brief, proof, approval

Design Studio (**Design → Ad Projects**) is where every display-ad creative job lives. Each ad project ties to a single sale.

**Status pipeline:**
`brief → awaiting_art → designing → proof_sent → revising → approved → signed_off → placed`

**Starting a brief:** when a sale closes, an ad project is auto-created in `brief` status. On the board, cards in the **Needs Brief** column are sales without a project yet — click one to seed the Create Brief modal with the sale's details.

**Camera-ready vs we-design:** set on the brief. Camera-ready ads skip straight to `awaiting_art` pending client's file upload. We-design ads go into `designing`.

**Uploading a proof:** open the project, click **Upload Proof**. Supported formats: PDF, PNG, JPG. Version numbers increment automatically (v1, v2, v3).

**Sending the proof to the client:** from the project detail, **Send Proof**. The system emails a public proof link (no login required). Status → `proof_sent`.

**Client response:** they click **Approve** or **Request Revision** on the proof page. Approve → `approved`. Revision → `revising`, and you can upload a new proof.

**Revision charges:** three revisions included. Starting with v4, the system flags a surcharge (visible on the project detail).

**Sign-off:** both designer and salesperson must sign off. The **Place on Flatplan** action becomes available once signed-off. Final status: `placed`.
