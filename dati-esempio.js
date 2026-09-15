// dati-esempio.js — PROVVISORIO, da cancellare alla Tappa 2.
//
// Semina qualche nota solo quando l'archivio locale è vuoto, così l'app ha qualcosa da
// mostrare prima che esista un repo dati. Le righe passano dalla cattura vera: è
// `brt-classificatore.js` a decidere categoria, richiedente, priorità e scadenza, quindi
// quello che si vede a schermo è il comportamento reale del classificatore, non una
// tabella di categorie scritte a mano.
//
// Alla Tappa 2, quando il pannello impostazioni configura owner/repo/token, questo file
// va eliminato e la chiamata in `avvia()` con lui: da quel momento le note sono quelle
// vere e seminarne di finte sporcherebbe il log.

import * as Store from './brt-store.js';
import { parse } from './brt-classificatore.js';

const fra = (giorni) => {
  const d = new Date();
  d.setDate(d.getDate() + giorni);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// `rc` è messo a mano perché serve mostrare sia le voci in pari sia quelle da
// ricontrollare; nell'uso vero lo calcola la tabella a ogni cambio di stato.
const ESEMPI = [
  { riga: '!! Zebra ferma in spedizione, non stampa le etichette oggi', stato: 'inbox', rc: -1, src: 'app' },
  { riga: '@rossi reset password, il nuovo assunto non riesce ad accedere', stato: 'inbox', rc: 2, src: 'urlbar' },
  { riga: 'Verificare i permessi della cartella condivisa amministrazione', stato: 'inbox', rc: 0, src: 'app' },
  { riga: '@chiara errore validazione sulla creazione spedizione da rest api ven', stato: 'dafare', rc: -3, src: 'bookmarklet', ticket: 'INC-8871', fs: 1 },
  { riga: 'Mappatura campi del tracciato fnvab, flusso non trasmesso', stato: 'dafare', rc: 4, src: 'manuale', ticket: 'REQ-2210' },
  { riga: 'Attivazione plug&ship per il nuovo cliente di Bergamo', stato: 'dafare', rc: 1, src: 'app' },
  { riga: 'woocommerce non si sincronizza gli stati ordine @bianchi', stato: 'corso', rc: 2, src: 'bookmarklet', ticket: 'PRJ-119' },
  { riga: 'Ristampa segnacollo per il cliente di Como', stato: 'corso', rc: -1, src: 'urlbar' },
  { riga: 'Estrazione report kpi mensile per la direzione', stato: 'corso', rc: 0, src: 'app', ticket: 'REQ-2198' },
  { riga: '! mybrt pagina bianca al salvataggio @ferrini', stato: 'corso', rc: 3, src: 'app', fs: 1 },
  { riga: '@longhi sollecito ticket it erp per la porta verso il gestionale', stato: 'attesa', rc: -5, src: 'bookmarklet', ticket: 'INC-4412' },
  { riga: 'Manca record nella trasmissione di ieri, segnalazione secondo procedura', stato: 'attesa', rc: 2, src: 'app', ticket: 'INC-4390' },
  { riga: 'Notifica sms al destinatario non parte, tracking fermo', stato: 'chiuso', esito: 'risolto', src: 'app' },
  { riga: 'Utenza ftp del fornitore scaduta, file non arrivato', stato: 'chiuso', esito: 'girato', src: 'bookmarklet', ticket: 'REQ-2187' },
  { riga: '@longhi chiedeva se fermopoint copre anche i resi del marketplace', stato: 'chiuso', esito: 'risposto', src: 'app' },
  { riga: '@chiara monitor per la postazione nuova, ha cambiato sede', stato: 'chiuso', esito: 'decaduto', src: 'app' },
];

export async function seminaEsempi() {
  for (const e of ESEMPI) {
    const nota = await Store.aggiungi(e.riga);
    const patch = { stato: e.stato, src: e.src, fs: e.fs || 0, pf: parse(e.riga).pf };
    if (e.rc !== undefined) patch.rc = fra(e.rc);
    if (e.ticket) patch.ticket = e.ticket;
    if (e.esito) patch.esito = e.esito;
    await Store.modifica(nota.id, patch);
  }
}
