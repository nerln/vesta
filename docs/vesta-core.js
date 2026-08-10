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

/* -------------------------------------------------- rimozione del fondo chroma
   Stessa logica del motore Python: chiave misurata sul bordo, alpha come massimo
   fra distanza e cromaticita', solo il fondo collegato al bordo diventa
   trasparente, colore ricostruito sui bordi e despill in una fascia stretta. */
const T_TRA = 12, T_OPA = 220, K_LO = .25, K_HI = .80, SPILL = 8;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
export const hexRgb = (h) => { h = (h || '').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0); };

export function pickKey(colorHex) {
  const keys = { '#00ff00': [0, 255, 0], '#ff00ff': [255, 0, 255], '#0000ff': [0, 0, 255] };
  if (!colorHex) return '#00ff00';
  const g = hexRgb(colorHex);
  let best = '#00ff00', bd = -1;
  for (const k in keys) { const v = keys[k];
    const d = Math.hypot(v[0] - g[0], v[1] - g[1], v[2] - g[2]);
    if (d > bd) { bd = d; best = k; } }
  return best;
}
function axis(key) {
  const thr = Math.max(Math.max(...key) * .5, 40);
  const pos = [0, 1, 2].filter((i) => key[i] >= thr);
  const neg = [0, 1, 2].filter((i) => !pos.includes(i));
  return pos.length && neg.length ? [pos, neg] : [[1], [0, 2]];
}
/** Da immagine su fondo pieno a canvas RGBA trasparente. */
export function stripChroma(src, keyHex) {
  const w = src.width, h = src.height;
  const g = src.getContext ? src.getContext('2d') : null;
  const cv = g ? src : (() => { const c = canvasOf(w, h); c.getContext('2d').drawImage(src, 0, 0); return c; })();
  const ctx = cv.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h), d = img.data;

  // chiave misurata: la mediana delle fasce di bordo
  const band = Math.max(2, Math.min(12, (h / 8) | 0, (w / 8) | 0));
  const samp = [[], [], []];
  const push = (x, y) => { const i = (y * w + x) * 4; samp[0].push(d[i]); samp[1].push(d[i + 1]); samp[2].push(d[i + 2]); };
  for (let y = 0; y < band; y++) for (let x = 0; x < w; x += 2) { push(x, y); push(x, h - 1 - y); }
  for (let x = 0; x < band; x++) for (let y = 0; y < h; y += 2) { push(x, y); push(w - 1 - x, y); }
  const med = samp.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; });
  const declared = keyHex ? hexRgb(keyHex) : null;
  const [pos, neg] = axis(declared || med);
  const keyness = Math.min(...pos.map((i) => med[i])) - Math.max(...neg.map((i) => med[i]));
  const key = keyness >= 30 ? med : (declared || med);
  const keyScore = Math.max(Math.min(...pos.map((i) => key[i])) - Math.max(...neg.map((i) => key[i])), 1);

  const alpha = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const dist = Math.hypot(r - key[0], gg - key[1], b - key[2]);
    const aDist = smooth((dist - T_TRA) / (T_OPA - T_TRA));
    const px = [r, gg, b];
    const score = Math.min(...pos.map((k) => px[k])) - Math.max(...neg.map((k) => px[k]));
    const aKey = 1 - smooth((score / keyScore - K_LO) / (K_HI - K_LO));
    alpha[p] = Math.max(aDist, aKey);
  }

  // fondo = solo cio' che e' collegato al bordo (un dettaglio verde interno resta)
  const bg = new Uint8Array(w * h);
  const q = new Int32Array(w * h); let qs = 0, qe = 0;
  const seed = (p) => { if (!bg[p] && alpha[p] < .5) { bg[p] = 1; q[qe++] = p; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (qs < qe) {
    const p = q[qs++], x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
  }

  // fascia di bordo per il despill
  const edge = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (bg[p]) {
    const x = p % w, y = (p / w) | 0;
    for (let dy = -SPILL; dy <= SPILL; dy++) for (let dx = -SPILL; dx <= SPILL; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = ny * w + nx; if (!bg[np]) edge[np] = 1;
    }
  }

  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    let a = bg[p] ? alpha[p] : 1;
    a = Math.min(1, Math.max(0, a));
    if (a > .15 && a < .995) {   // colore ricostruito togliendo il fondo
      for (let k = 0; k < 3; k++)
        d[i + k] = Math.min(255, Math.max(0, (d[i + k] - (1 - a) * key[k]) / a));
    }
    if (edge[p] || (a > .05 && a < .995)) {  // despill solo lungo il contorno
      const cap = Math.max(...neg.map((k) => d[i + k]));
      for (const k of pos) d[i + k] = Math.min(d[i + k], cap);
    }
    d[i + 3] = Math.round(a * 255);
    if (d[i + 3] === 0) { d[i] = d[i + 1] = d[i + 2] = 0; }
  }
  const out = canvasOf(w, h);
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
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

/* ------------------------------------------------------------------ modelli */
export const settings = {
  get provider() { return localStorage.getItem('vw.provider') || 'gemini'; },
  set provider(v) { localStorage.setItem('vw.provider', v); },
  get key() { return localStorage.getItem('vw.key.' + this.provider) || ''; },
  set key(v) { v ? localStorage.setItem('vw.key.' + this.provider, v) : localStorage.removeItem('vw.key.' + this.provider); },
  keyFor(p) { return localStorage.getItem('vw.key.' + p) || ''; },
  get ready() { return !!this.key; },
};

const GEMINI_TEXT = 'gemini-2.5-flash';
const GEMINI_IMAGE = 'gemini-2.5-flash-image';
const OPENAI_TEXT = 'gpt-4.1-mini';
const OPENAI_IMAGE = 'gpt-image-1';
const geminiBase = (k) => k.startsWith('AQ.')
  ? 'https://aiplatform.googleapis.com/v1/publishers/google/models'
  : 'https://generativelanguage.googleapis.com/v1beta/models';

function friendly(provider, status, msg) {
  const m = (msg || '').slice(0, 200);
  if (provider === 'gemini') {
    if (status === 429 && /free_tier/.test(m))
      return 'La chiave gratuita di Gemini non include la generazione di immagini. Attiva la fatturazione su aistudio.google.com: circa 0,04 $ a immagine.';
    if (status === 400 && /API key not valid/i.test(m)) return 'Chiave Gemini non valida.';
    if (status === 401 || status === 403)
      return 'Gemini rifiuta la chiave. Le chiavi che iniziano con AQ. sono di Vertex express e spesso non sono abilitate: creane una che inizia con AIza.';
  }
  if (status === 401) return 'Chiave non valida.';
  if (status === 429) return 'Troppe richieste, riprova fra poco.';
  return `${provider}: errore ${status}. ${m}`;
}
/** Il browser blocca le chiamate a OpenAI: l'header Authorization fa scattare un preflight
 *  che api.openai.com non autorizza. Qui il muro diventa un messaggio comprensibile. */
export const OPENAI_NEL_BROWSER = false;
async function post(url, init, provider) {
  try { return await fetch(url, init); }
  catch (e) {
    if (provider === 'openai') throw new Error(
      'OpenAI non accetta chiamate dirette da una pagina web: il browser le blocca prima di partire. '
      + 'Qui usa Gemini, oppure la versione con il backend sul tuo Mac.');
    throw new Error('Rete non raggiungibile. Controlla la connessione e riprova.');
  }
}
const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob);
});
/** Immagine pronta per l'API: sempre JPEG, trasparenza appiattita su bianco (mai su nero). */
const toJpeg = async (x) => {
  const bmp = x instanceof Blob ? await createImageBitmap(x) : x;
  const s = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return toBlob(c, 'image/jpeg', .92);
};

