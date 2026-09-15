# CLAUDE.md — App note di lavoro CED

Contesto permanente del progetto. Leggilo prima di ogni intervento e rispettane i vincoli
anche quando una soluzione alternativa sembra più elegante.

---

## 1. A cosa serve

Strumento personale di un responsabile ICT che segue più filiali. Serve ad annotare in
pochi secondi richieste ricevute a voce, per mail o al telefono, e a tenerne lo stato.
Sostituisce un file Excel abbandonato perché compilarlo a fine giornata costava troppo.

**Il criterio che decide tutto:** annotare deve costare meno che ricordare. Se una scelta
implementativa aggiunge anche solo due tap alla cattura, è la scelta sbagliata. Ogni volta
che hai un dubbio, ottimizza per la velocità di inserimento, non per la completezza del dato.

## 2. Vincoli non negoziabili

- **Nessun framework, nessun build step, nessun bundler.** HTML, CSS e JavaScript vanilla,
  moduli ES nativi. Si apre il file e funziona.
- **Nessuna dipendenza npm nel frontend.** Zero eccezioni.
- **Offline-first.** Ogni scrittura va prima in IndexedDB e ritorna subito. La rete è
  sempre un'operazione di sfondo che può fallire senza che l'utente se ne accorga.
- **Niente installazione.** Il telefono aziendale non permette di installare app: deve
  funzionare da browser, con service worker per la cache ma senza dipendere da esso.
- **Nessun servizio esterno oltre a GitHub.** Niente Supabase, Firebase, CDN, font remoti,
  analytics, librerie da unpkg.
- **Le immagini non escono mai dal dispositivo.** Restano in IndexedDB, nel log viaggia
  solo il contatore. Questo è un requisito di riservatezza, non una semplificazione.

## 3. Due repository, e c'è un motivo

| Repo | Visibilità | Contenuto |
|---|---|---|
| `note-lavoro` | **pubblico** | Codice dell'app. Servito da GitHub Pages. Nessun dato. |
| `note-lavoro-dati` | **privato** | `log/*.ndjson`, `snapshot.json`, workflow del recap. |

GitHub Pages su repository privato richiede un piano a pagamento, e i dati di lavoro non
possono stare in un repo pubblico: la separazione risolve entrambi i problemi. L'app
pubblica è un guscio vuoto, senza token non mostra nulla.

Il token è fine-grained, limitato al solo repo dati, permesso Contents read/write,
conservato in `localStorage`. L'app deve offrire un modo evidente per cancellarlo.

## 4. Struttura dei file

```
note-lavoro/                    (pubblico, Pages)
├── index.html                  guscio + markup
├── app.js                      UI, eventi, rendering
├── stile.css                   fornito dal design, non inventarlo
├── brt-classificatore.js       GIÀ SCRITTO — non riscrivere
├── brt-store.js                GIÀ SCRITTO — non riscrivere
├── prove-classificatore.js     prove del dizionario: node prove-classificatore.js
├── prove-reali.js              venti estratti autentici da mail, con l'esito atteso
├── prove-interfaccia.html      prove del disegno: si apre in un browser e basta
├── package.json                solo {"type":"module"}, perché node legga i .js come ESM
├── sw.js                       cache statica, niente cache delle API
├── manifest.webmanifest
├── CLAUDE.md                   questo file
└── PIANO.md                    tappe di costruzione

note-lavoro-dati/               (privato)
├── log/<dispositivo>.ndjson
├── snapshot.json
└── .github/
    ├── workflows/recap.yml     GIÀ SCRITTO
    └── scripts/recap.mjs       GIÀ SCRITTO — è uno script foglia, si può toccare
```

I file segnati "già scritto" sono il cuore logico e sono collaudati nel disegno.
Puoi correggerne i bug, ma non rifattorizzarli per gusto né sostituirne l'approccio senza
che io te lo chieda esplicitamente. `recap.mjs` fa eccezione: non ha nessuno a valle,
quindi si modifica liberamente purché continui a leggere il log senza riscriverlo.

## 5. Modello dati

