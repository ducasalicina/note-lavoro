/* ============================================================
   brt-classificatore.js
   Categorie CED, classificazione automatica e parsing rapido.
   Nessuna dipendenza. Esportabile come modulo o usabile inline.

   Principio: decide il PROBLEMA, non il PRODOTTO.
   "reset password su EasySpedWeb" è un problema di accessi che capita
   su un portale, non un problema di portali. Per questo i termini sono
   divisi in due classi che non si sommano mai fra loro:

     sintomi      pesano e decidono la categoria
     piattaforme  pesano zero e finiscono nel campo `pf`

   Una piattaforma decide solo quando nel testo non c'è nessun sintomo,
   e in quel caso col peso dimezzato: "MyBRT" da solo è meglio di niente,
   ma "reset password" accanto a "MyBRT" vince sempre.
   ============================================================ */

/* Macro-aree: servono ai filtri, perché 14 voci su telefono
   non stanno in una barra. Filtri per area, classifichi per codice. */
export const AREE = {
  ACCESSI:     { nome: 'Accessi',            cat: ['ACC'] },
  PORTALI:     { nome: 'Portali e servizi',  cat: ['ATT', 'POR', 'SRV'] },
  INTEGRAZ:    { nome: 'Integrazioni e dati',cat: ['API', 'ECO', 'TRX', 'SFT'] },
  OPERATIVO:   { nome: 'Operativo',          cat: ['ETI', 'TRK', 'CED', 'REP'] },
  SISTEMI:     { nome: 'Sistemi',            cat: ['HW', 'ESC'] }
};

/* Forme ammesse per un termine, nei sintomi come nelle piattaforme:

     'parola'                       peso = numero di parole che la compongono
     ['frase', 3]                   peso esplicito, per i termini che da soli bastano
     { re: /\binc\d+/, peso: 3 }    schema, confrontato sul testo normalizzato
     { maiuscolo: 'VAB', peso: 4 }  confronto sensibile alle maiuscole, sul testo grezzo

   Le frasi vincono sui singoli termini perché pesano di più: "stampa etichetta"
   (peso 2) batte "stampante" (peso 1) e la nota finisce in ETI, non in HW.

   Gli acronimi corti vanno sempre in `maiuscolo`: "vas", "vat" e "ob" in minuscolo
   intercettano parole comuni e classificherebbero mezza inbox in TRX. */

