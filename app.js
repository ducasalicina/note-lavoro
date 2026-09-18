// app.js — interfaccia, eventi, rendering.
// Tre fasce sovrapposte: cattura, scadenze, contenuto.
// Su desktop le cinque liste stanno affiancate e si trascina; su telefono una lista per
// volta e si scorre la riga, perché trascinare card su schermo piccolo è solo frustrazione.

import { parse, classifica, CATEGORIE, AREE, categoria, filiale } from './brt-classificatore.js';
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
let cliente = null; // codice cliente su cui è ristretto il board
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

// ─── Il percorso di una nota ─────────────────────────────────────────────────
// Il motivo per cui questo strumento esiste (§1): l'ufficio commerciale contesta i tempi,
// e serve poter dire con le date quando una richiesta è arrivata, quando è stata presa in
// carico, quanto è rimasta ferma e quando è stata chiusa.
//
// Lo stato finale che `elenco()` ricostruisce non sa dire QUANDO: quello lo sanno solo gli
// eventi, che hanno tutti il loro `at`. Qui il log viene riletto e ridotto a un percorso
// per nota. Non è un campo da compilare: non costa un tocco a nessuno.
//
// L'indice si rifà da capo a ogni scrittura. Con qualche migliaio di eventi è questione di
// millisecondi, e vale la semplicità: nessuno stato incrementale da tenere allineato.

const NOME_PASSO = {
  inbox: 'rimessa in inbox',
  dafare: 'messa in coda',
  corso: 'presa in carico',
  attesa: 'in attesa',
  chiuso: 'chiusa',
};

let percorsi = new Map(); // id -> [{ at, stato?, testo, aspetto?, esito? }]

async function aggiornaPercorsi() {
  try {
    percorsi = costruisciPercorsi(await Store.eventi());
  } catch {
    percorsi = new Map(); // senza percorsi il resto dell'interfaccia funziona lo stesso
  }
}

function costruisciPercorsi(eventi) {
  const m = new Map();
  for (const e of eventi) {
    if (e.ev === 'del') {
      m.delete(e.id);
      continue;
    }
    if (e.ev === 'new') {
      m.set(e.id, [{ at: e.at, testo: 'creata' }]);
      continue;
    }
    const passi = m.get(e.id);
    if (!passi) continue; // un `upd` prima del suo `new`: lo ignora, come fa `rigioca()`
    // Il diario si mescola ai passaggi di stato, non sta in una sezione sua: gli eventi
    // arrivano già ordinati per `at`, quindi basta accodarlo dove capita.
    if (e.ev === 'diario') {
      passi.push({ at: e.at, diario: e.d });
      continue;
    }
    const p = e.p || {};
    // Il ripristino di una nota eliminata riscrive `creato` con una patch, perché il
    // `new` porterebbe l'ora del ripristino: il percorso deve seguirlo, o direbbe che
    // la richiesta è arrivata il giorno in cui l'ho recuperata.
    if (p.creato) passi[0].at = p.creato;
    if (p.stato) passi.push({ at: e.at, stato: p.stato, testo: NOME_PASSO[p.stato] || p.stato });
    if (p.aspetto) {
      // La risposta al «cosa aspetti» arriva con un evento suo, subito dopo lo
      // spostamento: si attacca a quel passo invece di diventarne uno in più.
      // Si attacca solo alla PRIMA risposta dopo lo spostamento. Se ne arriva un'altra
      // dopo, diventa un passo suo: sovrascrivendo, la risposta di prima sparirebbe anche
      // dal percorso, ed è proprio quello che non deve succedere.
      const ultimo = [...passi].reverse().find((x) => x.stato);
      if (ultimo && ultimo.stato === 'attesa' && !ultimo.aspetto) ultimo.aspetto = p.aspetto;
      else passi.push({ at: e.at, stato: 'attesa', testo: 'in attesa di', aspetto: p.aspetto });
    }
    if (p.esito) {
      const chiusura = [...passi].reverse().find((x) => x.stato === 'chiuso');
      if (chiusura) chiusura.esito = p.esito;
    }
  }
  return m;
}

const passiDi = (id) => percorsi.get(id) || [];
const righeDiario = (id) => passiDi(id).filter((p) => p.diario);
const testoDiario = (id) => righeDiario(id).map((p) => p.diario).join(' ');

/** Da quando la nota è nello stato in cui sta adesso. `agg` non va bene: si sposta a ogni
 *  correzione, quindi bastava sistemare un ticket per azzerare una settimana di attesa. */
function fermaDa(n) {
  const ultimo = [...passiDi(n.id)].reverse().find((p) => p.stato);
  return giorniDa(ultimo ? ultimo.at : n.agg);
}

