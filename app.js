// app.js — interfaccia, eventi, rendering.
// Tre fasce sovrapposte: cattura, scadenze, contenuto.
// Su desktop le cinque liste stanno affiancate e si trascina; su telefono una lista per
// volta e si scorre la riga, perché trascinare card su schermo piccolo è solo frustrazione.

import { parse, classifica, CATEGORIE, AREE, categoria } from './brt-classificatore.js';
import * as Store from './brt-store.js';
import { seminaEsempi } from './dati-esempio.js';

const STATI = [
  { chiave: 'inbox', nome: 'Inbox' },
  { chiave: 'dafare', nome: 'Da fare' },
  { chiave: 'corso', nome: 'In corso' },
  { chiave: 'attesa', nome: 'Attesa' },
  { chiave: 'chiuso', nome: 'Chiuso' },
];

const ESITI = ['risolto', 'risposto', 'girato', 'decaduto'];

// ─── Ricontrollo ─────────────────────────────────────────────────────────────
// `rc` non è la scadenza. `sc` dice quando una cosa è dovuta a qualcun altro, `rc` quando
// voglio rimetterci gli occhi sopra: molte richieste non hanno scadenza e spariscono lo
// stesso.
//
// ATTENZIONE: i numeri qui sotto sono PROVVISORI. Sono stati scelti a tavolino, senza
// nessun dato dietro, solo per avere qualcosa che funzioni dal primo giorno. Vanno rivisti
// dopo due settimane di uso vero, guardando quante voci riemergono davvero e quante
// vengono rimandate subito: una colonna che si rimanda sempre ha la finestra troppo corta,
// una che non riemerge mai ce l'ha troppo lunga. Finché quella revisione non è stata fatta,
// non trattare questa tabella come una scelta ragionata: non lo è.

const RICONTROLLO = {
  inbox: { '*': 2 },
  dafare: { '*': 7, ACC: 3 },
  corso: { '*': 3, ESC: 5 },
  attesa: { '*': 5, ESC: 7, HW: 7 },
  chiuso: { '*': null },
};

/** Giorni di ricontrollo per una nota nel suo stato attuale. `null` = non si ricontrolla. */
function giorniRicontrollo(nota) {
  const riga = RICONTROLLO[nota.stato] || {};
  const giorni = nota.cat && riga[nota.cat] !== undefined ? riga[nota.cat] : riga['*'];
  return giorni ?? null;
}

/** La data di ricontrollo che spetta a una nota adesso. */
function nuovoRicontrollo(nota) {
  const giorni = giorniRicontrollo(nota);
  return giorni === null ? null : iso(sommaGiorni(new Date(), giorni));
}

// Limite WIP su "In corso": uno specchio, non un cancello. Dalla Tappa 2 sta nel pannello
// impostazioni; fino ad allora si ritocca da localStorage senza ricompilare niente.
// In navigazione privata su Safari iOS il solo accesso a localStorage può lanciare: senza
// questo try l'intero modulo non parte e la pagina resta bianca sul telefono aziendale.
const LIMITE_CORSO = leggiLimite();

function leggiLimite() {
  try {
    return Number(localStorage.getItem('limite_corso')) || 3;
  } catch {
    return 3;
  }
}

/* La configurazione sta in localStorage accanto al token, non nel log: descrive questo
   dispositivo, non il lavoro, e non ha senso sincronizzarla sugli altri. */
const CONFIG_DEFAULT = { owner: '', repo: '', dev: 'pc', esempi: false };

function cfg() {
  try {
    return { ...CONFIG_DEFAULT, ...JSON.parse(localStorage.getItem('brt.cfg') || '{}') };
  } catch {
    return { ...CONFIG_DEFAULT };
  }
}

function salvaCfg(parziale) {
  const nuova = { ...cfg(), ...parziale };
  try {
    localStorage.setItem('brt.cfg', JSON.stringify(nuova));
  } catch { /* archivio bloccato: la configurazione vale per questa sessione e basta */ }
  return nuova;
}

function token() {
  try {
    return Store.token.get();
  } catch {
    return null;
  }
}

// Vero solo se la MIA ultima sincronizzazione esplicita è fallita. Lo store fallisce in
// silenzio di suo, quindi senza questo l'indicatore non saprebbe mai di essere al buio.
let rete = { guasta: false };

// ─── Stato dell'interfaccia (i dati stanno nello store) ──────────────────────

let stat = 'inbox'; // lista mostrata sul telefono
let fascia = null; // contatore attivo nella fascia, che filtra il board
let filtro = '';
let trascinata = null;
let apertaId = null; // nota aperta nel dettaglio
let scadutoAnnulla = null;

const tutte = () => Store.elenco();

// ─── Utilità ─────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);

function nodo(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo != null) e.textContent = testo; // mai innerHTML con testo dell'utente
  return e;
}

function bottone(classe, testo) {
  const b = nodo('button', classe, testo);
  b.type = 'button';
  return b;
}