export const CATEGORIE = [
  {
    cod: 'ACC', area: 'ACCESSI', nome: 'Accessi e utenze',
    kw: [
      ['password', 3], 'reset password', 'reset', 'account bloccato',
      'utente bloccato', ['credenziali', 3], 'utenza', 'utenze',
      'registrazione', 'registrare', 'accesso', 'accessi', 'login',
      'codice cliente', 'associazione utente', 'sbloccare', 'sbloccato',
      'abilitazione utente', 'nuovo utente', 'non entra', 'non riesce ad accedere',
      'account', 'permessi', 'permesso', 'autorizzazioni', 'accedere', 'accedervi',
      'non riesco ad accedere', 'non abbiamo i permessi'
    ]
  },
  {
    cod: 'ATT', area: 'PORTALI', nome: 'Attivazioni e configurazioni servizi',
    kw: [
      ['attivazione', 3], ['attivare', 3], ['attivato', 3], ['da attivare', 4],
      ['marketplace', 2], ['pudo', 3], ['rmp', 3],
      'configurazione', 'configurare', 'abilitare servizio', 'nuovo servizio',
      'richiesta attivazione'
    ]
  },
  {
    cod: 'POR', area: 'PORTALI', nome: 'Assistenza portali BRT',
    kw: [
      'portale', 'non salva', 'non carica', 'non visualizza', 'non vedo',
      'errore inserimento', 'errore salvataggio', 'schermata', 'pagina bianca',
      'non funziona il portale'
    ]
  },
  {
    cod: 'API', area: 'INTEGRAZ', nome: 'Integrazioni REST API e web service',
    kw: [
      ['api', 3], ['rest api', 4], ['rest', 2], ['web service', 4],
      ['webservice', 4], ['json', 3], ['endpoint', 3], ['token api', 3],
      'validazione', 'errore validazione', 'creazione spedizione',
      'conferma spedizione', 'prenotazione ritiro', 'payload',
      'errore 400', 'errore 500'
    ]
  },
  {
    cod: 'ECO', area: 'INTEGRAZ', nome: 'Integrazioni e-commerce',
    kw: [
      ['ecommerce', 3], ['e commerce', 3],
      'plugin', 'ordini', 'sincronizzazione ordini', 'sincronizzazione',
      'stati ordine', 'non si sincronizza'
    ]
  },
  {
    cod: 'TRX', area: 'INTEGRAZ', nome: 'Trasmissioni dati e tracciati',
    kw: [
      ['fnvab', 5], ['fnvat', 5], ['tracciato', 3], 'tracciati', ['csv', 2],
      'mappatura', 'mappatura campi', 'importazione', 'importare', 'import',
      'trasmissione', 'trasmissioni', 'non trasmesso', 'trasmissione mancante',
      'flusso dati',
      /* Sigle dei tracciati: solo in maiuscolo, o "vas" e "ob" pescano ovunque. */
      { maiuscolo: 'VAB', peso: 4 }, { maiuscolo: 'VAT', peso: 4 },
      { maiuscolo: 'VAO', peso: 4 }, { maiuscolo: 'VAS', peso: 4 },
      { maiuscolo: 'OB', peso: 3 }
    ]
  },
  {
    cod: 'SFT', area: 'INTEGRAZ', nome: 'Scambio file SFTP/FTPS',
    kw: [
      ['sftp', 5], ['ftps', 5], ['ftp', 4], 'cartella', 'cartelle',
      'chiave ssh', 'connessione ftp', 'utenza ftp', 'file non arrivato',
      'recupero file', 'upload file', 'non trova il file',
      { re: /\bporta (21|22)\b/, peso: 4 }
    ]
  },
  {
    cod: 'ETI', area: 'OPERATIVO', nome: 'Etichette, segnacolli e borderò',
    kw: [
      ['etichetta', 4], ['etichette', 4], ['segnacollo', 5], ['segnacolli', 5],
      ['bordero', 4], ['barcode', 3], 'ristampa', 'stampa etichetta',
      'stampa etichette', 'ristampare etichetta', 'pdf etichetta',
      'codice a barre', 'non stampa etichetta',
      /* "serie 2" = serie dei segnacolli. DA CONFERMARE: se in BRT indica altro,
         questa riga va spostata di categoria. */
      { re: /\bserie 2\b/, peso: 3 }
    ]
  },
  {
    cod: 'SRV', area: 'PORTALI', nome: 'Servizi e instradamento spedizioni',
    kw: [
      /* "dpd" da solo è passato fra le piattaforme: è un marchio di vettore, e in un
         testo sul tracking pareggiava con TRK spingendo la nota all'astensione.
         "dpd estero" resta, perché descrive un servizio e non solo il vettore. */
      'dpd estero', 'estero', ['multicollo', 4], ['fermopoint', 5],
      ['reso', 3], 'resi', ['pallet', 3], 'codice servizio', 'filiale di arrivo',
      'instradamento', 'contrassegno', 'spedizione estero'
    ]
  },
  {
    cod: 'TRK', area: 'OPERATIVO', nome: 'Tracking, esiti e notifiche',
    kw: [
      ['tracking', 4], 'traccia', ['esito', 3], 'esiti', ['notifica', 3],
      'notifiche', ['sms', 3], 'riferimento brt', 'riferimento dpd',
      'aggiornamento stato', 'giacenza', 'non aggiorna il tracking',
      'mail al destinatario'
    ]
  },
  {
    cod: 'CED', area: 'OPERATIVO', nome: 'Controlli operativi CED',
    kw: [
      ['manca record', 6], 'mancano record', ['scarto', 4], 'scarti',
      ['anomalia', 4], 'anomalie', 'segnalazione secondo procedura',
      'controllo trasmissioni', 'quadratura', 'verifica giornaliera'
    ]
  },
  {
    cod: 'REP', area: 'OPERATIVO', nome: 'Estrazioni, report e flussi fatture',
    kw: [
      ['estrazione', 4], 'estrazioni', ['report', 3], ['kpi', 4],
      ['file vf', 5], 'excel', 'fattura', 'fatture', 'fatturazione',
      'riepilogo', 'elenco spedizioni', 'raggruppamento codici', 'estrarre',
      /* Verbi tecnici: in italiano d'ufficio "estrapolare" significa quasi solo
         tirare fuori dati da un sistema, quindi basta da solo. */
      ['estrapolare', 2], ['estrapolando', 2],
      'codici cliente', 'elenco codici', 'elenco completo'
    ]
  },
  {
    cod: 'HW', area: 'SISTEMI', nome: 'Postazioni, dispositivi e connettività',
    kw: [
      ['vdi', 4], ['stampante', 3], ['pistola', 4], 'lettore',
      ['wifi', 3], ['wi fi', 3], 'monitor', 'postazione', 'tastiera', 'mouse',
      'toner', ['pc', 2], 'non si accende', 'non stampa', 'rete lenta',
      'cavo', 'muletto', 'offline'
    ]
  },
  {
    cod: 'ESC', area: 'SISTEMI', nome: 'Ticket ed escalation IT',
    kw: [
      /* "ticket" da solo non c'è più: compariva in troppe richieste di ogni
         categoria. Restano le frasi e il numero di ticket vero. */
      ['escalation', 4], ['erp', 3], 'it erp', 'sollecito',
      'sollecitare', 'sollecitato', 'evidenze', 'apertura segnalazione',
      'aperto ticket', 'aggiornamento ticket', 'in carico a it',
      { re: /\binc\d+/, peso: 3 }
    ]
  }
];

