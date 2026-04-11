import { supabase } from "./supabase";

const FUNCTION_URL = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/generate-pdf";

/**
 * Generate a PDF for an invoice or contract via edge function.
 * @param {"invoice"|"contract"} type
 * @param {string} id - record ID
 * @param {"download"|"base64"} mode - download triggers browser save, base64 returns raw data
 * @returns {Promise<{base64?: string, filename?: string}>}
 */
export async function generatePdf(type, id, mode = "download") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, id, format: mode === "base64" ? "base64" : undefined }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "PDF generation failed: " + res.status);
  }

  if (mode === "base64") {
    return await res.json();
  }

  // Download mode — trigger browser save
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = type === "invoice" ? `invoice-${id}.pdf` : `contract-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
  return { downloaded: true };
}
