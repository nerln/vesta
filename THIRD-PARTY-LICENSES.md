# What stops Vesta from being published today

Verified on 10 and 11 August 2026 by reading the licence files, not the summaries.

## In one line

Vesta cannot be published on the App Store as it is, and there are **two** blocks, not one: the model that generates the try-on and the model that makes the masks are both non-commercial.

## The two blocks

| Component | What it is for | Verified licence | Verdict |
|---|---|---|---|
| CatVTON, weights and code | generates the try-on | CC BY-NC-SA 4.0 ([LICENSE](https://raw.githubusercontent.com/Zheng-Chong/CatVTON/edited/LICENSE)) | blocked |
| `mattmdjaga/segformer_b2_clothes` | the garment mask and the handles | `license: other`, refers to the NVIDIA Source Code License for SegFormer, section 3.3: non-commercial use, ["for research or evaluation purposes only"](https://raw.githubusercontent.com/NVlabs/SegFormer/master/LICENSE) | blocked |

Replacing only CatVTON unblocks nothing. The segmenter has to be planned together with it.

There are also two points still to close, less serious but open:

- The base weights come from `booksforcharlie/stable-diffusion-inpainting`, a third-party mirror with a few hundred downloads, because the original from runwayml answers 401. The licence is CreativeML OpenRAIL-M, which allows commercial use, but with use restrictions that must be passed on to the end user.
- The `u2netp` weights used by rembg: the code is MIT, the weights are distributed separately and nobody has verified their terms.

## The dataset matters more than the repo

The academic line of virtual try-on is closed upstream, and not because of the licence of the repos. VITON-HD is CC BY-NC 4.0 "research purposes only", and Dress Code forbids commercial use **of derivative works**, [spelled out](https://raw.githubusercontent.com/aimagelab/dress-code/main/LICENCE). That clause closes CatVTON, Leffa and DSR-Tryon without needing a legal opinion. IDM-VTON, OOTDiffusion, StableVITON, FitDiT, MV-VTON, Mobile-VTON (CVPR 2026) and SIFT-VTON (5 August 2026) are all CC BY-NC-SA trained on VITON-HD.

The latest release of this line is a few days old and confirms the trend. The academic world will not solve this problem.

## The way that holds

**Generation: FLUX.2-klein-4B.** Apache-2.0 read at the file, not gated, 3.88 billion parameters, official fp8 build of 4.08 GB. On the task needed here, that is an isolated photo of the garment plus a photo of the person, it beats all the specialised VTONs and also the 32B FLUX.2. Runtime `mflux`, MIT licence, maintained.

A product constraint that follows: garments must be acquired as **isolated product shots**. Taking the garment from a photo of someone wearing it is the case where klein collapses, below CatVTON. Vesta's generative pipeline already rebuilds the garment as a catalogue image, so it already has the right shape.

**Segmentation: there is no ready answer, and that has to be said.**

- SAM 2.1 is Apache-2.0 and Apple publishes the Core ML conversions, but it segments on a geometric prompt and does not return clothing classes: a layer on top is needed.
- SAM 3 adds the text prompt and its licence grants commercial use, but the weights are gated with manual approval.
- MediaPipe Selfie Multiclass has a "clothes" class, Apache-2.0 code, but it runs at 256x256 and the licence of the `.tflite` weights is not verified.
- MODNet is the only case where the licence explicitly covers the weights too, but it is portrait matting, not garment parsing.

None of the four is a direct replacement. This is the longest work item on the list, and it has to be counted in weeks, not days.

## What not to do

Verified and discarded:

- **FLUX.2-klein-9B with the try-on LoRA.** It is the first thing you find, the LoRA has the Apache-2.0 badge in plain view, but the base model is under `flux-non-commercial-license`. And the main file is 18 GB.
- **Qwen-Image-Edit and the other 20B models.** Good licence, but the 4-bit MLX build weighs 27 GB. On 16 GB it is not a road.
- **CodeFormer** is S-Lab License, non-commercial. **GFPGAN** opens with Apache 2.0 and two hundred lines later lists StyleGAN2 under a non-commercial NVIDIA licence.
- **In the browser**: RMBG-1.4 and RMBG-2.0 are from BRIA and non-commercial; `@imgly/background-removal` is AGPL-3.0 and would force the release of the whole stack; IS-Net and BiRefNet are trained on DIS5K, whose terms forbid commercial use even after "copying, editing, processing or any operations".

## In the meantime

As long as the two blocks remain, Vesta is an open, personal project: you use it, study it, modify it. The browser version on GitHub Pages does not touch either of the two models, so it is not affected by the problem.

For a binary to sell you need, in this order: replace the generator with klein-4B, replace the segmenter, redo the quality and time measurements on the target machine, and only then reopen the [App Store checklist](PLAN.md).