/* Le piattaforme non classificano: dicono soltanto DOVE succede la cosa.
   `cat` è la categoria a cui ripiegare quando nel testo non c'è nessun sintomo. */
/* Nei testi veri le piattaforme compaiono quasi sempre abbreviate, quindi ogni voce
   porta i suoi alias. Le varianti di sola maiuscola NON servono: `normalizza()` abbassa
   tutto prima del confronto, quindi "MyBrt", "MYBRT" e "mybrt" sono già lo stesso alias.
   Servono invece le forme scritte diversamente: staccate, troncate, con la sigla. */
export const PIATTAFORME = [
  { nome: 'MyBRT',       cat: 'POR', peso: 4, kw: ['mybrt', 'my brt'] },
  /* `normalizza()` non tocca i punti, quindi "e.s.w." arriva intatto: il termine
     `e.s.w` senza punto finale copre entrambe le forme, perché il confine di parola
     dopo la "w" cade sul punto. */
  { nome: 'EasySpedWeb', cat: 'POR', peso: 4,
    kw: ['easyspedweb', 'easysped web', 'easysped', 'easyweb', 'easy web', 'easy sped',
         ['esw', 3], ['e.s.w', 3]] },
  { nome: 'WooCommerce', cat: 'ECO', peso: 4, kw: ['woocommerce', 'woo commerce'] },
  { nome: 'Shopify',     cat: 'ECO', peso: 4, kw: ['shopify'] },
  { nome: 'PrestaShop',  cat: 'ECO', peso: 4, kw: ['prestashop', 'presta shop'] },
  { nome: 'Magento',     cat: 'ECO', peso: 4, kw: ['magento'] },
  { nome: 'GSped',       cat: 'ECO', peso: 4, kw: ['gsped', 'g sped'] },
  { nome: 'Qapla',       cat: 'ECO', peso: 4, kw: ['qapla'] },
  { nome: 'ShippyPro',   cat: 'ECO', peso: 4, kw: ['shippypro', 'shippy pro'] },
  { nome: 'Plug & Ship', cat: 'ATT', peso: 4, kw: ['plug&ship', 'plug and ship', 'plugship', 'plug ship'] },
  /* ZT41x è un modello di stampante Zebra: un prodotto, quindi piattaforma.
     "ZT411 non stampa" resta HW per via del sintomo, non per via del modello. */
  { nome: 'Zebra',       cat: 'HW',  peso: 4, kw: ['zebra', { re: /\bzt41\d\b/, peso: 4 }] },
  { nome: 'ServiceNow',  cat: 'ESC', peso: 4, kw: ['servicenow', 'service now'] },
  /* Amazon non era nella tua lista: l'ho aggiunta perché `prove-reali.js` si aspetta
     `pf: 'Amazon'`. Ripiega su ECO come gli altri marketplace. Dimmi se sbaglio. */
  { nome: 'Amazon',      cat: 'ECO', peso: 4, kw: ['amazon'] },
  /* I vettori stanno in fondo di proposito: quando in un testo compaiono due
     piattaforme, `pf` tiene la prima di questo elenco, e un vettore — che in un'azienda
     di spedizioni è nominato quasi ovunque — identifica molto meno del portale o del
     marketplace su cui la cosa è rotta. */
  { nome: 'DPD',         cat: 'SRV', peso: 4, kw: ['dpd'] }
];

