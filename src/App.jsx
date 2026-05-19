import { useState, useEffect, useRef, useCallback } from "react";
import ComfyClient, { testConnection as comfyTest, generate as comfyGenerate, checkResult as comfyCheck, isApiFormat, DEFAULT_URL } from "./comfy.js";

// ----------------------------------------------------------------------------
// Built-in test workflow — the standard SD 1.5 text-to-image graph that ships
// with ComfyUI. We use it for "Create Test Workflow" so a brand-new user can
// confirm the round-trip (prompt → /prompt → prompt_id → /history) works
// before they bring their own workflow. Node 6 is the positive CLIPTextEncode
// where Animiko injects the user's prompt; Node 7 is the negative.
// ----------------------------------------------------------------------------
const TEST_WORKFLOW = {
  "3": {
    inputs: { seed: 8566257, steps: 20, cfg: 8, sampler_name: "euler", scheduler: "normal", denoise: 1,
              model: ["4", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["5", 0] },
    class_type: "KSampler",
    _meta: { title: "KSampler" },
  },
  "4": {
    inputs: { ckpt_name: "v1-5-pruned-emaonly.ckpt" },
    class_type: "CheckpointLoaderSimple",
    _meta: { title: "Load Checkpoint" },
  },
  "5": {
    inputs: { width: 512, height: 512, batch_size: 1 },
    class_type: "EmptyLatentImage",
    _meta: { title: "Empty Latent Image" },
  },
  "6": {
    inputs: { text: "a photo of a cat", clip: ["4", 1] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Prompt)" },
  },
  "7": {
    inputs: { text: "watermark, text, blurry, low quality", clip: ["4", 1] },
    class_type: "CLIPTextEncode",
    _meta: { title: "CLIP Text Encode (Negative)" },
  },
  "8": {
    inputs: { samples: ["3", 0], vae: ["4", 2] },
    class_type: "VAEDecode",
    _meta: { title: "VAE Decode" },
  },
  "9": {
    inputs: { filename_prefix: "Animiko", images: ["8", 0] },
    class_type: "SaveImage",
    _meta: { title: "Save Image" },
  },
};

/* ============================================================================
 * ANIMIKO — premium glassmorphism AI animation studio
 *   • React 18 + Vite + Tailwind v3
 *   • No external UI libraries (no shadcn/ui, no Radix, no Headless UI).
 *   • Every primitive (Card, Button, Tabs, Modal, Input) is hand-built here.
 *   • Demo Mode always works. Local AI Mode requires ComfyUI running on the
 *     user's OWN computer.
 * ==========================================================================*/

/* ---------- GLASS DESIGN PRIMITIVES ---------- */
const Card = ({ children, className = "" }) => (
  <div className={"bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_0_40px_rgba(139,92,246,0.15)] p-5 " + className}>
    {children}
  </div>
);

const InnerCard = ({ children, className = "" }) => (
  <div className={"bg-slate-900/50 border border-slate-700/50 rounded-xl " + className}>{children}</div>
);

const Badge = ({ children, tone = "violet" }) => {
  const tones = {
    violet:  "bg-violet-500/15 text-violet-200 border-violet-400/40",
    cyan:    "bg-cyan-500/15 text-cyan-200 border-cyan-400/40",
    amber:   "bg-amber-500/15 text-amber-200 border-amber-400/40",
    emerald: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
    rose:    "bg-rose-500/15 text-rose-200 border-rose-400/40",
    slate:   "bg-white/5 text-slate-200 border-white/10",
  };
  return (
    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border " + (tones[tone] || tones.slate)}>
      {children}
    </span>
  );
};

const PrimaryBtn = ({ children, className = "", ...p }) => (
  <button {...p} className={"inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 shadow-lg shadow-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition " + className}>
    {children}
  </button>
);

const SecondaryBtn = ({ children, className = "", ...p }) => (
  <button {...p} className={"inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-white bg-white/15 border border-white/25 hover:bg-white/25 hover:border-white/40 shadow-sm shadow-black/20 disabled:opacity-50 transition " + className}>
    {children}
  </button>
);

const GhostBtn = ({ children, className = "", ...p }) => (
  <button {...p} className={"inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-white bg-white/10 border border-white/20 hover:bg-white/20 hover:border-white/30 disabled:opacity-50 transition " + className}>
    {children}
  </button>
);

const DangerBtn = ({ children, className = "", ...p }) => (
  <button {...p} className={"inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-rose-200 bg-rose-500/15 border border-rose-400/30 hover:bg-rose-500/25 disabled:opacity-50 transition " + className}>
    {children}
  </button>
);

const inputCls = "w-full bg-black/30 border border-white/10 rounded-lg p-2 text-white placeholder:text-slate-500 focus:border-violet-400/50 focus:outline-none transition";

/* ============================================================================
 * Navbar
 * ==========================================================================*/
function Navbar({ theme, setTheme, onOpenSettings }) {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/60 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-violet-900/50">L</div>
          <div className="leading-tight">
            <div className="font-semibold text-white">Animiko</div>
            <div className="text-xs text-slate-400">Frontend-first · Demo Mode</div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {["Studio", "Stickman", "Local AI"].map(s => (
            <a key={s} href={"#" + s.toLowerCase().replace(" ", "-")} className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition">
              {s}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SecondaryBtn onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">{theme === "dark" ? "☀" : "🌙"}</SecondaryBtn>
          <SecondaryBtn onClick={onOpenSettings} title="Settings">⚙</SecondaryBtn>
          <SecondaryBtn className="hidden sm:inline-flex">Login</SecondaryBtn>
          <PrimaryBtn className="px-3 py-2">Discord</PrimaryBtn>
        </div>
      </div>
    </header>
  );
}

/* ============================================================================
 * Hero
 * ==========================================================================*/
function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 pt-10 pb-6">
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge tone="violet">Demo Mode</Badge>
        <Badge tone="cyan">Local AI Mode: Coming Soon</Badge>
        <Badge tone="amber">Requires local GPU setup</Badge>
        <Badge tone="emerald">No paid API required if running locally</Badge>
      </div>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300">Animiko</span>
      </h1>
      <p className="mt-3 text-slate-300 max-w-3xl">Create animations using uploaded assets, stickman parts, frame-by-frame sprites, and future local AI video generation.</p>
      <p className="mt-1 text-xs text-slate-400">Performance depends entirely on your computer hardware when running locally.</p>
    </section>
  );
}

/* ============================================================================
 * Creation Controls + Animation Results
 * ==========================================================================*/
const TABS = ["Image or Text", "Video to Video", "Talk", "Stickman Builder", "Local AI Setup"];
const MODELS = [
  { value: "demo",        label: "Demo Mode" },
  { value: "animatediff", label: "Local AnimateDiff (Coming Soon)" },
  { value: "svd",         label: "Local Stable Video Diffusion (Coming Soon)" },
  { value: "wan",         label: "Local Wan Video (Coming Soon)" },
  { value: "comfy",       label: "Local ComfyUI Workflow (Coming Soon)" },
];
const STYLES = ["Cinematic", "Anime", "3D Cartoon", "Pixel Art", "Realistic", "Stickman Sketch", "Cyberpunk"];

function CreationPanel({ settings, connection, onOpenSettings, onScrollTo, result, setResult }) {
  const [tab, setTab] = useState(TABS[0]);
  // No hardcoded sample prompt — the user types their own.
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("demo");
  const [style, setStyle] = useState("Cinematic");
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [pendingPromptId, setPendingPromptId] = useState(null); // ComfyUI prompt_id once it accepts the job
  const [errorMessage, setErrorMessage] = useState(null);  // Local AI backend / generation error shown in the result panel
  // Single uploaded media item per spec: { file, name, type, url } | null
  const [uploaded, setUploaded] = useState(null);

  const onUpload = (e) => {
    const f = (e.target.files || [])[0];
    if (!f) return;
    setUploaded(prev => {
      // Replacing existing upload — revoke the previous blob URL.
      if (prev && prev.url) { try { URL.revokeObjectURL(prev.url); } catch (_) {} }
      return { file: f, name: f.name, type: f.type || "", url: URL.createObjectURL(f) };
    });
    e.target.value = ""; // reset so the same file can be re-picked after removal
  };
  const removeUpload = () => {
    setUploaded(prev => {
      if (prev && prev.url) { try { URL.revokeObjectURL(prev.url); } catch (_) {} }
      return null;
    });
  };
  const magic = () => {
    const ideas = [
      "ultra-detailed, volumetric lighting, 35mm film grain",
      "soft pastel palette, cel-shaded, smooth keyframe motion, 24fps",
      "low-angle hero shot, neon rim light, slow zoom",
      "stop-motion feel, paper-cut textures, hand-drawn outlines",
    ];
    setPrompt(p => p + "\n" + ideas[Math.floor(Math.random() * ideas.length)]);
  };

  const generate = async () => {
    setErrorMessage(null); // wipe any previous error on a fresh attempt

    // ---------- DEMO MODE ----------
    // Never claims real generation. Demo result is clearly labelled.
    if (model === "demo") {
      setBusy(true); setStage("rendering demo"); setResult(null);
      await new Promise(r => setTimeout(r, 3000));
      setBusy(false); setStage("");
      setResult({ kind: "demo", prompt, style, model, generatedAt: new Date().toLocaleTimeString() });
      return;
    }

    // ---------- LOCAL AI MODE ----------
    // Never falls back to the demo city. Refuses with a precise message
    // based on what's actually missing (per spec):
    //   - explicit "disconnected" from last Test → ask for Test Connection
    //   - connected but no workflow            → ask for workflow upload
    //   - untested + no workflow               → ask for workflow upload
    //   - otherwise                            → attempt; connector will
    //                                            test connection itself
    if (connection && connection.status === "disconnected") {
      setResult(null);
      setErrorMessage("Local AI backend is not connected. Start ComfyUI locally, then click Test Connection.");
      return;
    }
    if (!settings.workflow) {
      setResult(null);
      setErrorMessage(
        connection && connection.status === "connected"
          ? "ComfyUI is connected, but no workflow JSON is loaded yet. Upload a workflow JSON in Local AI Setup."
          : "No workflow JSON loaded yet. Upload one in Local AI Setup, then click Test Connection."
      );
      return;
    }

    setBusy(true); setStage("connecting"); setResult(null); setPendingPromptId(null);
    // Captured locally so the catch block can read the latest value even
    // though setPendingPromptId is async.
    let receivedPromptId = null;
    try {
      const imgFile = (uploaded && uploaded.type && uploaded.type.startsWith("image/")) ? uploaded.file : null;
      // ===== ACTUAL CALL TO THE LOCAL BACKEND =====
      // (see src/comfy.js for the connector; this turns into a /prompt POST
      // when ComfyUI is reachable on settings.backendUrl)
      const out = await comfyGenerate({
        backendUrl: settings.backendUrl,
        workflow:   settings.workflow,
        prompt,
        imageFile:  imgFile,
        onProgress: (ev) => {
          if (ev && ev.stage)    setStage(ev.stage);
          if (ev && ev.promptId) { receivedPromptId = ev.promptId; setPendingPromptId(ev.promptId); }
        },
      });
      setResult({
        kind: "comfy",
        outputs: out.outputs,
        promptId: out.promptId,
        prompt, style, model,
        generatedAt: new Date().toLocaleTimeString(),
      });
    } catch (e) {
      // Polling timed out — the job is queued in ComfyUI and may still
      // complete. Show the user a "queued" state with a Refresh button.
      if (e && e.code === "POLL_TIMEOUT" && receivedPromptId) {
        setResult({
          kind: "queued",
          promptId: receivedPromptId,
          prompt, style, model,
          generatedAt: new Date().toLocaleTimeString(),
        });
        return;
      }
      const msg = (e && e.message) || String(e);
      const isConnectionError = msg.indexOf("Cannot reach ComfyUI") >= 0 || msg.indexOf("Failed to fetch") >= 0;
      setErrorMessage(
        isConnectionError
          ? "Local AI backend is not connected. Start ComfyUI locally, then click Test Connection.\n\n" +
            "If ComfyUI is already running, this may be a CORS issue — re-launch it with --enable-cors-header \"*\".\n\n" +
            msg
          : "Local AI generation failed:\n\n" + msg
      );
    } finally {
      setBusy(false); setStage(""); setPendingPromptId(null);
    }
  };

  // "Check Output Now" button on the queued result view.
  const refreshQueued = async () => {
    if (!result || result.kind !== "queued" || !result.promptId) return;
    setBusy(true); setStage("checking /history/" + result.promptId);
    try {
      const check = await comfyCheck(settings.backendUrl, result.promptId);
      if (check.status === "ready") {
        setResult({
          kind: "comfy",
          outputs: check.outputs,
          promptId: result.promptId,
          prompt: result.prompt, style: result.style, model: result.model,
          generatedAt: new Date().toLocaleTimeString(),
        });
      } else if (check.status === "pending") {
        // Still no output — keep the queued state, just refresh the timestamp.
        setResult({ ...result, generatedAt: new Date().toLocaleTimeString() });
      } else {
        setErrorMessage("Could not reach ComfyUI: " + check.error);
        setResult(null);
      }
    } finally {
      setBusy(false); setStage("");
    }
  };

  const exportActions = ["Upscale", "Interpolate", "Effects", "Download", "Export PNG", "Export GIF", "Export Sprite Sheet"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Creation Controls</h3>
          <Badge tone="violet">{model === "demo" ? "Demo Mode" : "Local AI"}</Badge>
        </div>

        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-black/30 border border-white/10 mb-4">
          {TABS.map(t => (
            <button key={t}
              onClick={() => {
                setTab(t);
                if (t === "Stickman Builder") onScrollTo && onScrollTo("stickman");
                if (t === "Local AI Setup")  onScrollTo && onScrollTo("local-ai");
              }}
              className={"text-xs md:text-sm px-3 py-2 rounded-lg transition " +
                (tab === t
                  ? "bg-violet-500/20 text-violet-200 border border-violet-400/40"
                  : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent")}>
              {t}
            </button>
          ))}
        </div>

        <label className="block">
          <div className="text-xs text-cyan-300 mb-2 font-medium">Upload Media</div>
          <div className="border border-dashed border-white/15 rounded-xl p-5 text-center hover:border-violet-400/50 hover:bg-white/5 transition cursor-pointer bg-black/20">
            <div className="text-2xl text-violet-300">⬆</div>
            <div className="mt-1 text-sm text-slate-300">Click to upload images, video, or audio</div>
            <div className="text-xs text-slate-400">Files stay in your browser.</div>
            <input type="file" multiple className="hidden" onChange={onUpload} />
          </div>
        </label>
        {uploaded && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1 py-1 rounded-full bg-white/5 text-slate-200 border border-white/10">
              <span className="truncate max-w-[160px]">{uploaded.name}</span>
              <button
                onClick={removeUpload}
                title={"Remove " + uploaded.name}
                aria-label={"Remove " + uploaded.name}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-rose-500/70 text-slate-300 hover:text-white inline-flex items-center justify-center leading-none"
              >×</button>
            </span>
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-cyan-300 font-medium">Prompt</div>
            <GhostBtn onClick={magic}>✨ Magic Prompt</GhostBtn>
          </div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} className={inputCls + " text-sm scroll-thin"} placeholder="Describe the animation you want…" />
        </div>

        <SecondaryBtn className="mt-3 w-full">+ Add Character</SecondaryBtn>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs text-cyan-300 mb-1 font-medium">AI Model</div>
            <select value={model} onChange={e => setModel(e.target.value)} className={inputCls + " text-sm"}>
              {MODELS.map(m => <option key={m.value} value={m.value} className="bg-slate-900">{m.label}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Style</div>
            <select value={style} onChange={e => setStyle(e.target.value)} className={inputCls + " text-sm"}>
              {STYLES.map(s => <option key={s} className="bg-slate-900">{s}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-3 py-2">
          <div>
            <div className="text-sm text-white">{pub ? "Public" : "Private"}</div>
            <div className="text-xs text-slate-400">Visibility (saved locally).</div>
          </div>
          <button onClick={() => setPub(v => !v)} className={"relative w-11 h-6 rounded-full transition " + (pub ? "bg-gradient-to-r from-violet-500 to-cyan-500" : "bg-white/10 border border-white/10")}>
            <span className={"absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition " + (pub ? "left-5" : "left-0.5")} />
          </button>
        </div>

        <PrimaryBtn disabled={busy} onClick={generate} className="mt-4 w-full py-3 text-base">
          {busy ? (
            <>
              <span className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              {stage || "Generating…"}
            </>
          ) : <>⚡ Generate Animation</>}
        </PrimaryBtn>

        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Real AI video generation requires either a paid API or a local GPU setup. This dashboard is built for local generation — the frontend is ready, but the local AI backend must be connected later.
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h3 className="font-semibold text-white">Animation Results</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {model !== "demo" && (() => {
              const ready = settings.workflow && connection && connection.status === "connected";
              const tone  = ready ? "emerald" : (connection && connection.status === "disconnected" ? "rose" : "amber");
              const label = ready
                ? "ready"
                : !settings.workflow
                  ? "no workflow"
                  : connection && connection.status === "disconnected" ? "not connected" : "untested";
              return <Badge tone={tone}>Local AI · {label}</Badge>;
            })()}
            <Badge tone="cyan">{model === "demo" ? "Demo Mode" : "Preview"}</Badge>
          </div>
        </div>

        <InnerCard className="overflow-hidden">
          <div className="canvas-bg aspect-video flex items-center justify-center">
            {busy ? (
              <BusyLoader model={model} stage={stage} prompt={prompt} promptId={pendingPromptId} />
            ) : errorMessage ? (
              /* Local AI failure — replaces the panel. NEVER falls back to
                 a demo city. Shows the error, the prompt, and the upload
                 (if any) so the user can correct course. */
              <LocalAIErrorView
                message={errorMessage}
                prompt={prompt}
                uploaded={uploaded}
                onRemoveUpload={removeUpload}
              />
            ) : result && result.kind === "comfy" ? (
              /* PRIORITY 1: real generated output from the local backend
                 wins over uploaded input. */
              <ComfyResult result={result} />
            ) : result && result.kind === "queued" ? (
              /* ComfyUI accepted the job but our 30s poll window expired.
                 Show prompt_id + "Check Output Now" refresh button. */
              <QueuedView result={result} prompt={prompt} uploaded={uploaded} onRefresh={refreshQueued} />
            ) : uploaded ? (
              /* PRIORITY 2: uploaded media preview. */
              <MediaPreview
                uploaded={uploaded}
                onRemove={removeUpload}
                prompt={prompt}
                badge={result ? "Generated · Demo Mode" : null}
              />
            ) : result && result.kind === "demo" && model === "demo" ? (
              /* Demo placeholder — ONLY when Demo Mode is selected AND no
                 upload exists. Local AI modes can never reach this branch. */
              <DemoResult result={result} />
            ) : (
              /* PRIORITY 3 + 4: prompt placeholder / empty state.
                 Local AI gets a connection-status pill here — never a city. */
              <CleanPlaceholder
                hasPrompt={prompt.trim().length > 0}
                prompt={prompt}
                model={model}
                settings={settings}
                connection={connection}
              />
            )}
          </div>
        </InnerCard>

        {/* Idle inputs panel — file chips (with X) + prompt text — shown only
            when we're not busy and no result is on screen yet. */}
        {!busy && !result && uploaded && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1 py-1 rounded-full bg-white/5 text-slate-200 border border-white/10">
              <span className="truncate max-w-[240px]">{uploaded.name}</span>
              <button
                onClick={removeUpload}
                title={"Remove " + uploaded.name}
                aria-label={"Remove " + uploaded.name}
                className="w-4 h-4 rounded-full bg-white/10 hover:bg-rose-500/70 text-slate-300 hover:text-white inline-flex items-center justify-center leading-none"
              >×</button>
            </span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {exportActions.map(b => (
            <GhostBtn key={b} onClick={() => alert(b + ": stub. Will be wired up after a result is available or after the local backend is connected.")}>
              {b}
            </GhostBtn>
          ))}
        </div>
      </Card>
    </div>
  );
}

// Decide which media element to render. Triggers on:
//   - image/*  (PNG, JPG, WebP, SVG, etc — also animated GIF)
//   - a .gif extension even if the browser didn't set the type
//   - video/*  (MP4, WebM, etc)
//   - audio/*  (MP3, WAV, etc)
function mediaKind(m) {
  if (!m) return "none";
  if ((m.type && m.type.startsWith("image/")) || /\.gif$/i.test(m.name || "")) return "image";
  if (m.type && m.type.startsWith("video/")) return "video";
  if (m.type && m.type.startsWith("audio/")) return "audio";
  return "file";
}

// The single preview for uploaded media — used in BOTH idle and post-Generate
// states. Uploaded media always wins over result/demo previews, so this one
// component is everything the upload path needs:
//   - `prompt`  : when set, overlay the prompt text at the bottom
//   - `badge`   : when set, show a small badge in the top-right (e.g. "Generated")
//   - falls back to showing the filename when there's no prompt overlay
function MediaPreview({ uploaded, onRemove, prompt, badge }) {
  if (!uploaded) return null;
  const kind = mediaKind(uploaded);
  const showPrompt = !!(prompt && prompt.trim());
  return (
    <div className="w-full h-full relative">
      {kind === "image" ? (
        <img src={uploaded.url} alt={uploaded.name} className="w-full h-full object-contain" />
      ) : kind === "video" ? (
        <video src={uploaded.url} controls loop className="w-full h-full object-contain bg-black" />
      ) : kind === "audio" ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-3xl text-violet-300">🎵</div>
          <audio src={uploaded.url} controls className="w-full max-w-md" />
          <div className="text-xs text-slate-400">{uploaded.name}</div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm p-4">
          <span className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10">{uploaded.name}</span>
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        {badge && <Badge tone="violet">{badge}</Badge>}
        <button
          onClick={onRemove}
          title="Remove this upload"
          aria-label="Remove uploaded media"
          className="w-8 h-8 rounded-full bg-black/70 hover:bg-rose-500/80 backdrop-blur border border-white/20 text-white flex items-center justify-center transition"
        >×</button>
      </div>
      {showPrompt ? (
        <div className="absolute bottom-2 left-2 right-2 text-xs text-slate-200 bg-black/60 backdrop-blur px-3 py-2 rounded">
          <span className="text-cyan-300 mr-1.5 font-medium">prompt:</span>{prompt}
        </div>
      ) : (
        <div className="absolute bottom-2 left-2 right-12 text-xs text-slate-200 bg-black/60 backdrop-blur px-2 py-1 rounded truncate">
          {uploaded.name}
        </div>
      )}
    </div>
  );
}

// Quiet idle state — text only, NEVER a hardcoded preview.
// In Local AI mode: shows backend URL + workflow status + prompt (no demo).
// In Demo Mode: generic copy + prompt (no city placeholder either, the
//               demo city only renders after Generate is clicked).
function CleanPlaceholder({ hasPrompt, prompt, model, settings, connection }) {
  const isLocalAI = model && model !== "demo";
  const status = (connection && connection.status) || "untested";
  const statusClass =
    status === "connected"    ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200" :
    status === "disconnected" ? "bg-rose-500/15 border-rose-400/40 text-rose-200" :
    status === "testing"      ? "bg-cyan-500/15 border-cyan-400/40 text-cyan-200" :
                                "bg-white/5 border-white/10 text-slate-300";
  const statusLabel =
    status === "connected"    ? "● Connected" :
    status === "disconnected" ? "● Not Connected" :
    status === "testing"      ? "● Testing…" :
                                "● Not Tested";

  return (
    <div className="text-center p-8 max-w-md">
      {isLocalAI ? (
        <>
          <div className="text-slate-300">
            {hasPrompt
              ? "Click Generate Animation to send the prompt to your local backend."
              : "Local AI mode — write a prompt and click Generate Animation."}
          </div>
          <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
              Backend:&nbsp;<span className="font-mono text-cyan-300">{(settings && settings.backendUrl) || "not set"}</span>
            </span>
            <span className={"px-2 py-0.5 rounded-full border " + (settings && settings.workflow
              ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
              : "bg-rose-500/15 border-rose-400/40 text-rose-200")}>
              {settings && settings.workflow
                ? "Workflow: " + (settings.workflowName || "loaded")
                : "Workflow: not loaded"}
            </span>
            <span className={"px-2 py-0.5 rounded-full border " + statusClass}>{statusLabel}</span>
          </div>
        </>
      ) : (
        <div className="text-slate-300">
          {hasPrompt
            ? "Prompt ready — upload media or click Generate Animation to render."
            : "Upload media and/or enter a prompt to preview your animation result."}
        </div>
      )}
      {hasPrompt && prompt && (
        <div className="text-xs text-slate-400 italic mt-3 max-h-24 overflow-auto px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-left">
          “{prompt}”
        </div>
      )}
    </div>
  );
}

// Loading view shown during the 3-second demo render OR while waiting on
// the local AI backend. Model-aware copy: Demo Mode says "no GPU used",
// Local AI says "Sending prompt to ComfyUI…" and shows the prompt id
// once the queue accepts the job.
function BusyLoader({ model, stage, prompt, promptId }) {
  const isDemo = model === "demo";
  return (
    <div className="text-center p-6 max-w-md">
      <div className="w-10 h-10 mx-auto mb-3 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
      <div className="text-slate-200">
        {isDemo ? (stage || "Rendering demo result…") : "Sending prompt to ComfyUI…"}
      </div>
      <div className={"text-xs mt-1 " + (isDemo ? "text-amber-200/80" : "text-slate-400")}>
        {isDemo ? "Demo Mode — no GPU used, no real generation" : ("Stage: " + (stage || "talking to ComfyUI"))}
      </div>
      {promptId && (
        <div className="text-xs text-cyan-300 mt-2 font-mono break-all">
          ✓ ComfyUI accepted job: {promptId}
        </div>
      )}
      {prompt && prompt.trim() && (
        <div className="text-xs text-slate-400 mt-3 italic line-clamp-3">“{prompt}”</div>
      )}
    </div>
  );
}

// Local AI backend / generation error. Replaces the canvas content so the
// user CANNOT see a demo placeholder while in Local AI mode. Still shows
// the prompt and the uploaded media (with X to remove) so they have context.
function LocalAIErrorView({ message, prompt, uploaded, onRemoveUpload }) {
  const showUpload = !!uploaded;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center overflow-auto">
      <div className="rounded-xl bg-rose-500/15 border border-rose-400/40 px-4 py-3 max-w-md text-left">
        <div className="font-semibold text-rose-100 mb-1">⚠ Local AI backend not connected</div>
        <div className="text-xs text-rose-200/90 whitespace-pre-wrap">{message}</div>
      </div>
      {showUpload && (
        <div className="relative w-36 h-24 rounded-lg overflow-hidden border border-white/10 bg-black/30">
          {((uploaded.type && uploaded.type.startsWith("image/")) || /\.gif$/i.test(uploaded.name || "")) ? (
            <img src={uploaded.url} alt={uploaded.name} className="w-full h-full object-contain" />
          ) : (uploaded.type && uploaded.type.startsWith("video/")) ? (
            <video src={uploaded.url} className="w-full h-full object-contain" muted />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300 px-1 truncate">{uploaded.name}</div>
          )}
          <button
            onClick={onRemoveUpload}
            title="Remove uploaded media"
            aria-label="Remove uploaded media"
            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-rose-500 text-white text-xs flex items-center justify-center"
          >×</button>
        </div>
      )}
      {prompt && prompt.trim() && (
        <div className="text-xs text-slate-300 max-w-md whitespace-pre-wrap">
          <span className="text-cyan-300 font-medium mr-1">prompt:</span><span className="italic">{prompt}</span>
        </div>
      )}
    </div>
  );
}

// Shown when ComfyUI accepted the /prompt POST but our 30s poll window
// elapsed without the job appearing in /history. The job may still be
// running on the server — user can hit "Check Output Now" to re-poll.
function QueuedView({ result, prompt, uploaded, onRefresh }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-4 py-3 max-w-md">
        <div className="font-semibold text-cyan-100 mb-1">✓ ComfyUI job queued</div>
        <div className="text-xs text-cyan-100/80">
          Queued successfully. Output polling will continue when you click <em>Check Output Now</em>.
        </div>
      </div>
      <div className="text-xs font-mono text-cyan-200 bg-black/40 px-3 py-2 rounded break-all">
        prompt_id: {result.promptId}
      </div>
      <button
        onClick={onRefresh}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-400 hover:to-cyan-400 shadow-lg shadow-violet-900/40 text-sm"
      >
        🔄 Check Output Now
      </button>
      {uploaded && (
        <div className="text-xs text-slate-400">Input: <span className="text-slate-300">{uploaded.name}</span></div>
      )}
      {prompt && prompt.trim() && (
        <div className="text-xs text-slate-300 max-w-md whitespace-pre-wrap">
          <span className="text-cyan-300 font-medium mr-1">prompt:</span><span className="italic">{prompt}</span>
        </div>
      )}
      <div className="text-[11px] text-slate-500">last checked {result.generatedAt}</div>
    </div>
  );
}

function DemoResult({ result }) {
  return (
    <div className="w-full h-full relative overflow-hidden">
      <style>{`
        @keyframes drift{0%{transform:translateX(-20%)}100%{transform:translateX(120%)}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
      `}</style>
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 60% at 50% 60%, rgba(139,92,246,.5), transparent 70%), radial-gradient(40% 40% at 80% 20%, rgba(34,211,238,.4), transparent 70%)" }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ animation: "bob 3s ease-in-out infinite" }}>
        <div className="text-6xl">🌆</div>
      </div>
      <div className="absolute top-6 left-0 right-0" style={{ animation: "drift 9s linear infinite" }}>
        <div className="text-3xl">☁️</div>
      </div>
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
        <div className="bg-amber-500/20 border border-amber-400/40 text-amber-100 text-[11px] px-2 py-1 rounded backdrop-blur">
          Demo Mode · not real AI · no GPU used
        </div>
        <Badge tone="violet">Demo</Badge>
      </div>
      <div className="absolute bottom-2 left-3 right-3 text-xs text-slate-200 flex justify-between gap-3">
        <div className="truncate">
          <span className="text-slate-400">{result.style}</span>
          {result.prompt && result.prompt.trim() ? <> · {result.prompt}</> : null}
        </div>
        <div className="text-slate-400 whitespace-nowrap">{result.generatedAt}</div>
      </div>
    </div>
  );
}

function ComfyResult({ result }) {
  const [idx, setIdx] = useState(0);
  const out = result.outputs[Math.min(idx, result.outputs.length - 1)];
  return (
    <div className="w-full h-full relative bg-black/40 flex items-center justify-center">
      {out.mime.indexOf("video") === 0
        ? <video src={out.url} controls autoPlay loop className="max-w-full max-h-full" />
        : <img src={out.url} alt={out.filename} className="max-w-full max-h-full object-contain" />}
      <div className="absolute top-3 right-3 flex gap-2">
        <Badge tone="emerald">Local ComfyUI</Badge>
        {result.outputs.length > 1 && <Badge tone="violet">{idx + 1}/{result.outputs.length}</Badge>}
      </div>
      {result.outputs.length > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 flex justify-between items-center px-2 pointer-events-none">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} className="pointer-events-auto w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10">‹</button>
          <button onClick={() => setIdx(i => Math.min(result.outputs.length - 1, i + 1))} className="pointer-events-auto w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/10">›</button>
        </div>
      )}
      <div className="absolute bottom-2 left-3 right-3 text-xs text-slate-200 flex justify-between gap-3">
        <div className="truncate"><span className="text-slate-400">prompt:</span> {result.prompt}</div>
        <a href={out.url} download={out.filename} className="text-cyan-300 hover:text-cyan-200 underline whitespace-nowrap">download {out.filename}</a>
      </div>
    </div>
  );
}

/* ============================================================================
 * Stickman Asset Builder
 * ==========================================================================*/
const PART_TYPES = ["head", "eyes", "eyebrows", "nose", "ears", "mouth", "body", "arms", "legs", "feet"];
const PRESETS = ["run", "walk", "wave", "eat", "angry stomp", "flex muscles", "jump", "dance", "point"];

// Stroke width for every built-in shape — single source of truth.
const PART_STROKE = 4;

// --------------------------------------------------------------------------
// PER-SHAPE ANALYTIC BOUNDS  (part-local coords, centered around the origin)
// --------------------------------------------------------------------------
// Each case returns the SMALLEST axis-aligned rectangle that wraps the
// pixels drawBuiltinPart actually paints — derived from the same hw/hh and
// geometry the drawing code uses, with stroke pixels included. This is the
// "true rendered bounding rectangle" the editor uses for the selection box,
// hit-testing, and any future snapping.
function getShapeLocalBounds(type, w, h) {
  const hw = Math.max(1, (w - PART_STROKE) / 2); // inner half-width
  const hh = Math.max(1, (h - PART_STROKE) / 2); // inner half-height
  const s2 = PART_STROKE / 2;                     // half-stroke padding

  // Build a rect that spans ±dx, ±dy and optionally pads by half a stroke.
  const sym = (dx, dy, stroked = true) => {
    const pad = stroked ? s2 : 0;
    const swp = stroked ? PART_STROKE : 0;
    return { x: -dx - pad, y: -dy - pad, w: 2 * dx + swp, h: 2 * dy + swp };
  };

  switch (type) {
    case "head":     // stroked ellipse — radius hw × hh
      return sym(hw, hh);

    case "eyes": {   // two FILLED circles at (±hw*0.45, 0), radius r
      const r = Math.min(hw, hh) * 0.45;
      return sym(hw * 0.45 + r, r, /*stroked=*/ false);
    }

    case "eyebrows": // two stroked lines spanning ±hw and ±hh*0.5
      return sym(hw, hh * 0.5);

    case "nose":     // stroked triangle reaching ±hw, ±hh
      return sym(hw, hh);

    case "ears":     // two stroked ellipses placed at the edges (extent ±hw, ±hh)
      return sym(hw, hh);

    case "mouth": {  // stroked arc — drawn symmetrically about the origin
      const ry = Math.max(hh, 4);
      // Painted arc (in arc-center coords) spans y ∈ [ry·sin(0.15π), ry].
      // The arc center is shifted by -(sin(0.15π) + 1) / 2 · ry so the
      // painted region is centered on y = 0.
      const yExt = ((1 - Math.sin(0.15 * Math.PI)) / 2) * ry;
      const xExt = hw * Math.cos(0.15 * Math.PI);
      return {
        x: -xExt - s2,
        y: -yExt - s2,
        w: 2 * xExt + PART_STROKE,
        h: 2 * yExt + PART_STROKE,
      };
    }

    case "body":     // vertical line — stroke thickness is the x extent
      return { x: -s2, y: -hh - s2, w: PART_STROKE, h: 2 * hh + PART_STROKE };

    case "arms":     // horizontal line — stroke thickness is the y extent
      return { x: -hw - s2, y: -s2, w: 2 * hw + PART_STROKE, h: PART_STROKE };

    case "legs":     // two diagonals from (0,-hh) to (±hw, hh) — full ±hw, ±hh
      return sym(hw, hh);

    case "feet":     // two ellipses; combined paint reaches ±hw, ±hh
      return sym(hw, hh);

    default:
      return sym(hw, hh);
  }
}

// Selection rectangle = true painted bounds expanded by visual padding.
// Uploaded images: painted region is exactly the image's w × h (no stroke).
function getPartBounds(p, padding = 6) {
  const local = p.src
    ? { x: -p.w / 2, y: -p.h / 2, w: p.w, h: p.h }
    : getShapeLocalBounds(p.type, p.w, p.h);
  return {
    x: local.x - padding,
    y: local.y - padding,
    w: local.w + padding * 2,
    h: local.h + padding * 2,
  };
}

// Hit-test rect = painted region with NO padding (clicks land on the shape).
function getPartHitRect(p) {
  return p.src
    ? { x: -p.w / 2, y: -p.h / 2, w: p.w, h: p.h }
    : getShapeLocalBounds(p.type, p.w, p.h);
}

// World-space hit-test for a (possibly rotated) part. Reverses the part's
// translate + rotation, then checks the analytic local rect — so the click
// is tested against the TRUE TRANSFORMED bounds of the rendered shape.
function hitTestPart(p, worldX, worldY) {
  const dx = worldX - p.x;
  const dy = worldY - p.y;
  const a  = -((p.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  const b  = getPartHitRect(p);
  return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
}

// World-space axis-aligned bounding box for a part. Transforms the four
// corners of the part-local bounds through rotate + translate, then takes
// the min/max — used for marquee selection (intersection vs. the curtain).
function getPartWorldAabb(p) {
  const local = p.src
    ? { x: -p.w / 2, y: -p.h / 2, w: p.w, h: p.h }
    : getShapeLocalBounds(p.type, p.w, p.h);
  const rot = ((p.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const xs = [], ys = [];
  for (const c of [
    { x: local.x,             y: local.y },
    { x: local.x + local.w,   y: local.y },
    { x: local.x,             y: local.y + local.h },
    { x: local.x + local.w,   y: local.y + local.h },
  ]) {
    xs.push(c.x * cos - c.y * sin + p.x);
    ys.push(c.x * sin + c.y * cos + p.y);
  }
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function rectsIntersect(a, b) {
  return !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
}

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

// Draw a built-in stickman part CENTERED at the local origin (0, 0).
// The caller has already translated to (p.x, p.y) and rotated around it,
// so every shape here is symmetric about the origin and fills its
// w × h bounding box. NO internal translate.
function drawBuiltinPart(ctx, type, w, h) {
  ctx.save();
  ctx.lineWidth = PART_STROKE;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#e2e8f0";
  ctx.fillStyle = "#e2e8f0";

  // Half-extents shrunk by half the stroke so the painted stroke stays
  // inside the bounding box.
  const hw = Math.max(1, (w - PART_STROKE) / 2);
  const hh = Math.max(1, (h - PART_STROKE) / 2);

  switch (type) {
    case "head":
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;

    case "eyes": {
      const r = Math.min(hw, hh) * 0.45;
      ctx.beginPath(); ctx.arc(-hw * 0.45, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc( hw * 0.45, 0, r, 0, Math.PI * 2); ctx.fill();
      break;
    }

    case "eyebrows":
      ctx.beginPath(); ctx.moveTo(-hw,        hh * 0.5); ctx.lineTo(-hw * 0.1, -hh * 0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( hw * 0.1, -hh * 0.5); ctx.lineTo( hw,        hh * 0.5); ctx.stroke();
      break;

    case "nose":
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(-hw,  hh);
      ctx.lineTo( hw,  hh);
      ctx.closePath();
      ctx.stroke();
      break;

    case "ears": {
      const er = Math.min(hw * 0.5, hh);
      ctx.beginPath(); ctx.ellipse(-hw + er, 0, er, hh, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse( hw - er, 0, er, hh, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }

    case "mouth": {
      // Arc spans 0.15π → 0.85π. Shifting the ellipse center upward by
      // (sin(0.15π) + 1) / 2 · ry puts the painted arc symmetrically about
      // y = 0 so the selection box wraps it evenly on all sides.
      const ry = Math.max(hh, 4);
      const yShift = -((Math.sin(0.15 * Math.PI) + 1) / 2) * ry;
      ctx.beginPath();
      ctx.ellipse(0, yShift, hw, ry, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      break;
    }

    case "body":
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0,  hh);
      ctx.stroke();
      break;

    case "arms":
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.lineTo( hw, 0);
      ctx.stroke();
      break;

    case "legs":
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(-hw,  hh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo( hw,  hh); ctx.stroke();
      break;

    case "feet": {
      const fw = hw * 0.45;
      ctx.beginPath(); ctx.ellipse(-hw + fw, 0, fw, hh, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse( hw - fw, 0, fw, hh, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }

    default:
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  }
  ctx.restore();
}

function defaultStickman() {
  const u = () => crypto.randomUUID();
  // (x, y) is the TRUE visual CENTER of each part. The canvas pipeline does:
  //   translate(p.x, p.y) → rotate(p.rot) → drawBuiltinPart  → centered art
  return [
    { id: u(), type: "body",     x: 300, y: 270, w:   4, h: 140, rot: 0, src: null },
    { id: u(), type: "head",     x: 300, y: 160, w:  80, h:  80, rot: 0, src: null },
    { id: u(), type: "eyebrows", x: 300, y: 140, w:  50, h:  10, rot: 0, src: null },
    { id: u(), type: "eyes",     x: 300, y: 155, w:  44, h:  10, rot: 0, src: null },
    { id: u(), type: "mouth",    x: 300, y: 182, w:  34, h:  12, rot: 0, src: null },
    { id: u(), type: "arms",     x: 300, y: 240, w: 140, h:   4, rot: 0, src: null },
    { id: u(), type: "legs",     x: 300, y: 380, w:  80, h:  80, rot: 0, src: null },
    { id: u(), type: "feet",     x: 300, y: 426, w:  90, h:  14, rot: 0, src: null },
  ];
}

function FrameThumb({ frame }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.scale(c.width / 600, c.height / 500);
    frame.parts.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot || 0) * Math.PI / 180);
      drawBuiltinPart(ctx, p.type, p.w, p.h);
      ctx.restore();
    });
    ctx.restore();
  }, [frame]);
  return <canvas ref={ref} width={120} height={78} className="w-full h-full" />;
}

function StickmanBuilder() {
  const W = 600, H = 500;
  const canvasRef = useRef(null);
  const imgCache = useRef(new Map());

  const [library, setLibrary] = useState(() => {
    try { return JSON.parse(localStorage.getItem("laias.library") || "{}"); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem("laias.library", JSON.stringify(library)); } catch (_) {} }, [library]);

  const [libTab, setLibTab] = useState("head");
  const [frames, setFrames] = useState([{ id: crypto.randomUUID(), parts: defaultStickman() }]);
  const [active, setActive] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]); // array of selected part ids (multi-select)
  const [drag, setDrag] = useState(null);              // { startX, startY, starts: { [id]: {x, y} } }
  const [marquee, setMarquee] = useState(null);        // { x0, y0, x1, y1, additive } | null
  const [dragFrame, setDragFrame] = useState(null);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [onion, setOnion] = useState(true);
  const [presets, setPresets] = useState(() => { try { return JSON.parse(localStorage.getItem("laias.presets") || "{}"); } catch { return {}; } });
  const [gifBusy, setGifBusy] = useState(false);

  const frame = frames[active];

  const drawFrame = useCallback((ctx, f, selectedSet) => {
    f.parts.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot || 0) * Math.PI / 180);
      if (p.src) {
        let im = imgCache.current.get(p.src);
        if (!im) {
          im = new Image();
          im.src = p.src;
          imgCache.current.set(p.src, im);
        }
        if (im && im.complete && im.naturalWidth) ctx.drawImage(im, -p.w / 2, -p.h / 2, p.w, p.h);
        else drawBuiltinPart(ctx, p.type, p.w, p.h);
      } else {
        drawBuiltinPart(ctx, p.type, p.w, p.h);
      }
      if (selectedSet && selectedSet.has(p.id)) {
        const b = getPartBounds(p);
        ctx.strokeStyle = "#a78bfa";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    if (onion && active > 0) { ctx.globalAlpha = 0.18; drawFrame(ctx, frames[active - 1]); ctx.globalAlpha = 1; }
    const sel = new Set(selectedIds);
    drawFrame(ctx, frame, sel);
    // Marquee (curtain) selection rectangle — drawn above parts, below DOM controls.
    if (marquee) {
      const r = normalizeRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
      if (r.w > 0.5 && r.h > 0.5) {
        ctx.save();
        ctx.fillStyle = "rgba(167, 139, 250, 0.12)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = "#a78bfa";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }, [frame, frames, active, onion, selectedIds, marquee, drawFrame]);

  useEffect(() => { draw(); }, [draw]);

  // Force redraw once any newly-uploaded image finishes loading.
  useEffect(() => {
    const all = new Set();
    frames.forEach(f => f.parts.forEach(p => p.src && all.add(p.src)));
    let cancelled = false;
    all.forEach(src => {
      let im = imgCache.current.get(src);
      if (!im) {
        im = new Image();
        im.src = src;
        imgCache.current.set(src, im);
      }
      if (!im.complete) im.addEventListener("load", () => { if (!cancelled) draw(); }, { once: true });
    });
    return () => { cancelled = true; };
  }, [frames, draw]);

  // Keyboard: arrow keys nudge selection, Delete/Backspace removes it.
  // Ignored while the user is typing in an input/textarea/select so the
  // prompt textarea and number fields keep working normally.
  useEffect(() => {
    const onKey = (e) => {
      if (!selectedIds.length) return;
      const el = document.activeElement;
      const tag = el && el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const ids = new Set(selectedIds);
        setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: f.parts.filter(p => !ids.has(p.id)) } : f));
        setSelectedIds([]);
        return;
      }

      const step = e.shiftKey ? 10 : 1; // hold Shift for 10px nudges
      let dx = 0, dy = 0;
      if      (e.key === "ArrowUp")    dy = -step;
      else if (e.key === "ArrowDown")  dy =  step;
      else if (e.key === "ArrowLeft")  dx = -step;
      else if (e.key === "ArrowRight") dx =  step;
      else return;

      e.preventDefault(); // stop the page from scrolling
      const ids = new Set(selectedIds);
      setFrames(fs => fs.map((f, i) => {
        if (i !== active) return f;
        return { ...f, parts: f.parts.map(p => ids.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p) };
      }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, active]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setActive(a => { const next = a + 1; if (next >= frames.length) return loop ? 0 : a; return next; });
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [playing, fps, frames.length, loop]);

  const updatePart = (id, patch) =>
    setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: f.parts.map(p => p.id === id ? { ...p, ...patch } : p) } : f));

  // Slider helper: apply the delta (newValue - first-selected's current value) to
  // EVERY selected part. For single selection this is identical to setting the
  // value directly. For multi-selection it preserves the spread between parts.
  const applyDelta = (key, newValue) => {
    if (!selectedIds.length) return;
    const first = frame.parts.find(p => p.id === selectedIds[0]);
    if (!first) return;
    const delta = newValue - (first[key] || 0);
    if (delta === 0) return;
    const idSet = new Set(selectedIds);
    setFrames(fs => fs.map((f, i) => {
      if (i !== active) return f;
      return {
        ...f,
        parts: f.parts.map(p => {
          if (!idSet.has(p.id)) return p;
          if (key === "rot") return { ...p, rot: (p.rot || 0) + delta };
          return { ...p, [key]: Math.max(10, (p[key] || 0) + delta) };
        }),
      };
    }));
  };

  // Move every selected part by (dx, dy). Used by arrow keys and group drag.
  const moveSelectedBy = (dx, dy) => {
    if (!selectedIds.length) return;
    const idSet = new Set(selectedIds);
    setFrames(fs => fs.map((f, i) => {
      if (i !== active) return f;
      return { ...f, parts: f.parts.map(p => idSet.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p) };
    }));
  };

  // Send all selected back / bring all selected forward.
  // - Single selection → one step (preserves the original feel).
  // - Multi selection  → group goes all the way to the back / front.
  const layerOp = (op) => {
    if (!selectedIds.length) return;
    const idSet = new Set(selectedIds);
    setFrames(fs => fs.map((f, i) => {
      if (i !== active) return f;
      if (selectedIds.length === 1) {
        const id = selectedIds[0];
        const idx = f.parts.findIndex(p => p.id === id);
        if (idx < 0) return f;
        const arr = [...f.parts]; const [p] = arr.splice(idx, 1);
        if (op === "forward")   arr.splice(Math.min(arr.length, idx + 1), 0, p);
        else if (op === "back") arr.splice(Math.max(0, idx - 1), 0, p);
        return { ...f, parts: arr };
      }
      const selectedParts = f.parts.filter(p => idSet.has(p.id));
      const rest          = f.parts.filter(p => !idSet.has(p.id));
      if (op === "back")    return { ...f, parts: [...selectedParts, ...rest] };
      if (op === "forward") return { ...f, parts: [...rest, ...selectedParts] };
      return f;
    }));
  };

  // Duplicate every selected part (fresh IDs, +15px offset), then move
  // selection onto the new copies. Copies and IDs are computed BEFORE the
  // setFrames updater so a StrictMode double-invocation can't double-push.
  const duplicateSelected = () => {
    if (!selectedIds.length) return;
    const idSet  = new Set(selectedIds);
    const sources = frame.parts.filter(p => idSet.has(p.id));
    if (!sources.length) return;
    const copies  = sources.map(p => ({ ...p, id: crypto.randomUUID(), x: p.x + 15, y: p.y + 15 }));
    const newIds  = copies.map(c => c.id);
    setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: [...f.parts, ...copies] } : f));
    setSelectedIds(newIds);
  };

  const deleteSelected = () => {
    if (!selectedIds.length) return;
    const idSet = new Set(selectedIds);
    setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: f.parts.filter(p => !idSet.has(p.id)) } : f));
    setSelectedIds([]);
  };

  const addPart = (type, src = null, pos = null) => {
    const lib = library[type] || [];
    const finalSrc = src != null ? src : (lib.length ? lib[lib.length - 1].src : null);
    const np = { id: crypto.randomUUID(), type, x: pos ? pos.x : 300, y: pos ? pos.y : 250, w: 120, h: 120, rot: 0, src: finalSrc };
    setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: [...f.parts, np] } : f));
    setSelectedIds([np.id]);
  };

  const canvasCoords = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height),
    };
  };

  const onMouseDown = (e) => {
    const { x, y } = canvasCoords(e);
    const hit = [...frame.parts].reverse().find(p => hitTestPart(p, x, y));
    if (hit) {
      // Decide the new selection.
      let nextSelected;
      if (e.shiftKey) {
        // Shift+click toggles membership; no drag (just adjusts selection).
        nextSelected = selectedIds.includes(hit.id)
          ? selectedIds.filter(id => id !== hit.id)
          : [...selectedIds, hit.id];
        setSelectedIds(nextSelected);
        return;
      }
      if (!selectedIds.includes(hit.id)) {
        // Clicking outside the current selection — replace it.
        nextSelected = [hit.id];
      } else {
        // Clicking on an already-selected part — keep the whole group for drag.
        nextSelected = selectedIds;
      }
      setSelectedIds(nextSelected);
      // Record start positions for every selected part so they all move together.
      const starts = {};
      frame.parts.forEach(p => { if (nextSelected.includes(p.id)) starts[p.id] = { x: p.x, y: p.y }; });
      setDrag({ startX: x, startY: y, starts });
    } else {
      // Click on empty canvas — start a marquee. Shift makes it additive.
      if (!e.shiftKey) setSelectedIds([]);
      setMarquee({ x0: x, y0: y, x1: x, y1: y, additive: e.shiftKey });
    }
  };

  const onMouseMove = (e) => {
    if (!drag && !marquee) return;
    const { x, y } = canvasCoords(e);
    if (drag) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      setFrames(fs => fs.map((f, i) => {
        if (i !== active) return f;
        return {
          ...f,
          parts: f.parts.map(p => drag.starts[p.id]
            ? { ...p, x: drag.starts[p.id].x + dx, y: drag.starts[p.id].y + dy }
            : p),
        };
      }));
    } else if (marquee) {
      setMarquee(m => m && { ...m, x1: x, y1: y });
    }
  };

  const onMouseUp = () => {
    if (marquee) {
      const r = normalizeRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
      // Treat anything bigger than 3px as an intentional marquee drag.
      if (r.w > 3 || r.h > 3) {
        const hits = frame.parts
          .filter(p => rectsIntersect(getPartWorldAabb(p), r))
          .map(p => p.id);
        setSelectedIds(prev => marquee.additive
          ? Array.from(new Set([...prev, ...hits]))
          : hits);
      }
      setMarquee(null);
    }
    setDrag(null);
  };
  const onDragOver = (e) => { if (e.dataTransfer.types.includes("application/x-laias-part")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } };
  const onDrop = (e) => {
    const raw = e.dataTransfer.getData("application/x-laias-part");
    if (!raw) return;
    e.preventDefault();
    let pl; try { pl = JSON.parse(raw); } catch { return; }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    addPart(pl.type, pl.src, { x, y });
  };

  const uploadPart = (type) => async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const items = await Promise.all(files.map(f => new Promise(res => {
      const r = new FileReader();
      r.onload = () => res({ id: crypto.randomUUID(), src: r.result, name: f.name });
      r.readAsDataURL(f);
    })));
    setLibrary(L => ({ ...L, [type]: [...(L[type] || []), ...items] }));
    e.target.value = "";
  };
  const deleteLibItem = (type, id) => setLibrary(L => ({ ...L, [type]: (L[type] || []).filter(i => i.id !== id) }));
  const uploadFrameSheet = (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    Promise.all(files.map(f => new Promise(res => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f);
    }))).then(srcs => {
      const newFrames = srcs.map(s => ({
        id: crypto.randomUUID(),
        parts: [{ id: crypto.randomUUID(), type: "body", x: 300, y: 250, w: 300, h: 300, rot: 0, src: s }],
      }));
      setFrames(fs => [...fs, ...newFrames]);
    });
    e.target.value = "";
  };

  const addFrame = () => {
    setFrames(fs => [...fs.slice(0, active + 1), { id: crypto.randomUUID(), parts: [] }, ...fs.slice(active + 1)]);
    setActive(a => a + 1); setSelectedIds([]);
  };
  const duplicateFrame = () => {
    setFrames(fs => {
      const src = fs[active];
      const copy = { id: crypto.randomUUID(), parts: src.parts.map(p => ({ ...p, id: crypto.randomUUID() })) };
      return [...fs.slice(0, active + 1), copy, ...fs.slice(active + 1)];
    });
    setActive(a => a + 1); setSelectedIds([]);
  };
  const deleteFrame = () => {
    if (frames.length <= 1) return;
    setFrames(fs => fs.filter((_, i) => i !== active));
    setActive(a => Math.max(0, a - 1)); setSelectedIds([]);
  };
  const moveFrame = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;
    setFrames(fs => { const arr = [...fs]; const [f] = arr.splice(from, 1); arr.splice(to, 0, f); return arr; });
    setActive(to);
  };

  const applyPresetAnim = (name) => {
    const base = JSON.parse(JSON.stringify(frame.parts));
    const out = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const parts = base.map(p => {
        const np = { ...p, id: crypto.randomUUID() };
        switch (name) {
          case "walk":
          case "run":
            if (p.type === "legs") np.rot = Math.sin(t * Math.PI * 2) * (name === "run" ? 35 : 18);
            if (p.type === "arms") np.rot = -Math.sin(t * Math.PI * 2) * (name === "run" ? 35 : 15);
            if (p.type === "body") np.y = p.y + Math.abs(Math.sin(t * Math.PI * 2)) * -6;
            break;
          case "wave":  if (p.type === "arms") np.rot = -60 + Math.sin(t * Math.PI * 2) * 15; break;
          case "eat":   if (p.type === "mouth") np.h = p.h * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 4)));
                        if (p.type === "arms") np.rot = -30; break;
          case "angry stomp": if (p.type === "legs") np.rot = i % 2 === 0 ? 20 : -20;
                              if (p.type === "body") np.y = p.y + (i % 2 === 0 ? -4 : 4); break;
          case "flex muscles": if (p.type === "arms") { np.rot = i % 2 ? -40 : 40; np.h = p.h * 1.5; } break;
          case "jump":  np.y = p.y - Math.sin(t * Math.PI) * 40; break;
          case "dance": if (p.type === "body") np.rot = Math.sin(t * Math.PI * 2) * 10;
                        if (p.type === "arms") np.rot = Math.sin(t * Math.PI * 2 + 1) * 25;
                        if (p.type === "legs") np.rot = Math.sin(t * Math.PI * 2 + 2) * 10; break;
          case "point": if (p.type === "arms") np.rot = -20 - i * 2; break;
        }
        return np;
      });
      out.push({ id: crypto.randomUUID(), parts });
    }
    setFrames(out); setActive(0); setSelectedIds([]);
  };

  const savePreset = () => {
    const name = window.prompt("Preset name:"); if (!name) return;
    const next = { ...presets, [name]: frame.parts };
    setPresets(next); localStorage.setItem("laias.presets", JSON.stringify(next));
  };
  const loadPreset = (name) => {
    const parts = presets[name]; if (!parts) return;
    setFrames(fs => fs.map((f, i) => i === active ? { ...f, parts: JSON.parse(JSON.stringify(parts)) } : f));
  };
  const saveProject = () => {
    localStorage.setItem("laias.project", JSON.stringify({ frames, fps, loop }));
    alert("Project saved to browser local storage.");
  };
  const loadProject = () => {
    const d = JSON.parse(localStorage.getItem("laias.project") || "null");
    if (!d) return alert("No saved project.");
    setFrames(d.frames); setFps(d.fps || 8); setLoop(!!d.loop); setActive(0);
  };

  const renderFrameToCanvas = (f) => {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    drawFrame(c.getContext("2d"), f);
    return c;
  };
  const exportPNG = () => {
    const c = renderFrameToCanvas(frame);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "stickman-frame-" + (active + 1) + "-transparent.png";
    a.click();
  };
  const exportPNGSequence = async () => {
    for (let i = 0; i < frames.length; i++) {
      const c = renderFrameToCanvas(frames[i]);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = "stickman-" + String(i + 1).padStart(3, "0") + "-transparent.png";
      document.body.appendChild(a); a.click(); a.remove();
      await new Promise(r => setTimeout(r, 150));
    }
  };
  const exportSpriteSheet = () => {
    const cols = Math.min(frames.length, 6);
    const rows = Math.ceil(frames.length / cols);
    const c = document.createElement("canvas");
    c.width = cols * W; c.height = rows * H;
    const ctx = c.getContext("2d");
    frames.forEach((f, i) => { const fc = renderFrameToCanvas(f); ctx.drawImage(fc, (i % cols) * W, Math.floor(i / cols) * H); });
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "stickman-sprite-sheet.png";
    a.click();
  };
  const exportGIF = () => {
    if (frames.length < 2) return alert("Add at least 2 frames before exporting a GIF.");
    const GIF = window.GIF;
    if (typeof GIF === "undefined") return alert("GIF library failed to load.");
    setGifBusy(true);
    const gif = new GIF({
      workers: 2, quality: 8, width: W, height: H, transparent: null,
      workerScript: "https://cdn.jsdelivr.net/gh/jnordberg/gif.js@0.2.0/dist/gif.worker.js",
    });
    frames.forEach(f => gif.addFrame(renderFrameToCanvas(f), { delay: 1000 / fps }));
    gif.on("finished", blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stickman-" + frames.length + "f-" + fps + "fps.gif";
      document.body.appendChild(a); a.click(); a.remove();
      setGifBusy(false);
    });
    gif.render();
  };

  // First-selected part (used to seed slider current values).
  const sel = selectedIds.length ? frame.parts.find(p => p.id === selectedIds[0]) : null;
  const totalAssets = Object.values(library).reduce((n, a) => n + (a ? a.length : 0), 0);

  return (
    <section id="stickman" className="max-w-7xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2 font-medium">Builder</div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Stickman Asset Builder</h2>
        <p className="text-slate-300 mt-2 max-w-3xl">Upload transparent PNG parts (or use the built-in shapes), drag them onto the canvas, resize/rotate, and animate frame-by-frame. Everything stays in your browser.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Asset Library */}
        <Card className="xl:col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-white">Asset Library</h4>
            <Badge tone="violet">{totalAssets} assets</Badge>
          </div>
          <p className="text-xs text-slate-400 mb-2">Drag a thumbnail onto the canvas, or click to add it.</p>

          <div className="flex flex-wrap gap-1 mb-3">
            {PART_TYPES.map(t => {
              const count = (library[t] || []).length;
              return (
                <button key={t} onClick={() => setLibTab(t)}
                  className={"text-xs px-2 py-1 rounded-full border capitalize transition " +
                    (libTab === t
                      ? "bg-violet-500/20 text-violet-200 border-violet-400/40"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10")}>
                  {t}{count ? <span className="ml-1 opacity-70">·{count}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 mb-2">
            <GhostBtn onClick={() => addPart(libTab)}>+ Add {libTab}</GhostBtn>
            <label className="text-xs px-2 py-1 rounded text-white bg-white/10 border border-white/20 hover:bg-white/20 cursor-pointer">
              ⬆ Upload
              <input type="file" accept="image/png,image/gif,image/webp" multiple className="hidden" onChange={uploadPart(libTab)} />
            </label>
          </div>

          <InnerCard className="p-2 min-h-[120px] max-h-[260px] overflow-auto scroll-thin">
            {(library[libTab] || []).length === 0 ? (
              <label className="cursor-pointer h-[110px] rounded-lg border border-dashed border-white/15 hover:border-violet-400/50 flex items-center justify-center text-center text-xs text-slate-400 hover:bg-white/5 transition">
                <span>
                  <div className="text-lg text-violet-300">⬆</div>
                  <div>No <span className="capitalize text-slate-300">{libTab}</span> assets yet</div>
                  <div className="text-slate-500">Click to upload transparent PNGs</div>
                </span>
                <input type="file" accept="image/png,image/gif,image/webp" multiple className="hidden" onChange={uploadPart(libTab)} />
              </label>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {(library[libTab] || []).map(item => (
                  <div key={item.id} draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("application/x-laias-part", JSON.stringify({ type: libTab, src: item.src }));
                    }}
                    onClick={() => addPart(libTab, item.src)}
                    className="group relative rounded-lg border border-white/10 hover:border-violet-400/50 cursor-grab active:cursor-grabbing canvas-bg transition">
                    <img src={item.src} alt={item.name || libTab} className="w-full h-16 object-contain p-1 pointer-events-none" />
                    <button onClick={(e) => { e.stopPropagation(); deleteLibItem(libTab, item.id); }}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500/80 text-white text-xs opacity-0 group-hover:opacity-100 transition">×</button>
                  </div>
                ))}
              </div>
            )}
          </InnerCard>

          <label className="block mt-3 text-xs px-2 py-2 rounded-lg text-white bg-white/10 border border-white/20 hover:bg-white/20 cursor-pointer text-center transition">
            Upload frames (each image = new frame)
            <input type="file" accept="image/*" multiple className="hidden" onChange={uploadFrameSheet} />
          </label>
          <p className="text-xs text-slate-400 mt-1">Library is saved in your browser (localStorage).</p>
        </Card>

        {/* Canvas + Timeline */}
        <Card className="xl:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-white">Canvas · Frame {active + 1}/{frames.length} <span className="ml-2 text-xs font-normal text-slate-400">drop assets here ↓</span></h4>
            <div className="flex items-center gap-3 text-xs">
              <label className="text-slate-300 flex items-center gap-1"><input type="checkbox" checked={onion} onChange={e => setOnion(e.target.checked)} /> Onion skin</label>
              <label className="text-slate-300 flex items-center gap-1"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop</label>
            </div>
          </div>

          <InnerCard className="overflow-hidden">
            <canvas ref={canvasRef} width={W} height={H}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
              onDragOver={onDragOver} onDrop={onDrop}
              style={{ display: "block", width: "100%", height: "auto", cursor: drag ? "grabbing" : "grab" }}
              className="canvas-bg" />
          </InnerCard>

          {sel ? (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="text-xs text-slate-300">Width <input type="range" min="10" max="400" value={sel.w} onChange={e => applyDelta("w", +e.target.value)} className="w-full" /></label>
              <label className="text-xs text-slate-300">Height <input type="range" min="10" max="400" value={sel.h} onChange={e => applyDelta("h", +e.target.value)} className="w-full" /></label>
              <label className="text-xs text-slate-300">Rotation <input type="range" min="-180" max="180" value={sel.rot} onChange={e => applyDelta("rot", +e.target.value)} className="w-full" /></label>
              <div className="flex flex-wrap items-end gap-1">
                <GhostBtn onClick={() => layerOp("back")}>Send Back</GhostBtn>
                <GhostBtn onClick={() => layerOp("forward")}>Bring Forward</GhostBtn>
                <GhostBtn onClick={duplicateSelected}>Duplicate</GhostBtn>
                <DangerBtn onClick={deleteSelected}>Delete</DangerBtn>
              </div>
              {selectedIds.length > 1 && (
                <div className="col-span-2 md:col-span-4 flex items-center justify-between text-xs">
                  <span className="text-cyan-300 font-medium">{selectedIds.length} parts selected</span>
                  <span className="text-slate-400">Sliders apply to all · arrow keys to nudge (Shift+arrow = 10px)</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-3">
              Click a part to select it. <span className="text-slate-300">Shift+click</span> adds/removes. Drag from empty space to marquee-select. Arrow keys nudge (Shift = 10px). Delete to remove.
            </p>
          )}

          <InnerCard className="mt-4 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">Timeline</span>
                <Badge tone="slate">{frames.length} frame{frames.length === 1 ? "" : "s"}</Badge>
                <Badge tone="violet">Frame {active + 1}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <GhostBtn onClick={addFrame}>+ Add</GhostBtn>
                <GhostBtn onClick={duplicateFrame}>⎘ Duplicate</GhostBtn>
                <DangerBtn disabled={frames.length <= 1} onClick={deleteFrame}>🗑 Delete</DangerBtn>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <GhostBtn onClick={() => setActive(a => Math.max(0, a - 1))}>◀</GhostBtn>
              <PrimaryBtn className="px-3 py-1 text-xs" onClick={() => setPlaying(p => !p)}>{playing ? "⏸ Pause" : "▶ Play"}</PrimaryBtn>
              <GhostBtn onClick={() => setActive(a => Math.min(frames.length - 1, a + 1))}>▶</GhostBtn>

              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-cyan-300 font-medium">FPS</span>
                <input type="range" min="1" max="30" value={fps} onChange={e => setFps(+e.target.value)} className="w-28" />
                <input type="number" min="1" max="60" value={fps} onChange={e => setFps(Math.max(1, Math.min(60, +e.target.value || 1)))} className="w-14 bg-black/30 border border-white/10 rounded px-1 py-0.5 text-xs text-white" />
              </div>

              <div className="ml-auto text-xs text-slate-400">~{(frames.length / fps).toFixed(2)}s @ {fps}fps</div>
            </div>

            <div className="flex gap-2 overflow-x-auto scroll-thin pb-2">
              {frames.map((f, i) => (
                <div key={f.id} draggable
                  onDragStart={(e) => { setDragFrame(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("application/x-laias-frame", String(i)); }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("application/x-laias-frame")) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
                  onDrop={(e) => { const raw = e.dataTransfer.getData("application/x-laias-frame"); if (!raw) return; e.preventDefault(); const from = parseInt(raw, 10); if (!isNaN(from)) moveFrame(from, i); setDragFrame(null); }}
                  onDragEnd={() => setDragFrame(null)}
                  onClick={() => { setActive(i); setSelectedIds([]); }}
                  style={{ width: 120, height: 78 }}
                  className={"shrink-0 relative rounded-lg border-2 cursor-pointer overflow-hidden transition " +
                    (i === active ? "border-violet-400 shadow-lg shadow-violet-500/40" : "border-white/10 hover:border-white/30") +
                    (dragFrame === i ? " opacity-50" : "")}>
                  <div className="absolute inset-0 canvas-bg"><FrameThumb frame={f} /></div>
                  <span className="absolute top-1 left-1 text-xs px-1.5 py-0.5 bg-black/70 rounded text-slate-200">{i + 1}</span>
                </div>
              ))}
              <button onClick={addFrame} style={{ width: 120, height: 78 }}
                className="shrink-0 flex items-center justify-center rounded-lg border-2 border-dashed border-white/15 hover:border-violet-400/50 text-slate-400 hover:text-violet-300 text-2xl transition">+</button>
            </div>
          </InnerCard>
        </Card>

        {/* Presets + Export */}
        <Card className="xl:col-span-1">
          <h4 className="font-semibold text-white mb-2">Presets & Export</h4>
          <p className="text-xs text-slate-400 mb-3">Frame controls and playback are on the timeline strip below the canvas.</p>

          <details className="rounded-lg bg-white/5 border border-white/10 p-2 mb-2">
            <summary className="text-xs text-violet-300 font-medium cursor-pointer">Preset Animations</summary>
            <div className="flex flex-wrap gap-1 mt-2">
              {PRESETS.map(p => <GhostBtn key={p} className="capitalize" onClick={() => applyPresetAnim(p)}>{p}</GhostBtn>)}
            </div>
          </details>

          <details className="rounded-lg bg-white/5 border border-white/10 p-2 mb-2">
            <summary className="text-xs text-violet-300 font-medium cursor-pointer">Character Presets</summary>
            <div className="flex flex-wrap gap-1 mt-2">
              <GhostBtn className="bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25" onClick={savePreset}>Save Current</GhostBtn>
              {Object.keys(presets).map(n => <GhostBtn key={n} onClick={() => loadPreset(n)}>{n}</GhostBtn>)}
            </div>
          </details>

          <details className="rounded-lg bg-white/5 border border-white/10 p-2 mb-2">
            <summary className="text-xs text-violet-300 font-medium cursor-pointer">Project</summary>
            <div className="flex gap-1 mt-2">
              <GhostBtn className="bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25" onClick={saveProject}>Save</GhostBtn>
              <GhostBtn onClick={loadProject}>Load</GhostBtn>
            </div>
          </details>

          <details className="rounded-lg bg-white/5 border border-white/10 p-2" open>
            <summary className="text-xs text-violet-300 font-medium cursor-pointer">Export</summary>
            <div className="grid grid-cols-2 gap-1 mt-2">
              <GhostBtn className="bg-emerald-500/15 border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/25" onClick={exportPNG}>Transparent PNG</GhostBtn>
              <GhostBtn onClick={exportPNGSequence}>PNG Sequence</GhostBtn>
              <GhostBtn onClick={exportSpriteSheet}>Sprite Sheet</GhostBtn>
              <GhostBtn disabled={gifBusy} className="bg-gradient-to-r from-violet-500/40 to-cyan-500/40 border-violet-400/40 text-white hover:from-violet-500/60 hover:to-cyan-500/60" onClick={exportGIF}>{gifBusy ? "Rendering…" : "Animated GIF"}</GhostBtn>
            </div>
          </details>
        </Card>
      </div>
    </section>
  );
}

/* ============================================================================
 * Local AI Setup
 * ==========================================================================*/
const LOCAL_BACKENDS = [
  { name: "ComfyUI",                desc: "Node-based local pipeline. Recommended entry point.",      link: "https://github.com/comfyanonymous/ComfyUI" },
  { name: "AnimateDiff",            desc: "Motion module for Stable Diffusion. Short looping clips.", link: "https://github.com/guoyww/AnimateDiff" },
  { name: "Stable Video Diffusion", desc: "Image-to-video model from Stability.",                     link: "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid" },
  { name: "Wan Video",              desc: "Open video model. Heavier VRAM requirements.",             link: "#" },
  { name: "FFmpeg",                 desc: "Required for encoding GIF/MP4 outputs locally.",           link: "https://ffmpeg.org" },
];
// One step in the Local AI Setup quick-start checklist.
function ChecklistStep({ number, title, subtitle, children }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-white font-bold flex items-center justify-center shrink-0 shadow-lg shadow-violet-900/40">{number}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-white">{title}</h4>
            {subtitle && <Badge tone="slate">{subtitle}</Badge>}
          </div>
          <div className="mt-2 text-sm text-slate-300 space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Monospace code block used inside the checklist + desktop shortcut sections.
function CodeBlock({ children }) {
  return (
    <pre className="text-xs font-mono bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto text-slate-200 whitespace-pre-wrap break-words">{children}</pre>
  );
}

function ConnectionBadge({ status }) {
  if (status === "connected")    return <Badge tone="emerald">● Connected</Badge>;
  if (status === "disconnected") return <Badge tone="rose">● Not Connected</Badge>;
  if (status === "testing")      return <Badge tone="cyan">● Testing…</Badge>;
  return <Badge tone="slate">● Not Tested</Badge>;
}

function LocalAISetup({ onOpenSettings, settings, updateSettings, connection, runTest }) {
  // Workflow upload — same logic as the Settings modal, exposed inline.
  const onWorkflow = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!isApiFormat(json)) {
          alert('"' + f.name + '" looks like the ComfyUI UI workflow format, not the API format.\n\nIn ComfyUI: enable Dev mode in Settings, then click "Save (API Format)".');
          return;
        }
        updateSettings({ workflow: json, workflowName: f.name });
      } catch (err) {
        alert("Could not parse workflow JSON: " + err.message);
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };
  const clearWorkflow = () => updateSettings({ workflow: null, workflowName: "" });

  // "Create Test Workflow" — drops in a standard SD 1.5 text-to-image graph
  // so the user can confirm the round-trip works before bringing their own.
  // Requires that the ComfyUI install has v1-5-pruned-emaonly.ckpt available;
  // the user will get a clear ComfyUI error if it's missing.
  const loadTestWorkflow = () => {
    updateSettings({
      workflow:     JSON.parse(JSON.stringify(TEST_WORKFLOW)),
      workflowName: "animiko-test-text2img.json",
    });
  };

  const status = (connection && connection.status) || "untested";
  const statusBoxClass =
    status === "connected"    ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-200" :
    status === "disconnected" ? "bg-rose-500/10 border-rose-400/30 text-rose-200" :
    status === "testing"      ? "bg-cyan-500/10 border-cyan-400/30 text-cyan-200" :
                                "bg-white/5 border-white/10 text-slate-300";

  return (
    <section id="local-ai" className="max-w-7xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2 font-medium">Backend</div>
        <h2 className="text-2xl md:text-3xl font-bold text-white">Local AI Setup</h2>
        <p className="text-slate-300 mt-2 max-w-3xl">
          Connect a local ComfyUI server (running on your own machine) to use real AI generation.
          Nothing leaves your computer — the hosted dashboard talks to <span className="font-mono text-cyan-300">localhost</span> directly from your browser.
        </p>
      </div>

      {/* Hosted-deployment note */}
      <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <div className="font-semibold text-amber-200 mb-1">⚠ Animiko is LOCAL-ONLY for AI generation</div>
        Hosted/Vercel versions cannot connect to <span className="font-mono text-amber-200">http://127.0.0.1</span> or <span className="font-mono text-amber-200">http://localhost</span> because Chrome blocks HTTPS websites from calling local private network addresses (Private Network Access / CORS restrictions). To use Local AI, run Animiko locally with <code className="bg-black/30 px-1 py-0.5 rounded">npm run dev</code> — see the checklist below.
      </div>

      {/* ============ Hosted-site warning ============ */}
      {typeof location !== "undefined" && location.protocol === "https:" && (
        <div className="mb-6 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          <div className="font-semibold text-rose-200 mb-1">⚠ You're on the hosted Vercel site</div>
          <div className="text-rose-100/90">
            For local ComfyUI, run Animiko locally with <code className="text-rose-50 bg-black/30 px-1 py-0.5 rounded font-mono">npm run dev</code>.
            The hosted Vercel site may not be able to access <span className="font-mono text-rose-50">http://127.0.0.1:8188</span> because
            browsers block local HTTP backends from hosted HTTPS sites (CORS / mixed-content / Private Network Access).
          </div>
          <div className="mt-2 text-xs text-rose-200/80">
            Quick recipe:&nbsp;
            <code className="bg-black/30 px-1 py-0.5 rounded font-mono">git clone …animiko</code>{" "}→{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded font-mono">npm install</code>{" "}→{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded font-mono">npm run dev</code>{" "}→ open{" "}
            <code className="bg-black/30 px-1 py-0.5 rounded font-mono">http://localhost:5173</code>
          </div>
        </div>
      )}

      {/* ============ Quick Start Checklist (local test, start to finish) ============ */}
      <Card className="mb-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-white">Quick Start Checklist · Local Test, Start to Finish</h3>
          <Badge tone="cyan">Run locally</Badge>
        </div>

        <div className="space-y-3">
          <ChecklistStep number="1" title="Start ComfyUI first" subtitle="Terminal A">
            <p>For ComfyUI Portable:</p>
            <CodeBlock>{`cd C:\\ComfyUI_windows_portable
.\\python_embeded\\python.exe -s ComfyUI\\main.py --enable-cors-header "*"`}</CodeBlock>
            <p>Wait for this line in the terminal:</p>
            <CodeBlock>{`To see the GUI go to: http://127.0.0.1:8188`}</CodeBlock>
            <p className="text-xs text-amber-200/90">
              ⚠ Leave this terminal open the whole time — it's your live ComfyUI server log.
            </p>
          </ChecklistStep>

          <ChecklistStep number="2" title="Start Animiko locally" subtitle="Terminal B">
            <p>If you haven't cloned the repo yet:</p>
            <CodeBlock>{`cd C:\\Users\\ongcz\\Desktop\\Jc\\Claude
git clone https://github.com/JPODesign/local-ai-animation-studio.git animiko-local
cd animiko-local
npm install
npm run dev`}</CodeBlock>
            <p>If already cloned:</p>
            <CodeBlock>{`cd C:\\Users\\ongcz\\Desktop\\Jc\\Claude\\animiko-local
git pull
npm run dev`}</CodeBlock>
            <p>Wait for:</p>
            <CodeBlock>{`Local:   http://localhost:5173/`}</CodeBlock>
            <p>Open <code className="bg-black/30 px-1 py-0.5 rounded font-mono">http://localhost:5173</code> in your browser. You're using the local dev server — Animiko's hosted Vercel URL will <em>not</em> work for this.</p>
          </ChecklistStep>

          <ChecklistStep number="3" title="Test connection" subtitle="Inside Animiko">
            <ul className="list-disc pl-5 space-y-1">
              <li>Backend URL should be <code className="bg-black/30 px-1 py-0.5 rounded font-mono">http://127.0.0.1:8188</code></li>
              <li>Click <span className="text-violet-300 font-medium">Test Connection</span></li>
              <li>If connected, the badge turns emerald and shows <em>"ComfyUI connected"</em></li>
            </ul>
            <details className="rounded-lg bg-rose-500/5 border border-rose-400/20 p-2 mt-2">
              <summary className="text-xs text-rose-200 cursor-pointer font-medium">If Test Connection fails…</summary>
              <ul className="list-decimal pl-5 mt-2 text-xs text-slate-300 space-y-1">
                <li>Make sure ComfyUI is running (check Terminal A)</li>
                <li>Make sure the URL matches Terminal A's output (e.g. <code className="bg-black/30 px-1 rounded">http://127.0.0.1:8188</code>)</li>
                <li>Make sure ComfyUI was launched with <code className="bg-black/30 px-1 rounded">--enable-cors-header "*"</code></li>
                <li>Make sure Animiko is running locally (<code className="bg-black/30 px-1 rounded">http://localhost:5173</code>), <em>not</em> from Vercel</li>
              </ul>
            </details>
          </ChecklistStep>

          <ChecklistStep number="4" title="Load or create a workflow">
            <p>
              Click <span className="text-violet-300 font-medium">✨ Create Test Workflow</span> for the built-in SD 1.5 text-to-image template,
              <strong> OR</strong> upload your own ComfyUI workflow JSON.
            </p>
            <p className="text-xs text-slate-400">
              For your own workflow: in ComfyUI, open <strong>Settings → Enable Dev mode Options</strong>, then click <strong>Save (API Format)</strong> (not the plain "Save"). Upload that JSON in the Connection card below.
            </p>
          </ChecklistStep>

          <ChecklistStep number="5" title="Generate animation">
            <ul className="list-disc pl-5 space-y-1">
              <li>Change <strong>AI Model</strong> from <em>Demo Mode</em> to <strong>Local ComfyUI Workflow</strong></li>
              <li>Type your prompt in the prompt textarea</li>
              <li>Click <span className="text-violet-300 font-medium">⚡ Generate Animation</span></li>
              <li>
                Success indicator: <strong>Terminal A</strong> (the ComfyUI window) prints{" "}
                <code className="bg-black/30 px-1 py-0.5 rounded font-mono">got prompt</code>
              </li>
            </ul>
            <p className="text-xs text-slate-400">
              The Animation Results panel will show "Sending prompt to ComfyUI…", then ComfyUI's prompt_id, then the rendered output (or a Queued state with a "Check Output Now" button if generation takes longer than 30 s).
            </p>
          </ChecklistStep>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* ============ Connection panel (inline, not a modal) ============ */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h3 className="font-semibold text-white">Connection</h3>
            <ConnectionBadge status={status} />
          </div>

          <label className="block mb-3">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Backend URL</div>
            <input
              type="url"
              value={settings.backendUrl}
              onChange={e => updateSettings({ backendUrl: e.target.value })}
              onBlur={e => updateSettings({ backendUrl: e.target.value.replace(/\/+$/, "") })}
              placeholder="http://127.0.0.1:8188"
              className={inputCls + " font-mono text-sm"}
            />
            <div className="text-xs text-slate-400 mt-1">
              Default: <span className="font-mono text-slate-300">http://127.0.0.1:8188</span>{" "}
              · <span className="font-mono text-slate-300">http://localhost:8188</span> also works
              · trailing slash trimmed
            </div>
          </label>

          <div className="mb-3">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Workflow JSON (API Format)</div>
            <label className="block cursor-pointer">
              <div className="rounded-lg border border-dashed border-white/15 hover:border-violet-400/50 hover:bg-white/5 p-3 text-center text-slate-300 transition text-sm">
                {settings.workflow ? (
                  <>
                    <span className="text-emerald-300">✓</span>{" "}
                    Loaded: <span className="text-emerald-300 font-medium">{settings.workflowName || "workflow"}</span> · {Object.keys(settings.workflow).length} nodes
                  </>
                ) : (
                  <><span className="text-violet-300">⬆</span> Click to upload ComfyUI workflow JSON</>
                )}
              </div>
              <input type="file" accept="application/json" className="hidden" onChange={onWorkflow}/>
            </label>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={loadTestWorkflow}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-500/20 border border-violet-400/40 text-violet-200 hover:bg-violet-500/30 transition"
              >
                ✨ Create Test Workflow
              </button>
              <span className="text-[11px] text-slate-400">SD 1.5 text-to-image template (needs <code className="bg-black/30 px-1 py-0.5 rounded">v1-5-pruned-emaonly.ckpt</code> in your ComfyUI models)</span>
              {settings.workflow && (
                <button onClick={clearWorkflow} className="text-[11px] text-rose-300 hover:text-rose-200 underline ml-auto">Remove workflow</button>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-2">
              <span className="text-slate-300">Export your workflow from ComfyUI using Save API Format, then upload it here.</span>{" "}
              Enable <span className="text-slate-300">Dev mode</span> in ComfyUI settings first, then use <span className="text-slate-300">"Save (API Format)"</span>.
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <PrimaryBtn onClick={runTest} disabled={status === "testing"} className="text-sm">
              {status === "testing" && <span className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin"/>}
              {status === "testing" ? "Testing…" : "Test Connection"}
            </PrimaryBtn>
            {status !== "untested" && status !== "testing" && (
              <button onClick={() => runTest()} className="text-xs text-slate-400 hover:text-slate-200 underline">Re-test</button>
            )}
          </div>

          {connection && connection.message && (
            <div className={"mt-3 text-xs rounded-lg p-2 whitespace-pre-wrap border " + statusBoxClass}>
              {connection.message}
            </div>
          )}

          <p className="text-xs text-slate-400 mt-3">
            Launch ComfyUI with <code className="text-violet-300">--enable-cors-header "*"</code> so this hosted page can call it.
          </p>
        </Card>

        {/* ============ How to Install ComfyUI ============ */}
        <Card>
          <h3 className="font-semibold text-white mb-3">Install ComfyUI</h3>
          <ol className="space-y-2.5 text-sm text-slate-200 list-decimal pl-5">
            <li>
              Download{" "}
              <a href="https://github.com/comfyanonymous/ComfyUI/releases" target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200 underline">
                ComfyUI Portable
              </a>
            </li>
            <li>Extract the zip to a folder (e.g. <code className="text-xs bg-black/30 px-1 py-0.5 rounded">C:\ComfyUI</code>)</li>
            <li>
              Run <code className="text-xs bg-black/30 px-1 py-0.5 rounded">run_nvidia_gpu.bat</code>
              <div className="text-xs text-slate-400 mt-0.5">
                (or <code className="bg-black/30 px-1 py-0.5 rounded">run_cpu.bat</code> if no NVIDIA GPU)
              </div>
            </li>
            <li>
              Open <code className="text-xs bg-black/30 px-1 py-0.5 rounded">http://127.0.0.1:8188</code> (or <code className="text-xs bg-black/30 px-1 py-0.5 rounded">localhost:8188</code>) to verify it works
            </li>
            <li>
              Paste that URL into the field on the left → click <span className="text-violet-300">Test Connection</span>
            </li>
          </ol>
          <div className="mt-3 text-xs text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-lg p-2">
            <strong>For the hosted site:</strong> close ComfyUI, then re-launch it with the CORS flag:
            <code className="block mt-1 text-amber-100 text-[11px] bg-black/30 px-2 py-1 rounded font-mono">python main.py --enable-cors-header "*"</code>
          </div>
        </Card>
      </div>

      {/* ============ Desktop Shortcut card ============ */}
      <Card className="mb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-white">Open Animiko Easily · Desktop Shortcut</h3>
          <Badge tone="violet">Optional</Badge>
        </div>
        <p className="text-sm text-slate-300 mb-3">
          Create a desktop shortcut so you don't have to retype the launch commands every time.
        </p>
        <ol className="list-decimal pl-5 text-sm text-slate-300 space-y-1.5 mb-3">
          <li>Create a file on your <strong>Desktop</strong> named <code className="bg-black/30 px-1 py-0.5 rounded font-mono">Open Animiko.bat</code></li>
          <li>Paste the code below inside it</li>
          <li>Save the file</li>
          <li>Double-click it whenever you want to open Animiko</li>
        </ol>
        <CodeBlock>{`cd /d "C:\\Users\\ongcz\\Desktop\\Jc\\Claude\\animiko-local"
npm run dev`}</CodeBlock>
        <p className="text-xs text-slate-400 mt-2">
          The .bat opens a terminal and starts the Animiko dev server. Open <code className="bg-black/30 px-1 py-0.5 rounded font-mono">http://localhost:5173</code> in your browser afterwards. Remember: ComfyUI must already be running in a separate terminal (Step 1 above).
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Want to launch ComfyUI from a shortcut too? Make another .bat with:
        </p>
        <CodeBlock>{`cd /d "C:\\ComfyUI_windows_portable"
.\\python_embeded\\python.exe -s ComfyUI\\main.py --enable-cors-header "*"
pause`}</CodeBlock>
      </Card>

      {/* ============ Supported backends reference ============ */}
      <h3 className="text-lg font-semibold text-white mb-3">Supported backends</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {LOCAL_BACKENDS.map(b => (
          <Card key={b.name} className="hover:border-violet-400/40 hover:shadow-violet-500/20 transition">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-white flex items-center justify-center font-bold shadow-lg shadow-violet-900/40">{b.name[0]}</div>
                <div>
                  <div className="font-semibold text-white">{b.name}</div>
                  <div className="text-xs text-slate-400">{b.desc}</div>
                </div>
              </div>
              {b.name === "ComfyUI" ? <ConnectionBadge status={status}/> : <Badge tone="rose">● Not connected</Badge>}
            </div>
            <div className="mt-3 text-xs text-slate-300 space-y-1">
              <div>• Requirement: <span className="text-slate-400">Local install</span></div>
              <div>• Best with <span className="text-cyan-300">NVIDIA GPU</span></div>
              <div>• Depends entirely on your computer hardware</div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <a href={b.link} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 text-slate-200">Docs</a>
            </div>
          </Card>
        ))}
      </div>

      {/* ============ Local Proxy Setup (placeholder) ============ */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-white mb-3">Local Proxy Setup <Badge tone="slate">Coming Soon</Badge></h3>
        <Card>
          <div className="text-sm text-slate-300 space-y-2">
            <p>
              If <strong>Test Connection</strong> fails even with ComfyUI running, the browser is most
              likely refusing the cross-origin call (CORS). The cleanest fix is to relaunch ComfyUI with{" "}
              <code className="text-xs bg-black/30 px-1 py-0.5 rounded">--enable-cors-header "*"</code>.
            </p>
            <p className="text-slate-400">
              If for some reason that's not an option (older ComfyUI build, embedded environment, etc.),
              a small local proxy server can sit in front of ComfyUI and add the CORS headers.
              We don't ship one yet — this slot is a placeholder for that.
            </p>
            <div className="mt-2 rounded-lg bg-rose-500/10 border border-rose-400/30 p-3 text-xs text-rose-100">
              <strong>If you see this message in the result panel:</strong>{" "}
              <em>"Browser cannot access ComfyUI because of CORS. A small local proxy may be needed."</em>{" "}
              — that's the case described above. Try the CORS flag first; the proxy is the fallback.
            </div>
            <div className="text-xs text-slate-400 italic">
              No proxy server is built yet — this section will be wired up once it's needed.
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

/* ============================================================================
 * Settings modal
 * ==========================================================================*/
function SettingsModal({ open, onClose, settings, updateSettings }) {
  const [url, setUrl] = useState(settings.backendUrl);
  const [model, setModel] = useState(settings.modelPath);
  const [wfName, setWfName] = useState(settings.workflowName);
  const [status, setStatus] = useState({ tone: "slate", text: "" });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(settings.backendUrl); setModel(settings.modelPath); setWfName(settings.workflowName);
    setStatus({ tone: "slate", text: "" });
  }, [open, settings.backendUrl, settings.modelPath, settings.workflowName]);

  const onWorkflow = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const json = JSON.parse(r.result);
        if (!isApiFormat(json)) {
          setStatus({ tone: "amber", text: '"' + f.name + '" looks like the UI workflow format. In ComfyUI, enable Dev Mode and use "Save (API Format)".' });
          return;
        }
        updateSettings({ workflow: json, workflowName: f.name });
        setWfName(f.name);
        setStatus({ tone: "emerald", text: "Workflow loaded: " + f.name + " (" + Object.keys(json).length + " nodes)." });
      } catch (err) {
        setStatus({ tone: "rose", text: "Could not parse workflow JSON: " + err.message });
      }
    };
    r.readAsText(f); e.target.value = "";
  };

  const test = async () => {
    setTesting(true);
    setStatus({ tone: "slate", text: "Testing " + url + " …" });
    const r = await comfyTest(url);
    setTesting(false);
    if (r.ok) setStatus({ tone: "emerald", text: "Connected ✓ (" + ((r.data && r.data.system && r.data.system.os) || "ComfyUI") + " reachable)" });
    else setStatus({ tone: "rose", text: r.error });
  };

  const save = () => {
    updateSettings({ backendUrl: url, modelPath: model });
    setStatus({ tone: "emerald", text: "Settings saved locally." });
  };

  if (!open) return null;
  const colors = { slate: "text-slate-300", emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/20 shadow-[0_0_40px_rgba(139,92,246,0.25)] rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">Local AI Settings</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg w-7 h-7 rounded-full hover:bg-white/10">×</button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Local backend URL</div>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:8188" className={inputCls} />
          </label>

          <label className="block cursor-pointer">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Workflow JSON</div>
            <div className="rounded-lg border border-dashed border-white/15 hover:border-violet-400/50 hover:bg-white/5 p-3 text-center text-slate-300 transition">
              <span className="text-violet-300">⬆</span> {wfName || "Upload ComfyUI workflow JSON (API Format)"}
            </div>
            <input type="file" accept="application/json" className="hidden" onChange={onWorkflow} />
          </label>

          <label className="block">
            <div className="text-xs text-cyan-300 mb-1 font-medium">Model path</div>
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="C:\\models\\my_model.safetensors" className={inputCls} />
          </label>

          <div className="flex gap-2">
            <SecondaryBtn className="flex-1" onClick={test} disabled={testing}>
              {testing && <span className="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />}
              {testing ? "Testing…" : "Test Connection"}
            </SecondaryBtn>
            <PrimaryBtn className="flex-1" onClick={save}>Save Settings</PrimaryBtn>
          </div>

          {settings.workflow && (
            <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-lg p-2">
              Workflow in memory: <span className="font-medium">{settings.workflowName || "unnamed"}</span> · {Object.keys(settings.workflow).length} nodes
            </div>
          )}
          {status.text && <div className={"text-xs " + (colors[status.tone] || colors.slate) + " bg-white/5 border border-white/10 rounded-lg p-2 whitespace-pre-wrap"}>{status.text}</div>}

          <p className="text-xs text-slate-400">
            Calls go to <span className="text-slate-200">{url || "(unset)"}</span> on your own machine — no paid APIs. If Test fails, launch ComfyUI with <code className="text-violet-300">--enable-cors-header &quot;*&quot;</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * ROOT App
 * ==========================================================================*/
export default function App() {
  const [theme, setTheme] = useState("dark");
  const [openSettings, setOpenSettings] = useState(false);
  const [result, setResult] = useState(null);

  const [settings, setSettings] = useState(() => ({
    backendUrl:   (typeof localStorage !== "undefined" && localStorage.getItem("laias.backendUrl")) || DEFAULT_URL,
    modelPath:    (typeof localStorage !== "undefined" && localStorage.getItem("laias.modelPath")) || "",
    workflow:     (() => { try { return JSON.parse(localStorage.getItem("laias.workflow") || "null"); } catch { return null; } })(),
    workflowName: (typeof localStorage !== "undefined" && localStorage.getItem("laias.workflowName")) || "",
  }));
  const updateSettings = (patch) => setSettings(s => {
    const next = { ...s, ...patch };
    if (patch.backendUrl   !== undefined) localStorage.setItem("laias.backendUrl",   next.backendUrl);
    if (patch.modelPath    !== undefined) localStorage.setItem("laias.modelPath",    next.modelPath);
    if (patch.workflow     !== undefined) localStorage.setItem("laias.workflow",     JSON.stringify(next.workflow));
    if (patch.workflowName !== undefined) localStorage.setItem("laias.workflowName", next.workflowName);
    return next;
  });

  // Live ComfyUI connection state. "untested" before the user clicks Test;
  // we don't auto-ping on load so we never make a network request the user
  // didn't ask for. Surfaced in the result-card header, the inline Local
  // AI Setup panel, and the idle CleanPlaceholder.
  const [connection, setConnection] = useState({ status: "untested", message: "" });

  // Normalize trailing slashes so /system_stats etc. concatenate cleanly.
  const normalizedBackendUrl = (settings.backendUrl || "").replace(/\/+$/, "");

  const runConnectionTest = async () => {
    setConnection({ status: "testing", message: "Pinging " + normalizedBackendUrl + "/system_stats …" });
    const r = await comfyTest(normalizedBackendUrl);
    if (r.ok) {
      setConnection({ status: "connected", message: "ComfyUI connected — " + normalizedBackendUrl });
    } else {
      // fetch() throws on either "ComfyUI not running" OR a CORS preflight
      // rejection OR a Private Network Access preflight from HTTPS→127.0.0.1.
      // The browser can't tell us which — we list the four common fixes.
      const onHosted = typeof location !== "undefined" && location.protocol === "https:";
      setConnection({
        status: "disconnected",
        message:
          "ComfyUI is not running or blocked by the browser.\n\n" +
          "To fix this:\n" +
          "  1. Make sure ComfyUI is running.\n" +
          '  2. Start ComfyUI with  --enable-cors-header "*"\n' +
          "  3. Run Animiko locally with  npm run dev\n" +
          "  4. Open http://localhost:5173 and test again.\n" +
          (onHosted
            ? "\nYou are on the hosted Vercel site. Browsers usually block HTTPS pages from calling http://127.0.0.1 (Private Network Access). Steps 3 + 4 above are the reliable fix.\n"
            : "") +
          "\nUnderlying error: " + r.error,
      });
    }
  };

  const scrollTo = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth" }); };

  return (
    <div className="relative min-h-screen text-white bg-gradient-to-br from-slate-950 via-[#10182b] to-[#1a1033]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-32 -left-32 w-[28rem] h-[28rem] bg-violet-600/25 rounded-full blur-[110px]" />
        <div className="absolute top-1/3 -right-32 w-[28rem] h-[28rem] bg-cyan-500/20 rounded-full blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 w-[28rem] h-[28rem] bg-fuchsia-500/15 rounded-full blur-[120px]" />
      </div>

      <div className="relative">
        <Navbar theme={theme} setTheme={setTheme} onOpenSettings={() => setOpenSettings(true)} />
        <Hero />
        <section id="studio" className="max-w-7xl mx-auto px-4 md:px-6 pb-4">
          <CreationPanel settings={settings} connection={connection} onOpenSettings={() => setOpenSettings(true)} onScrollTo={scrollTo} result={result} setResult={setResult} />
        </section>
        <StickmanBuilder />
        <LocalAISetup
          onOpenSettings={() => setOpenSettings(true)}
          settings={settings}
          updateSettings={updateSettings}
          connection={connection}
          runTest={runConnectionTest}
        />
        <footer className="border-t border-white/10 mt-6">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-3">
            <div>© Animiko · Frontend-only build · No data leaves your browser.</div>
            <div className="flex gap-2">
              <Badge tone="violet">Demo Mode</Badge>
              <Badge tone="cyan">Local AI: Coming Soon</Badge>
              <Badge tone="amber">Hardware-dependent</Badge>
            </div>
          </div>
        </footer>
      </div>

      <SettingsModal open={openSettings} onClose={() => setOpenSettings(false)} settings={settings} updateSettings={updateSettings} />
    </div>
  );
}
