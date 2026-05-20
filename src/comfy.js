/* =============================================================================
 * Animiko — ComfyUI Backend Connector
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

// Default to 127.0.0.1 (per user spec). http://localhost:8188 also works —
// both are browser-trusted "potentially trustworthy" origins that bypass
// the HTTPS-only mixed-content block.
const DEFAULT_URL = "http://127.0.0.1:8188";

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

// Patch the UI's generation parameters into a workflow. Each option is
// optional — only the keys you pass get written. Nodes are located by
// class_type (not node id), so this works with both Animiko's built-in
// test workflow and most third-party SD 1.5 / SDXL graphs.
//
// Supported opts:
//   prompt          → first non-negative CLIPTextEncode.inputs.text
//   negativePrompt  → first  "negative"-titled CLIPTextEncode.inputs.text
//   imageFilename   → first LoadImage.inputs.image
//   checkpoint      → first CheckpointLoaderSimple.inputs.ckpt_name
//   width           → first EmptyLatentImage.inputs.width
//   height          → first EmptyLatentImage.inputs.height
//   steps,cfg,
//   sampler,
//   scheduler,
//   seed            → first KSampler.inputs.{steps,cfg,sampler_name,scheduler,seed}
function inject(workflow, opts) {
  opts = opts || {};
  const wf = JSON.parse(JSON.stringify(workflow));

  let promptInjected = false, negPromptInjected = false, imageInjected = false;
  let firstCkpt = null, firstLatent = null, firstKSampler = null;

  // Walk once and remember the first node of each interesting class_type.
  for (const id of Object.keys(wf)) {
    const n = wf[id];
    if (!n || typeof n !== "object") continue;
    const title = ((n._meta && n._meta.title) || "").toLowerCase();
    const isNeg = title.includes("negative");

    if (n.class_type === "CLIPTextEncode" && n.inputs && "text" in n.inputs) {
      if (!isNeg && !promptInjected && opts.prompt != null) {
        n.inputs.text = opts.prompt;
        promptInjected = true;
      }
      if (isNeg && !negPromptInjected && opts.negativePrompt != null) {
        n.inputs.text = opts.negativePrompt;
        negPromptInjected = true;
      }
    }
    if (!imageInjected && opts.imageFilename && n.class_type === "LoadImage" && n.inputs && "image" in n.inputs) {
      n.inputs.image = opts.imageFilename;
      imageInjected = true;
    }
    if (!firstCkpt     && n.class_type === "CheckpointLoaderSimple") firstCkpt     = n;
    if (!firstLatent   && n.class_type === "EmptyLatentImage")       firstLatent   = n;
    if (!firstKSampler && n.class_type === "KSampler")               firstKSampler = n;
  }

  if (firstCkpt && opts.checkpoint && firstCkpt.inputs) {
    firstCkpt.inputs.ckpt_name = opts.checkpoint;
  }
  if (firstLatent && firstLatent.inputs) {
    if (opts.width  != null) firstLatent.inputs.width  = opts.width;
    if (opts.height != null) firstLatent.inputs.height = opts.height;
  }
  if (firstKSampler && firstKSampler.inputs) {
    if (opts.steps     != null) firstKSampler.inputs.steps        = opts.steps;
    if (opts.cfg       != null) firstKSampler.inputs.cfg          = opts.cfg;
    if (opts.sampler   != null) firstKSampler.inputs.sampler_name = opts.sampler;
    if (opts.scheduler != null) firstKSampler.inputs.scheduler    = opts.scheduler;
    // seed: any number >= 0 wins. -1 means "let the workflow keep its own seed
    // OR generate randomly upstream" — we deliberately do not overwrite.
    if (opts.seed != null && opts.seed >= 0) firstKSampler.inputs.seed = opts.seed;
  }

  return { workflow: wf, promptInjected, imageInjected, negPromptInjected };
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

async function waitForResult(url, id, onProgress, opts = {}) {
  // Poll /history/{prompt_id} every 2 s for up to 30 s by default. On
  // timeout we throw a structured error (code "POLL_TIMEOUT") so the UI
  // can switch to a "queued, waiting" state instead of showing an error.
  const intervalMs = opts.intervalMs || 2000;
  const timeoutMs  = opts.timeoutMs  || 30 * 1000;
  const deadline   = Date.now() + timeoutMs;
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
    await new Promise(res => setTimeout(res, intervalMs));
  }
  const err = new Error("Polling timed out after " + (timeoutMs / 1000) + "s — the ComfyUI job may still be running on the server.");
  err.code = "POLL_TIMEOUT";
  throw err;
}

const viewUrl = (b, f) => {
  const qs = new URLSearchParams({
    filename: f.filename,
    subfolder: f.subfolder || "",
    type: f.type || "output",
  });
  return joinUrl(b, "/view?" + qs.toString());
};

// One-shot check of /history/{prompt_id} — used by the "Refresh" button on
// the queued result view. Returns one of:
//   { status: "ready",   outputs: [...] }     — job completed
//   { status: "pending" }                     — still running
//   { status: "error",   error: "…" }         — fetch / HTTP error
export async function checkResult(backendUrl, promptId) {
  try {
    const r = await fetch(joinUrl(backendUrl, "/history/" + promptId));
    if (!r.ok) return { status: "error", error: "HTTP " + r.status + " from /history/" + promptId };
    const j = await r.json();
    const entry = j[promptId];
    if (!entry || !entry.outputs || !Object.keys(entry.outputs).length) {
      return { status: "pending" };
    }
    const outputs = [];
    for (const nid of Object.keys(entry.outputs)) {
      const out = entry.outputs[nid];
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
    return { status: "ready", outputs, raw: entry };
  } catch (e) {
    return { status: "error", error: (e && e.message) || String(e) };
  }
}

export async function generate(opts) {
  opts = opts || {};
  const { backendUrl, workflow, imageFile, onProgress } = opts;
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

  // Forward every supported generation parameter into the workflow.
  // Anything left undefined is preserved from the original workflow JSON.
  const { workflow: patched } = inject(workflow, {
    prompt:         opts.prompt,
    negativePrompt: opts.negativePrompt,
    imageFilename,
    checkpoint:     opts.checkpoint,
    width:          opts.width,
    height:         opts.height,
    steps:          opts.steps,
    cfg:            opts.cfg,
    sampler:        opts.sampler,
    scheduler:      opts.scheduler,
    seed:           opts.seed,
  });

  onProgress && onProgress({ stage: "queuing workflow" });
  const queued = await queuePrompt(backendUrl, patched);
  // Surface the prompt id to the UI so it can show "ComfyUI accepted job <id>".
  onProgress && onProgress({ stage: "queued", promptId: queued.prompt_id });

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

// Query ComfyUI for the list of installed checkpoint files. Used by the
// System Status card so the user can see exactly what models are available
// and by loadTestWorkflow to pick the first one if v1-5-pruned-emaonly is
// not present.
export async function listCheckpoints(backendUrl) {
  try {
    const r = await fetch(joinUrl(backendUrl, "/object_info/CheckpointLoaderSimple"));
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    const data = await r.json();
    // Path: CheckpointLoaderSimple.input.required.ckpt_name = [ [list of files], { tooltip: ... } ]
    const node = data.CheckpointLoaderSimple || {};
    const req  = (node.input || {}).required || {};
    const raw  = req.ckpt_name || [];
    const names = Array.isArray(raw[0]) ? raw[0] : [];
    return { ok: true, checkpoints: names };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// Parse the system_stats payload into a tidy { os, python, comfyui, gpus[] }
// shape. Each gpu = { name, vramTotalMB, vramFreeMB, type }.
export function summarizeSystem(data) {
  if (!data) return null;
  const sys = data.system || {};
  const devices = Array.isArray(data.devices) ? data.devices : [];
  const gpus = devices.map(d => ({
    name:         d.name || "(unknown)",
    type:         d.type || "",
    index:        d.index ?? null,
    vramTotalMB:  d.vram_total ? Math.round(d.vram_total / (1024 * 1024)) : null,
    vramFreeMB:   d.vram_free  ? Math.round(d.vram_free  / (1024 * 1024)) : null,
  }));
  return {
    os:          sys.os || "",
    python:      sys.python_version || "",
    comfyui:     sys.comfyui_version || "",
    ramTotalMB:  sys.ram_total ? Math.round(sys.ram_total / (1024 * 1024)) : null,
    ramFreeMB:   sys.ram_free  ? Math.round(sys.ram_free  / (1024 * 1024)) : null,
    gpus,
  };
}

export { DEFAULT_URL };

export default { testConnection, generate, isApiFormat, DEFAULT_URL };