/** Interroga un modello con visione e ottiene JSON. */
export async function visionJSON(prompt, images, schema) {
  const p = settings.provider, key = settings.key;
  if (!key) throw new Error('Serve una chiave per questa funzione.');
  const parts = [];
  for (const im of images) parts.push(await toJpeg(im));

  if (p === 'openai') {
    const content = [{ type: 'text', text: prompt }];
    for (const b of parts) content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + await blobToB64(b) } });
    const r = await post('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENAI_TEXT, messages: [{ role: 'user', content }],
        response_format: { type: 'json_schema', json_schema: { name: 'out', strict: true, schema } } }),
    }, 'openai');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(friendly('openai', r.status, j?.error?.message));
    return JSON.parse(j.choices[0].message.content);
  }

  const body = { contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) } };
  for (const b of parts) body.contents[0].parts.push({ inlineData: { mimeType: 'image/jpeg', data: await blobToB64(b) } });
  const r = await post(`${geminiBase(key)}/${GEMINI_TEXT}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'gemini');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly('gemini', r.status, j?.error?.message));
  const txt = (j.candidates || []).flatMap((c) => (c.content?.parts || []).map((x) => x.text || '')).join('');
  if (!txt.trim()) throw new Error('Il modello non ha risposto.');
  return JSON.parse(txt);
}
function toGeminiSchema(n) {
  if (!n || typeof n !== 'object') return n;
  const o = {};
  for (const k in n) {
    if (k === 'additionalProperties') continue;
    if (k === 'type') o.type = String(n[k]).toUpperCase();
    else if (k === 'properties') { o.properties = {}; for (const p in n[k]) o.properties[p] = toGeminiSchema(n[k][p]); }
    else if (k === 'items') o.items = toGeminiSchema(n[k]);
    else o[k] = n[k];
  }
  return o;
}

/** Genera o modifica un'immagine. Restituisce un Blob PNG. */
export async function generateImage(prompt, images, opts = {}) {
  const p = settings.provider, key = settings.key;
  if (!key) throw new Error('Serve una chiave per generare.');
  const parts = [];
  for (const im of images) parts.push(await toJpeg(im));

  if (p === 'openai') {
    const fd = new FormData();
    fd.append('model', OPENAI_IMAGE);
    fd.append('prompt', prompt);
    fd.append('size', opts.size || '1024x1024');
    fd.append('quality', opts.quality || 'high');
    fd.append('input_fidelity', 'high');
    fd.append('n', '1');
    if (opts.transparent) fd.append('background', 'transparent');
    parts.forEach((b, i) => fd.append('image[]', b, `im${i}.jpg`));
    const r = await post('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd }, 'openai');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(friendly('openai', r.status, j?.error?.message));
    const bin = atob(j.data[0].b64_json);
    const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: 'image/png' });
  }

  const body = { contents: [{ parts: [{ text: prompt }] }] };
  for (const b of parts) body.contents[0].parts.push({ inlineData: { mimeType: 'image/jpeg', data: await blobToB64(b) } });
  const r = await post(`${geminiBase(key)}/${GEMINI_IMAGE}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'gemini');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly('gemini', r.status, j?.error?.message));
  for (const c of j.candidates || []) for (const part of c.content?.parts || []) {
    const blob = part.inlineData || part.inline_data;
    if (blob?.data) {
      const bin = atob(blob.data);
      const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], { type: 'image/png' });
    }
  }
  throw new Error('Nessuna immagine nella risposta: forse il contenuto e stato bloccato.');
}

