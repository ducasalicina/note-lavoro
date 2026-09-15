/* ============================================================
   brt-store.js
   Dati offline-first + sincronizzazione su repo GitHub privato.

   Principio: nessun dispositivo scrive mai sul file di un altro.
     log/<dispositivo>.ndjson   una riga = un evento, solo in append
     snapshot.json              compattazione periodica
   Lo stato si ottiene rigiocando tutti gli eventi in ordine.
   Conflitti di scrittura: impossibili per costruzione.
   ============================================================ */

import { parse } from './brt-classificatore.js';

const DB_NOME = 'brt-note';
const DB_VER  = 1;

let cfg = {
  owner: null,        // 'ducasalicina'
  repo:  null,        // 'log-lavoro'
  ramo:  'main',
  dev:   null         // 'pc' | 'tel' | ...
};

let db = null;
let stato = new Map();   // id -> item ricostruito
let seq = 0;

/* ---------- IndexedDB (wrapper minimo a promesse) ---------- */

function apriDB() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB_NOME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('eventi'))    d.createObjectStore('eventi', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('coda'))      d.createObjectStore('coda',   { keyPath: 'k' });
      if (!d.objectStoreNames.contains('immagini'))  d.createObjectStore('immagini');
      if (!d.objectStoreNames.contains('meta'))      d.createObjectStore('meta');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror   = () => ko(r.error);
  });
}

const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
const prom = req => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

/* ---------- riduttore: eventi -> stato ---------- */

const chiave = e => `${e.at}|${e.dev}|${e.seq}`;

function ordina(eventi) {
  return eventi.sort((a, b) =>
    a.at - b.at || (a.dev < b.dev ? -1 : a.dev > b.dev ? 1 : 0) || a.seq - b.seq);
}

function rigioca(eventi) {
  const m = new Map();
  for (const e of ordina(eventi.slice())) {
    if (e.ev === 'new') {
      m.set(e.id, {
        id: e.id, creato: e.at, dev: e.dev, testo: e.t || '',
        cat: e.cat || null, da: e.da || null, tag: e.tag || [],
        priorita: e.pr || 0, scadenza: e.sc || null,
        stato: 'inbox', ticket: null, img: 0, agg: e.at
      });
    } else if (e.ev === 'upd') {
      const it = m.get(e.id); if (!it) continue;
      /* Ultima scrittura vince, campo per campo: siccome tutti i
         dispositivi rigiocano gli stessi eventi nello stesso ordine,
         il risultato converge ovunque. */
      for (const [k, v] of Object.entries(e.p || {})) it[k] = v;
      it.agg = e.at;
    } else if (e.ev === 'del') {
      m.delete(e.id);
    }
  }
  return m;
}

/* ---------- API pubblica ---------- */

export async function init({ owner, repo, ramo = 'main', dev }) {
  cfg = { owner, repo, ramo, dev };
  db = await apriDB();
  const eventi = await prom(tx('eventi').getAll());
  stato = rigioca(eventi);
  return stato.size;
}

export const token   = {
  set: t => localStorage.setItem('brt.tok', t),
  get: () => localStorage.getItem('brt.tok'),
  via: () => localStorage.removeItem('brt.tok')
};

function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function registra(e) {
  e.dev = cfg.dev;
  e.at  = e.at || Date.now();
  e.seq = ++seq;
  const k = chiave(e);
  await prom(tx('eventi', 'readwrite').put({ ...e, k }));
  await prom(tx('coda',   'readwrite').put({ ...e, k }));
  stato = rigioca(await prom(tx('eventi').getAll()));
  sincronizza().catch(() => {});   // in background, senza bloccare la UI
  return e;
}

/** Cattura: niente attese, niente rete. */
export async function aggiungi(riga) {
  const p = parse(riga);
  const e = { ev: 'new', id: nuovoId(), t: p.testo, cat: p.cat, da: p.da,
              tag: p.tag, pr: p.priorita, sc: p.scadenza };
  await registra(e);
  return stato.get(e.id);
}

/** patch es. { stato:'corso' } oppure { cat:'API', ticket:'INC12345' } */
export async function modifica(id, patch) {
  await registra({ ev: 'upd', id, p: patch });
  return stato.get(id);
}

export async function elimina(id) {
  await registra({ ev: 'del', id });
}