function dataOra(ms) {
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function giorniTesto(g) {
  if (g <= 0) return 'meno di un giorno';
  return g === 1 ? '1 giorno' : `${g} giorni`;
}

/** Quanto è durato un passo. Si mostra solo sull'attesa: è l'unico pezzo di percorso su
 *  cui nasce una contestazione, e metterlo su tutti farebbe rumore. */
function durataPasso(passi, i) {
  if (passi[i].stato !== 'attesa') return null;
  // Il prossimo CAMBIO DI STATO, non il prossimo passo: in mezzo ci sono le righe di
  // diario, e contando fino a quelle un'attesa di otto giorni ne misurerebbe uno.
  const dopo = passi.slice(i + 1).find((p) => p.stato);
  const g = Math.round(((dopo ? dopo.at : Date.now()) - passi[i].at) / 86400000);
  return dopo ? giorniTesto(g) : `${giorniTesto(g)}, ancora ferma`;
}

function testoPasso(p) {
  if (p.diario) return p.diario;
  let t = p.testo;
  if (p.aspetto) t += `: ${p.aspetto}`;
  if (p.esito) t += `, ${p.esito}`;
  return t;
}

/** Il percorso su una riga sola, per il riepilogo da incollare in una mail. */
function percorsoInRiga(id) {
  const passi = passiDi(id);
  return passi.map((p, i) => {
    const durata = durataPasso(passi, i);
    return `${dataOra(p.at)} ${testoPasso(p)}${durata ? ` (${durata})` : ''}`;
  }).join(' · ');
}

// Il colore sta sull'area, non sulla categoria: quattordici tinte non si distinguono a
// colpo d'occhio, cinque sì. Serve a riconoscere di cosa parla una card senza leggerla.
const areaDi = (cod) => categoria(cod)?.area || null;

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

// Il chiuso mostra solo la settimana appena passata. Il resto non sparisce e non si
// archivia a mano: resta nel log e si ritrova con la ricerca, che copre tutti gli stati.
// Il valore dello strumento sta proprio nel poter rivedere cosa è stato chiuso e quando.
const GIORNI_CHIUSO = 7;

const chiuseVecchie = () =>
  tutte().filter((n) => n.stato === 'chiuso' && giorniDa(n.agg) > GIORNI_CHIUSO).length;

/** Note di uno stato, già passate al contatore attivo e al filtro di ricerca. */
function visibili(chiave) {
  const q = filtro.trim().toLowerCase();
  const scelta = FASCE.find((f) => f.chiave === fascia);
  return tutte().filter((n) => {
    if (n.stato !== chiave) return false;
    // Il cliente è un campo, non del testo: si confronta il codice, se no una nota che
    // nomina quel numero per altri motivi finirebbe fra le sue.
    if (cliente && n.cl !== cliente) return false;
    // Cercando si vede tutto: è il modo per ritrovare le chiusure vecchie. Guardare un
    // cliente vale lo stesso, perché di un cliente si vuole la storia, non la settimana.
    if (chiave === 'chiuso' && !q && !cliente && giorniDa(n.agg) > GIORNI_CHIUSO) return false;
    if (scelta && !scelta.test(n)) return false;
    if (!q) return true;
    const dove = [n.testo, n.aspetto || '', n.da || '', n.cat || '', n.cl || '',
      n.ticket || '', (n.tag || []).join(' '), testoDiario(n.id)].join(' ');
    return dove.toLowerCase().includes(q);
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/** Una sezione che si rompe non porta giù le altre.
 *
 *  Il board è la cosa che deve arrivare a schermo comunque: se manca il contenitore dei
 *  contatori, si perdono i contatori, non la giornata di lavoro. L'errore va in console
 *  forte, perché resta un difetto da correggere, non una condizione normale. */
function perSezione(nome, disegnaLa) {
  try {
    disegnaLa();
  } catch (err) {
    console.error(`[note] non sono riuscito a disegnare: ${nome}`, err);
  }
}

function disegna() {
  perSezione('filtro cliente', disegnaCliente);
  perSezione('fascia scadenze', disegnaScadenze);
  perSezione('barra degli stati', disegnaBarra);
  perSezione('colonne', disegnaColonne);
  perSezione('dettaglio', disegnaDettaglio);
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

  // Dice di cosa parla la riga: questi contano ritardi e cose ferme, mentre i numeri
  // accanto ai titoli delle colonne contano quanto lavoro c'è. Senza l'etichetta si
  // somigliano troppo. Sta fuori dal contenitore che scorre, così non se ne va via.
  const nome = nodo('span', 'fascia__nome', 'Da guardare oggi');
  $('#fascia-scadenze')?.replaceChildren(nome, riga);
}

function disegnaBarra() {
  const barra = $('#barra-stati');
  if (!barra) return;
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
    const vecchie = s.chiave === 'chiuso' && !filtro.trim() && !cliente ? chiuseVecchie() : 0;

    for (const n of elenco) corpo.append(desktop() ? disegnaNota(n) : disegnaRiga(n));
    if (elenco.length === 0 && vecchie === 0) {
      corpo.append(nodo('div', 'colonna__vuota', desktop() ? 'Trascina qui' : 'Vuota'));
    }
    if (vecchie > 0) {
      const oltre = bottone('colonna__oltre', `altre ${vecchie} chiuse, cercale`);
      oltre.addEventListener('click', apriRicerca);
      corpo.append(oltre);
    }

    colonna.append(corpo);
    griglia.append(colonna);
  }

  $('#contenuto')?.replaceChildren(griglia);
}

function disegnaNota(n) {
  const carta = nodo('article', 'nota');
  carta.tabIndex = 0;
  carta.setAttribute('role', 'button');
  carta.setAttribute('aria-label', `Apri: ${n.testo}`);
  // La barretta colorata a sinistra la disegna il CSS da qui. Senza categoria resta del
  // colore del bordo: un'assenza, non un sesto colore da imparare.
  if (areaDi(n.cat)) carta.dataset.area = areaDi(n.cat);

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

  // In Attesa al posto del testo va quello che si sta aspettando, con accanto i giorni:
  // con nove note ferme il testo originale non dice a cosa sono appese, e per ricollegarle
  // bisognava riaprirle una per una. L'originale non si perde, sta nel dettaglio.
  const inAttesa = n.stato === 'attesa';
  if (inAttesa) {
    const blocco = nodo('div', 'nota__attesa');
    // Anche senza risposta la riga c'è, e dice che manca: una nota ferma da sei giorni
    // senza sapere di chi è il caso peggiore, non quello da nascondere.
    blocco.append(n.aspetto
      ? nodo('span', 'nota__aspetto', n.aspetto)
      : nodo('span', 'nota__aspetto nota__aspetto--vuoto', 'non è scritto chi si aspetta'));
    blocco.append(chipFermo(n));
    carta.append(blocco);
    // Sotto, in piccolo e su una riga sola, il testo originale: serve a riconoscere la
    // nota a colpo d'occhio, non a rileggerla. Per intero sta nel `title` — l'app si usa
    // al 90% da desktop, quindi l'hover è un posto buono dove metterlo — e nel dettaglio.
    const originale = nodo('div', 'nota__originale', n.testo);
    originale.title = n.testo;
    carta.append(originale);
  } else {
    carta.append(nodo('div', 'nota__titolo', n.testo));
  }

  const meta = nodo('div', 'nota__meta');
  // Sul chiuso al posto della scadenza va l'esito: è l'unico riscontro visivo che ho
  // di quel campo, e senza non so mai se l'ho compilato.
  if (n.stato === 'chiuso') {
    if (n.esito) meta.append(nodo('span', 'nota__esito', n.esito));
  } else {
    const sc = etichettaScadenza(n.scadenza);
    if (sc) meta.append(nodo('span', `scadenza ${sc.classe}`.trim(), sc.testo));
  }
  const diario = righeDiario(n.id);
  if (diario.length) meta.append(chipDiario(diario));
  if (n.cl) meta.append(bottoneCliente(n));
  if (n.da) meta.append(nodo('span', 'nota__da', n.da));
  if (n.priorita > 0 && n.stato !== 'chiuso') meta.append(nodo('span', 'nota__priorita', n.priorita > 1 ? '!!' : '!'));
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

/** Il codice cliente sulla card. È un bottone e non un'etichetta perché la domanda che
 *  uno si fa guardandolo è sempre la stessa: «cos'altro ha aperto questo cliente?». */
function bottoneCliente(n) {
  const b = bottone('nota__cliente', n.cl);
  b.title = `Cliente ${n.cl}, filiale ${filiale(n.cl)} — mostra tutte le sue note`;
  // Come su Rimanda: sul telefono la card ascolta lo scorrimento, e senza questo il tap
  // parte come swipe da zero pixel e il click si perde.
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // non aprire il dettaglio
    cercaCliente(n.cl);
  });
  return b;
}

/** Tutte le note di un cliente, in tutti gli stati, chiuse vecchie comprese: di un
 *  cliente si vuole la storia, non la settimana.
 *
 *  Non passa dalla ricerca testuale, che pescherebbe anche le note che quel numero lo
 *  nominano e basta — ed è esattamente la confusione che il riconoscimento stretto del
 *  codice serve a evitare. Filtra sul campo `cl`, e il codice resta in vista nella riga
 *  di ricerca, perché un filtro che non si vede è un filtro che non si toglie. */
function cercaCliente(cl) {
  cliente = cl;
  fascia = null; // un contatore attivo nasconderebbe metà delle sue note
  filtro = '';
  campoRicerca.value = '';
  apriRicerca();
  disegna();
}

function disegnaCliente() {
  const b = $('#cliente-attivo');
  const apri = $('#riepilogo-apri');
  if (apri) apri.hidden = !cliente;
  if (!b) return;
  b.hidden = !cliente;
  if (!cliente) return;
  b.textContent = `cliente ${cliente} · filiale ${filiale(cliente)} ✕`;
  b.title = 'Togli il filtro per cliente';
}

// ─── Riepilogo del cliente ───────────────────────────────────────────────────
// Il gesto che si fa quando il commerciale contesta i tempi: si filtra per cliente, si
// copia, si incolla nella risposta. Testo semplice e basta — un allegato o un file
// generato aggiungerebbero un passaggio proprio dove serve non averne (§1).

/** Tutte le note del cliente, dalla più vecchia: un riepilogo si legge in avanti. */
function noteDelCliente(cl) {
  return tutte().filter((n) => n.cl === cl).sort((a, b) => a.creato - b.creato);
}

function testoRiepilogo(cl) {
  const note = noteDelCliente(cl);
  const righe = [`Cliente ${cl} — filiale ${filiale(cl)}`];
  if (note.length) {
    const dal = new Date(Math.min(...note.map((n) => n.creato)));
    righe.push(`${note.length} ${note.length === 1 ? 'richiesta' : 'richieste'}, dal ${dataCompleta(dal)} a oggi`);
  } else {
    righe.push('Nessuna richiesta registrata.');
  }
  righe.push('');

  note.forEach((n, i) => {
    righe.push(`${i + 1}. ${n.testo}`);
    // Lo stato attuale in testa alla riga: è la prima cosa che chiede chi legge —
    // «e adesso a che punto siamo?» — e il percorso da solo non la dice a voce alta.
    const dettagli = [STATI.find((s) => s.chiave === n.stato)?.nome || n.stato];
    dettagli.push(n.cat ? `${n.cat} · ${nomeCategoria(n.cat)}` : 'da classificare');
    if (n.pf) dettagli.push(n.pf);
    // Un ticket assente è un'informazione, non un vuoto: dice che è passata fuori dal
    // sistema ufficiale, ed è la prima cosa che il commerciale chiede.
    dettagli.push(n.ticket ? `ticket ${n.ticket}` : 'nessun ticket');
    righe.push(`   ${dettagli.join(' · ')}`);
    righe.push(`   ${percorsoInRiga(n.id) || 'percorso non disponibile'}`);
    righe.push('');
  });

  righe.push(`Estratto il ${dataCompleta(new Date())} dalle note di lavoro CED.`);
  return righe.join('\n');
}

function dataCompleta(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function apriRiepilogo() {
  const area = $('#riepilogo-testo');
  if (!cliente || !area || !$('#riepilogo')) return;
  const titolo = $('#riepilogo-titolo');
  if (titolo) titolo.textContent = `Riepilogo cliente ${cliente}`;
  area.value = testoRiepilogo(cliente);
  $('#riepilogo').hidden = false;
  area.focus();
  area.setSelectionRange(0, area.value.length);
}

function chiudiRiepilogo() {
  const p = $('#riepilogo');
  if (p) p.hidden = true;
  const area = $('#riepilogo-testo');
  if (area) area.value = '';
}

/** I giorni di fermo, contati dal passaggio di stato e non da `agg`.
 *
 *  «Fermo da sei giorni in attesa del cliente» e «fermo da sei giorni per colpa nostra»
 *  sono due cose diverse, ed è su quella differenza che nascono le contestazioni (§1):
 *  il chi sta scritto accanto, nella riga della risposta o — quando la risposta manca —
 *  al posto suo, che è anche il modo di accorgersi che non l'ho scritta.
 *
 *  Oltre la settimana il chip si fa scuro. Non terracotta: quello è del ritardo su una
 *  scadenza, e un'attesa lunga non è per forza un ritardo mio. */
function chipFermo(n, conParola = false) {
  const g = fermaDa(n);
  const e = nodo('span', 'nota__giorni', conParola ? `ferma da ${g} g` : `${g} g`);
  if (g >= 7) e.classList.add('nota__giorni--lunga');
  const passi = passiDi(n.id);
  const entrata = [...passi].reverse().find((p) => p.stato);
  e.title = `In attesa dal ${entrata ? dataOra(entrata.at) : '—'}, ${giorniTesto(g)}`
    + (n.aspetto ? ` — si aspetta: ${n.aspetto}` : ' — di chi si aspetti non è scritto');
  return e;
}

/** Quante righe di diario ha una nota. È la differenza fra una ferma da otto giorni con
 *  tre solleciti dentro e una dimenticata: sul board si vedevano uguali. */
function chipDiario(diario) {
  const e = nodo('span', 'nota__diario', `${diario.length} in diario`);
  const ultima = diario[diario.length - 1];
  e.title = `Ultima: ${dataOra(ultima.at)} — ${ultima.diario}`;
  return e;
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
// L'eliminazione sta molto più in là della soglia che manda in corso: la si raggiunge
// solo volendo, e strada facendo la card vira al rosso, così si vede dove si sta andando.
const SOGLIA_ELIMINA = 150;

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
    dx = Math.max(-200, Math.min(116, dx));
    const elimina = dx <= -SOGLIA_ELIMINA;
    carta.style.transform = `translateX(${dx}px)`;
    scoperta.style.opacity = String(Math.min(1, Math.abs(dx) / 56));
    riga.classList.toggle('is-elimina', elimina);
    scoperta.lastElementChild.textContent = elimina ? 'Elimina'
      : puo.avviabile ? 'In corso →' : '';
  });

  const rilascia = () => {
    if (partenza === null) return;
    const scelto = dx;
    partenza = null;
    riga.classList.remove('is-swipe', 'is-elimina');
    carta.style.transform = '';
    scoperta.style.opacity = '0';
    // Un dito che si è mosso stava scorrendo, non toccando: non aprire il dettaglio.
    if (Math.abs(scelto) > 4) carta.dataset.scorso = '1';
    if (scelto <= -SOGLIA_ELIMINA) eliminaNota(n.id);
    else if (scelto >= SOGLIA && puo.chiudibile) sposta(n.id, 'chiuso');
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
  await Store.modifica(nota.id, { src: 'app', rc: nuovoRicontrollo(nota), pf: letta.pf, cl: letta.cl });
  await ridisegna();
}

/** `conAnnulla` a false per gli spostamenti fatti dal selettore nel dettaglio: la barretta
 *  starebbe sotto al pannello e non si potrebbe toccare, e soprattutto lì non serve —
 *  il selettore mostra i cinque stati e tornare indietro è toccare quello di prima. */
async function sposta(id, verso, conAnnulla = true) {
  const nota = tutte().find((n) => n.id === id);
  if (!nota || nota.stato === verso) return;
  const prima = { stato: nota.stato, rc: nota.rc ?? null, aspetto: nota.aspetto ?? null };
  await Store.modifica(id, { stato: verso, rc: nuovoRicontrollo({ ...nota, stato: verso }) });
  await ridisegna();

  const nome = STATI.find((s) => s.chiave === verso).nome;
  const annulla = () => {
    if (!conAnnulla) return;
    offriAnnulla(`Spostata in ${nome}`, async () => {
      await Store.modifica(id, prima); // l'evento contrario, non un dialogo "sei sicuro?"
      await ridisegna();
    });
  };

  // Annulla aspetta che la domanda sia finita: il pannello la coprirebbe, e i cinque
  // secondi se ne andrebbero mentre uno scrive.
  if (verso === 'attesa') chiediAttesa(id, annulla);
  else annulla();
}

// ─── L'unica domanda dell'applicazione ───────────────────────────────────────
// Una riga sola, e arriva quando la nota è già in Attesa: non è un passaggio obbligato,
// è un'occasione. Se cresce di un campo diventa un modulo, e i moduli non si compilano.

let attesaId = null;
let attesaPoi = null;

function chiediAttesa(id, poi) {
  // Senza il pannello la domanda si salta e si va avanti: lo spostamento è già avvenuto.
  if (!$('#attesa') || !campoAttesa) return poi?.();
  const n = tutte().find((x) => x.id === id);
  attesaId = id;
  attesaPoi = poi;
  campoAttesa.value = n?.aspetto || '';
  $('#attesa').hidden = false;
  campoAttesa.focus();
  campoAttesa.select();
}

/** `salva` a false è lo sbrigo: Esc o un tocco fuori non scrivono niente. Con Invio si
 *  scrive quello che c'è, e il vuoto vale `null`, che è anche il modo di togliere una
 *  risposta sbagliata. Se il valore non cambia non parte nessun evento: il log è per
 *  sempre, e non merita una riga per una domanda saltata. */
async function chiudiAttesa(salva) {
  if ($('#attesa')?.hidden ?? true) return;
  const id = attesaId;
  const poi = attesaPoi;
  const risposta = campoAttesa.value.trim() || null;
  attesaId = null;
  attesaPoi = null;
  $('#attesa').hidden = true;

  if (salva && id != null) await cambiaAspetto(id, risposta);
  if (poi) poi();
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
  await ridisegna();
}

/** Ridisegna dopo una scrittura. Il percorso di una nota vive negli eventi, non
 *  nell'item, quindi va ricostruito dal log prima di rimettere in scena qualsiasi cosa
 *  lo mostri: le card in attesa, la cronologia nel dettaglio, il riepilogo. */
async function ridisegna() {
  await aggiornaPercorsi();
  disegna();
}

async function correggi(id, patch) {
  await Store.modifica(id, patch);
  await ridisegna();
}

/** Nessuna conferma: l'evento contrario è un `new` con lo stesso id, quindi la barretta
 *  Annulla copre l'eliminazione come copre tutto il resto. È una protezione migliore di
 *  un "sei sicuro?", che dopo la ventesima volta si tocca senza leggerlo. */
async function eliminaNota(id) {
  const nota = tutte().find((n) => n.id === id);
  if (!nota) return;
  const copia = { ...nota };
  if (apertaId === id) chiudiDettaglio();
  await Store.elimina(id);
  await ridisegna();
  offriAnnulla('Nota eliminata', async () => {
    await Store.ripristina(copia);
    await ridisegna();
  });
}

function offriAnnulla(descrizione, contrario) {
  const barra = $('#annulla');
  const testo = $('#annulla-testo');
  const vecchio = $('#annulla-bottone');
  if (!barra || !testo || !vecchio) return; // l'azione è già avvenuta: si perde solo l'annullo
  clearTimeout(scadutoAnnulla);
  testo.textContent = descrizione;
  barra.hidden = false;
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
  passo = 'stato'; // sul telefono si riparte sempre dallo stato, che è il motivo dell'apertura
  areaAperta = null;
  disegnaDettaglio();
  // Il fuoco va sulla categoria solo se c'è davvero qualcosa da scegliere: su una nota
  // già classificata portava il foglio a scorrere oltre il selettore di stato, che è la
  // cosa per cui il dettaglio si apre quasi sempre. Altrimenti lo prende il foglio, così
  // Esc continua a chiudere anche senza toccare niente.
  const n = tutte().find((x) => x.id === id);
  const foglio = $('#dettaglio-foglio');
  if (foglio) foglio.tabIndex = -1;
  const primo = desktop() && n && !n.cat ? $('#dettaglio .categoria-scelta') : null;
  (primo || foglio)?.focus();
}

function chiudiDettaglio() {
  apertaId = null;
  const p = $('#dettaglio');
  if (p) p.hidden = true;
  $('#dettaglio-foglio')?.replaceChildren();
}

function disegnaDettaglio() {
  if (apertaId == null) return;
  const n = tutte().find((x) => x.id === apertaId);
  if (!n) return chiudiDettaglio();

  const foglio = $('#dettaglio-foglio');
  if (!foglio) return;
  foglio.replaceChildren();
  foglio.classList.toggle('dettaglio__foglio--passi', !desktop());

  const testa = nodo('header', 'dettaglio__testa');
  const testo = nodo('p', 'dettaglio__testo', n.testo);
  testo.title = n.testo; // sul telefono il titolo è tagliato a tre righe
  testa.append(testo);
  const chiudi = bottone('dettaglio__chiudi', '✕');
  chiudi.setAttribute('aria-label', 'Chiudi');
  chiudi.addEventListener('click', chiudiDettaglio);
  testa.append(chiudi);
  foglio.append(testa);

  // Sul desktop la cronologia sta subito sotto il testo, perché è la storia di questa
  // richiesta e si legge insieme a lei. Sul telefono sta in cima ad «Altro», che è dove
  // si va a cercare: lì il dettaglio si apre per cambiare stato (§1, una nota su 17).
  if (desktop()) foglio.append(sezioneCronologia(n), sezioneDiario(n), ...sezioniDesktop(n));
  else foglio.append(passoCorrente(n), barraPassi());

  const p = $('#dettaglio');
  if (p) p.hidden = false;
}

/** Sul desktop il foglio unico va bene: c'è spazio, c'è il mouse, e si vede tutto
 *  insieme senza scorrere. Qui non si tocca niente (§1). */
function sezioniDesktop(n) {
  return [sezioneStato(n), sezioneCategoria(n), ...campiComuni(n), sezioneElimina(n)];
}

/** I campi che si scrivono: sul desktop stanno in fila, sul telefono dietro «Altro». */
function campiComuni(n) {
  const campi = [
    sezioneCliente(n),
    campoTesto('Richiedente', n.da || '', 'chi ha chiesto', (v) => correggi(n.id, { da: v || null })),
    campoData('Scadenza', n.scadenza, 'quando è dovuta', (v) => correggi(n.id, { scadenza: v })),
    campoData('Ricontrollo', n.rc || null, 'quando la rivedo', (v) => correggi(n.id, { rc: v })),
    campoTesto('Numero ticket', n.ticket || '', 'vuoto = fuori dal sistema ufficiale', (v) => correggi(n.id, { ticket: v || null })),
  ];
  // La risposta alla domanda si corregge qui, o non si correggerebbe più: la domanda
  // arriva una volta sola, allo spostamento.
  if (n.stato === 'attesa') {
    campi.push(campoTesto('Cosa aspetti', n.aspetto || '', 'chi o cosa tiene ferma la nota', (v) => cambiaAspetto(n.id, v || null)));
  }
  if (n.stato === 'chiuso') campi.push(sezioneEsito(n));
  return campi;
}

/** Il percorso della nota. **Sola lettura**: non c'è niente da compilare, viene tutto dai
 *  timestamp che gli eventi hanno già. È la risposta alla contestazione dell'ufficio
 *  commerciale, e per questo sta in alto e non in fondo. */
function sezioneCronologia(n) {
  const sez = nodo('section', 'dettaglio__sezione dettaglio__sezione--percorso');
  const testa = nodo('div', 'dettaglio__etichetta');
  testa.append(nodo('span', null, 'Percorso'));
  const copia = bottone('dettaglio__copia', 'Copia');
  copia.title = 'Copia il percorso su una riga, da incollare in una mail';
  copia.addEventListener('click', () => negliAppunti(`${n.testo}\n${percorsoInRiga(n.id)}`, copia));
  testa.append(copia);
  sez.append(testa);

  const passi = passiDi(n.id);
  if (!passi.length) {
    sez.append(nodo('div', 'dettaglio__nota', 'Il percorso non è ancora stato letto dal log.'));
    return sez;
  }

  const elenco = nodo('ol', 'percorso');
  passi.forEach((p, i) => {
    const riga = nodo('li', `percorso__passo${p.diario ? ' percorso__passo--diario' : ''}`);
    if (p.stato) riga.dataset.stato = p.stato;
    riga.append(nodo('span', 'percorso__quando', dataOra(p.at)));
    riga.append(nodo('span', 'percorso__cosa', testoPasso(p)));
    const durata = durataPasso(passi, i);
    if (durata) riga.append(nodo('span', 'percorso__durata', durata));
    elenco.append(riga);
  });
  sez.append(elenco);
  return sez;
}

/** Il diario: una riga che si aggiunge, con la sua data e ora.
 *
 *  Registra cosa succede DENTRO uno stato — sollecitato, il cliente ha risposto, girato a
 *  un altro — che i passaggi di stato non sanno dire: senza, una nota ferma otto giorni
 *  con tre solleciti dentro sembra identica a una dimenticata.
 *
 *  Un campo e invio. Nessuna conferma, nessun modale: è una riga, non un modulo. E non
 *  c'è un elenco qui sotto, perché le righe si leggono nel percorso, mescolate ai cambi
 *  di stato in ordine di tempo — che è il punto. */
function sezioneDiario(n) {
  const sez = nodo('section', 'dettaglio__sezione');
  const testa = nodo('div', 'dettaglio__etichetta');
  testa.append(nodo('span', null, 'Diario'));
  testa.append(nodo('span', 'dettaglio__attuale', 'invio per aggiungere'));
  sez.append(testa);

  const i = document.createElement('input');
  i.type = 'text';
  i.className = 'dettaglio__campo diario__campo';
  i.placeholder = 'sollecitato, il cliente ha risposto, girato a…';
  i.autocomplete = 'off';
  i.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const testo = i.value.trim();
    if (!testo) return;
    i.value = '';
    annotaNota(n.id, testo);
  });
  sez.append(i);
  sez.append(nodo('div', 'dettaglio__nota',
    'Ogni riga è un evento nel log: si aggiunge, non sostituisce, e compare nel percorso qui sopra alla sua ora.'));
  return sez;
}

