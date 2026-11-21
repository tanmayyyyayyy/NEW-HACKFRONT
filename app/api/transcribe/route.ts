import { matchesAppOrigin } from "@/lib/app-origin";
import { configuredAppUrl } from "@/lib/site-url";
import { withQueryBudget } from "@/lib/query-budget";

const formats = new Map([["audio/webm", "webm"], ["audio/mp4", "m4a"], ["audio/ogg", "ogg"]]);
const maxBytes = 768 * 1024;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!matchesAppOrigin(request.headers.get("origin"), configuredAppUrl() || url.origin)) {
    return reply({ error: "Open SkillForge at its configured address to use dictation." }, 403);
  }
  const language = url.searchParams.get("language");
  if (language !== "Hindi" && language !== "English" && language !== "Hinglish") {
    return reply({ error: "Select a dictation language." }, 400);
  }
  const mime = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const extension = formats.get(mime);
  if (!extension) return reply({ error: "This recording format is unsupported." }, 415);
  if (Number(request.headers.get("content-length")) > maxBytes) return reply({ error: "The recording is too large." }, 413);
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key) return reply({ error: "Recorded dictation needs a configured Sarvam API key." }, 503);

  return withQueryBudget(async () => {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "There is no audio to transcribe." }, 400);
    const bytes = new Uint8Array(maxBytes);
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (length + value.length > maxBytes) {
          await reader.cancel();
          return reply({ error: "The recording is too large." }, 413);
        }
        bytes.set(value, length);
        length += value.length;
      }
    } catch {
      return reply({ error: "Could not read the recording." }, 400);
    } finally { reader.releaseLock(); }
    if (!length) return reply({ error: "There is no audio to transcribe." }, 400);

    const form = new FormData();
    form.set("file", new Blob([bytes.subarray(0, length)], { type: mime }), "dictation." + extension);
    form.set("model", "saaras:v4");
    form.set("language_code", language === "Hindi" ? "hi-IN" : language === "English" ? "en-IN" : "unknown");
    form.set("mode", language === "Hinglish" ? "codemix" : "transcribe");
    try {
      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST", headers: { "api-subscription-key": key }, body: form,
        redirect: "error", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result?.transcript === "string" && result.transcript.trim()) {
          return reply({ transcript: result.transcript.trim().slice(0, 500) });
        }
        return reply({ error: "No speech was detected. Try recording again." }, 422);
      }
    } catch {
      // Keep provider errors and credentials on the server.
    }
    return reply({ error: "Transcription is unavailable right now. You can still type your question." }, 502);
  });
}