const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function sommaGiorni(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Giorni fra oggi e una data ISO. Negativo = passata. */
function giorniA(data) {
  if (!data) return null;
  return Math.round((new Date(data) - new Date(iso(new Date()))) / 86400000);
}

function giorniDa(quando) {
  return Math.floor((Date.now() - quando) / 86400000);
}

function etichettaScadenza(data) {
  const g = giorniA(data);
  if (g === null) return null;
  if (g < 0) return { testo: testoData(data), classe: 'scadenza--ritardo' };
  if (g === 0) return { testo: 'oggi', classe: 'scadenza--oggi' };
  if (g === 1) return { testo: 'domani', classe: '' };
  return { testo: testoData(data), classe: '' };
}

function testoData(data) {
  const d = new Date(data);
  return `${GIORNI_BREVI[d.getDay()]} ${d.getDate()}`;
}

const nomeCategoria = (cod) => categoria(cod)?.nome || '';

// ─── Criteri della fascia ────────────────────────────────────────────────────
// La fascia non elenca più le note: una sola riga di contatori che filtrano il board.
// Elencandole, la stessa nota compariva fino a tre volte nella stessa schermata — una
// per gruppo, più la sua card — e la fascia si mangiava un quarto dello schermo.

const FASCE = [
  { chiave: 'ritardo', nome: 'in ritardo', test: (n) => n.stato !== 'chiuso' && n.stato !== 'attesa' && giorniA(n.scadenza) < 0 },
  { chiave: 'oggi', nome: 'oggi', test: (n) => n.stato !== 'chiuso' && n.stato !== 'attesa' && giorniA(n.scadenza) === 0 },
  { chiave: 'ricontrollo', nome: 'da ricontrollare', test: (n) => scaduto(n) },
  { chiave: 'attesa', nome: 'in attesa', test: (n) => n.stato === 'attesa' },
];

// Il ricontrollo ha preso il posto della giacenza fissa a sette giorni, che non sapeva
// distinguere una richiesta che può aspettare un mese da una da rivedere domani.
function scaduto(nota) {
  return !!nota.rc && nota.stato !== 'chiuso' && giorniA(nota.rc) <= 0;
}

/** Quante note stanno davvero in uno stato, ignorando i filtri. */
const quante = (chiave) => tutte().filter((n) => n.stato === chiave).length;

/** Note di uno stato, già passate al contatore attivo e al filtro di ricerca. */
function visibili(chiave) {
  const q = filtro.trim().toLowerCase();
  const scelta = FASCE.find((f) => f.chiave === fascia);
  return tutte().filter((n) => {
    if (n.stato !== chiave) return false;
    if (scelta && !scelta.test(n)) return false;
    if (!q) return true;
    const dove = [n.testo, n.da || '', n.cat || '', n.ticket || '', (n.tag || []).join(' ')].join(' ');
    return dove.toLowerCase().includes(q);
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function disegna() {
  disegnaScadenze();
  disegnaBarra();
  disegnaColonne();
  disegnaDettaglio();
}

function disegnaScadenze() {
  const riga = nodo('div', 'contatori');

  FASCE.forEach((f, i) => {
    if (i > 0) {
      const sep = nodo('span', 'contatori__sep', '·');
      sep.setAttribute('aria-hidden', 'true');
      riga.append(sep);
    }
    const quanti = tutte().filter(f.test).length;
    const b = bottone(`contatore contatore--${f.chiave}`);
    b.setAttribute('aria-pressed', String(fascia === f.chiave));
    if (fascia === f.chiave) b.classList.add('is-attivo');
    b.append(nodo('span', 'contatore__numero', String(quanti)));
    b.append(nodo('span', 'contatore__nome', f.nome));
    // Ricliccare quello attivo toglie il filtro: nessun tasto "azzera" da cercare.
    b.addEventListener('click', () => {
      fascia = fascia === f.chiave ? null : f.chiave;
      disegna();
    });
    riga.append(b);
  });

  $('#fascia-scadenze').replaceChildren(riga);
}

function disegnaBarra() {
  const barra = $('#barra-stati');
  barra.replaceChildren();

  for (const s of STATI) {
    const tab = bottone(`stato-tab${s.chiave === 'attesa' ? ' stato-tab--attesa' : ''}`);
    tab.setAttribute('aria-selected', String(s.chiave === stat));
    tab.append(nodo('span', 'stato-tab__nome', s.nome));
    tab.append(contatore(s.chiave, 'stato-tab__conteggio'));
    tab.addEventListener('click', () => {
      stat = s.chiave;
      disegna();
    });
    barra.append(tab);
  }
}

/** Il conteggio della colonna. Su "In corso" diventa `n/limite`, che è la stessa cosa
 *  vista da più vicino: il limite si può superare, e quando succede si vede. */
function contatore(chiave, classe) {
  if (chiave !== 'corso') return nodo('span', classe, String(visibili(chiave).length));
  const quanti = quante('corso'); // il carico vero, non quello filtrato
  const e = nodo('span', classe, `${quanti}/${LIMITE_CORSO}`);
  if (quanti > LIMITE_CORSO) e.classList.add(`${classe}--oltre`);
  return e;
}

function disegnaColonne() {
  const griglia = nodo('div', 'colonne');

  for (const s of STATI) {
    const colonna = nodo('section', `colonna colonna--${s.chiave}`);
    if (s.chiave === stat) colonna.classList.add('is-attiva');

    const testa = nodo('div', 'colonna__intestazione');
    testa.append(nodo('span', 'colonna__nome', s.nome));
    testa.append(contatore(s.chiave, 'colonna__conteggio'));
    colonna.append(testa);

    const corpo = nodo('div', 'colonna__corpo');
    collegaRilascio(corpo, s.chiave);

    const elenco = visibili(s.chiave);
    if (elenco.length === 0) {
      corpo.append(nodo('div', 'colonna__vuota', desktop() ? 'Trascina qui' : 'Vuota'));
    } else {
      for (const n of elenco) corpo.append(desktop() ? disegnaNota(n) : disegnaRiga(n));
    }

    colonna.append(corpo);
    griglia.append(colonna);
  }

  $('#contenuto').replaceChildren(griglia);
}

function disegnaNota(n) {
  const carta = nodo('article', 'nota');
  carta.tabIndex = 0;
  carta.setAttribute('role', 'button');
  carta.setAttribute('aria-label', `Apri: ${n.testo}`);

  // Il codice da solo non dice niente a chi non lo sa già: accanto ci va il nome esteso.
  const cat = nodo('span', 'nota__categoria');
  if (n.cat) {
    cat.append(nodo('span', 'nota__codice', n.cat));
    cat.append(nodo('span', 'nota__nome-categoria', nomeCategoria(n.cat)));
  } else {
    cat.textContent = 'da classificare';
    cat.classList.add('nota__categoria--vuota');
  }
  // La piattaforma sta accanto alla categoria, non dentro: dove succede una cosa è
  // un'informazione diversa da che cosa è. Accessi e utenze + MyBRT, non "categoria MyBRT".
  if (n.pf) cat.append(nodo('span', 'nota__piattaforma', n.pf));
  carta.append(cat);

  carta.append(nodo('div', 'nota__titolo', n.testo));

  const meta = nodo('div', 'nota__meta');
  // Sul chiuso al posto della scadenza va l'esito: è l'unico riscontro visivo che ho
  // di quel campo, e senza non so mai se l'ho compilato.
  if (n.stato === 'chiuso') {
    if (n.esito) meta.append(nodo('span', 'nota__esito', n.esito));
  } else {
    const sc = etichettaScadenza(n.scadenza);
    if (sc) meta.append(nodo('span', `scadenza ${sc.classe}`.trim(), sc.testo));
  }
  if (n.da) meta.append(nodo('span', 'nota__da', n.da));
  if (n.priorita > 0 && n.stato !== 'chiuso') meta.append(nodo('span', 'nota__priorita', n.priorita > 1 ? '!!' : '!'));
  if (n.stato === 'attesa') meta.append(nodo('span', 'nota__ferma', `ferma da ${giorniDa(n.agg)} g`));
  // Rimanda si stacca a destra: è un'azione, e in mezzo agli altri sembrava un'etichetta.
  if (scaduto(n)) meta.append(bottoneRimanda(n));
  if (meta.childElementCount) carta.append(meta);

  carta.addEventListener('click', () => apri(n.id));
  carta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      apri(n.id);
    }
  });

  if (desktop()) {
    carta.draggable = true;
    carta.addEventListener('dragstart', () => {
      trascinata = n.id;
      carta.classList.add('is-trascinata');
    });
    carta.addEventListener('dragend', () => {
      trascinata = null;
      carta.classList.remove('is-trascinata');
      document.querySelectorAll('.is-sopra').forEach((e) => e.classList.remove('is-sopra'));
    });
  }

  return carta;
}

function bottoneRimanda(n) {
  const b = bottone('nota__rimanda', 'Rimanda');
  b.title = 'Sposta avanti il ricontrollo';
  // Sul telefono la card intera ascolta lo scorrimento: qui fermiamo il gesto sul nascere,
  // altrimenti il tap sul bottone parte come swipe da zero pixel e il click si perde.
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // non aprire il dettaglio
    rimanda(n.id);
  });
  return b;
}

