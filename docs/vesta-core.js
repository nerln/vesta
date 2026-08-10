/* Vesta, motore lato client.
   Tutto quello che il server faceva in Python qui gira nel browser: ritaglio,
   rimozione del fondo chroma, archivio. Le uniche chiamate esterne sono ai
   modelli, con la chiave dell'utente, direttamente dal browser. */

/* ------------------------------------------------------------------ archivio */
const DB = 'vesta-web', VER = 1;
const STORES = ['garments', 'looks', 'meta'];

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => { for (const s of STORES)
      if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), rq = fn(t.objectStore(store));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export const store = {
  all: (s) => tx(s, 'readonly', (o) => o.getAll()),
  get: (s, id) => tx(s, 'readonly', (o) => o.get(id)),
  put: (s, v) => tx(s, 'readwrite', (o) => o.put(v)),
  del: (s, id) => tx(s, 'readwrite', (o) => o.delete(id)),
};

/* ------------------------------------------------------------------ immagini */
export async function toBitmap(src) {
  if (src instanceof Blob) return createImageBitmap(src);
  const r = await fetch(src); return createImageBitmap(await r.blob());
}
export function canvasOf(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function toBlob(canvas, type = 'image/png', q = 0.92) {
  return new Promise((res) => canvas.toBlob(res, type, q));
}
export async function downscale(blob, max = 1400) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (s === 1) return blob;
  const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  // Il JPEG non ha trasparenza: una figura già ritagliata resterebbe con il fondo nero.
  const alpha = blob.type === 'image/png' || blob.type === 'image/webp';
  return alpha ? toBlob(c, 'image/png') : toBlob(c, 'image/jpeg', 0.92);
}
/** Ritaglio di un riquadro normalizzato, con margine, su tela quadrata neutra. */
export async function cropSquare(blob, box, pad = 0.12, side = 1024) {
  const bmp = await createImageBitmap(blob);
  const [l, t, r, b] = box;
  const w = (r - l) * bmp.width, h = (b - t) * bmp.height;
  const m = Math.max(w, h) * pad;
  const x0 = Math.max(0, l * bmp.width - m), y0 = Math.max(0, t * bmp.height - m);
  const x1 = Math.min(bmp.width, r * bmp.width + m), y1 = Math.min(bmp.height, b * bmp.height + m);
  const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
  const s = Math.min(1, side / Math.max(cw, ch));
  const c = canvasOf(side, side);
  const g = c.getContext('2d');
  g.fillStyle = '#f5f5f5'; g.fillRect(0, 0, side, side);
  const dw = cw * s, dh = ch * s;
  g.drawImage(bmp, x0, y0, cw, ch, (side - dw) / 2, (side - dh) / 2, dw, dh);
  return c;
}

/** Ritaglia sul contenuto opaco lasciando un margine. */
export function trimAlpha(canvas, pad = .06) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return canvas;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, m = Math.round(Math.max(bw, bh) * pad);
  const out = canvasOf(bw + m * 2, bh + m * 2);
  out.getContext('2d').drawImage(canvas, x0, y0, bw, bh, m, m, bw, bh);
  return out;
}
/** Quanto e' andata: serve per decidere se ritentare con un'altra chiave. */
export function checkCutout(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let opaque = 0, transparent = 0;
  for (let p = 0; p < w * h; p++) { const a = d[p * 4 + 3]; if (a > 128) opaque++; else if (a < 20) transparent++; }
  const tot = w * h;
  const problems = [];
  if (transparent / tot < .05) problems.push('fondo non rimosso');
  if (opaque / tot < .03) problems.push('contenuto quasi vuoto');
  if (opaque / tot > .92) problems.push('fondo non rimosso');
  return { ok: !problems.length, problems, content: +(opaque / tot).toFixed(3) };
}
export function dominantHex(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const px = [];
  for (let p = 0; p < w * h; p += 7) { const i = p * 4;
    if (d[i + 3] > 200 && !(d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240)) px.push([d[i], d[i + 1], d[i + 2]]); }
  if (!px.length) return '#8a8a8a';
  const med = [0, 1, 2].map((k) => { const a = px.map((p) => p[k]).sort((x, y) => x - y); return a[a.length >> 1]; });
  return '#' + med.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/* -------------------------------------------- ritaglio dal fondo tinta unita
   Nessun modello, nessuna chiamata di rete, nessuna chiave: il fondo viene
   misurato sul bordo dell'immagine e tolto dove e' collegato al bordo. Funziona
   su una foto scattata contro un muro, un lenzuolo o un piano di colore uniforme,
   e non solo su un fondo chroma. Su uno sfondo mosso non funziona, e lo dice. */
const F_LO = 20, F_HI = 74;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

/** Le componenti di fondo raggiungibili dal bordo: un dettaglio interno dello
 *  stesso colore del muro resta al suo posto invece di bucare il capo. */
function borderConnected(alpha, w, h, soglia = .5) {
  const bg = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qs = 0, qe = 0;
  const seed = (p) => { if (!bg[p] && alpha[p] < soglia) { bg[p] = 1; q[qe++] = p; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (qs < qe) {
    const p = q[qs++], x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  return bg;
}

/** Il colore del fondo, come mediana delle quattro fasce di bordo. */
function borderMedian(d, w, h) {
  const band = Math.max(2, Math.min(14, (h / 8) | 0, (w / 8) | 0));
  const s = [[], [], []];
  const push = (x, y) => { const i = (y * w + x) * 4; s[0].push(d[i]); s[1].push(d[i + 1]); s[2].push(d[i + 2]); };
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x += 2) { push(x, y); push(x, h - 1 - y); }
  for (let x = 0; x < band; x++) for (let y = 0; y < h; y += 2) { push(x, y); push(w - 1 - x, y); }
  const med = s.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; });
  const spread = s.map((a) => a[(a.length * .9) | 0] - a[(a.length * .1) | 0]);
  return { med, uniforme: Math.max(...spread) };
}

/**
 * Toglie il fondo tinta unita da una foto. Restituisce { canvas, sfondo, uniforme }.
 * `uniforme` e' quanto varia il bordo: sopra i 60 circa il fondo non e' tinta unita
 * e il ritaglio non e' affidabile.
 */
export function stripFlat(src) {
  const w = src.width, h = src.height;
  const cv = src.getContext ? src : (() => {
    const c = canvasOf(w, h); c.getContext('2d').drawImage(src, 0, 0); return c;
  })();
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const { med, uniforme } = borderMedian(d, w, h);

  const alpha = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const dist = Math.hypot(d[i] - med[0], d[i + 1] - med[1], d[i + 2] - med[2]);
    alpha[p] = smooth((dist - F_LO) / (F_HI - F_LO));
  }
  const bg = borderConnected(alpha, w, h);

  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const a = bg[p] ? Math.min(1, Math.max(0, alpha[p])) : 1;
    if (a > .15 && a < .995) {  // colore ricostruito togliendo il fondo dal bordo sfumato
      for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.max(0, (d[i + k] - (1 - a) * med[k]) / a));
    }
    d[i + 3] = Math.round(a * 255);
    if (d[i + 3] === 0) { d[i] = d[i + 1] = d[i + 2] = 0; }
  }
  const out = canvasOf(w, h);
  out.getContext('2d').putImageData(img, 0, 0);
  return {
    canvas: out,
    sfondo: '#' + med.map((v) => v.toString(16).padStart(2, '0')).join(''),
    uniforme: Math.round(uniforme),
    contrasto: Math.round(centroVsFondo(src.getContext ? src : cv, med)),
  };
}