/* Indice codice -> categoria, e alias testuali per il tag manuale #api */
const PER_COD = Object.fromEntries(CATEGORIE.map(c => [c.cod, c]));
export const codiciValidi = () => Object.keys(PER_COD);
export const categoria = cod => PER_COD[cod] || null;
export const piattaforme = () => PIATTAFORME.map(p => p.nome);

/* ---------- normalizzazione ---------- */

export function normalizza(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // via accenti
    .replace(/['’`]/g, '')                              // qapla' -> qapla
    .replace(/[-_/]/g, ' ')                             // wi-fi -> wi fi
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Confine di parola solo dove ha senso: "plug&ship" non ha \b utile
   davanti alla & , quindi lo calcoliamo sui caratteri effettivi. */
function regexPer(kw) {
  const k = escapeRe(kw);
  const pre  = /^[\p{L}\p{N}]/u.test(kw) ? '\\b' : '';
  const post = /[\p{L}\p{N}]$/u.test(kw) ? '\\b' : '';
  return new RegExp(pre + k + post, 'u');
}

/* Compila un termine in { re, peso, grezzo }. `grezzo` = confronta sul testo
   originale invece che sul normalizzato, per i confronti sensibili alle maiuscole. */
function compila(v) {
  if (Array.isArray(v)) {
    const n = normalizza(v[0]);
    return { re: regexPer(n), peso: v[1], grezzo: false };
  }
  if (typeof v === 'string') {
    const n = normalizza(v);
    return { re: regexPer(n), peso: n.split(' ').length, grezzo: false };
  }
  if (v.maiuscolo) return { re: regexPer(v.maiuscolo), peso: v.peso, grezzo: true };
  return { re: v.re, peso: v.peso, grezzo: false };
}

/* Cache delle regex: il classificatore gira a ogni battuta di tasto.
   Niente flag `g`: con lo stato di lastIndex da azzerare a mano, prima o poi
   qualcuno si dimentica e un termine smette di essere trovato a righe alterne. */
const SINTOMI = CATEGORIE.map(c => ({ cod: c.cod, voci: c.kw.map(compila) }));
const PIATT = PIATTAFORME.map(p => ({ ...p, voci: p.kw.map(compila) }));

const colpisce = (v, norm, grezzo) => v.re.test(v.grezzo ? grezzo : norm);

/* ---------- classificazione ---------- */

const SOGLIA = 2;   // sotto questo punteggio non si indovina: "da classificare"

/** Le piattaforme nominate nel testo, in ordine di dichiarazione. */
function piattaformeIn(norm, grezzo) {
  return PIATT.filter(p => p.voci.some(v => colpisce(v, norm, grezzo)));
}

/* LIMITE NOTO: `pf` tiene una piattaforma sola. Quando in un testo ce n'è più d'una —
   "il tracking DPD non appare su Amazon" — vince la prima di PIATTAFORME e l'altra si
   perde. Per questo i vettori stanno in fondo all'elenco: sono i meno informativi.
   Resta una casella singola di proposito: diventerà un array solo se l'uso reale
   dimostrerà che così perdiamo qualcosa, non perché in teoria potrebbe succedere. */

export function classifica(testo) {
  const grezzo = String(testo || '');
  const t = normalizza(grezzo);
  if (!t) return { cod: null, punteggio: 0, alternative: [], pf: null };

  const trovate = piattaformeIn(t, grezzo);
  const pf = trovate.length ? trovate[0].nome : null;

  const punti = SINTOMI.map(c => {
    let p = 0;
    for (const v of c.voci) if (colpisce(v, t, grezzo)) p += v.peso;
    return { cod: c.cod, p };
  }).filter(x => x.p > 0).sort((a, b) => b.p - a.p);

  /* Nessun sintomo: la piattaforma è l'unica cosa che sappiamo, e vale metà.
     "MyBRT" da solo è un indizio debole ma è meglio che niente; basta un
     sintomo qualsiasi nel testo perché torni a contare zero. */
  if (!punti.length) {
    if (!trovate.length) return { cod: null, punteggio: 0, alternative: [], pf: null };
    const p = Math.round(trovate[0].peso / 2);
    if (p < SOGLIA) return { cod: null, punteggio: p, alternative: [], pf };
    return { cod: trovate[0].cat, punteggio: p, alternative: [], pf, daPiattaforma: true };
  }

  if (punti[0].p < SOGLIA) {
    return { cod: null, punteggio: punti[0].p, alternative: punti.slice(0, 3), pf };
  }
  /* Pareggio secco fra due categorie: meglio non scegliere,
     la correzione in triage costa meno di una categoria sbagliata. */
  if (punti[1] && punti[1].p === punti[0].p) {
    return { cod: null, punteggio: punti[0].p, alternative: punti.slice(0, 3), pf, incerto: true };
  }
  return { cod: punti[0].cod, punteggio: punti[0].p, alternative: punti.slice(1, 3), pf };
}

/* ---------- urgenza ---------- */

/* Separata dalla categoria apposta: dice quanto scotta, non di cosa si tratta.
   Alza `pr` solo se non l'ho già messa io con ! o !!: la mia mano batte l'euristica.

   Fuori "bloccato" e "fermo", che sembravano urgenza e invece sono descrizione:
   "account bloccato" è il caso ACC più ordinario che esista, e "tracking fermo" o
   "Zebra ferma" dicono cos'è rotto, non che il mondo si è fermato. L'urgenza vera è
   quando qualcuno non può lavorare. */
const URGENZA = ['urgente', 'subito', 'il prima possibile',
  'non riesce a lavorare', 'sono fermi', 'tutta la filiale'].map(s => regexPer(normalizza(s)));

export function urgente(testo) {
  const t = normalizza(testo);
  return URGENZA.some(re => re.test(t));
}

/* ---------- parsing della riga di cattura ---------- */

const GIORNI = { dom: 0, lun: 1, mar: 2, mer: 3, gio: 4, ven: 5, sab: 6 };

function prossimoGiorno(idx, base) {
  const d = new Date(base);
  const delta = (idx - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d;
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* Segnale interno: "qui c'è una data, ma parla del passato". */
const DESCRITTIVA = Symbol('descrittiva');

function estraiScadenza(testo, oggi = new Date()) {
  let t = testo, data = null, descrittiva = false;

  /* `fn` può restituire una data, niente, oppure DESCRITTIVA: in quest'ultimo caso
     il testo parla di una data ma al passato, e l'intera riga smette di cercare
     scadenze. Serve per "spedizioni partite venerdì 11/09", dove altrimenti il
     giorno della settimana, letto da solo, fisserebbe il venerdì prossimo. */
  const tolgo = (re, fn) => {
    if (data || descrittiva) return;
    const m = t.match(re);
    if (!m) return;
    const d = fn(m);
    if (d === DESCRITTIVA) { descrittiva = true; return; }
    if (!d) return;
    data = iso(d);
    t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  };

  // 15/10  oppure 15/10/2026
  tolgo(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => {
    const gg = +m[1], mm = +m[2] - 1;
    let aa = m[3] ? +m[3] : oggi.getFullYear();
    if (aa < 100) aa += 2000;
    const d = new Date(aa, mm, gg);
    if (isNaN(d)) return null;
    /* Senza anno e già passata è quasi sempre un riferimento al passato, non una
       scadenza: su testo di mail "l'anno prossimo" produceva scadenze fantasma a
       dodici mesi, che poi riemergevano dal nulla. Meglio nessuna scadenza. */
    if (!m[3] && d < new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())) return DESCRITTIVA;
    return d;
  });

  // +3g  /  +2gg
  tolgo(/(?:^|\s)\+(\d{1,2})g{1,2}\b/i, m => {
    const d = new Date(oggi); d.setDate(d.getDate() + +m[1]); return d;
  });

  tolgo(/\boggi\b/i, () => new Date(oggi));
  tolgo(/\bdomani\b/i, () => { const d = new Date(oggi); d.setDate(d.getDate() + 1); return d; });
  tolgo(/\bdopodomani\b/i, () => { const d = new Date(oggi); d.setDate(d.getDate() + 2); return d; });

  // lun mar mer gio ven sab dom  (anche estesi)
  tolgo(/\b(lun|mar|mer|gio|ven|sab|dom)(?:edi|tedi|coledi|vedi|erdi|ato|enica)?\b/i, m => {
    const k = m[1].toLowerCase();
    return prossimoGiorno(GIORNI[k], oggi);
  });

  return { testo: t, scadenza: data };
}

/**
 * parse('!! @rossi #api validazione ko su conferma spedizione dom')
 *  -> { testo, cat, catAuto, da, tag[], priorita, scadenza, pf }
 */
export function parse(input, oggi = new Date()) {
  let t = (input || '').trim();
  let priorita = 0, da = null, catManuale = null;
  const tag = [];

  // priorità: ! o !! isolati
  t = t.replace(/(^|\s)(!{1,2})(?=\s|$)/g, (_, sp, b) => { priorita = b.length; return sp; });

  // richiedente: @rossi
  t = t.replace(/(^|\s)@([\p{L}\d._]+)/gu, (_, sp, n) => { if (!da) da = n; return sp; });

  // tag: #vpn ; se coincide con un codice categoria, è una categoria forzata
  t = t.replace(/(^|\s)#([\p{L}\d._]+)/gu, (_, sp, n) => {
    const up = n.toUpperCase();
    if (PER_COD[up]) catManuale = up; else tag.push(n.toLowerCase());
    return sp;
  });

  const sc = estraiScadenza(t.replace(/\s+/g, ' ').trim(), oggi);
  const testo = sc.testo;

  const auto = classifica(testo);

  // L'urgenza non tocca la categoria e non tocca la mia mano: riempie solo il vuoto.
  if (priorita === 0 && urgente(testo)) priorita = 1;

  return {
    testo,
    cat:      catManuale || auto.cod || null,
    catAuto:  !catManuale && !!auto.cod,
    incerto:  !catManuale && !!auto.incerto,
    da,
    tag,
    priorita,
    scadenza: sc.scadenza,
    pf:       auto.pf
  };
}

/* Utile alla UI: etichetta breve da mostrare accanto al campo mentre si scrive */
export function etichetta(cod) {
  const c = PER_COD[cod];
  return c ? `${c.cod} · ${c.nome}` : 'da classificare';
}