/** Riga del telefono: la card sopra, le due destinazioni scoperte sotto. */
function disegnaRiga(n) {
  const riga = nodo('div', 'riga');
  const carta = disegnaNota(n);

  const chiudibile = n.stato !== 'chiuso';
  const avviabile = n.stato !== 'corso' && n.stato !== 'chiuso';

  const scoperta = nodo('div', 'riga__scoperta');
  scoperta.append(nodo('span', null, chiudibile ? '✓ Chiuso' : ''));
  scoperta.append(nodo('span', null, avviabile ? 'In corso →' : ''));
  riga.append(scoperta, carta);

  collegaScorrimento(riga, carta, scoperta, n, { chiudibile, avviabile });
  return riga;
}

// ─── Trascinamento (solo desktop) ────────────────────────────────────────────

function collegaRilascio(corpo, chiave) {
  if (!desktop()) return;
  corpo.addEventListener('dragover', (e) => {
    e.preventDefault();
    corpo.classList.add('is-sopra');
  });
  corpo.addEventListener('dragleave', () => corpo.classList.remove('is-sopra'));
  corpo.addEventListener('drop', (e) => {
    e.preventDefault();
    corpo.classList.remove('is-sopra');
    if (trascinata != null) sposta(trascinata, chiave);
    trascinata = null;
  });
}