async function annotaNota(id, testo) {
  await Store.annota(id, testo);
  await ridisegna();
  // Il pannello si è appena ridisegnato: il campo è nuovo e il fuoco se n'era andato.
  // Chi annota spesso ne scrive due o tre di fila.
  $('#dettaglio .diario__campo')?.focus();
}

/** La risposta al «cosa aspetti» si sovrascrive, ma quella di prima non deve sparire:
 *  finisce nel diario, datata al momento in cui ha smesso di valere. Così la cronologia
 *  tiene tutte e due — cosa aspettavo allora e cosa aspetto adesso. */
async function cambiaAspetto(id, nuovo) {
  const n = tutte().find((x) => x.id === id);
  const vecchio = n?.aspetto || null;
  if (vecchio === (nuovo || null)) return;
  if (vecchio) await Store.annota(id, `prima aspettavo: ${vecchio}`);
  await correggi(id, { aspetto: nuovo || null });
}

/** Negli appunti, e se il browser non lascia scrivere si ripiega sulla selezione: in
 *  quel caso il Ctrl+C lo fa l'utente, ma il testo è comunque pronto. */
async function negliAppunti(testo, bottone, area) {
  const originale = bottone.textContent;
  try {
    await navigator.clipboard.writeText(testo);
    bottone.textContent = 'Copiato';
  } catch {
    if (area) {
      area.focus();
      area.select();
      bottone.textContent = 'Selezionato: Ctrl+C';
    } else {
      bottone.textContent = 'Non copiabile qui';
    }
  }
  setTimeout(() => { bottone.textContent = originale; }, 2500);
}

