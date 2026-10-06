# Environment note, 10 August 2026

During a disk cleanup, heavy files that can be downloaded again were removed from
this project. **The code and the git history were not touched.**

## What is missing and how to put it back

| What | Size | How to restore |
|---|---|---|
| `backend/.hf-cache/` | 3.8 GB | HuggingFace cache of the backend: it holds the weights of `booksforcharlie/stable-diffusion-inpainting` (3.2 GB) and `stabilityai/sd-vae-ft-mse` (319 MB). They download again by themselves at the first start of the backend. |
| `backend/.venv/` | 1.2 GB | `cd backend && python3 -m venv .venv && pip install -r requirements.txt` |

## Watch the Python

The backend venv **pointed to pyenv**, not to the system Python:

```
home = /Users/eugenionerelli/.pyenv/versions/3.11.13/bin
```

`~/.pyenv` was not touched and is still in place. If you recreate the venv,
use the same version (`pyenv local 3.11.13`) or the backend may not start
with the pinned dependencies.

## What was not touched

`backend/CatVTON` and the rest of the code are intact. The HuggingFace cache
downloaded inside the project is excluded from Time Machine backups, so if it
disappears there is no way to recover it other than downloading it again.
