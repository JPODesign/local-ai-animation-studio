/* =============================================================================
 * Local AI Animation Studio — ComfyUI Backend Connector
 * -----------------------------------------------------------------------------
 * The ONLY module that talks to a local ComfyUI server. Every HTTP call targets
 * the user-provided local backend URL (default http://localhost:8188).
 *
 * IMPORTANT — this only works when the user runs ComfyUI ON THEIR OWN COMPUTER.
 * The deployed website cannot reach a backend on someone else's machine.
 *
 * CORS:
 *   ComfyUI does NOT set CORS headers by default. Launch ComfyUI with:
 *       python main.py --enable-cors-header "*"
 *
 * WORKFLOW FORMAT:
 *   /prompt requires the API format (flat { nodeId: { class_type, inputs } }),
 *   NOT the UI format (with `nodes` and `links` arrays). In ComfyUI: enable
 *   Dev Mode, then use "Save (API Format)".
 * ===========================================================================*/

const DEFAULT_URL = "http://localhost:8188";

const clientId =
  (typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID()) ||
  "laias-" + Math.random().toString(36).slice(2);

const joinUrl = (b, p) => (b || "").replace(/\/+$/, "") + p;

export function isApiFormat(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  if (Array.isArray(json.nodes)) return false;
  const vals = Object.values(json);
  if (!vals.length) return false;
  return vals.every(v => v && typeof v === "object" && typeof v.class_type === "string");
}

export async function testConnection(url) {
  const target = joinUrl(url || DEFAULT_URL, "/system_stats");
  try {
    const r = await fetch(target);
    if (!r.ok) return { ok: false, error: `ComfyUI responded HTTP ${r.status} at ${target}` };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return {
      ok: false,
      error:
        `Cannot reach ComfyUI at ${url || DEFAULT_URL}.\n\n` +
        `Checklist:\n` +
        `  1. Is ComfyUI running on this same computer? (python main.py)\n` +
        `  2. Is the URL correct? (default: ${DEFAULT_URL})\n` +
        `  3. Did you launch with  --enable-cors-header "*"  ?\n\n` +
        `Note: this hosted dashboard talks to localhost on YOUR machine only.\n` +
        `It cannot reach a backend on a remote computer.\n\n` +
        `Underlying error: ${e.message || e}`,
    };
  }
}

async function uploadImage(url, file) {
  const fd = new FormData();
  fd.append("image", file, file.name || "input.png");
  fd.append("overwrite", "true");
  const r = await fetch(joinUrl(url, "/upload/image"), { method: "POST", body: fd });
  if (!r.ok) throw new Error("Image upload failed (HTTP " + r.status + ")");
  return (await r.json()).name;
}

function inject(workflow, { prompt, imageFilename }) {
  const wf = JSON.parse(JSON.stringify(workflow));
  let promptInjected = false, imageInjected = false;
  for (const id of Object.keys(wf)) {
    const n = wf[id];
    if (!n || typeof n !== "object") continue;
    const t = ((n._meta && n._meta.title) || "").toLowerCase();
    if (!promptInjected && n.class_type === "CLIPTextEncode" && n.inputs && "text" in n.inputs && !t.includes("negative")) {
      n.inputs.text = prompt;
      promptInjected = true;
    }
    if (!imageInjected && imageFilename && n.class_type === "LoadImage" && n.inputs && "image" in n.inputs) {
      n.inputs.image = imageFilename;
      imageInjected = true;
    }
  }
  return { workflow: wf, promptInjected, imageInjected };
}

// ============ THE ACTUAL CALL TO COMFYUI ============
async function queuePrompt(url, workflow) {
  const r = await fetch(joinUrl(url, "/prompt"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  if (!r.ok) {
    let msg = `ComfyUI rejected the workflow (HTTP ${r.status}).`;
    try {
      const j = await r.json();
      if (j && j.error) msg += " " + JSON.stringify(j.error);
    } catch (_) {}
    throw new Error(msg);
  }
  return r.json();
}

async function waitForResult(url, id, onProgress) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(joinUrl(url, "/history/" + id));
      if (r.ok) {
        const j = await r.json();
        const e = j[id];
        if (e && e.outputs && Object.keys(e.outputs).length) return e;
      }
    } catch (_) { /* transient blips are expected — keep polling */ }
    onProgress && onProgress({ stage: "rendering" });
    await new Promise(res => setTimeout(res, 1000));
  }
  throw new Error("Timed out waiting for ComfyUI (5 min).");
}

const viewUrl = (b, f) => {
  const qs = new URLSearchParams({
    filename: f.filename,
    subfolder: f.subfolder || "",
    type: f.type || "output",
  });
  return joinUrl(b, "/view?" + qs.toString());
};

export async function generate({ backendUrl, workflow, prompt, imageFile, onProgress }) {
  if (!backendUrl) throw new Error("No backend URL set. Open Settings → Local AI.");
  if (!workflow) throw new Error("No workflow uploaded. Open Settings → Local AI.");
  if (!isApiFormat(workflow)) throw new Error('Wrong workflow format. In ComfyUI, enable Dev Mode and use "Save (API Format)".');

  onProgress && onProgress({ stage: "connecting" });
  const ping = await testConnection(backendUrl);
  if (!ping.ok) throw new Error(ping.error);

  let imageFilename = null;
  if (imageFile) {
    onProgress && onProgress({ stage: "uploading image" });
    imageFilename = await uploadImage(backendUrl, imageFile);
  }

  const { workflow: patched } = inject(workflow, { prompt, imageFilename });

  onProgress && onProgress({ stage: "queuing workflow" });
  const queued = await queuePrompt(backendUrl, patched);

  const result = await waitForResult(backendUrl, queued.prompt_id, onProgress);

  const outputs = [];
  for (const nid of Object.keys(result.outputs || {})) {
    const out = result.outputs[nid];
    for (const k of ["images", "gifs", "videos"]) {
      for (const f of (out[k] || [])) {
        outputs.push({
          url: viewUrl(backendUrl, f),
          filename: f.filename,
          mime: k === "images" ? "image/png" : k === "gifs" ? "image/gif" : "video/mp4",
        });
      }
    }
  }
  if (!outputs.length) throw new Error("ComfyUI finished but produced no outputs. Add a SaveImage node to your workflow.");

  return { outputs, promptId: queued.prompt_id, raw: result };
}

export { DEFAULT_URL };

export default { testConnection, generate, isApiFormat, DEFAULT_URL };