function sezioneElimina(n) {
  const sez = nodo('section', 'dettaglio__sezione');
  const elimina = bottone('dettaglio__via pericolo', 'Elimina la nota');
  elimina.addEventListener('click', () => eliminaNota(n.id));
  sez.append(elimina);
  sez.append(nodo('div', 'dettaglio__nota', 'Si annulla dalla barretta, come tutto il resto.'));
  return sez;
}

// ─── Il dettaglio sul telefono: una sezione per schermata ────────────────────
// Il foglio unico, sul telefono, era un modulo lungo: si scorreva, si riduceva
// l'ingrandimento e si mirava un campo alto trentotto pixel. Qui si sceglie con file di
// pulsanti grandi, una sezione alla volta, e i campi da scrivere stanno dietro «Altro»,
// perché quelli si cercano quando servono. La cattura non cambia di una virgola: resta
// una riga e invio, che è il 100% di quello che il telefono fa davvero (§1).

const PASSI = [
  { chiave: 'stato', nome: 'Stato' },
  { chiave: 'categoria', nome: 'Categoria' },
  { chiave: 'altro', nome: 'Altro' },
];

let passo = 'stato';
let areaAperta = null; // la categoria si sceglie in due passaggi: prima l'area, poi il codice

function passoCorrente(n) {
  const corpo = nodo('div', 'passo');
  if (passo === 'stato') corpo.append(passoStato(n));
  else if (passo === 'categoria') corpo.append(passoCategoria(n));
  else corpo.append(sezioneCronologia(n), sezioneDiario(n), ...campiComuni(n), sezioneElimina(n));
  return corpo;
}

