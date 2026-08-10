/* Vesta, il piccolo motore di movimento.
 *
 * Qui non ci sono transizioni CSS: ci sono molle. La differenza si sente
 * quando un gesto viene interrotto a meta'. Una transizione riparte da capo
 * con la sua durata fissa; una molla conserva la velocita' che l'oggetto
 * aveva gia', quindi il trascinamento non "scatta" e il rilascio continua
 * il movimento invece di ricominciarlo.
 *
 * Tutto passa da un solo requestAnimationFrame condiviso: N molle su un
 * ciclo, non N cicli. E si tocca solo transform e opacity, mai geometria.
 */

const ridotto = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ------------------------------------------------------------------ ciclo */
const attivi = new Set();
let girando = false, tPrec = 0;

function ciclo(t) {
  const dt = Math.min(0.064, (t - tPrec) / 1000) || 0.016;  // niente salti dopo un blocco
  tPrec = t;
  for (const f of attivi) if (f(dt, t) === false) attivi.delete(f);
  girando = attivi.size > 0;
  if (girando) requestAnimationFrame(ciclo);
}

/** Aggiunge una funzione al ciclo condiviso. Torna false per uscirne. */
export function ogniFrame(f) {
  attivi.add(f);
  if (!girando) { girando = true; tPrec = performance.now(); requestAnimationFrame(ciclo); }
  return () => attivi.delete(f);
}

/* ------------------------------------------------------------------ molla */
export const MOLLE = {
  dolce:   { k: 120, c: 20, m: 1 },   // pannelli, cose grandi
  pronta:  { k: 300, c: 22, m: 1 },   // bottoni, interruttori
  elastica:{ k: 420, c: 16, m: 1 },   // il capo che cade addosso
  pesante: { k: 100, c: 18, m: 2 },   // fogli modali
};

/** Una molla a un grado di liberta', integrata a passo fisso per non esplodere. */
export class Molla {
  constructor(valore = 0, preset = MOLLE.pronta) {
    this.x = valore; this.meta = valore; this.v = 0;
    Object.assign(this, preset);
  }
  verso(meta, slancio = 0) { this.meta = meta; this.v += slancio; return this; }
  fermo(tolleranza = 0.4) { return Math.abs(this.x - this.meta) < tolleranza * 0.01 && Math.abs(this.v) < tolleranza; }
  avanza(dt) {
    if (ridotto.matches) { this.x = this.meta; this.v = 0; return this.x; }
    // sotto-passi fissi: con dt variabile una molla rigida diverge
    let resta = dt;
    const h = 1 / 240;
    while (resta > 0) {
      const p = Math.min(h, resta); resta -= p;
      const a = (-this.k * (this.x - this.meta) - this.c * this.v) / this.m;
      this.v += a * p;
      this.x += this.v * p;
    }
    return this.x;
  }
}

/** Molle x/y accoppiate: il caso del trascinamento. */
export class Molla2 {
  constructor(x = 0, y = 0, preset = MOLLE.pronta) {
    this.mx = new Molla(x, preset); this.my = new Molla(y, preset);
  }
  verso(x, y, vx = 0, vy = 0) { this.mx.verso(x, vx); this.my.verso(y, vy); return this; }
  avanza(dt) { return [this.mx.avanza(dt), this.my.avanza(dt)]; }
  get fermo() { return this.mx.fermo() && this.my.fermo(); }
}

/* --------------------------------------------------------------- gesti */
/**
 * Trascinamento con inerzia: tiene la velocita' vera del puntatore, cosi'
 * al rilascio l'oggetto continua invece di fermarsi di colpo.
 */
export function traccia() {
  let ux = 0, uy = 0, ut = 0, vx = 0, vy = 0;
  return {
    inizia(x, y) { ux = x; uy = y; ut = performance.now(); vx = vy = 0; },
    muovi(x, y) {
      const t = performance.now(), dt = Math.max(8, t - ut) / 1000;
      // media esponenziale: un singolo evento sporco non falsa il lancio
      vx = vx * 0.6 + ((x - ux) / dt) * 0.4;
      vy = vy * 0.6 + ((y - uy) / dt) * 0.4;
      ux = x; uy = y; ut = t;
    },
    get velocita() {
      const fermo = performance.now() - ut > 90;   // dito appoggiato: niente lancio
      return fermo ? [0, 0] : [vx, vy];
    },
  };
}

/* ------------------------------------------------- rivelazioni a scaglioni */
export function rivela(radice = document, ritardo = 55) {
  if (ridotto.matches) {
    radice.querySelectorAll('[data-rivela]').forEach(e => e.classList.add('visto'));
    return () => {};
  }
  const oss = new IntersectionObserver((voci) => {
    const entrati = voci.filter(v => v.isIntersecting).map(v => v.target);
    entrati.forEach((el, i) => {
      el.style.setProperty('--ritardo', (i * ritardo) + 'ms');
      el.classList.add('visto');
      oss.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  radice.querySelectorAll('[data-rivela]:not(.visto)').forEach(e => oss.observe(e));
  return () => oss.disconnect();
}

/* ------------------------------------------------------- numero che sale */
export function contaFino(el, a, durata = 700) {
  const da = parseFloat(el.dataset.valore || '0') || 0;
  if (da === a || ridotto.matches) { el.textContent = a; el.dataset.valore = a; return; }
  el.dataset.valore = a;
  const t0 = performance.now();
  ogniFrame(() => {
    const p = Math.min(1, (performance.now() - t0) / durata);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(da + (a - da) * e);
    return p < 1;
  });
}

export const motoRidotto = () => ridotto.matches;