/* ------------------------------------------------------------------ prompt */
export const CATS = { upper: 'Sopra', lower: 'Sotto', overall: 'Interi', outerwear: 'Capispalla', shoes: 'Scarpe', accessory: 'Accessori' };

const ITEM_PROPS = {
  slug: { type: 'string' }, label: { type: 'string' },
  category: { type: 'string', enum: Object.keys(CATS) },
  bbox: { type: 'array', items: { type: 'number' } },
  color_name: { type: 'string' }, color_hex: { type: 'string' },
  material: { type: 'string' }, silhouette: { type: 'string' }, construction: { type: 'string' },
  pattern: { type: 'string' }, graphic_policy: { type: 'string', enum: ['exact', 'mark-only', 'omit'] },
  graphic_text: { type: 'string' }, unknowns: { type: 'string' },
  confidence: { type: 'string', enum: ['high', 'medium', 'low'] }, description: { type: 'string' },
};
export const INVENTORY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: Object.keys(ITEM_PROPS), properties: ITEM_PROPS } } },
};
export const INVENTORY_PROMPT = `You are cataloguing the garments visible in this photograph for a wardrobe app.

List every deliberately worn or displayed garment: tops, bottoms, dresses, outerwear, shoes and
notable accessories. Ignore anything that is not clothing. At most 6 items, most prominent first.
If a garment is mostly hidden or you cannot tell what type it is, leave it out.

Report ONLY what is visible:
- slug: short lowercase-hyphenated english id
- label: short ITALIAN label, max 3 words
- category: upper, lower, overall, outerwear, shoes or accessory
- bbox: [left, top, right, bottom] floats 0..1, tight around the garment
- color_name: plain english colour; color_hex: dominant fabric colour as #rrggbb
- material, silhouette, construction, pattern: what you can actually see
- graphic_policy: exact if text is fully legible, mark-only if a graphic is visible but unreadable,
  otherwise omit; graphic_text: the legible text or empty
- unknowns: attributes you cannot see; confidence: high, medium or low
- description: one factual sentence in Italian

Never guess brands, logos, pockets or fasteners that are not clearly visible: prefer omission over
invention. Return JSON only.`;