function barraPassi() {
  const barra = nodo('nav', 'passi');
  barra.setAttribute('aria-label', 'Sezioni');
  for (const p of PASSI) {
    const b = bottone('passo-tab', p.nome);
    b.setAttribute('aria-selected', String(passo === p.chiave));
    if (passo === p.chiave) b.classList.add('is-attivo');
    b.addEventListener('click', () => {
      passo = p.chiave;
      areaAperta = null;
      disegnaDettaglio();
    });
    barra.append(b);
  }
  return barra;
}

/** Un pulsante grande: il modo di scegliere quando si ha un dito e non un mouse. */
function sceltaGrande(testo, sotto, attivo, azione) {
  const b = bottone(`grande${attivo ? ' is-attivo' : ''}`);
  b.setAttribute('aria-pressed', String(!!attivo));
  b.append(nodo('span', 'grande__testo', testo));
  if (sotto) b.append(nodo('span', 'grande__sotto', sotto));
  b.addEventListener('click', azione);
  return b;
}

function passoStato(n) {
  const fila = nodo('div', 'grandi');
  for (const s of STATI) {
    fila.append(sceltaGrande(s.nome, null, n.stato === s.chiave, () => sposta(n.id, s.chiave, false)));
  }
  return fila;
}

/** Due passaggi, non quattordici pulsanti: cinque aree stanno in una schermata e si
 *  leggono, quattordici codici no. La barretta colorata è la stessa delle card, quindi
 *  sceglierli insegna anche i colori. */
