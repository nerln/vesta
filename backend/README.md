# Vesta, try-on + color analysis (local, Apple Silicon)

Mobile web app that runs **locally** on an M4 Mac (Metal GPU / MPS). The Mac acts as the
**inference server** and also serves the web client: one command, one address.

Two pillars:
1. **Color analysis** from the photo → personal palette (season) + color advice.
2. **Virtual try-on** → you see yourself wearing the garments in the wardrobe.

## Stack
- Try-on: **CatVTON** (SD1.5) on MPS, in **bfloat16** (half the memory, safe on the VAE).
- Garment mask: **segformer_b2_clothes** (no detectron2/DensePose).
- Color analysis: ITA° in **CIELAB** + heuristics for the 4 seasons (`color_analysis.py`).
- API + client: **FastAPI** (it also serves `web/` as a Preact app, no build).
- **Cloud** mode (opt.): free IDM-VTON Space via `gradio_client`. Cutout of photographed garments: `rembg` (u2netp).
- Weights in `./.hf-cache` (~4 GB) and renders in `outputs/cache` (can be deleted).

> ⚠️ **Licence**: CatVTON is **non-commercial (research)**. Great for prototyping;
> before publishing the engine must be replaced with one under a commercial licence.
> The architecture (`/tryon`, `/analyze`) stays identical.

## Start (macOS)
Simple: double-click **`Vesta.app`** (in the root of the repo). It starts the server and opens the browser.
First time: right-click → **Open** (Gatekeeper: unsigned app). If "allow Python to accept
incoming connections?" appears → **Allow** (needed for the iPhone).

Equivalent from the terminal (port **8770**; 8000 belongs to "AI Director"):
```bash
cd <repo>/backend
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8770
```
On the Mac open `http://127.0.0.1:8770/`.

### From iPhone (same Wi-Fi)
1. Start with `Vesta.app` (it runs **natively**, not sandboxed → reachable on the network).
2. On the phone open **`http://192.168.1.129:8770/`** (IP of the Mac: `ipconfig getifaddr en0`).
3. If it does not load: System Settings → Network → Firewall → allow Python; same Wi-Fi.
4. Photo on iPhone: use "Upload a photo" → "Take photo" (the web webcam over http is blocked by iOS).

Native iOS app (WKWebView) in `ios/`. dtype override: `VESTA_DTYPE=fp32 …`. Cloud: `HF_TOKEN` for more quota.

## Endpoints
- `GET /health` → status + device.
- `POST /tryon` (multipart: `person`, `cloth`, `category` upper|lower|overall, `quality` fast|balanced|high, `mode` local|cloud) → PNG. Headers `X-Inference-Seconds`, `X-Mode`, `X-Cache`. Disk cache in `outputs/cache`.
- `POST /analyze` (multipart: `person`) → JSON: `season`, `undertone`, `depth`, `contrast`, `ita`, `palette`, `advice`.
- `POST /cutout` (multipart: `image`) → PNG of the garment cut out on white (rembg).

**Cloud** mode: try-on via the free IDM-VTON Space (~25s, high quality); automatic fallback to local if unavailable. Set `HF_TOKEN` for a higher quota.

## App (web/index.html)
- Onboarding: upload your full-length photo (or "use the sample photo"). It stays local.
- Home: you in the foreground, **personal palette + season + advice**, **Look of the day**
  slot inventory (tap = wear), quality selector, shuffle, "original" comparison.
- "Add"/camera: you upload the photo of a garment and try it on.
- Per-garment cache (instant re-selection); loading state with a timer for the ~90s.

## Timings (base M4 16 GB, bf16)
| preset | resolution | steps | time ~ |
|---|---|---|---|
| fast | 384×512 | 30 | ~90s |
| balanced | 576×768 | 35 | ~3 min |
| high | 768×1024 | 45 | ~5 min |

With bf16 a generation uses ~1.9 GB of GPU. ⚠️ Keep the RAM free: having **two** Vesta
servers active together (or other big models) sends the Mac into swap and slows everything down by 15-20×.

## Files
- `server.py`, API + serves the client (loads the pipeline once, bf16, no-cache).
- `color_analysis.py`, color analysis (ITA°/CIELAB → season + palette).
- `tryon.py`, command-line try-on. `mask_from_person.py`, garment mask.
- `download_weights.py`, downloads only the needed weights. `check_env.py`, MPS sanity check.
- `../web/`, client (index.html, garments/, person_sample.jpg, garments.json).
- `CatVTON/`, the model repo (third party).