Non esiste uno stato salvato: esiste un **log di eventi in sola aggiunta**, e lo stato si
ottiene rigiocandolo in ordine. Ogni dispositivo scrive solo sul proprio file, quindi i
conflitti di scrittura sono impossibili per costruzione.

```jsonc
{"ev":"new","id":"k3m9","at":1789000000000,"dev":"pc","seq":12,
 "t":"Rossi chiede VPN nuovo assunto","cat":"ACC","da":"rossi","tag":[],"pr":1,
 "sc":"2026-09-20","rc":"2026-09-16","ticket":"INC-8871","src":"urlbar","fs":0}
{"ev":"upd","id":"k3m9","at":1789000100000,"dev":"tel","seq":3,"p":{"stato":"corso"}}
{"ev":"del","id":"k3m9","at":1789000200000,"dev":"pc","seq":13}
```

Ordinamento di rigioco: `at`, poi `dev`, poi `seq`. Deterministico su tutti i dispositivi.
Conseguenza pratica: **l'annullamento è gratis** (basta un evento contrario), quindi usa
undo al posto dei dialoghi di conferma. Mai un modale "sei sicuro?".

### Le chiavi

| Chiave | Significato |
|---|---|
| `t` | testo originale, come è stato battuto |
| `cat` | categoria indovinata, `null` se il classificatore non decide |
| `da` | richiedente |
| `tag` | etichette libere |
| `pr` | priorità: `0`, `1` (`!`), `2` (`!!`) |
| `sc` | scadenza: quando la cosa è dovuta |
| `rc` | ricontrollo: quando la voglio rivedere (vedi §7) |
| `ticket` | numero ticket del sistema ufficiale, assente se non c'è |
| `esito` | come è finita: `risolto` \| `risposto` \| `girato` \| `decaduto`. Solo su `chiuso` |
| `src` | da dove è arrivata la cattura |
| `ca` | canale di arrivo, **solo se dichiarato** |
| `fs` | `0` ordinaria, `1` fuori standard |
| `pf` | piattaforma dove succede (MyBRT, WooCommerce, Zebra…), separata dalla categoria |

### `src` è un fatto, `ca` è una dichiarazione

`src` vale `bookmarklet` | `urlbar` | `app` | `manuale` e si salva **sempre**: è un fatto
osservabile su come la nota è entrata, e come tale non invecchia mai.

`ca` vale `voce` | `tel` | `mail` | `altro` e si salva **solo quando lo dichiaro io**,
scrivendo `>mail` `>tel` `>voce` nel testo o correggendolo dal dettaglio.

La mappatura sorgente → canale (per esempio: `bookmarklet` ⇒ `mail`) **vive in
`recap.mjs`, non nel log**. Così si può ritarare fra sei mesi, quando mi accorgo che
il bookmarklet lo uso anche fuori da Outlook, senza dover riscrivere la storia.
Un `ca` esplicito vince sempre sulla mappatura.

Le chiavi sono tutte opzionali: essendo il log in sola aggiunta, gli eventi vecchi che non
le hanno restano validi e valgono i default. Nessuna migrazione, mai.

### Attenzione: l'evento e l'item non hanno gli stessi nomi

Le chiavi qui sopra sono quelle **dell'evento nel log**. L'item che `rigioca()` ricostruisce
in memoria usa nomi lunghi: `t` → `testo`, `pr` → `priorita`, `sc` → `scadenza`, più
`creato` e `agg`. L'interfaccia legge gli item, quindi legge i nomi lunghi.

Le patch di `modifica(id, {...})` si applicano all'**item**, non all'evento: si scrive
`{ scadenza: '2026-09-20' }`, non `{ sc: ... }`. `rc`, `src`, `fs` ed `esito` passano di
lì senza essere dichiarati da nessuna parte, perché la patch è generica.

`aggiungi()` scrive solo i campi che il classificatore produce: `src` e `rc` arrivano con
una `modifica()` subito dopo. Due eventi per una cattura, entrambi locali e istantanei.

### L'esito si vede sulla card

Una nota chiusa mostra il suo `esito` al posto della scadenza, che sul chiuso non vuole
più dire niente. È l'unico riscontro visivo che quel campo è stato compilato: senza,
compilarlo è un atto di fede e dopo due settimane si smette.