// ─── Scorrimento (solo telefono) ─────────────────────────────────────────────

const SOGLIA = 70;

function collegaScorrimento(riga, carta, scoperta, n, puo) {
  let partenza = null;
  let dx = 0;

  carta.addEventListener('pointerdown', (e) => {
    if (desktop() || e.button !== 0) return;
    partenza = e.clientX;
    dx = 0;
    riga.classList.add('is-swipe');
    // Su un puntatore già rilasciato la cattura lancia: senza try il gesto resterebbe
    // a metà, con la riga in stato di scorrimento e nessuno che la rimette a posto.
    try {
      carta.setPointerCapture(e.pointerId);
    } catch { /* si scorre lo stesso, solo senza cattura */ }
  });

  carta.addEventListener('pointermove', (e) => {
    if (partenza === null) return;
    dx = e.clientX - partenza;
    if (dx > 0 && !puo.chiudibile) dx = 0;
    if (dx < 0 && !puo.avviabile) dx = 0;
    dx = Math.max(-116, Math.min(116, dx));
    carta.style.transform = `translateX(${dx}px)`;
    scoperta.style.opacity = String(Math.min(1, Math.abs(dx) / 56));
  });

  const rilascia = () => {
    if (partenza === null) return;
    const scelto = dx;
    partenza = null;
    riga.classList.remove('is-swipe');
    carta.style.transform = '';
    scoperta.style.opacity = '0';
    // Un dito che si è mosso stava scorrendo, non toccando: non aprire il dettaglio.
    if (Math.abs(scelto) > 4) carta.dataset.scorso = '1';
    if (scelto >= SOGLIA && puo.chiudibile) sposta(n.id, 'chiuso');
    else if (scelto <= -SOGLIA && puo.avviabile) sposta(n.id, 'corso');
  };

  carta.addEventListener('pointerup', rilascia);
  carta.addEventListener('pointercancel', rilascia);
  carta.addEventListener('click', (e) => {
    if (carta.dataset.scorso) {
      e.stopImmediatePropagation();
      delete carta.dataset.scorso;
    }
  }, true);
}

// ─── Azioni ──────────────────────────────────────────────────────────────────

function desktop() {
  return window.matchMedia('(min-width: 900px)').matches;
}

async function aggiungi(riga) {
  if (!riga.trim()) return;
  const letta = parse(riga);
  const nota = await Store.aggiungi(riga);
  // `aggiungi()` dello store scrive solo i campi che conosceva quando è stato scritto:
  // `src`, `rc` e la piattaforma arrivano subito dopo, con una patch. Due eventi invece
  // di uno, entrambi locali e istantanei.
  await Store.modifica(nota.id, { src: 'app', rc: nuovoRicontrollo(nota), pf: letta.pf });
  disegna();
}

async function sposta(id, verso) {
  const nota = tutte().find((n) => n.id === id);
  if (!nota || nota.stato === verso) return;
  const prima = { stato: nota.stato, rc: nota.rc ?? null };
  await Store.modifica(id, { stato: verso, rc: nuovoRicontrollo({ ...nota, stato: verso }) });
  disegna();

  const nome = STATI.find((s) => s.chiave === verso).nome;
  offriAnnulla(`Spostata in ${nome}`, async () => {
    await Store.modifica(id, prima); // l'evento contrario, non un dialogo "sei sicuro?"
    disegna();
  });
}

/** Un tap e basta: nessun dialogo, nessuna motivazione. Rimandare dieci volte è un dato
 *  interessante, non una colpa da giustificare — e nemmeno una barretta "Annulla", che
 *  dopo ogni rinvio sarebbe solo rumore: il rinvio si corregge rinviando ancora. */
async function rimanda(id) {
  const nota = tutte().find((n) => n.id === id);
  if (!nota) return;
  const quando = nuovoRicontrollo(nota);
  if (!quando) return;
  await Store.modifica(id, { rc: quando });
  disegna();
}

async function correggi(id, patch) {
  await Store.modifica(id, patch);
  disegna();
}

function offriAnnulla(descrizione, contrario) {
  const barra = $('#annulla');
  clearTimeout(scadutoAnnulla);
  $('#annulla-testo').textContent = descrizione;
  barra.hidden = false;
  const vecchio = $('#annulla-bottone');
  const nuovo = vecchio.cloneNode(true); // sgancia l'annullamento precedente
  vecchio.replaceWith(nuovo);
  nuovo.addEventListener('click', () => {
    barra.hidden = true;
    clearTimeout(scadutoAnnulla);
    contrario();
  });
  scadutoAnnulla = setTimeout(() => { barra.hidden = true; }, 5000);
}

// ─── Dettaglio ───────────────────────────────────────────────────────────────
// Senza questo il modello "indovina e correggi dopo" non sta in piedi: il classificatore
// sbaglia per costruzione — sotto soglia e sui pareggi non sceglie apposta — e se non c'è
// dove correggerlo, ogni errore resta lì per sempre. Perciò la categoria sta in cima, ed
// è la prima cosa che prende il fuoco quando la nota è ancora da classificare.

function apri(id) {
  apertaId = id;
  disegnaDettaglio();
  const primo = $('#dettaglio .categoria-scelta, #dettaglio input');
  if (primo) primo.focus();
}

