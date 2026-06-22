/**
 * Triggers the process-iam-queue Edge Function to immediately process
 * pending Entra ID actions (assign/remove groups, licenses, apps).
 * Called after any change that generates iam_queue entries.
 * 
 * @param force - If true, ignores next_retry_at and processes all pending items immediately
 */
export async function triggerEntraProcessing(force = true): Promise<void> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-iam-queue`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force }),
    });
    if (!res.ok) {
      console.warn("[triggerEntraProcessing] HTTP", res.status, await res.text());
    } else {
      const body = await res.json();
      console.log("[triggerEntraProcessing] Processed:", body.summary || body);
    }
  } catch (err) {
    console.warn("[triggerEntraProcessing] Error:", err);
  }
}
