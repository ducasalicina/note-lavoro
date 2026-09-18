// dati-esempio.js — PROVVISORIO, da cancellare prima del primo uso reale.
//
// Semina qualche nota solo quando l'archivio locale è vuoto, così l'app ha qualcosa da
// mostrare prima che esista un repo dati. Le righe passano dalla cattura vera: è
// `brt-classificatore.js` a decidere categoria, richiedente, priorità e scadenza, quindi
// quello che si vede a schermo è il comportamento reale del classificatore, non una
// tabella di categorie scritte a mano.
//
// Ogni nota porta anche un PERCORSO datato. Senza, tutti gli eventi nascerebbero nello
// stesso istante e la cronologia — che è la cosa per cui lo strumento esiste (§1) —
// mostrerebbe sedici righe tutte alle 14:32 di oggi, cioè niente. Le date arrivano
// dall'argomento `at` di `aggiungi()` e `modifica()`, che esiste solo per questo file.
//
// Va eliminato insieme alla sua chiamata in `avvia()` quando si collega il repo vero:
// da quel momento le note sono quelle reali e seminarne di finte sporcherebbe il log.

import * as Store from './brt-store.js';
import { parse } from './brt-classificatore.js';

const fra = (giorni) => {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Un istante `g` giorni fa, a un'ora d'ufficio plausibile. */
const quando = (g, ora = 9, min = 40) => {
  const d = new Date();
  d.setDate(d.getDate() + g);
  d.setHours(ora, min, 0, 0);
  return d.getTime();
};

// `rc` è messo a mano perché serve mostrare sia le voci in pari sia quelle da
// ricontrollare; nell'uso vero lo calcola la tabella a ogni cambio di stato.
//
// `nata` = giorni fa in cui è arrivata. `passi` = il percorso, con i giorni e lo stato.
// Le attese portano la risposta al «cosa aspetti», che è quello che serve leggere per
// sapere di chi è la palla.
const ESEMPI = [
  { riga: '!! Zebra ferma in spedizione, non stampa le etichette oggi',
    nata: 0, passi: [], rc: -1, src: 'app' },
  { riga: '@rossi reset password, il nuovo assunto non riesce ad accedere',
    nata: -1, passi: [], rc: 2, src: 'urlbar' },
  { riga: 'Verificare i permessi della cartella condivisa amministrazione',
    nata: -2, passi: [], rc: 0, src: 'app' },

  { riga: '@chiara errore validazione sulla creazione spedizione da rest api ven',
    nata: -9, passi: [{ g: -8, stato: 'dafare' }], rc: -3, src: 'bookmarklet', ticket: 'INC-8871', fs: 1 },
  { riga: 'Mappatura campi del tracciato fnvab, flusso non trasmesso',
    nata: -6, passi: [{ g: -5, stato: 'dafare' }], rc: 4, src: 'manuale', ticket: 'REQ-2210' },
  { riga: 'Attivazione plug&ship per il nuovo cliente di Bergamo',
    nata: -4, passi: [{ g: -3, stato: 'dafare' }], rc: 1, src: 'app' },

  { riga: 'woocommerce non si sincronizza gli stati ordine @bianchi',
    nata: -7, passi: [{ g: -6, stato: 'dafare' }, { g: -2, stato: 'corso' }], rc: 2, src: 'bookmarklet', ticket: 'PRJ-119' },
  { riga: 'Ristampa segnacollo per il cliente di Como',
    nata: -3, passi: [{ g: -3, stato: 'corso', ora: 15 }], rc: -1, src: 'urlbar' },
  { riga: 'Estrazione report kpi mensile per la direzione',
    nata: -5, passi: [{ g: -1, stato: 'corso' }], rc: 0, src: 'app', ticket: 'REQ-2198' },
  { riga: '! mybrt pagina bianca al salvataggio @ferrini',
    nata: -2, passi: [{ g: -1, stato: 'corso', ora: 11 }], rc: 3, src: 'app', fs: 1 },

  // Le due attese lunghe: sono il caso su cui nascono le contestazioni.
  { riga: '@longhi sollecito ticket it erp per la porta verso il gestionale',
    nata: -14, passi: [{ g: -13, stato: 'dafare' }, { g: -11, stato: 'corso' },
                       { g: -9, stato: 'attesa', aspetto: 'risposta di IT ERP sul ticket INC-4412' }],
    rc: -5, src: 'bookmarklet', ticket: 'INC-4412' },
  { riga: 'Manca record nella trasmissione di ieri, segnalazione secondo procedura',
    nata: -8, passi: [{ g: -8, stato: 'corso', ora: 14 },
                      { g: -6, stato: 'attesa', aspetto: 'conferma del cliente sui codici da rilavorare' }],
    rc: 2, src: 'app', ticket: 'INC-4390' },

  { riga: 'Notifica sms al destinatario non parte, tracking fermo',
    nata: -6, passi: [{ g: -5, stato: 'corso' }, { g: -2, stato: 'chiuso', esito: 'risolto' }], src: 'app' },
  { riga: 'Utenza ftp del fornitore scaduta, file non arrivato',
    nata: -12, passi: [{ g: -11, stato: 'corso' },
                       { g: -10, stato: 'attesa', aspetto: 'credenziali nuove dal fornitore' },
                       { g: -4, stato: 'chiuso', esito: 'girato' }],
    src: 'bookmarklet', ticket: 'REQ-2187' },
  { riga: '@longhi chiedeva se fermopoint copre anche i resi del marketplace',
    nata: -3, passi: [{ g: -3, stato: 'chiuso', esito: 'risposto', ora: 16 }], src: 'app' },
  { riga: '@chiara monitor per la postazione nuova, ha cambiato sede',
    nata: -5, passi: [{ g: -5, stato: 'chiuso', esito: 'decaduto', ora: 17 }], src: 'app' },
];

export async function seminaEsempi() {
  for (const e of ESEMPI) {
    const nato = quando(e.nata);
    const nota = await Store.aggiungi(e.riga, nato);

    // Come nella cattura vera: `aggiungi()` scrive quello che sa il classificatore, il
    // resto arriva con una patch subito dopo.
    const primo = { src: e.src, fs: e.fs || 0, pf: parse(e.riga).pf };
    if (e.ticket) primo.ticket = e.ticket;
    await Store.modifica(nota.id, primo, nato + 60_000);

    for (const p of e.passi) {
      const t = quando(p.g, p.ora ?? 11, 5);
      await Store.modifica(nota.id, { stato: p.stato }, t);
      // La risposta al «cosa aspetti» e l'esito arrivano con un evento loro, come
      // succede davvero: la domanda si risponde a spostamento già fatto.
      if (p.aspetto) await Store.modifica(nota.id, { aspetto: p.aspetto }, t + 40_000);
      if (p.esito) await Store.modifica(nota.id, { esito: p.esito }, t + 40_000);
    }

    if (e.rc !== undefined) await Store.modifica(nota.id, { rc: fra(e.rc) });
  }
}