function chiudiDettaglio() {
  apertaId = null;
  $('#dettaglio').hidden = true;
  $('#dettaglio-foglio').replaceChildren();
}

function disegnaDettaglio() {
  if (apertaId == null) return;
  const n = tutte().find((x) => x.id === apertaId);
  if (!n) return chiudiDettaglio();

  const foglio = $('#dettaglio-foglio');
  foglio.replaceChildren();

  const testa = nodo('header', 'dettaglio__testa');
  testa.append(nodo('p', 'dettaglio__testo', n.testo));
  const chiudi = bottone('dettaglio__chiudi', '✕');
  chiudi.setAttribute('aria-label', 'Chiudi');
  chiudi.addEventListener('click', chiudiDettaglio);
  testa.append(chiudi);
  foglio.append(testa);

  foglio.append(sezioneCategoria(n));
  foglio.append(campoTesto('Richiedente', n.da || '', 'chi ha chiesto', (v) => correggi(n.id, { da: v || null })));
  foglio.append(campoData('Scadenza', n.scadenza, 'quando è dovuta', (v) => correggi(n.id, { scadenza: v })));
  foglio.append(campoData('Ricontrollo', n.rc || null, 'quando la rivedo', (v) => correggi(n.id, { rc: v })));
  foglio.append(campoTesto('Numero ticket', n.ticket || '', 'vuoto = fuori dal sistema ufficiale', (v) => correggi(n.id, { ticket: v || null })));
  if (n.stato === 'chiuso') foglio.append(sezioneEsito(n));

  $('#dettaglio').hidden = false;
}

function sezioneCategoria(n) {
  const sez = nodo('section', 'dettaglio__sezione dettaglio__sezione--categoria');
  const testa = nodo('div', 'dettaglio__etichetta');
  testa.append(nodo('span', null, 'Categoria'));
  testa.append(nodo('span', 'dettaglio__attuale', n.cat ? `${n.cat} · ${nomeCategoria(n.cat)}` : 'da classificare'));
  sez.append(testa);

  // Sulle note che il classificatore non ha saputo decidere, le sue alternative vengono
  // per prime: sono i due o tre codici che aveva in testa quando ha rinunciato.
  if (!n.cat) {
    const alt = classifica(n.testo).alternative || [];
    if (alt.length) {
      const riga = nodo('div', 'categorie categorie--suggerite');
      for (const a of alt) riga.append(sceltaCategoria(n, a.cod));
      sez.append(nodo('div', 'dettaglio__nota', 'Il classificatore esitava fra queste'));
      sez.append(riga);
    }
  }

  for (const [chiave, area] of Object.entries(AREE)) {
    const gruppo = nodo('div', 'area');
    gruppo.append(nodo('span', 'area__nome', area.nome));
    const riga = nodo('div', 'categorie');
    for (const cod of area.cat) riga.append(sceltaCategoria(n, cod));
    gruppo.append(riga);
    sez.append(gruppo);
    gruppo.dataset.area = chiave;
  }

  if (n.cat) {
    const via = bottone('dettaglio__via', 'Togli la categoria');
    via.addEventListener('click', () => correggi(n.id, { cat: null }));
    sez.append(via);
  }
  return sez;
}

function sceltaCategoria(n, cod) {
  const c = categoria(cod);
  const b = bottone('categoria-scelta');
  b.title = c ? c.nome : cod;
  b.setAttribute('aria-pressed', String(n.cat === cod));
  if (n.cat === cod) b.classList.add('is-attiva');
  b.append(nodo('span', 'categoria-scelta__cod', cod));
  b.append(nodo('span', 'categoria-scelta__nome', c ? c.nome : ''));
  b.addEventListener('click', () => correggi(n.id, { cat: cod }));
  return b;
}

function sezioneEsito(n) {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', 'Esito'));
  const riga = nodo('div', 'esiti');
  for (const e of ESITI) {
    const b = bottone('esito-scelta', e);
    b.setAttribute('aria-pressed', String(n.esito === e));
    if (n.esito === e) b.classList.add('is-attivo');
    b.addEventListener('click', () => correggi(n.id, { esito: n.esito === e ? null : e }));
    riga.append(b);
  }
  sez.append(riga);
  return sez;
}

function campoTesto(etichetta, valore, aiuto, salva, tipo = 'text') {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', etichetta));
  const i = document.createElement('input');
  i.type = tipo;
  i.className = 'dettaglio__campo';
  i.value = valore;
  i.placeholder = aiuto;
  i.autocomplete = 'off';
  // Si salva uscendo dal campo o su Invio: nessun tasto "conferma" da cercare.
  i.addEventListener('change', () => salva(i.value.trim()));
  sez.append(i);
  return sez;
}

function campoData(etichetta, valore, aiuto, salva) {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', etichetta));
  const riga = nodo('div', 'dettaglio__riga');
  const i = document.createElement('input');
  i.type = 'date';
  i.className = 'dettaglio__campo';
  i.value = valore || '';
  i.title = aiuto;
  i.addEventListener('change', () => salva(i.value || null));
  riga.append(i);
  if (valore) {
    const via = bottone('dettaglio__via', 'Togli');
    via.addEventListener('click', () => salva(null));
    riga.append(via);
  }
  sez.append(riga);
  return sez;
}

