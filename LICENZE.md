# Cosa impedisce oggi di pubblicare Vesta

Verificato il 10 e 11 agosto 2026 leggendo i file di licenza, non i riassunti.

## In una riga

Vesta non e' pubblicabile su App Store cosi' com'e', e i blocchi sono **due**, non uno: il modello che genera la prova e il modello che fa le maschere sono entrambi non commerciali.

## I due blocchi

| Componente | A cosa serve | Licenza verificata | Verdetto |
|---|---|---|---|
| CatVTON, pesi e codice | genera la prova addosso | CC BY-NC-SA 4.0 ([LICENSE](https://raw.githubusercontent.com/Zheng-Chong/CatVTON/edited/LICENSE)) | bloccato |
| `mattmdjaga/segformer_b2_clothes` | la maschera del capo e gli appigli | `license: other`, rimanda alla NVIDIA Source Code License for SegFormer, sezione 3.3: uso non commerciale, ["for research or evaluation purposes only"](https://raw.githubusercontent.com/NVlabs/SegFormer/master/LICENSE) | bloccato |

Sostituire solo CatVTON non sblocca niente. Il segmentatore va pianificato insieme.

Ci sono anche due punti da chiudere, meno gravi ma aperti:

- I pesi base arrivano da `booksforcharlie/stable-diffusion-inpainting`, un mirror di terzi con poche centinaia di download, perche' l'originale di runwayml risponde 401. La licenza e' CreativeML OpenRAIL-M, che l'uso commerciale lo permette, ma con restrizioni d'uso da propagare all'utente finale.
- I pesi `u2netp` usati da rembg: il codice e' MIT, i pesi sono distribuiti a parte e i loro termini non li ha verificati nessuno.

## Il dataset conta piu' del repo

Il filone accademico del virtual try-on e' chiuso a monte, e non per la licenza dei repo. VITON-HD e' CC BY-NC 4.0 "research purposes only", e Dress Code vieta l'uso commerciale **delle opere derivate**, [scritto a lettere](https://raw.githubusercontent.com/aimagelab/dress-code/main/LICENCE). Quella clausola chiude CatVTON, Leffa, DSR-Tryon senza bisogno di un parere legale. IDM-VTON, OOTDiffusion, StableVITON, FitDiT, MV-VTON, Mobile-VTON (CVPR 2026) e SIFT-VTON (5 agosto 2026) sono tutti CC BY-NC-SA addestrati su VITON-HD.

L'ultima uscita del filone ha pochi giorni e conferma la tendenza. Il mondo accademico non risolvera' questo problema.

## La strada che regge

**Generazione: FLUX.2-klein-4B.** Apache-2.0 letta al file, non gated, 3,88 miliardi di parametri, build ufficiale fp8 da 4,08 GB. Sul compito che serve qui, cioe' foto del capo isolata piu' foto della persona, batte tutti i VTON specializzati e anche il FLUX.2 da 32B. Runtime `mflux`, licenza MIT, mantenuto.

Un vincolo di prodotto che ne discende: i capi vanno acquisiti come **product shot isolati**. Prendere il capo da una foto di qualcuno che lo indossa e' il caso in cui klein crolla, sotto CatVTON. La pipeline generativa di Vesta gia' ricostruisce il capo come immagine di catalogo, quindi la forma giusta ce l'ha.

**Segmentazione: non c'e' una risposta pronta, e va detto.**

- SAM 2.1 e' Apache-2.0 e Apple pubblica le conversioni Core ML, ma segmenta su prompt geometrico e non restituisce classi di abbigliamento: serve uno strato sopra.
- SAM 3 aggiunge il prompt testuale e la sua licenza concede l'uso commerciale, ma i pesi sono gated con approvazione manuale.
- MediaPipe Selfie Multiclass ha una classe "clothes", codice Apache-2.0, ma gira a 256x256 e la licenza dei pesi `.tflite` non e' verificata.
- MODNet e' l'unico caso in cui la licenza copre esplicitamente anche i pesi, ma e' matting di ritratti, non parsing di capi.

Nessuna delle quattro e' un rimpiazzo diretto. Questa e' la voce di lavoro piu' lunga della lista, e va messa in conto in settimane, non in giorni.

## Cosa non fare

Verificato e scartato:

- **FLUX.2-klein-9B con la LoRA di try-on.** E' la prima cosa che si trova, la LoRA ha il badge Apache-2.0 bene in vista, ma il modello base e' sotto `flux-non-commercial-license`. E sono 18 GB per il file principale.
- **Qwen-Image-Edit e gli altri da 20B.** Licenza buona, ma la build MLX a 4 bit pesa 27 GB. Su 16 GB non e' una strada.
- **CodeFormer** e' S-Lab License, non commerciale. **GFPGAN** apre con Apache 2.0 e duecento righe dopo elenca StyleGAN2 sotto licenza NVIDIA non commerciale.
- **Nel browser**: RMBG-1.4 e RMBG-2.0 sono di BRIA e non commerciali; `@imgly/background-removal` e' AGPL-3.0 e obbligherebbe a rilasciare tutto lo stack; IS-Net e BiRefNet sono addestrati su DIS5K, i cui termini vietano l'uso commerciale anche dopo "copying, editing, processing or any operations".

## Nel frattempo

Finche' i due blocchi restano, Vesta e' un progetto aperto e personale: si usa, si studia, si modifica. La versione nel browser su GitHub Pages non tocca nessuno dei due modelli, quindi non e' toccata dal problema.

Per un binario da vendere servono, in quest'ordine: sostituire il generatore con klein-4B, sostituire il segmentatore, rifare le misure di qualita' e tempo sulla macchina bersaglio, e solo allora riaprire la [checklist App Store](PIANO.md).