`esito` non è una deroga nuova ai campi personalizzati (§10): è un campo che c'era già e
che questo documento non aveva mai elencato, come è successo a `ticket`.

## 6. Stati

`inbox` → `dafare` → `corso` → `attesa` → `chiuso`

`attesa` significa "fermo su terzi" (IT ERP, fornitore, cliente) e va tenuto separato
visivamente: non è roba che dipende da lui, e mescolarla fa sembrare il board intasato.
Mostra i giorni di attesa accanto alla voce.

### Limite WIP su `corso`

Accanto al titolo della colonna "In corso" sta un contatore `n/limite`. Il limite è
configurabile, default **3**. Quando `n` supera il limite il contatore si evidenzia.

**Superarlo non è mai impedito.** Il limite è uno specchio, non un cancello: se una
giornata va storta il board deve poterlo dire, non bloccare il lavoro. Nessun avviso,
nessuna conferma, nessuna coda: solo il contatore che cambia aspetto.

L'evidenziazione non usa il terracotta: quello è riservato al ritardo (§9).

## 7. Ricontrollo

`rc` è **una cosa diversa dalla scadenza**. `sc` dice quando una cosa è dovuta a qualcun
altro; `rc` dice quando io voglio rimetterci gli occhi sopra. Molte richieste non hanno
scadenza e spariscono lo stesso: il ricontrollo è ciò che le fa riemergere.

Si imposta **da solo**, alla creazione e a ogni cambio di stato, da questa tabella
categoria + stato → giorni:

| stato | default | eccezioni |
|---|---|---|
| `inbox` | 2 | — |
| `dafare` | 7 | `ACC` 3 |
| `corso` | 3 | `ESC` 5 |
| `attesa` | 5 | `ESC` 7, `HW` 7 |
| `chiuso` | — | nessun ricontrollo |

**I numeri sono provvisori.** Scelti a tavolino, senza nessun dato dietro, solo per avere
qualcosa che funzioni dal primo giorno. Vanno rivisti dopo due settimane di uso vero:
una riga che si rimanda sempre ha la finestra troppo corta, una che non riemerge mai ce
l'ha troppo lunga. Finché quella revisione non è stata fatta, non è una scelta ragionata.

Dal dettaglio `rc` è modificabile a mano.

Quando `rc` è passata:

- nel **recap** la voce entra in cima, nella sezione "Da ricontrollare", con il testo
  originale (`t`) e non un riassunto;
- nell'**app** la voce compare nella fascia scadenze e sulla sua card appare **Rimanda**.

Un tap su Rimanda sposta `rc` avanti di N giorni e basta. Nessun dialogo, nessuna tendina,
nessuna richiesta di motivazione: rimandare dieci volte è un dato interessante, non una
colpa da giustificare. N viene dalla stessa tabella.

## 8. Cattura

Il campo di input è la cosa più importante dell'applicazione.

- `autofocus`, cursore pronto all'apertura, nessuna schermata di caricamento davanti.
- Invio salva e svuota. Nessun campo obbligatorio, nessuna tendina, nessuna conferma.
- Il parsing di `@persona`, `#tag`, `#COD` categoria, `!`/`!!` e delle scadenze è già in
  `brt-classificatore.js`: usalo, non reimplementarlo.
- La categoria è indovinata e mostrata come etichetta **non bloccante**. Se il
  classificatore restituisce `null`, la nota resta in Inbox come "da classificare". Mai
  chiedere all'utente di scegliere al momento della cattura.
- Il microfono è quello della tastiera di sistema. Non implementare Web Speech API come
  unica strada: su Safari iOS è inaffidabile. Se la aggiungi, deve degradare in silenzio.

### Canale, fuori standard e ricontrollo non si chiedono mai

Nessuno dei tre compare alla cattura come domanda. `src` lo sa la sorgente, `rc` lo
calcola la tabella, `fs` resta `0` salvo marcatura esplicita, `ca` resta assente salvo
dichiarazione. Si correggono tutti dal dettaglio, dopo, quando c'è tempo.

Scorciatoie facoltative nel testo, per chi sta già scrivendo:

- `*` in fondo ⇒ `fs: 1`
- `>mail` `>tel` `>voce` ⇒ `ca` dichiarato

Vanno aggiunte a `brt-classificatore.js`. **Non toccare la logica di `!`/`!!`**: funziona
già e non ha bisogno di essere riscritta per fare spazio a queste.

### Il dizionario decide il problema, non il prodotto

I termini del classificatore stanno in due classi che non si sommano mai fra loro:

- **sintomi** — pesano e decidono la categoria;
- **piattaforme** — pesano zero e finiscono in `pf`. Una piattaforma decide solo quando
  nel testo non c'è nessun sintomo, e in quel caso col peso dimezzato.

«Reset password su MyBRT» è un problema di accessi che capita su un portale, non un
problema di portali: `ACC` + `pf: MyBRT`. La piattaforma dice *dove*, mai *che cosa*.

Regole che il dizionario deve rispettare:

- Le frasi vincono sui termini generici, perché pesano di più: «stampa etichette» porta a
  `ETI`, «stampante Zebra offline» a `HW`.
- Nessuna parola che compare in mezza inbox classifica da sola: `urgente`, `problema`,
  `assistenza`, `conferma`, `ticket` valgono zero se isolate.
- Gli acronimi corti (`VAB`, `VAT`, `VAO`, `VAS`, `OB`) si confrontano **sensibili alle
  maiuscole**, sul testo grezzo: in minuscolo intercettano parole comuni.
- Sui segnali contrastanti — pareggio secco, o punteggio sotto soglia — si lascia
  `da classificare`. Forzare l'abbinamento costa più della correzione in triage.

**Limite noto, accettato:** `pf` tiene **una piattaforma sola**. In «il tracking DPD non
appare su Amazon» vince la prima dell'elenco `PIATTAFORME` e l'altra si perde. Per questo
i vettori stanno in fondo: in un'azienda di spedizioni il nome del vettore è ovunque e
identifica pochissimo, mentre il portale o il marketplace su cui la cosa è rotta dicono
molto di più. Resta una casella singola di proposito — diventerà un array solo se l'uso
reale dimostrerà che così perdiamo qualcosa, non perché in teoria potrebbe succedere.

### L'urgenza è un asse a parte

`urgente`, `subito`, `il prima possibile`, `non riesce a lavorare`, `sono fermi`,
`tutta la filiale` **non classificano**: alzano `pr` a 1, e solo se non l'ho già messa io
con `!` o `!!`. La mia mano batte sempre l'euristica.

Fuori `bloccato` e `fermo`: sembravano urgenza ed erano descrizione. «Account bloccato» è
il caso `ACC` più ordinario che esista, e «tracking fermo» dice cos'è rotto, non che il
mondo si è fermato. L'urgenza vera è quando qualcuno non può lavorare.

### Le prove

`prove-classificatore.js` tiene un elenco di frasi con la categoria attesa e si esegue con
`node prove-classificatore.js`. **Ogni modifica al dizionario si verifica lì.**

Quando una prova fallisce, la risposta quasi mai è alzare un peso finché passa: così si
insegna al dizionario le frasi della prova invece del dominio. Prima si guarda perché, e
se la frase attesa è sbagliata si corregge la prova.

## 9. Come deve venire il codice

- Nomi di variabili, funzioni e commenti **in italiano**, coerenti con i moduli esistenti.
- Funzioni corte, nessuna astrazione introdotta "per il futuro".
- I commenti spiegano il perché di una scelta, non quello che il codice già dice.
- Niente `innerHTML` con dati dell'utente senza escape: i testi contengono nomi di clienti
  e messaggi di errore con caratteri strani.
- Gestione errori: la rete fallisce in silenzio e si riprova, tutto il resto è visibile.
- CSS: solo variabili e classi definite dal design. Se ti serve qualcosa che non c'è,
  segnalalo invece di inventare colori e spaziature.
- **Si nasconde con `hidden`, mai con `style.display`.** In cima a `stile.css` c'è
  `[hidden] { display: none !important; }` e non va tolta: `hidden` vale `display: none`
  solo nel foglio del browser, e **qualsiasi** regola d'autore lo batte a prescindere
  dalla specificità. Senza quella riga `.dettaglio { display: flex }` teneva a schermo
  pannelli che il codice considerava chiusi.