/** L'evento contrario di `elimina`: riscrive la nota com'era, stesso id.
 *  Il log è in sola aggiunta, quindi non si "toglie" un `del`: gli si scrive sopra un
 *  `new` che, rigiocato dopo, rimette l'elemento al suo posto su tutti i dispositivi.
 *
 *  `item` è lo stato RIGIOCATO al momento dell'eliminazione, non l'evento di creazione:
 *  il `new` porta quindi dentro i valori attuali, e i vecchi `upd` — che nel rigioco
 *  capitano prima di lui, perché hanno un `at` più vecchio — cadono su `if (!it)` senza
 *  fare niente. È il motivo per cui una nota molto modificata torna com'era e non com'era
 *  nata.
 *
 *  `creato` invece il `new` lo riscriverebbe con l'ora del ripristino, e non si può
 *  ovviare mettendo un `at` più vecchio: l'evento finirebbe prima del `del` e verrebbe
 *  cancellato di nuovo. Passa quindi dalla patch, che si applica dopo. */
export async function ripristina(item) {
  await registra({
    ev: 'new', id: item.id, t: item.testo, cat: item.cat, da: item.da,
    tag: item.tag, pr: item.priorita, sc: item.scadenza
  });
  const resto = {};
  for (const k of ['stato', 'rc', 'ticket', 'esito', 'src', 'fs', 'pf', 'ca', 'img', 'creato']) {
    if (item[k] != null) resto[k] = item[k];
  }
  if (Object.keys(resto).length) await registra({ ev: 'upd', id: item.id, p: resto });
  return stato.get(item.id);
}

/** Le immagini restano sul dispositivo: nel log viaggia solo il flag. */
export async function allegaImmagine(id, file, latoMax = 1280, q = 0.7) {
  const blob = await ridimensiona(file, latoMax, q);
  const attuali = await prom(tx('immagini').get(id)) || [];
  attuali.push(blob);
  await prom(tx('immagini', 'readwrite').put(attuali, id));
  await registra({ ev: 'upd', id, p: { img: attuali.length } });
  return attuali.length;
}

export const immagini = id => prom(tx('immagini').get(id));

function ridimensiona(file, latoMax, q) {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, latoMax / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? ok(b) : ko(new Error('conversione fallita')), 'image/jpeg', q);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = ko;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- lettura ---------- */

export function elenco({ stato: st, area, cat, testo, da } = {}) {
  let v = [...stato.values()];
  if (st)   v = v.filter(i => i.stato === st);
  if (cat)  v = v.filter(i => i.cat === cat);
  if (area) v = v.filter(i => AREA_DI[i.cat] === area);
  if (da)   v = v.filter(i => (i.da || '').toLowerCase() === da.toLowerCase());
  if (testo) {
    const q = testo.toLowerCase();
    v = v.filter(i => (i.testo + ' ' + (i.da || '') + ' ' + (i.tag || []).join(' ')).toLowerCase().includes(q));
  }
  /* Era `b.pr - a.pr`, ma rigioca() salva il campo come `priorita`: il confronto dava
     NaN e l'ordinamento per priorità non è mai avvenuto, silenziosamente. */
  return v.sort((a, b) => b.priorita - a.priorita || b.creato - a.creato);
}

let AREA_DI = {};
export function mappaAree(CATEGORIE) {
  AREA_DI = Object.fromEntries(CATEGORIE.map(c => [c.cod, c.area]));
}

/* `oggi()` è stato tolto: aveva la giacenza fissa a sette giorni, che il progetto ha
   abbandonato, e non sapeva niente di `rc`. La fascia se la calcola l'app. */

/* ---------- stato della sincronizzazione ---------- */

/** Quanti eventi aspettano di partire. Serve all'indicatore "in coda N". */
export const inCoda = () => prom(tx('coda').getAll()).then(v => v.length);

/** Quando è andata a buon fine l'ultima sincronizzazione, o `undefined`. */
export const ultimaSync = () => prom(tx('meta').get('ultimaSync'));

/** Svuota l'archivio locale e basta: il repo dati non viene toccato, quindi alla prima
    sincronizzazione gli eventi tornano indietro da GitHub e le note riappaiono.
    Serve a ripartire puliti dopo le prove, senza passare dalla console. */
export async function svuota() {
  for (const nome of ['eventi', 'coda', 'immagini', 'meta']) {
    await prom(tx(nome, 'readwrite').clear());
  }
  stato = new Map();
  seq = 0;
}

/** Cancella per davvero: azzera i log e lo snapshot nel repo dati, poi l'archivio locale.
    Questa non torna indietro da nessuna parte — è l'unica operazione dell'applicazione
    che il log degli eventi non sa annullare, perché cancella il log stesso. */
export async function cancellaTutto() {
  const lista = await gh(`/contents/log?ref=${cfg.ramo}`) || [];
  for (const f of lista.filter(f => f.name.endsWith('.ndjson'))) {
    const r = await leggi(`log/${f.name}`);
    await scrivi(`log/${f.name}`, '', r.sha, 'cancellazione totale richiesta dall\'app');
  }
  const snap = await leggi('snapshot.json');
  if (snap.sha) await scrivi('snapshot.json', '', snap.sha, 'cancellazione totale');
  await svuota();
  return lista.length;
}

