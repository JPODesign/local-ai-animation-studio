# Local AI Animation Studio

A glassmorphism dark-theme dashboard for creating animations in the browser. Includes a hand-built stickman asset builder (drag-drop, resize, rotate, frame-by-frame timeline, export as transparent PNG / sprite sheet / animated GIF) and a ComfyUI backend connector for future local AI video generation.

Frontend-first. Runs entirely in the user's browser. No paid APIs. No Supabase. No backend required for the core features.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle into dist/
npm run preview  # serve the production bundle locally
```

Requires Node.js 18+.

## Tech stack

- **React 18** + **Vite 5**
- **Tailwind CSS 3** (JIT)
- **gif.js** (loaded from CDN in `index.html` for animated GIF export — no npm dep)
- No UI libraries — every Card / Button / Tab / Modal / Input is hand-built from `<div>` + Tailwind classes

## Project structure

```
.
├── index.html            # Vite entry
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── src/
    ├── main.jsx          # React root
    ├── index.css         # Tailwind + custom styles
    ├── comfy.js          # ComfyUI backend connector
    └── App.jsx           # All UI components live here
```

## Features

- **Demo Mode** — works out of the box, no setup
- **Stickman Asset Builder** — upload transparent PNG body parts, drag onto canvas, resize / rotate / layer, save presets to `localStorage`
- **Timeline** — add / duplicate / delete / reorder frames, play / pause, FPS control, onion skin
- **Exports** — transparent PNG, PNG sequence, sprite sheet, animated GIF (all client-side)
- **Local AI connector (ComfyUI)** — Settings → Local AI: backend URL, workflow upload, Test Connection. Real `/prompt` calls fire from the browser straight to `localhost`.

## How local AI works on the hosted site

Local AI generation only works when the user runs the local backend on their own computer. The online website can connect to `localhost` only from the same user's device — there is no shared GPU server. Each visitor brings their own ComfyUI install.

If you want to use Local AI Mode:
1. Install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) locally.
2. Launch with CORS enabled:
   ```bash
   python main.py --enable-cors-header "*"
   ```
3. In the dashboard: Settings (⚙) → Local AI → upload your workflow JSON (saved via ComfyUI's **Save (API Format)**) → Test Connection → Save.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com/new](https://vercel.com/new), import the repo.
3. Vercel auto-detects **Vite**. Confirm:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Click **Deploy**.

No environment variables are required.

## License

MIT
