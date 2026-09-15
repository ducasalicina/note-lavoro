/* ============================================================
   prove-reali.js
   Venti estratti autentici da mail di lavoro, con refusi e
   maiuscole originali. Non modificare i testi: il valore di
   questo file sta nell'essere sporco come la realtà.

   Campo `cat`:
     'COD'            unica risposta accettabile
     null             il classificatore DEVE astenersi
     ['A','B']        più esiti accettabili, il caso è contestabile
     ['A', null]      accettabile sia classificare sia astenersi

   Astenersi non è un fallimento: su un testo senza contesto è
   la risposta giusta. Otto dei venti casi sono di questo tipo.
   ============================================================ */

export const PROVE_REALI = [

  /* --- Contesto assente: la macchina non può sapere --- */

  { t: '@Ced028???',
    cat: null,
    nota: 'Solo un riferimento interno. Nessun sintomo, nessuna piattaforma.' },

  { t: 'Samu ciao, sai nulla?',
    cat: null,
    nota: 'Sollecito puro. Se qualcosa qui viene classificato, il dizionario è troppo largo.' },

  { t: 'Ciao , ci sono novità la cliente mi sollecita.',
    cat: null,
    nota: 'Verifica che "sollecita" da sola non tiri ESC: in ESC deve stare solo "sollecito ticket".' },

  { t: 'sapresti consigliarmi una strada alternativa per il cliente?',
    cat: null,
    nota: '"cliente" non deve pesare niente da sola.' },

  { t: 'Noi attualmente richiediamo il ritiro tramite portale e consegnamo all\'autista incaricato le nostre bolle con applicati i tagliandini rossi.',
    cat: null,
    nota: 'Descrizione di un processo, non una richiesta. "portale" e "ritiro" da sole non bastano.' },

  /* --- Urgenza senza categoria: il caso che separa i due segnali --- */

  { t: 'ho bisogno di riscontro urgente sulla faccenda essendo bloccata con le spedizioni e dovendo nel caso inserirle a mano, ricordo che noi spediamo più di 100 ordini al giorno il che renderebbe questo processo lunghissimo!',
    cat: null, pr: 1,
    nota: 'Il caso chiave: priorità alzata da "urgente", categoria null perché non si sa di cosa parli. "bloccata" non deve contribuire.' },

  /* --- Casi netti --- */

  { t: 'Ha recuperato 90% delle spedizioni. controllate solo lunedi ci dovrebbero essere 4 max 5 spedizioni in manca record. Fate mail per farle rientrare',
    cat: 'CED',
    nota: '"manca record" pesa 6, deve vincere nettamente.' },

  { t: 'Non riesco ad accedere con il mio account: potete aiutarmi a riattivare il mio account?',
    cat: 'ACC',
    nota: 'Verifica i confini di parola: "riattivare" NON deve attivare la voce "attivare" di ATT.' },

  { t: 'Sapete dirmi o eventualmente fissiamo call come gestire i vari account e/o se si può fare delle restrizioni?',
    cat: ['ACC', null],
    nota: 'Richiesta di call su una policy, non un caso operativo: astenersi è difendibile. "account" resta a peso 1 apposta, perché nelle mail compare quasi sempre come contorno ("ha scritto dal suo account"): alzarlo porterebbe in ACC ogni frase che lo sfiora.' },

  { t: 'Questo e\' il codice cliente:SFI45505 Spero presto per una risoluzione in quanto ho gia\' provato con diversi tentivi senza risultato.',
    cat: ['ACC', null],
    nota: 'Nessuno spazio dopo i due punti: verifica che "codice cliente" venga comunque riconosciuto.' },

  { t: 'Buongiorno, prima il tracking internazionale DPD cera in Amazon ora non appare, non fa il cambio del nazionale al internazionale.',
    cat: 'TRK', pf: 'Amazon',
    nota: 'Sintomo di tracking più due piattaforme. La categoria non deve spostarsi su SRV per via di DPD.' },

  { t: 'PER ESEMPIO IN AMAZON appare questo 028191054866984005 Ma il TRACKING CHE DEVE APPARIRE E QUESTE 08448879144592',
    cat: 'TRK',
    nota: 'Tutto maiuscolo. Verifica anche che i numeri lunghi non vengano letti come date.' },

  { t: 'Maria Grazia mi suggeriva di utilizzare Easysped a cui però non abbiamo i permessi per accedervi.',
    cat: 'ACC', pf: 'EasySpedWeb',
    nota: 'IL caso che valida la separazione sintomo/piattaforma. Attenzione: "Easysped" è abbreviato, va aggiunto agli alias.' },

  { t: 'Chiedi al supporto BRT se esiste un\'API o un endpoint per la prenotazione pickup (ritiro) via web service, anche diverso dall\'API REST documentata.',
    cat: 'API' },

  { t: 'Mi puoi confermare che questa spedizione risulta anche a voi come pallet?',
    cat: 'SRV',
    nota: '"confermare" non deve contribuire, solo "pallet".' },

  { t: 'Ho aperto un ticket questa mattina per comunicare di accettare dei titoli ritirarti presso un cliente, ma non mi è ancora arrivata la conferma.',
    cat: ['ESC', null],
    nota: '"ticket" isolato: se tira ESC da solo, valutare se abbassarne il peso.' },

  { t: 'FARE COMUNICAZIONE AREA, estrapolando le spedizioni partite venerdì 11/09',
    cat: 'REP',
    nota: 'ATTENZIONE: "venerdì 11/09" è una data descrittiva al passato, NON una scadenza. Non deve finire in `sc`.' },

  /* --- Contestabili: più risposte difendibili --- */

  { t: 'Ciao buondi so che ti ha scritto GSped per la questione trasmissioni dati estero multicollo GC ( Gianni chiarini) Ci tieni aggiornati?',
    cat: ['TRX', 'SRV'], pf: 'GSped',
    nota: 'Trasmissione dati (TRX) di spedizioni estero multicollo (SRV). Entrambe difendibili, GSped resta piattaforma.' },

  { t: 'spedizioni in consegna martedi 15/09 contengono un volume importantissimo, come già segnalato vi preghiamo di allertare le filiali per rispettare la consegna richiesta.',
    cat: ['SRV', null],
    nota: 'Anche qui "martedi 15/09" è descrittiva, non una scadenza da impostare.' },

  { t: 'Potreste inviarci l\'elenco completo di tutti i codici cliente attualmente attivi per la società TRIGANO SERVIZI, corredato da una breve descrizione?',
    cat: 'REP',
    nota: 'Oggi probabilmente FALLISCE: "elenco spedizioni" e "codice cliente" al singolare non coprono questa frase. Aggiungere "elenco codici" e "codici cliente" a REP invece di forzare i pesi.' }
];