// ─── Impostazioni e sincronizzazione ─────────────────────────────────────────
// Raggiungibili ma fuori dai piedi: senza owner, repo e token l'app è un guscio vuoto
// che funziona lo stesso in locale, e questo pannello è l'unico posto dove si riempie.

function apriConfig() {
  disegnaConfig();
  $('#config').hidden = false;
  const primo = $('#config input');
  if (primo) primo.focus();
}

function chiudiConfig() {
  $('#config').hidden = true;
  $('#config-foglio').replaceChildren();
}

function disegnaConfig() {
  const c = cfg();
  const foglio = $('#config-foglio');
  foglio.replaceChildren();

  const testa = nodo('header', 'dettaglio__testa');
  testa.append(nodo('p', 'dettaglio__testo', 'Impostazioni'));
  const chiudi = bottone('dettaglio__chiudi', '✕');
  chiudi.setAttribute('aria-label', 'Chiudi');
  chiudi.addEventListener('click', chiudiConfig);
  testa.append(chiudi);
  foglio.append(testa);

  foglio.append(campoTesto('Owner GitHub', c.owner, 'il tuo utente o l\'organizzazione', (v) => riconfigura({ owner: v })));
  foglio.append(campoTesto('Repository dati', c.repo, 'quello privato, non quello dell\'app', (v) => riconfigura({ repo: v })));
  foglio.append(campoTesto('Nome dispositivo', c.dev, 'pc, tel… scrive solo sul proprio file', (v) => riconfigura({ dev: v || 'pc' })));

  const tk = campoTesto('Token', token() || '', 'fine-grained, solo sul repo dati', (v) => {
    if (v) Store.token.set(v);
    aggiornaStato();
    disegnaConfig();
  }, 'password');
  if (token()) {
    const via = bottone('dettaglio__via', 'Cancella token da questo dispositivo');
    via.addEventListener('click', () => {
      Store.token.via();
      aggiornaStato();
      disegnaConfig();
    });
    tk.append(via);
  }
  foglio.append(tk);

  foglio.append(sezioneSync());
  foglio.append(sezioneProve(c));

  $('#config').hidden = false;
}

function sezioneSync() {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', 'Sincronizzazione'));
  const riga = nodo('div', 'dettaglio__riga');
  const adesso = bottone('dettaglio__via', 'Sincronizza adesso');
  adesso.addEventListener('click', async () => {
    adesso.disabled = true;
    try {
      await Store.sincronizza();
      rete.guasta = false;
    } catch {
      rete.guasta = true; // la rete fallisce in silenzio, ma l'indicatore deve dirlo
    }
    adesso.disabled = false;
    await aggiornaStato();
    disegnaConfig();
  });
  riga.append(adesso);
  sez.append(riga);

  const quando = nodo('div', 'dettaglio__nota', 'ultima sincronizzazione: mai');
  Store.ultimaSync().then((t) => {
    if (t) quando.textContent = `ultima sincronizzazione: ${new Date(t).toLocaleString('it-IT')}`;
  }).catch(() => {});
  sez.append(quando);
  return sez;
}

function sezioneProve(c) {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', 'Prove'));

  const riga = nodo('label', 'interruttore');
  const spunta = document.createElement('input');
  spunta.type = 'checkbox';
  spunta.id = 'esempi';
  spunta.checked = !!c.esempi;
  spunta.addEventListener('change', async () => {
    salvaCfg({ esempi: spunta.checked });
    if (spunta.checked && tutte().length === 0) {
      await seminaEsempi();
      disegna();
    }
    disegnaConfig();
  });
  riga.append(spunta);
  riga.append(nodo('span', null, 'Semina note di esempio quando l\'archivio è vuoto'));
  sez.append(riga);
  sez.append(nodo('div', 'dettaglio__nota', 'Da spegnere prima del primo collegamento al repo vero, o il log nasce con dentro note finte.'));

  // Conferma in due tempi invece di un modale: §5 dice mai "sei sicuro?", ma questo è
  // l'unico gesto dell'app che il log non sa annullare, quindi un secondo tocco ci vuole.
  const svuota = bottone('dettaglio__via pericolo', 'Svuota archivio locale');
  let armato = false;
  svuota.addEventListener('click', async () => {
    if (!armato) {
      armato = true;
      svuota.textContent = 'Tocca ancora per cancellare tutto';
      svuota.classList.add('is-armato');
      setTimeout(() => {
        armato = false;
        svuota.textContent = 'Svuota archivio locale';
        svuota.classList.remove('is-armato');
      }, 5000);
      return;
    }
    await Store.svuota();
    if (cfg().esempi) await seminaEsempi();
    disegna();
    await aggiornaStato();
    disegnaConfig();
  });
  sez.append(svuota);
  sez.append(nodo('div', 'dettaglio__nota', 'Cancella solo IndexedDB su questo dispositivo. Il repo dati non viene toccato.'));
  return sez;
}

