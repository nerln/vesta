# Vesta

Virtual wardrobe. You photograph the clothes you own, cut them out on a transparent background and try them on over a photo of yourself.

By Eugenio Nerelli and Gianmattia Barone.

There are two versions, and the difference is where the model lives.

## In the browser

**https://nerln.github.io/vesta/app.html**

It opens and it works. There is nothing to install, no account, no field where you paste an API key, and no image leaves the device.

- Garment cutout from a plain background: it measures the colour at the edge, the alpha comes from the distance, and only the background connected to the edge becomes transparent. It runs on canvas, between 12 and 56 ms on a half-megapixel image. If the garment is the same colour as the wall, or if the background is not uniform, it says so instead of handing over a cutout with holes in it.
- A filterable wardrobe, with nine sample garments already inside.
- You drag the garment onto the figure and the fitting is immediate.
- "Save the look" composes a real, exportable PNG that ends up in the lookbook.
- Everything is in IndexedDB: it stays there and disappears only if you delete the site data.
- Italian and English, dark and light theme, installable on the iPhone Home Screen.

No model runs here, so there is no generated try-on: for that you need the backend.

## On the Mac, with the backend

This is where the models live, and the cutout becomes generative: the garment is redrawn as a catalogue photo on a chroma background instead of being cut out, then the chroma becomes transparency. The try-on is really generated on the figure.

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r ../requirements.txt
git clone https://github.com/Zheng-Chong/CatVTON
.venv/bin/python download_weights.py
.venv/bin/python prep_wardrobe.py
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8770
```

Open http://127.0.0.1:8770, or http://IP-OF-THE-MAC:8770 from a smartphone on the same network.

It needs an Apple Silicon Mac and Python 3.11. The first start downloads about four gigabytes of weights.

- Try-on with CatVTON on MPS, about ninety seconds per try-on.
- Masks with `segformer_b2_clothes`, without detectron2.
- Colour analysis: skin undertone in CIELAB, season and palette.
- Paid models: the key lives in `backend/.keys.json` (outside git) or in the `OPENAI_API_KEY` and `GEMINI_API_KEY` variables, the call starts from the server and the key never reaches the client.

## Why the keys do not live in the browser

A field where you paste an API key inside a web page is a bad idea, and on GitHub Pages it is a bad idea twice over: all the projects of one account share the origin `<user>.github.io`, so a key in `localStorage` would be readable by any other page of the same account. The browser version has none, and at startup it deletes the ones saved by earlier versions.

There is also a measured fact worth knowing: the OpenAI APIs cannot be called from a web page. A POST with the `Authorization` header does not go out, because the preflight is not authorised; the same request without that header answers 401. Gemini does answer. So even if we wanted to, that field would have worked with only one provider out of two.

## iOS app

SwiftUI scaffold in `ios/`: a WKWebView pointing to the server, with a configurable address.

## Licences

There are two blocks, not one: CatVTON and also `segformer_b2_clothes`, which makes the masks, are both non-commercial. As long as they stay, Vesta is an open, personal project and not a binary to sell. What exactly blocks what, and the verified way out, are in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md). The plan for the App Store and subscriptions is in [PLAN.md](PLAN.md).
