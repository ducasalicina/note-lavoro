/* ============================================================
   prove-classificatore.js
   Si esegue con:   node prove-classificatore.js

   Serve a una cosa sola: rendere verificabile ogni modifica futura al
   dizionario. Il classificatore è fatto di pesi, e i pesi si toccano
   volentieri; senza queste righe, sistemare una frase ne rompe altre tre
   e non se ne accorge nessuno per settimane.

   Se una prova fallisce, la risposta quasi mai è alzare un peso finché
   passa: quello insegna al dizionario le frasi della prova invece che il
   dominio. Prima si guarda perché.

   Come si dichiara un'attesa:

     cat: 'ACC'          unica risposta accettabile
     cat: null           il classificatore DEVE astenersi
     cat: ['TRX','SRV']  più esiti difendibili, basta uno
     cat: ['ESC', null]  accettabile sia classificare sia astenersi
     pf:  'MyBRT'        piattaforma attesa (`null` = nessuna)
     pr:  1              priorità attesa
     sc:  null           scadenza attesa (`null` = nessuna)

   Astenersi non è un fallimento. Su un testo senza contesto è la risposta
   giusta, e un dizionario che indovina sempre è un dizionario troppo largo.
   ============================================================ */

import { parse } from './brt-classificatore.js';
import { PROVE_REALI } from './prove-reali.js';

const TUE = [
  { riga: 'reset password EasySped',            cat: 'ACC', pf: 'EasySpedWeb' },
  { riga: 'reset password EasySpedWeb',         cat: 'ACC', pf: 'EasySpedWeb' },
  /* Ambigua anche per un umano: "abilitare le API a un cliente" oppure "far
     funzionare l'integrazione". API è difendibile, astenersi anche. */
  { riga: 'attivare REST API',                  cat: ['API', null] },
  { riga: 'stampa etichette',                   cat: 'ETI' },
  { riga: 'stampante Zebra offline',            cat: 'HW',  pf: 'Zebra' },
];

/* Queste non me le hai dettate: le ho ricavate dalle regole che hai dato
   (schemi, acronimi, urgenza, token). Confermale o correggile — sono le
   prime a dover sparire se ho capito male il dominio. */

const RICAVATE = [
  // il problema batte il prodotto, e la piattaforma si salva a parte
  { riga: 'reset password su MyBRT',            cat: 'ACC', pf: 'MyBRT' },
  { riga: 'woocommerce non si sincronizza',     cat: 'ECO', pf: 'WooCommerce' },
  { riga: 'Zebra non stampa le etichette',      cat: 'ETI', pf: 'Zebra' },

  // Alias: nei testi veri le piattaforme sono quasi sempre abbreviate.
  // Erano scritte male: davo per esistenti termini ACC che non c'erano, e finivano per
  // provare un buco del dizionario invece dell'alias. Ora la frase porta un sintomo vero.
  { riga: 'reset password su MyBrt',            cat: 'ACC', pf: 'MyBRT' },
  { riga: 'non abbiamo i permessi su ESW',      cat: 'ACC', pf: 'EasySpedWeb' },

  // la piattaforma decide solo quando non c'è nessun sintomo, a peso dimezzato
  { riga: 'MyBRT',                              cat: 'POR', pf: 'MyBRT' },
  { riga: 'problema su Shopify',                cat: 'ECO', pf: 'Shopify' },

  // schemi
  { riga: 'aperto INC1234 per la filiale',      cat: 'ESC' },
  { riga: 'aprire la porta 22 verso il fornitore', cat: 'SFT' },
  { riga: 'ZT411 non stampa',                   cat: 'HW',  pf: 'Zebra' },
  { riga: 'segnacolli serie 2 finiti',          cat: 'ETI' },

  // acronimi: solo in maiuscolo
  { riga: 'manca il file VAB di ieri',          cat: 'TRX' },
  { riga: 'il cliente vas e viene senza dire niente', cat: null },

  // termini generici che non devono più classificare da soli
  { riga: 'ticket da aggiornare',               cat: null },
  { riga: 'il token non funziona',              cat: null },
  { riga: 'token API scaduto',                  cat: 'API' },

  // urgenza: alza pr, non tocca la categoria
  { riga: 'urgente, il cliente non riesce a lavorare', cat: null, pr: 1 },
  { riga: 'password dimenticata, urgente',      cat: 'ACC', pr: 1 },
  { riga: '!! password dimenticata, urgente',   cat: 'ACC', pr: 2 },
  { riga: 'reset password tranquillo',          cat: 'ACC', pr: 0 },
  // descrizione, non urgenza: nessuna delle due deve alzare la priorità
  { riga: 'account bloccato da stamattina',     cat: 'ACC', pr: 0 },
  { riga: 'il tracking è fermo da due giorni',  cat: 'TRK', pr: 0 },

  // date descrittive al passato: nessuna scadenza fantasma a dodici mesi
  { riga: 'spedizioni partite venerdì 11/09',   sc: null },
  { riga: 'consegnare entro il 31/12/2027',     sc: '2027-12-31' },
];

const GRUPPI = [
  { nome: 'Le tue frasi', casi: TUE },
  { nome: 'Ricavate dalle regole (da confermare)', casi: RICAVATE },
  { nome: 'Estratti reali da mail', casi: PROVE_REALI },
];

const mostra = (v) => (v === null || v === undefined ? 'nessuna' : Array.isArray(v) ? v.map(mostra).join(' o ') : v);

/** Il testo della prova: `riga` nei miei casi, `t` in quelli reali. */
const testoDi = (p) => p.riga ?? p.t;

/** Un'attesa può essere un valore solo o un elenco di valori accettabili. */
const accetta = (atteso, avuto) =>
  (Array.isArray(atteso) ? atteso : [atteso]).some((v) => (v ?? null) === (avuto ?? null));

let fallite = 0, totale = 0;

for (const { nome, casi } of GRUPPI) {
  console.log(`\n${nome}`);
  console.log('─'.repeat(nome.length));

  for (const prova of casi) {
    totale++;
    const testo = testoDi(prova);
    const esito = parse(testo);
    const scarti = [];

    if ('cat' in prova && !accetta(prova.cat, esito.cat)) {
      scarti.push(`categoria ${mostra(esito.cat)} invece di ${mostra(prova.cat)}`);
    }
    if ('pf' in prova && !accetta(prova.pf, esito.pf)) {
      scarti.push(`piattaforma ${mostra(esito.pf)} invece di ${mostra(prova.pf)}`);
    }
    if ('pr' in prova && !accetta(prova.pr, esito.priorita)) {
      scarti.push(`priorità ${esito.priorita} invece di ${mostra(prova.pr)}`);
    }
    if ('sc' in prova && !accetta(prova.sc, esito.scadenza)) {
      scarti.push(`scadenza ${mostra(esito.scadenza)} invece di ${mostra(prova.sc)}`);
    }

    const breve = testo.length > 68 ? testo.slice(0, 65).replace(/\s+/g, ' ') + '…' : testo.replace(/\s+/g, ' ');

    if (scarti.length === 0) {
      console.log(`  ok      ${breve}`);
    } else {
      fallite++;
      console.log(`  FALLITA ${breve}`);
      for (const s of scarti) console.log(`          ${s}`);
      if (prova.nota) console.log(`          nota: ${prova.nota}`);
    }
  }
}

const passate = totale - fallite;
console.log(`\n${passate}/${totale} passate${fallite ? `, ${fallite} da guardare` : ''}\n`);
process.exit(fallite ? 1 : 0);