async function riconfigura(parziale) {
  const c = salvaCfg(parziale);
  $('#dispositivo').textContent = c.dev;
  try {
    await Store.init({ owner: c.owner || null, repo: c.repo || null, dev: c.dev || 'pc' });
  } catch { /* l'archivio era già aperto: la configurazione vale comunque */ }
  disegna();
  await aggiornaStato();
}

/** In pari, in coda N, non raggiungibile. Discreto e sempre vero. */
async function aggiornaStato() {
  const el = $('#stato-sync');
  const c = cfg();
  const scrivi = (testo, classe) => {
    el.textContent = testo;
    el.className = `stato-sync ${classe}`.trim();
  };

  if (!c.owner || !c.repo || !token()) return scrivi('non configurato', 'stato-sync--spento');

  let coda = 0;
  try {
    coda = await Store.inCoda();
  } catch {
    return scrivi('archivio non pronto', 'stato-sync--guasto');
  }
  if (!navigator.onLine || rete.guasta) return scrivi('non raggiungibile', 'stato-sync--guasto');
  if (coda > 0) return scrivi(`in coda ${coda}`, 'stato-sync--coda');
  scrivi('in pari', '');
}

// ─── Cattura ─────────────────────────────────────────────────────────────────

function mostraAnteprima(testo) {
  const box = $('#anteprima');
  const letta = testo.trim() ? parse(testo) : null;
  const pezzi = [];
  if (letta) {
    if (letta.cat) pezzi.push({ testo: `${letta.cat} · ${nomeCategoria(letta.cat)}`, classe: 'etichetta--categoria' });
    else pezzi.push({ testo: letta.incerto ? 'incerta, da classificare' : 'da classificare', classe: '' });
    if (letta.pf) pezzi.push({ testo: letta.pf, classe: 'etichetta--piattaforma' });
    if (letta.da) pezzi.push({ testo: `@${letta.da}`, classe: '' });
    for (const t of letta.tag) pezzi.push({ testo: `#${t}`, classe: '' });
    if (letta.scadenza) pezzi.push({ testo: etichettaScadenza(letta.scadenza).testo, classe: 'etichetta--scadenza' });
    if (letta.priorita) pezzi.push({ testo: letta.priorita > 1 ? 'urgente' : 'importante', classe: 'etichetta--priorita' });
  }
  box.replaceChildren(...pezzi.map((p) => nodo('span', `etichetta ${p.classe}`.trim(), p.testo)));
  box.hidden = pezzi.length === 0;
}

// ─── Suggerimento inline ─────────────────────────────────────────────────────
// La sintassi è un acceleratore opzionale, non la strada maestra: serve a chi i codici
// non li sa a memoria, e per questo non deve mai mettersi fra me e l'invio. Regola
// ferrea: finché non ho scelto qualcosa con le frecce, Invio salva la nota com'è.

let sugg = { aperto: false, sigla: null, voci: [], indice: -1, inizio: 0, fine: 0 };