function passoCategoria(n) {
  const box = nodo('div', 'passo__corpo');

  if (!areaAperta) {
    const fila = nodo('div', 'grandi');
    for (const [chiave, area] of Object.entries(AREE)) {
      const b = sceltaGrande(area.nome, area.cat.join(' · '), areaDi(n.cat) === chiave, () => {
        areaAperta = chiave;
        disegnaDettaglio();
      });
      b.dataset.area = chiave;
      fila.append(b);
    }
    box.append(fila);
    if (n.cat) {
      const via = bottone('dettaglio__via', 'Togli la categoria');
      via.addEventListener('click', () => correggi(n.id, { cat: null }));
      box.append(via);
    }
    return box;
  }

  const indietro = bottone('passo__indietro', '‹ Tutte le aree');
  indietro.addEventListener('click', () => {
    areaAperta = null;
    disegnaDettaglio();
  });
  box.append(indietro);
  const fila = nodo('div', 'grandi');
  fila.dataset.area = areaAperta;
  for (const cod of AREE[areaAperta].cat) {
    fila.append(sceltaGrande(cod, nomeCategoria(cod), n.cat === cod, () => {
      areaAperta = null; // scelto il codice si torna alle aree: il passaggio è finito
      correggi(n.id, { cat: cod });
    }));
  }
  box.append(fila);
  return box;
}

/** Il selettore di stato: cinque voci in fila, un tocco.
 *
 *  Sul telefono è l'unico modo che esiste di cambiare stato. Lo scorrimento sa fare solo
 *  «chiuso» e «in corso», non sa portare in Attesa e soprattutto non sa tornare indietro:
 *  una nota chiusa per sbaglio, passati i cinque secondi della barretta, restava chiusa.
 *  Non un quarto gesto: tre sono già il limite di quello che una mano distingue tenendo
 *  il telefono, e il quarto si sbaglierebbe al posto di uno degli altri tre.
 *
 *  Sta sopra la categoria perché è il motivo per cui il dettaglio si apre durante la
 *  giornata; la categoria si corregge una volta sola, quando la nota è nata storta. */
function sezioneStato(n) {
  const sez = nodo('section', 'dettaglio__sezione');
  sez.append(nodo('div', 'dettaglio__etichetta', 'Stato'));
  const riga = nodo('div', 'stati');
  for (const s of STATI) {
    const b = bottone(`stato-scelta${s.chiave === 'attesa' ? ' stato-scelta--attesa' : ''}`, s.nome);
    b.setAttribute('aria-pressed', String(n.stato === s.chiave));
    if (n.stato === s.chiave) b.classList.add('is-attivo');
    // La domanda dell'Attesa scatta anche da qui: è legata al passaggio di stato, non
    // al gesto che lo produce.
    b.addEventListener('click', () => sposta(n.id, s.chiave, false));
    riga.append(b);
  }
  sez.append(riga);
  return sez;
}

/** Il codice cliente: sette cifre, le prime tre sono la filiale. */
function sezioneCliente(n) {
  const sez = nodo('section', 'dettaglio__sezione');
  const testa = nodo('div', 'dettaglio__etichetta');
  testa.append(nodo('span', null, 'Cliente'));
  // La filiale non si salva da nessuna parte: si ricava dal codice. Un dato derivabile
  // che viene scritto nel log è un dato che un giorno smentirà quello da cui deriva.
  testa.append(nodo('span', 'dettaglio__attuale', n.cl ? `filiale ${filiale(n.cl)}` : 'sette cifre'));
  sez.append(testa);

  const riga = nodo('div', 'dettaglio__riga');
  const i = document.createElement('input');
  i.type = 'text';
  i.inputMode = 'numeric';
  i.className = 'dettaglio__campo';
  i.value = n.cl || '';
  i.placeholder = 'es. 2245744';
  i.maxLength = 7;
  i.autocomplete = 'off';
  i.addEventListener('change', () => {
    const v = i.value.replace(/\D/g, '');
    // Mezzo codice non è un codice: ne uscirebbe una filiale inventata. Si rimette com'era.
    if (v && v.length !== 7) {
      i.value = n.cl || '';
      return;
    }
    correggi(n.id, { cl: v || null });
  });
  riga.append(i);
  if (n.cl) {
    const altre = bottone('dettaglio__via', 'Tutte le sue note');
    altre.addEventListener('click', () => {
      chiudiDettaglio();
      cercaCliente(n.cl);
    });
    riga.append(altre);
  }
  sez.append(riga);
  return sez;
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
  const p = $('#config');
  if (p) p.hidden = false;
  const primo = $('#config input');
  if (primo) primo.focus();
}