/** Quanto il centro dell'immagine si stacca dal fondo. Sotto i 45 circa il capo
 *  ha lo stesso colore del muro e il metodo a distanza di colore se lo mangia:
 *  meglio dirlo che consegnare un ritaglio bucato. */
function centroVsFondo(cv, med) {
  const w = cv.width, h = cv.height;
  const x0 = (w * .3) | 0, y0 = (h * .3) | 0, cw = Math.max(1, (w * .4) | 0), ch = Math.max(1, (h * .4) | 0);
  const d = cv.getContext('2d').getImageData(x0, y0, cw, ch).data;
  const c = [[], [], []];
  for (let p = 0; p < cw * ch; p += 5) { const i = p * 4; c[0].push(d[i]); c[1].push(d[i + 1]); c[2].push(d[i + 2]); }
  const m = c.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; });
  return Math.hypot(m[0] - med[0], m[1] - med[1], m[2] - med[2]);
}

/** Se l'immagine ha gia' un canale alfa vero non c'e' niente da togliere. */
export function hasAlpha(canvas) {
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let trasparenti = 0;
  for (let p = 0; p < w * h; p += 3) if (d[p * 4 + 3] < 250) trasparenti++;
  return trasparenti / (w * h / 3) > .02;
}

/* ------------------------------------------------------------------- composizione
   Il montaggio che si vede sul palco, reso in un PNG vero: stessa geometria,
   stessi appigli, tutto su tela e senza uscire dal dispositivo. */
export async function composeLook(personBlob, strati, lato = 1400) {
  const base = await createImageBitmap(personBlob);
  const s = Math.min(1, lato / Math.max(base.width, base.height));
  const w = Math.round(base.width * s), h = Math.round(base.height * s);
  const c = canvasOf(w, h);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0, w, h);
  for (const { blob, url, box } of strati) {
    const bmp = await toBitmap(blob || url);
    const bx = box[0] * w, by = box[1] * h;
    const bw = (box[2] - box[0]) * w, bh = (box[3] - box[1]) * h;
    const k = Math.min(bw / bmp.width, bh / bmp.height);   // contain, appeso dall'alto
    const dw = bmp.width * k, dh = bmp.height * k;
    g.drawImage(bmp, bx + (bw - dw) / 2, by, dw, dh);
  }
  return c;
}

export const CATS = { upper: 'Sopra', lower: 'Sotto', overall: 'Interi', outerwear: 'Capispalla', shoes: 'Scarpe', accessory: 'Accessori' };

/* Le chiavi API non stanno nel browser. Questa versione non chiama nessun modello:
   se qualcuno aveva salvato una chiave con una versione precedente, qui sparisce. */
export function dimenticaChiavi() {
  const via = [];
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.startsWith('vw.key') || k === 'vw.provider')) { localStorage.removeItem(k); via.push(k); }
  }
  return via;
}