/* ---------- GitHub ---------- */

const API = 'https://api.github.com';

async function gh(percorso, opt = {}) {
  const t = token.get();
  if (!t) throw new Error('token assente');
  const r = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}${percorso}`, {
    ...opt,
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opt.headers || {})
    }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);
  return r.json();
}

/* base64 sicuro con UTF-8 (i nomi dei clienti hanno accenti) */
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const deB64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));

async function leggi(path) {
  const j = await gh(`/contents/${path}?ref=${cfg.ramo}`);
  return j ? { testo: deB64(j.content), sha: j.sha } : { testo: '', sha: null };
}

async function scrivi(path, testo, sha, messaggio) {
  return gh(`/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: messaggio, content: b64(testo), branch: cfg.ramo, ...(sha ? { sha } : {})
    })
  });
}

let inCorso = false;

/**
 * Push della coda sul proprio file, poi pull dei file altrui.
 * Idempotente: gli eventi hanno chiave univoca, rileggere non duplica.
 */
export async function sincronizza() {
  if (inCorso || !navigator.onLine || !token.get()) return { saltata: true };
  inCorso = true;
  try {
    const mio = `log/${cfg.dev}.ndjson`;

    // 1) push
    const coda = await prom(tx('coda').getAll());
    if (coda.length) {
      const righe = ordina(coda).map(({ k, ...e }) => JSON.stringify(e)).join('\n');
      let { testo, sha } = await leggi(mio);
      const nuovo = (testo ? testo.replace(/\n*$/, '\n') : '') + righe + '\n';
      try {
        await scrivi(mio, nuovo, sha, `note ${cfg.dev} ${new Date().toISOString().slice(0, 16)}`);
      } catch (err) {
        // 409: stessa app aperta in due schede. Rileggo e riprovo una volta.
        const r2 = await leggi(mio);
        await scrivi(mio, (r2.testo ? r2.testo.replace(/\n*$/, '\n') : '') + righe + '\n', r2.sha, 'note (retry)');
      }
      const s = tx('coda', 'readwrite');
      for (const c of coda) s.delete(c.k);
    }

    // 2) pull: scopre da solo i dispositivi presenti
    const lista = await gh(`/contents/log?ref=${cfg.ramo}`) || [];
    const noti = new Set((await prom(tx('eventi').getAllKeys())));
    const nuoviEventi = [];

    const snap = await leggi('snapshot.json');
    if (snap.testo) {
      for (const e of JSON.parse(snap.testo).eventi || []) {
        if (!noti.has(chiave(e))) nuoviEventi.push(e);
      }
    }
    for (const f of lista.filter(f => f.name.endsWith('.ndjson') && f.name !== `${cfg.dev}.ndjson`)) {
      const { testo } = await leggi(`log/${f.name}`);
      for (const riga of testo.split('\n')) {
        if (!riga.trim()) continue;
        try {
          const e = JSON.parse(riga);
          if (!noti.has(chiave(e))) nuoviEventi.push(e);
        } catch { /* riga corrotta: la salto, il resto del log resta valido */ }
      }
    }

    if (nuoviEventi.length) {
      const s = tx('eventi', 'readwrite');
      for (const e of nuoviEventi) s.put({ ...e, k: chiave(e) });
      await new Promise(ok => s.transaction.oncomplete = ok);
      stato = rigioca(await prom(tx('eventi').getAll()));
    }

    await prom(tx('meta', 'readwrite').put(Date.now(), 'ultimaSync'));
    return { inviati: coda.length, ricevuti: nuoviEventi.length };
  } finally {
    inCorso = false;
  }
}

/**
 * Compattazione: da lanciare dal PC quando i log superano ~2000 righe.
 * Riversa tutto in snapshot.json e azzera i log dei dispositivi.
 */
export async function compatta() {
  const eventi = ordina(await prom(tx('eventi').getAll())).map(({ k, ...e }) => e);
  const snap = await leggi('snapshot.json');
  await scrivi('snapshot.json', JSON.stringify({ v: 1, il: Date.now(), eventi }, null, 0),
               snap.sha, `snapshot ${eventi.length} eventi`);
  const lista = await gh(`/contents/log?ref=${cfg.ramo}`) || [];
  for (const f of lista.filter(f => f.name.endsWith('.ndjson'))) {
    const r = await leggi(`log/${f.name}`);
    await scrivi(`log/${f.name}`, '', r.sha, 'azzeramento post snapshot');
  }
  return eventi.length;
}

/* Sync opportunistica: al ritorno della rete e quando torni sull'app */
addEventListener('online', () => sincronizza().catch(() => {}));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sincronizza().catch(() => {});
});