function chiudiConfig() {
  const p = $('#config');
  if (p) p.hidden = true;
  $('#config-foglio')?.replaceChildren();
}

function disegnaConfig() {
  const c = cfg();
  const foglio = $('#config-foglio');
  if (!foglio) return;
  foglio.replaceChildren();

  const testa = nodo('header', 'dettaglio__testa');
  testa.append(nodo('p', 'dettaglio__testo', 'Impostazioni'));
  const chiudi = bottone('dettaglio__chiudi', '✕');
  chiudi.setAttribute('aria-label', 'Chiudi');
  chiudi.addEventListener('click', chiudiConfig);
  testa.append(chiudi);
  foglio.append(testa);
  if (avvisoConfig) foglio.append(nodo('div', 'guasto', avvisoConfig));

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

  const p = $('#config');
  if (p) p.hidden = false;
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
      await aggiornaPercorsi(); // la sync porta eventi di altri dispositivi
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

  // Due azioni distinte, perché fanno due cose molto diverse. Entrambe in due tempi:
  // §5 dice mai "sei sicuro?", ma quella regola vale dove il log sa annullare, e qui no.
  sez.append(inDueTempi(
    'Svuota copia locale (i dati torneranno dalla sincronizzazione)',
    'Tocca ancora per svuotare la copia locale',
    async () => {
      await Store.svuota();
      if (cfg().esempi) await seminaEsempi();
    },
  ));
  sez.append(nodo('div', 'dettaglio__nota',
    'Cancella solo IndexedDB su questo dispositivo. Gli eventi restano su GitHub, quindi alla prima sincronizzazione le note tornano indietro da sole: serve a ripartire puliti, non a disfare il lavoro.'));

  sez.append(inDueTempi(
    'Cancella tutto, anche su GitHub',
    'Tocca ancora: cancella anche il repo dati',
    async () => {
      try {
        await Store.cancellaTutto();
        rete.guasta = false;
      } catch (err) {
        rete.guasta = true;
        alertaConfig(`Non è stato possibile cancellare su GitHub: ${err.message}`);
      }
    },
  ));
  sez.append(nodo('div', 'dettaglio__nota',
    'Azzera i file di log e lo snapshot nel repo dati, poi la copia locale. Questa non torna indietro da nessuna parte: è l\'unica cosa che il log degli eventi non sa annullare, perché cancella il log stesso. Serve il token.'));
  return sez;
}

/** Un bottone che al primo tocco si arma e al secondo agisce. La finestra è di cinque
 *  secondi: abbastanza per decidere, troppo poco per diventare un gesto automatico. */
function inDueTempi(etichetta, avviso, azione) {
  const b = bottone('dettaglio__via pericolo', etichetta);
  let armato = false;
  let scaduto = null;
  b.addEventListener('click', async () => {
    if (!armato) {
      armato = true;
      b.textContent = avviso;
      b.classList.add('is-armato');
      scaduto = setTimeout(() => {
        armato = false;
        b.textContent = etichetta;
        b.classList.remove('is-armato');
      }, 5000);
      return;
    }
    clearTimeout(scaduto);
    b.disabled = true;
    await azione();
    disegna();
    await aggiornaStato();
    disegnaConfig();
  });
  return b;
}

/** Gli errori di rete falliscono in silenzio, questo no: è una cosa che ho chiesto io.
 *  Sta in una variabile e non nel DOM perché il pannello si ridisegna subito dopo. */
let avvisoConfig = null;