### Le prove guardano quello che si vede, non quello che il codice crede

Il difetto qui sopra è passato attraverso tutte le prove perché controllavano
`elemento.hidden`, che era `true` mentre il pannello si vedeva benissimo. Una prova
sull'interfaccia deve chiedere `getClientRects()` o lo stile calcolato: la proprietà dice
cosa voleva il codice, il disegno dice cosa vede l'utente, e il difetto sta in mezzo.

Stessa cosa per lo stato iniziale: le prove partivano tutte da una pagina già toccata, e
nessuna guardava com'era **appena caricata**. `prove-interfaccia.html` copre quel caso, si
apre in un browser e basta, e carica `index.html` in un riquadro invece di ricopiarne il
markup.

## 10. Cosa NON fare, mai

Sotto-attività, commenti sulle note, stime di durata, tracciamento del tempo, campi
personalizzati, login, sincronizzazione delle immagini, notifiche push, grafici in tempo
reale, editor di testo ricco, drag and drop su mobile, animazioni oltre i 150ms.

Ognuna di queste riporta la compilazione al livello di costo dell'Excel abbandonato.
Se pensi che una serva davvero, dillo e argomenta: non aggiungerla e basta.

### Le uniche deroghe ai campi personalizzati

`src`, `ca`, `fs`, `rc` e `pf`. Servono a misurare il carico, a far riemergere le cose e
a tenere separato il dove dal che cosa; nessuno dei cinque costa un tap alla cattura,
perché li riempie il classificatore. Nient'altro entra per questa porta.

### `fs` è un conteggio minimo, mai una percentuale

`fs` misura **quanto sono diligente nel marcare**, non quanto lavoro fuori standard
faccio. Le note non marcate sono indistinguibili fra "ordinaria" e "mi sono dimenticato",
quindi il numero vero è sempre almeno quello mostrato e probabilmente di più.

Il recap lo scrive come conteggio assoluto — *"11 fuori standard segnate"* — e
**non lo esprime mai in percentuale sul totale**. Un "9% fuori standard" sembra una misura
del lavoro ed è invece una misura della mia memoria: è il tipo di numero che uno guarda
per un anno prima di accorgersi che non voleva dire niente.

Stessa cautela per `ca` dichiarato: si conta, non si percentualizza.

## 11. Il recap

Gira nel repo dati, legge il log e non lo riscrive mai. Deve produrre, in quest'ordine:

1. **Da ricontrollare** — in cima a tutto. Le voci con `rc` passata e stato diverso da
   `chiuso`, ordinate dalla più vecchia, ciascuna con il testo originale.
2. **Fuori dal sistema ufficiale** — quante note aperte e quante chiuse sono prive di
   `ticket`. È lavoro arrivato fuori dal canale ufficiale e non richiede nessun campo nuovo:
   basta guardare chi non ha un numero di ticket.
3. **Carico** — conteggi per canale (applicando la mappatura `src` → canale a chi non ha
   `ca` esplicito) e conteggio assoluto delle `fs`.
4. **Media giornaliera in `corso`** nel periodo: quanti elementi stavano in stato `corso`
   in media al giorno. Serve a vedere se il limite WIP è rispettato nei fatti o solo
   sulla carta.

La regola della giacenza fissa a sette giorni **è stata rimossa**: la sostituisce `rc`,
che sa distinguere una richiesta che può aspettare un mese da una da rivedere domani.

## 12. Criteri di accettazione

Prima di dichiarare finito un pezzo, verifica che:

1. Dal tocco sul segnalibro alla tastiera aperta passino meno di 2 secondi.
2. Aggiungere una nota in modalità aereo funzioni e la nota compaia subito.
3. Riaprendo l'app senza rete le note ci siano ancora tutte.
4. Due dispositivi che modificano la stessa nota convergano allo stesso risultato.
5. Ricaricare la pagina non duplichi mai un evento.
6. Nessuna richiesta di rete parta prima che l'interfaccia sia utilizzabile.
7. Il peso totale dell'app scaricata resti sotto i 150 KB.