/** Il token `#...` o `@...` che sta sotto il cursore, se c'è. */
function tokenAlCursore() {
  const pos = campo.selectionStart ?? campo.value.length;
  const trovato = campo.value.slice(0, pos).match(/([#@])([\p{L}\d._-]*)$/u);
  if (!trovato) return null;
  return { sigla: trovato[1], filtro: trovato[2], inizio: pos - trovato[0].length, fine: pos };
}

/** Le persone già usate, dalla più frequente: chi ricorre di più si scrive di meno. */
function personeUsate() {
  const conta = new Map();
  for (const n of tutte()) if (n.da) conta.set(n.da, (conta.get(n.da) || 0) + 1);
  return [...conta.entries()]
    .map(([nome, quante]) => ({ nome, quante }))
    .sort((a, b) => b.quante - a.quante || a.nome.localeCompare(b.nome));
}

function vociPer(sigla, testo) {
  const q = testo.toLowerCase();
  if (sigla === '#') {
    return CATEGORIE
      .filter((c) => c.cod.toLowerCase().startsWith(q) || c.nome.toLowerCase().includes(q))
      .map((c) => ({ valore: c.cod, spiega: c.nome }));
  }
  return personeUsate()
    .filter((p) => p.nome.toLowerCase().startsWith(q))
    .map((p) => ({ valore: p.nome, spiega: p.quante === 1 ? '1 nota' : `${p.quante} note` }));
}

function aggiornaSuggerimenti() {
  const t = tokenAlCursore();
  const voci = t ? vociPer(t.sigla, t.filtro) : [];
  if (voci.length === 0) return chiudiSuggerimenti();
  sugg = { aperto: true, sigla: t.sigla, voci, indice: -1, inizio: t.inizio, fine: t.fine };
  disegnaSuggerimenti();
}

function disegnaSuggerimenti() {
  const box = $('#suggerimenti');
  box.replaceChildren(...sugg.voci.map((v, i) => {
    const voce = nodo('div', 'suggerimento');
    voce.id = `sugg-${i}`;
    voce.setAttribute('role', 'option');
    voce.setAttribute('aria-selected', String(i === sugg.indice));
    if (i === sugg.indice) voce.classList.add('is-attivo');
    voce.append(nodo('span', 'suggerimento__valore', sugg.sigla + v.valore));
    voce.append(nodo('span', 'suggerimento__spiega', v.spiega));
    // pointerdown e non click: il click arriverebbe dopo il blur, a lista già chiusa
    voce.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      completa(i);
    });
    return voce;
  }));
  box.hidden = false;
  campo.setAttribute('aria-expanded', 'true');
  if (sugg.indice >= 0) campo.setAttribute('aria-activedescendant', `sugg-${sugg.indice}`);
  else campo.removeAttribute('aria-activedescendant');
}

function chiudiSuggerimenti() {
  sugg = { aperto: false, sigla: null, voci: [], indice: -1, inizio: 0, fine: 0 };
  const box = $('#suggerimenti');
  box.replaceChildren();
  box.hidden = true;
  campo.setAttribute('aria-expanded', 'false');
  campo.removeAttribute('aria-activedescendant');
}

function muoviSuggerimento(passo) {
  sugg.indice = Math.max(0, Math.min(sugg.voci.length - 1, sugg.indice + passo));
  disegnaSuggerimenti();
}

function completa(i) {
  const voce = sugg.voci[i];
  if (!voce) return;
  const inserito = `${sugg.sigla}${voce.valore} `;
  const testo = campo.value;
  campo.value = testo.slice(0, sugg.inizio) + inserito + testo.slice(sugg.fine);
  const pos = sugg.inizio + inserito.length;
  chiudiSuggerimenti();
  campo.focus();
  campo.setSelectionRange(pos, pos);
  mostraAnteprima(campo.value);
}

// ─── Avvio ───────────────────────────────────────────────────────────────────

const campo = $('#cattura');

campo.addEventListener('input', () => {
  mostraAnteprima(campo.value);
  aggiornaSuggerimenti();
});

campo.addEventListener('blur', chiudiSuggerimenti);

campo.addEventListener('keydown', async (e) => {
  if (sugg.aperto) {
    if (e.key === 'ArrowDown') return e.preventDefault(), muoviSuggerimento(1);
    if (e.key === 'ArrowUp') return e.preventDefault(), muoviSuggerimento(-1);
    if (e.key === 'Escape') return e.preventDefault(), chiudiSuggerimenti();
    // Invio completa solo se ho davvero scelto con le frecce. Altrimenti cade nel ramo
    // qui sotto e la nota si salva com'è: il suggerimento non intercetta mai l'invio.
    if (e.key === 'Enter' && sugg.indice >= 0) return e.preventDefault(), completa(sugg.indice);
  }
  if (e.key !== 'Enter') return;
  const riga = campo.value;
  campo.value = '';
  chiudiSuggerimenti();
  mostraAnteprima('');
  await aggiungi(riga);
});

const bottoneCerca = $('#cerca');
const rigaRicerca = $('#riga-ricerca');
const campoRicerca = $('#ricerca');

bottoneCerca.addEventListener('click', () => {
  const apriLa = rigaRicerca.hidden;
  rigaRicerca.hidden = !apriLa;
  bottoneCerca.setAttribute('aria-expanded', String(apriLa));
  if (apriLa) campoRicerca.focus();
  else chiudiRicerca();
});

campoRicerca.addEventListener('input', () => {
  filtro = campoRicerca.value;
  disegna();
});

campoRicerca.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  rigaRicerca.hidden = true;
  bottoneCerca.setAttribute('aria-expanded', 'false');
  chiudiRicerca();
  campo.focus();
});

function chiudiRicerca() {
  campoRicerca.value = '';
  filtro = '';
  disegna();
}

$('#dettaglio-fondo').addEventListener('click', chiudiDettaglio);
$('#config-fondo').addEventListener('click', chiudiConfig);
$('#impostazioni').addEventListener('click', apriConfig);
$('#stato-sync').addEventListener('click', apriConfig);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (apertaId != null) chiudiDettaglio();
  else if (!$('#config').hidden) chiudiConfig();
});

// La rete che torna, o l'app che riprende il fuoco, cambiano lo stato senza preavviso.
addEventListener('online', aggiornaStato);
addEventListener('offline', aggiornaStato);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) aggiornaStato();
});

// Il passaggio desktop/telefono cambia le affordance: trascinamento contro scorrimento.
window.matchMedia('(min-width: 900px)').addEventListener('change', disegna);

avvia();

async function avvia() {
  const c = cfg();
  $('#dispositivo').textContent = c.dev;
  try {
    Store.mappaAree(CATEGORIE); // senza questa, il filtro per area non trova mai niente
    await Store.init({ owner: c.owner || null, repo: c.repo || null, dev: c.dev });
    // Le note finte servono a provare sincronizzazione e gesti, quindi restano dietro un
    // interruttore spento di suo: chi apre l'app per lavorare non le vede mai.
    if (c.esempi && tutte().length === 0) await seminaEsempi();
  } catch (err) {
    // La rete fallisce in silenzio, tutto il resto è visibile: senza IndexedDB non
    // esiste applicazione, e mostrarlo è meglio che una schermata vuota inspiegabile.
    $('#contenuto').replaceChildren(
      nodo('p', 'guasto', `Archivio locale non disponibile: ${err.message}. In navigazione privata il browser lo blocca.`),
    );
    return;
  }
  disegna();
  await aggiornaStato();
  campo.focus();
}