function alertaConfig(testo) {
  avvisoConfig = testo;
  setTimeout(() => {
    if (avvisoConfig !== testo) return;
    avvisoConfig = null;
    if (!$('#config').hidden) disegnaConfig();
  }, 8000);
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

/** Un pallino, e una parola solo quando serve dirne una. Quando è tutto a posto non c'è
 *  niente da leggere: il verde da solo è già la risposta. Il testo per esteso resta nel
 *  `title` e nell'etichetta accessibile, per chi il colore non lo vede. */
async function aggiornaStato() {
  const el = $('#stato-sync');
  if (!el) return; // senza indicatore l'app funziona: si sincronizza lo stesso, in silenzio
  const scrivi = (classe, breve, esteso) => {
    el.className = `stato-sync ${classe}`.trim();
    const testo = $('#stato-sync-testo');
    if (testo) testo.textContent = breve;
    el.title = esteso;
    el.setAttribute('aria-label', esteso);
  };

  const c = cfg();
  if (!c.owner || !c.repo || !token()) {
    return scrivi('stato-sync--spento', 'non configurato', 'Sincronizzazione non configurata: apri le impostazioni');
  }

  let coda = 0;
  try {
    coda = await Store.inCoda();
  } catch {
    return scrivi('stato-sync--guasto', 'archivio non pronto', 'Archivio locale non disponibile');
  }
  if (!navigator.onLine || rete.guasta) {
    return scrivi('stato-sync--guasto', 'non raggiungibile', 'GitHub non risponde: le note restano qui e ripartono da sole');
  }
  if (coda > 0) {
    return scrivi('stato-sync--coda', String(coda), `${coda} ${coda === 1 ? 'nota in coda' : 'note in coda'} da sincronizzare`);
  }
  scrivi('stato-sync--pari', '', 'Sincronizzato con GitHub');
}

// ─── Cattura ─────────────────────────────────────────────────────────────────

function mostraAnteprima(testo) {
  const box = $('#anteprima');
  if (!box) return;
  const letta = testo.trim() ? parse(testo) : null;
  const pezzi = [];
  if (letta) {
    if (letta.cat) pezzi.push({ testo: `${letta.cat} · ${nomeCategoria(letta.cat)}`, classe: 'etichetta--categoria' });
    else pezzi.push({ testo: letta.incerto ? 'incerta, da classificare' : 'da classificare', classe: '' });
    if (letta.pf) pezzi.push({ testo: letta.pf, classe: 'etichetta--piattaforma' });
    if (letta.cl) pezzi.push({ testo: `cliente ${letta.cl}`, classe: 'etichetta--cliente' });
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
  if (!box || !campo) return;
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
  if (box) {
    box.replaceChildren();
    box.hidden = true;
  }
  campo?.setAttribute('aria-expanded', 'false');
  campo?.removeAttribute('aria-activedescendant');
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
// Il cablaggio degli ascoltatori sta tutto dentro `collega()`, e `collega()` non può far
// morire l'avvio.
//
// È già successo due volte: `index.html` pubblicato più vecchio di `app.js`, un `$()` che
// torna `null`, l'eccezione ferma il modulo a metà riga — e il board non viene disegnato
// per niente, perché `avvia()` sta sotto. Il risultato è una pagina con la sola testata,
// che sembra un guasto dei dati mentre manca un bottone.
//
// Regola: un pezzo d'interfaccia che manca costa quel pezzo, mai la pagina. Si scrive in
// console — forte, perché è un difetto e va corretto — e si tira dritto.

/** Aggancia un ascoltatore, se l'elemento c'è. Ritorna l'elemento o `null`. */
function ascolta(selettore, evento, azione, opzioni) {
  const el = $(selettore);
  if (!el) {
    console.error(
      `[note] manca in index.html: ${selettore}. L'interfaccia continua senza quel pezzo — `
      + 'quasi sempre vuol dire che index.html è più vecchio di app.js.');
    return null;
  }
  el.addEventListener(evento, azione, opzioni);
  return el;
}

const campo = $('#cattura');

function collega() {
  collegaCattura();
  collegaRicerca();
  collegaPannelli();
}

function collegaCattura() {
  ascolta('#cattura', 'input', () => {
    mostraAnteprima(campo.value);
    aggiornaSuggerimenti();
  });
  ascolta('#cattura', 'blur', chiudiSuggerimenti);
  ascolta('#cattura', 'keydown', tastoCattura);
}

async function tastoCattura(e) {
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
}

const bottoneCerca = $('#cerca');
const rigaRicerca = $('#riga-ricerca');
const campoRicerca = $('#ricerca');

// Da qui in giù si usa l'accesso opzionale: se un pezzo non c'è, l'azione che lo tocca
// non fa niente invece di far esplodere quella che viene dopo.
function apriRicerca() {
  if (rigaRicerca) rigaRicerca.hidden = false;
  bottoneCerca?.setAttribute('aria-expanded', 'true');
  campoRicerca?.focus();
}

function chiudiRigaRicerca() {
  if (rigaRicerca) rigaRicerca.hidden = true;
  bottoneCerca?.setAttribute('aria-expanded', 'false');
  chiudiRicerca();
}

function chiudiRicerca() {
  if (campoRicerca) campoRicerca.value = '';
  filtro = '';
  cliente = null; // chiudere la riga toglie tutti i filtri che quella riga mostrava
  disegna();
}

function collegaRicerca() {
  ascolta('#cerca', 'click', () => {
    if (rigaRicerca?.hidden) return apriRicerca();
    chiudiRigaRicerca();
  });

  ascolta('#ricerca', 'input', () => {
    filtro = campoRicerca.value;
    disegna();
  });

  ascolta('#ricerca', 'keydown', (e) => {
    if (e.key !== 'Escape') return;
    chiudiRigaRicerca();
    campo?.focus();
  });

  ascolta('#cliente-attivo', 'click', () => {
    cliente = null;
    disegna();
    campoRicerca?.focus();
  });

  ascolta('#riepilogo-apri', 'click', apriRiepilogo);
  ascolta('#riepilogo-chiudi', 'click', chiudiRiepilogo);
  ascolta('#riepilogo-fondo', 'click', chiudiRiepilogo);
  ascolta('#riepilogo-copia', 'click', (e) =>
    negliAppunti($('#riepilogo-testo')?.value || '', e.currentTarget, $('#riepilogo-testo')));
}

const campoAttesa = $('#attesa-campo');

function collegaPannelli() {
  // È un form apposta: così Invio lo chiude senza che serva intercettare un tasto.
  ascolta('#attesa-foglio', 'submit', (e) => {
    e.preventDefault();
    chiudiAttesa(true);
  });
  ascolta('#attesa-fondo', 'click', () => chiudiAttesa(false));

  ascolta('#dettaglio-fondo', 'click', chiudiDettaglio);
  ascolta('#config-fondo', 'click', chiudiConfig);
  ascolta('#impostazioni', 'click', apriConfig);
  ascolta('#stato-sync', 'click', apriConfig);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // `?? true` perché un pannello che non esiste conta come già chiuso: senza,
    // Esc smetterebbe di chiudere tutti gli altri.
    if (!($('#attesa')?.hidden ?? true)) chiudiAttesa(false);
    else if (!($('#riepilogo')?.hidden ?? true)) chiudiRiepilogo();
    else if (apertaId != null) chiudiDettaglio();
    else if (!($('#config')?.hidden ?? true)) chiudiConfig();
  });
}

// La rete che torna, o l'app che riprende il fuoco, cambiano lo stato senza preavviso.
addEventListener('online', aggiornaStato);
addEventListener('offline', aggiornaStato);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) aggiornaStato();
});

// Il passaggio desktop/telefono cambia le affordance: trascinamento contro scorrimento.
window.matchMedia('(min-width: 900px)').addEventListener('change', disegna);

// Due chiamate separate, e in quest'ordine: anche se `collega()` inciampasse su qualcosa
// di imprevisto, `avvia()` parte lo stesso e il board si disegna.
try {
  collega();
} catch (err) {
  console.error('[note] cablaggio degli ascoltatori interrotto:', err);
}
avvia();

async function avvia() {
  const c = cfg();
  const dev = $('#dispositivo');
  if (dev) dev.textContent = c.dev;
  try {
    Store.mappaAree(CATEGORIE); // senza questa, il filtro per area non trova mai niente
    await Store.init({ owner: c.owner || null, repo: c.repo || null, dev: c.dev });
    // Le note finte servono a provare sincronizzazione e gesti, quindi restano dietro un
    // interruttore spento di suo: chi apre l'app per lavorare non le vede mai.
    if (c.esempi && tutte().length === 0) await seminaEsempi();
    await aggiornaPercorsi();
  } catch (err) {
    // La rete fallisce in silenzio, tutto il resto è visibile: senza IndexedDB non
    // esiste applicazione, e mostrarlo è meglio che una schermata vuota inspiegabile.
    $('#contenuto')?.replaceChildren(
      nodo('p', 'guasto', `Archivio locale non disponibile: ${err.message}. In navigazione privata il browser lo blocca.`),
    );
    return;
  }
  disegna();
  await aggiornaStato();
  campo?.focus();
}