export const PERSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['upper', 'lower', 'shoes', 'skin_hex', 'hair_hex', 'season', 'undertone', 'palette', 'advice'],
  properties: {
    upper: { type: 'array', items: { type: 'number' } },
    lower: { type: 'array', items: { type: 'number' } },
    shoes: { type: 'array', items: { type: 'number' } },
    skin_hex: { type: 'string' }, hair_hex: { type: 'string' },
    season: { type: 'string', enum: ['Primavera', 'Estate', 'Autunno', 'Inverno'] },
    undertone: { type: 'string', enum: ['caldo', 'freddo', 'neutro'] },
    palette: { type: 'array', items: { type: 'string' } },
    advice: { type: 'string' },
  },
};
export const PERSON_PROMPT = `Look at this photograph of a person and return JSON.

1. Bounding boxes as [left, top, right, bottom], floats 0..1 of the whole image:
   - upper: the torso area where a top would sit, from shoulders to hips, including the arms
   - lower: from the waist to the ankles
   - shoes: the feet; if the feet are not visible use [0,0,0,0]
2. skin_hex: the average skin colour of the face as #rrggbb
   hair_hex: the hair colour as #rrggbb
3. Judge the person's seasonal colour type (Primavera, Estate, Autunno, Inverno) and undertone.
4. palette: exactly 5 hex colours that suit this person, as #rrggbb
5. advice: one short sentence in Italian about which colours suit them.

Return JSON only.`;

export function reconstructPrompt(item, chromaHex) {
  const framing = {
    upper: 'straight front view, neck opening centred, both sleeves complete, cuffs and full hem visible',
    outerwear: 'straight front view, collar centred, both sleeves complete, closure and full hem visible',
    lower: 'straight front view, waistband at the top, both legs complete and parallel, both hems visible',
    overall: 'straight front view, neckline at the top, the full length of the garment, complete hem',
    shoes: 'the matched pair side by side, three quarter view from slightly above',
    accessory: 'the complete item, long axis aligned with the canvas, both ends visible',
  }[item.category] || 'straight front view, the complete item';
  const chroma = { '#00ff00': 'pure saturated green', '#ff00ff': 'pure saturated magenta', '#0000ff': 'pure saturated blue' }[chromaHex] || 'pure saturated green';
  const facts = [];
  if (item.color_name) facts.push('colour: ' + item.color_name);
  if (item.material) facts.push('material: ' + item.material);
  if (item.silhouette) facts.push('silhouette: ' + item.silhouette);
  if (item.construction) facts.push('construction: ' + item.construction);
  if (item.pattern) facts.push('pattern: ' + item.pattern);
  const graphic = item.graphic_policy === 'exact' && item.graphic_text
    ? `Reproduce the visible graphic exactly, including the text "${item.graphic_text}".`
    : item.graphic_policy === 'mark-only'
      ? 'A graphic is visible but not legible: render it as an abstract mark with the same shape and colours, no lettering.'
      : 'Omit all logos, lettering and branding: none is clearly readable in the source.';
  const unknowns = item.unknowns ? `Not visible in the source: ${item.unknowns}. Resolve in the plainest way and add no detail.` : '';

  return `Use case: background-extraction
Asset type: transparent ecommerce clothing catalog cutout, generated first on a removable chroma key

Input image: the reference photograph shows the exact same ${item.label} worn by a person. Use it only
to identify and reconstruct that single item. Do not mix in details from any other clothing.

Primary request: Reconstruct ONLY the complete empty ${item.label} as a clean ecommerce catalog product
photograph: ${framing}. Remove the wearer, body, skin, hair, every other garment and the whole scene.
Show the complete unoccluded item, naturally and symmetrically arranged, as if laid flat and steamed,
with no person, mannequin or hanger.

Item fidelity: preserve exactly what the source supports - ${facts.join('; ')}. ${graphic} ${unknowns}
Do not invent any other logo, lettering, label, pocket, seam, fastener, hardware, colour or decoration.

Composition: square canvas, item centred and complete inside the frame with generous even padding on
every side; nothing cropped or touching an edge.

Background: perfectly flat, absolutely uniform solid ${chroma} (${chromaHex}) from edge to edge. Exactly
one colour: no shadow, gradient, texture, vignette, floor, reflection or lighting variation.

Lighting: neutral diffuse product lighting on the item only; no cast shadow, contact shadow, reflection,
prop, watermark, caption or border.

Critical: use no ${chroma} anywhere on the item itself; keep a crisp separable outer silhouette; output
exactly one item.`;
}

export function tryonPrompt(items) {
  const list = items.map((i) => {
    const f = [i.color_name, i.material, i.silhouette].filter(Boolean).join(', ');
    return `- ${i.label}${f ? ` (${f})` : ''}`;
  }).join('\n');
  return `Photorealistic virtual try-on. The first image is the person. The following images are garments
shown as catalog cutouts. Dress the person in these garments:
${list}

Keep the person's face, hair, skin tone, pose, body shape and the background exactly the same. Replace
only the corresponding clothing. Reproduce each garment faithfully: same colour, fabric, cut and details.
Natural fabric drape and folds, consistent lighting and shadows, high detail, full body in frame.
Do not invent logos, lettering, pockets or hardware that are not visible in the garment images.`;
}
