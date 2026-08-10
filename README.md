# Vesta

Armadio virtuale. Fotografi i vestiti che possiedi, li ritagli su fondo trasparente e li provi addosso a una tua foto.

Vibe coded da Eugenio Nerelli e Gianmattia Barone.

Ci sono due versioni, e la differenza è dove sta il modello.

## Nel browser

**https://nerln.github.io/vesta/app.html**

Si apre e funziona. Non c'è niente da installare, non c'è account, non c'è nessun campo dove incollare una chiave API, e nessuna immagine lascia il dispositivo.

- Ritaglio dei capi dal fondo tinta unita: misura il colore sul bordo, l'alfa viene dalla distanza e solo il fondo collegato al bordo diventa trasparente. Gira su canvas, fra i 12 e i 56 ms su un'immagine da mezzo megapixel. Se il capo ha lo stesso colore del muro, o se il fondo non è uniforme, lo dice invece di consegnare un ritaglio bucato.
- Guardaroba filtrabile, con nove capi di prova già dentro.
- Trascini il capo sulla figura e il montaggio è immediato.
- "Salva il look" compone un PNG vero, esportabile, che finisce nel lookbook.
- Tutto in IndexedDB: resta lì e sparisce solo se cancelli i dati del sito.
- Italiano e inglese, tema scuro e chiaro, installabile sulla schermata Home dell'iPhone.

Nessun modello gira qui, quindi niente prova generata: per quella serve il backend.

## Sul Mac, con il backend

Qui vivono i modelli, e il ritaglio diventa generativo: il capo viene ridisegnato come foto di catalogo su fondo chroma invece che scontornato, poi il chroma diventa trasparenza. La prova viene generata davvero sulla figura.

```bash
cd backend
python3.11 -m venv .venv
.venv/bin/pip install -r ../requirements.txt
git clone https://github.com/Zheng-Chong/CatVTON
.venv/bin/python download_weights.py
.venv/bin/python prep_wardrobe.py
.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8770
```

Apri http://127.0.0.1:8770, oppure http://IP-DEL-MAC:8770 dallo smartphone sulla stessa rete.

Serve un Mac Apple Silicon e Python 3.11. Il primo avvio scarica circa quattro gigabyte di pesi.

- Try-on con CatVTON su MPS, circa novanta secondi a prova.
- Maschere con `segformer_b2_clothes`, senza detectron2.
- Analisi colore: sottotono della pelle in CIELAB, stagione e palette.
- Modelli a pagamento: la chiave sta in `backend/.keys.json` (fuori da git) o nelle variabili `OPENAI_API_KEY` e `GEMINI_API_KEY`, la chiamata parte dal server e la chiave non arriva mai al client.

## Perché le chiavi non stanno nel browser

Un campo dove incollare una chiave API dentro una pagina web è una cattiva idea, e su GitHub Pages lo è due volte: tutti i progetti di uno stesso account condividono l'origine `<utente>.github.io`, quindi una chiave in `localStorage` sarebbe leggibile da qualunque altra pagina dello stesso account. La versione nel browser non ne ha nessuna, e all'avvio cancella quelle salvate da versioni precedenti.

C'è anche un fatto misurato che vale la pena sapere: le API di OpenAI non sono chiamabili da una pagina web. Una POST con l'header `Authorization` non parte, perché il preflight non viene autorizzato; la stessa richiesta senza quell'header risponde 401. Gemini invece risponde. Quindi anche volendo, quel campo avrebbe funzionato con un solo provider su due.

## App iOS

Scaffold SwiftUI in `ios/`: una WKWebView verso il server, con l'indirizzo configurabile.

## Licenze

CatVTON e IDM-VTON hanno licenza non commerciale, quindi valgono per uso personale e per ricerca ma non per un prodotto. Sostituirli è la cosa da fare prima di qualunque lancio. Il piano per App Store e abbonamenti è in [PIANO.md](PIANO.md).
