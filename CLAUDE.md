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

### A cosa serve davvero: difendere una cronologia

Dopo una settimana di uso vero è emerso il caso d'uso che conta, e non era quello previsto.

**Lo strumento non serve tanto a organizzare il lavoro quanto a difendere una cronologia.**
L'ufficio commerciale contesta i tempi di intervento — *«questo cliente aspetta da una
settimana, l'avete aiutato solo ieri»* — e quello che serve è poter ricostruire, con date
precise:

- quando la richiesta è **arrivata**;
- quando è stata **presa in carico**;
- quanto è rimasta **ferma**, e in attesa di chi: del cliente, del commerciale stesso, di
  un terzo;
- quando è stata **chiusa**, e come.

**Il valore sta nelle date e nel percorso, non nel contenuto delle note.** Il testo serve a
riconoscere di quale richiesta si parla; sono i timestamp a reggere la discussione. Il log
in sola aggiunta di §5 non è quindi un dettaglio implementativo: è il prodotto.

Conseguenza operativa, e vale su ogni scelta futura: **le funzioni di lettura e
ricostruzione vengono prima di quelle di organizzazione.** Un board più ordinato non serve
a niente se poi non si riesce a dire quando è successo cosa.

### Dati d'uso della prima settimana

Misurati, non stimati. Sono la ragione dell'ordine qui sopra.

| dato | numero |
|---|---|
| note inserite in 5 giorni | 17 |
| di cui dal telefono | **1** |
| sforamenti del limite WIP | **0** |
| note in attesa da rileggere per ricostruire il contesto | 9, ed è risultato troppo costoso |

Cosa ne segue:

- **Il telefono è un caso marginale.** Una nota su diciassette. Resta impeccabile sulla
  cattura rapida e leggibile per il resto; non si progetta più niente per lui, e non gli si
  sacrifica il desktop. L'`hover` con un `title` è un posto legittimo dove mettere il
  dettaglio secondario, senza equivalente sul telefono.
- **Il kanban è tarato male**, ma non è urgente: le note passano da Inbox direttamente ad
  Attesa o Chiuso, e «In corso» è quasi inutilizzata. Per questo il limite WIP non ha mai
  suonato — non perché il lavoro sia sotto controllo, ma perché quella colonna non si usa.
  Va ritarato **dopo** le funzioni di ricostruzione, non prima.
- **Rileggere le note in attesa per capire cosa si aspetta è il costo più alto** rimasto.
  È il motivo per cui `aspetto` esiste (§6), e il motivo per cui va mostrato ovunque
  serva invece di essere nascosto nel dettaglio.

### L'ordine delle cose, finché non cambia di nuovo

1. **La cronologia nel dettaglio** — il percorso di ogni nota, ricavato dagli eventi.
2. **La vista cliente esportabile** — il riepilogo copiabile da incollare in una mail.
3. **I giorni di fermo visibili in Attesa**, con chi si sta aspettando.
4. Poi, e solo poi: dettaglio mobile, taratura del kanban, note di chiusura.

**La cattura non si tocca**, in nessuno dei quattro. È l'unica cosa che già funziona come
deve.

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
- **La storia dei commit non si riscrive mai.** Niente `--amend`, `rebase` o force push su
  un commit già fatto. Se una modifica va annullata si fa **un commit nuovo che la
  annulla**, e la storia resta quella che è.

### Perché la storia non si riscrive

Su un repository collegato a GitHub, riscrivere un commit già spinto crea divergenze che
poi vanno sistemate a mano, e le sistema sempre qualcun altro. Il fatto che in un dato
momento il repo non abbia ancora un remote non è una deroga: è solo il caso in cui il
danno non si vede.

Vale anche quando il commit da disfare è di dieci minuti fa e riscriverlo sembrerebbe più
pulito. Una storia con dentro un passo falso e la sua correzione è più utile di una storia
ripulita: dice cosa è stato provato e perché è stato tolto.

### Le foto passano da OneDrive aziendale: nell'app non ci sono

**L'allegato immagine non si fa.** Le foto vanno su OneDrive aziendale, che è già dove
stanno e dove gli altri le trovano; duplicarle qui vorrebbe dire una copia in più da
tenere allineata e da spiegare.

`brt-store.js` espone ancora `allegaImmagine()`, `immagini()` e il campo `img`: sono
GIÀ SCRITTO e restano dove sono, semplicemente l'interfaccia non li chiama. Se un giorno
l'allegato tornasse, la regola qui sopra vale ancora — e con essa la conseguenza da dire
all'utente invece di lasciargliela scoprire: su un altro dispositivo il contatore si vede
e la foto no.

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

### Svuotare la copia locale non è cancellare

Sono due azioni distinte nel pannello, e la differenza va detta nell'etichetta, non
scoperta dopo:

- **Svuota copia locale** tocca solo IndexedDB. Gli eventi restano su GitHub, quindi alla
  prima sincronizzazione le note tornano indietro da sole. Serve a ripartire puliti dopo
  le prove, non a disfare il lavoro.
- **Cancella tutto, anche su GitHub** azzera i log e lo snapshot nel repo dati, poi la
  copia locale. **Questa non torna indietro da nessuna parte**: è l'unica operazione che
  il log degli eventi non sa annullare, perché cancella il log stesso.

Entrambe chiedono un secondo tocco. È l'eccezione al «mai sei sicuro?» di §5, e vale solo
qui: quella regola poggia sul fatto che l'annullamento è gratis, e per queste due non lo è.

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
| `aspetto` | cosa tiene ferma la nota. Solo su `attesa`, e solo se ho risposto (vedi §6) |
| `cl` | codice cliente: sette cifre, le prime tre sono la filiale (vedi §8) |

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

### Le date non si scrivono a mano

`aggiungi()` e `modifica()` accettano un `at` facoltativo, e **nell'uso vero non va passato
mai**. Esiste per un solo chiamante, `dati-esempio.js`, che deve far nascere le note finte
con una storia plausibile perché la cronologia si veda; e quel file sparisce prima del primo
uso reale. Le date sono il prodotto di questo strumento (§1): una data scritta a mano è una
data che non prova niente.

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

### L'unica domanda dell'applicazione

Spostando una nota in `attesa`, e **solo lì**, l'app chiede una riga: *cosa aspetti?* Un
campo di testo e nient'altro. La risposta finisce in `aspetto` e sulla card va **in cima**,
con i giorni accanto; sotto resta il testo originale, in piccolo e su **una riga sola,
troncata**, con il testo intero nel `title` per chi ci passa sopra col mouse — che sul
desktop è quasi sempre (§1). La risposta si corregge dal dettaglio.

Il testo originale non sparisce perché serve a riconoscere la nota a colpo d'occhio; è
piccolo perché a quel punto la cosa che si legge è la risposta.

Il problema che risolve: con nove note in attesa il testo originale non dice a cosa sono
appese, e per ricollegarle bisogna riaprirle una per una.

Regole che la tengono innocua, e che valgono più della domanda stessa:

- **Arriva a spostamento già fatto.** Non è un passaggio obbligato, è un'occasione: se la
  salti la nota è in `attesa` lo stesso, con il suo testo e il chip dei giorni.
- **Si salta con Esc o con un tocco fuori**, e saltando non scrive niente nel log.
- **Invio salva quello che c'è**, e il vuoto vale `null` — che è anche il modo di togliere
  una risposta sbagliata. Se il valore non cambia non parte nessun evento.
- **Annulla aspetta.** La barretta compare quando la domanda si è chiusa, o i suoi cinque
  secondi se ne andrebbero dietro al pannello che li copre.
- **Un campo solo, per sempre.** Aggiungerne un secondo la trasforma in un modulo, e i
  moduli riportano la compilazione al costo dell'Excel abbandonato (§1).

### Sul telefono il dettaglio è a sezioni, sul desktop no

Sono due pannelli diversi di proposito, ed è la prima applicazione concreta di §1.

**Desktop: foglio unico, non si tocca.** C'è spazio, c'è il mouse, si vede tutto insieme.

**Telefono: una sezione per schermata**, con tre voci in fondo — Stato, Categoria, Altro —
e le scelte fatte da **file di pulsanti alti almeno 48px**, non da campi. Il foglio unico,
lì, era un modulo: si scorreva, si riduceva l'ingrandimento e si mirava un campo alto
trentotto pixel.

- Si apre sempre sullo **Stato**, che è il motivo per cui il dettaglio si apre.
- La **categoria si sceglie in due passaggi**: prima le cinque aree, poi le voci di
  quell'area. Quattordici pulsanti in una schermata non si leggono, cinque sì. I pulsanti
  delle aree portano la stessa barretta colorata delle card, quindi sceglierli insegna
  anche i colori (§9).
- **I campi da scrivere stanno dietro «Altro»**, insieme all'eliminazione: erano loro a
  costringere a scorrere, e si cercano quando servono.
- **La cattura non cambia di una virgola**: una riga e invio, nessuno step aggiuntivo.
  È l'unica cosa che il telefono fa davvero spesso, e non si tocca.

### Il selettore di stato, e perché non è un quarto gesto

Nel dettaglio, sopra la categoria, stanno i cinque stati in fila: un tocco cambia stato.
Sul telefono è **l'unico** modo che esiste di cambiare stato, e l'unico modo di tornare
indietro fra stati in assoluto — lo scorrimento sa fare solo `chiuso` e `corso`, non sa
portare in `attesa`, e una nota chiusa per sbaglio, passati i cinque secondi della
barretta, prima restava chiusa per sempre.

**Non si aggiunge un quarto gesto.** Tre — destra, sinistra, sinistra lungo — sono già il
limite di quello che una mano distingue tenendo il telefono, e un quarto verrebbe fatto al
posto di uno degli altri tre.

Sta **sopra la categoria**, che fino a qui era in cima: durante la giornata il dettaglio si
apre per cambiare stato, mentre la categoria si corregge una volta sola, quando la nota è
nata storta. Per lo stesso motivo il fuoco va sulla categoria **solo se la nota è ancora da
classificare**; se no lo prende il foglio, che lascia funzionare Esc senza far scorrere
via il selettore.

Dal selettore **non compare la barretta Annulla**: starebbe sotto il pannello e non si
potrebbe toccare, e lì non serve, perché tornare indietro è toccare lo stato di prima.
L'unica differenza è che `rc` viene ricalcolato dalla tabella invece di essere ripristinato
al valore esatto — che è poi lo stesso valore che avrebbe avuto arrivandoci normalmente.

La domanda *cosa aspetti?* scatta anche da qui: è legata al passaggio di stato, non al
gesto che lo produce.

### Il percorso di una nota, e i giorni di fermo

Il dettaglio apre su **Percorso**: quando la richiesta è arrivata, ogni cambio di stato con
data e ora, la risposta al «cosa aspetti» con quanto è rimasta ferma, la chiusura con
l'esito. È la risposta alla contestazione sui tempi (§1), quindi sta in cima.

**È di sola lettura e non costa un tocco a nessuno.** Non è un campo: viene tutto dai `at`
che gli eventi hanno già. `elenco()` ricostruisce lo stato finale, e lo stato finale non sa
dire *quando*; il percorso si ricava rileggendo il log con `Store.eventi()`, in un indice
che `app.js` rifà a ogni scrittura. Con qualche migliaio di eventi sono millisecondi, e
vale la semplicità: nessuno stato incrementale da tenere allineato.

Formato: `15/09 09:40 creata · 15/09 14:20 in attesa: conferma cliente (6 giorni) ·
22/09 11:05 chiusa, risolto`. La durata si mostra **solo sull'attesa**: è l'unico pezzo su
cui nasce una contestazione, e metterla su tutti farebbe rumore.

**I giorni di fermo si contano dal passaggio di stato, non da `agg`.** `agg` si sposta a
ogni correzione, quindi bastava sistemare un numero di ticket per azzerare una settimana di
attesa — cioè per cancellare proprio il dato che serve difendere.

In colonna Attesa ogni card dice **chi si aspetta** e **da quanti giorni**; oltre la
settimana il conteggio si fa scuro. Quando la risposta manca, la riga lo dice invece di
tacere: una nota ferma da sei giorni senza sapere di chi è il caso peggiore, non quello da
nascondere.

### Il riepilogo del cliente

Filtrando per cliente compare **Riepilogo da incollare**: tutte le sue richieste, in
ordine, ciascuna con stato attuale, categoria, piattaforma, ticket (o «nessun ticket») e il
percorso per esteso. **Testo semplice, selezionato e pronto** — niente allegati, niente
file generati: il gesto è copiare e incollare in una risposta, e un file ci metterebbe in
mezzo un passaggio.

Anche il percorso della singola nota si copia, dal bottone accanto a «Percorso».

### La colonna `chiuso` mostra sette giorni, non tutto

In colonna stanno solo le chiusure degli ultimi sette giorni; in fondo una riga dice
quante altre ce ne sono e apre la ricerca. **Le più vecchie non spariscono e non si
archiviano a mano:** restano nel log e si ritrovano cercando, perché il valore dello
strumento sta proprio nel poter rivedere cosa è stato chiuso e quando. Cercando, la
finestra dei sette giorni non si applica.

### L'eliminazione

Sta nel dettaglio, e su telefono in uno **swipe lungo a sinistra** — soglia 150px contro
i 70 che mandano in corso, con la card che vira al rosso strada facendo, così si vede
dove si sta andando prima di lasciare il dito.

Niente conferma, niente tap lungo (è già preso dal dettaglio): scrive un evento `del`
come le altre azioni, e la barretta **Annulla** lo copre riscrivendo un `new` con lo
stesso id. È una protezione migliore di un "sei sicuro?", che dopo la ventesima volta si
tocca senza leggerlo.

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

### Il codice cliente non si indovina

`cl` sono **sette cifre, e le prime tre sono la filiale**. La filiale **non si salva**: si
ricava con `filiale(cl)`. Un dato derivabile scritto nel log è un dato che un giorno
smentirà quello da cui deriva.

**Sette cifre nude non diventano mai un codice cliente.** In un'azienda di spedizioni i
numeri lunghi sono dappertutto — tracking, spedizioni, bolle, ticket, riferimenti del
cliente — e riconoscerli a vista riempirebbe l'archivio di clienti che non esistono. Serve:

- una parola che lo dica vicino al numero — `cliente` o `codice`, entro dodici caratteri,
  perché «codice cliente:2245744» sì e «il cliente ha aperto il ticket 2245744» no;
- oppure il prefisso esplicito `cl:2245744`, che sparisce dal testo come `@rossi`.

Quando il numero sta dentro una frase, invece, **resta nel testo**: lì significa qualcosa
anche per chi rilegge.

Tutte le note di un cliente si guardano toccando il codice sulla card, o dal dettaglio.
Il filtro lavora **sul campo `cl`, non sulla ricerca testuale**, che pescherebbe anche le
note che quel numero lo nominano e basta — cioè esattamente la confusione che il
riconoscimento stretto serve a evitare. Guardando un cliente si vede la sua storia intera,
chiusure vecchie comprese: la finestra dei sette giorni di §6 non si applica.

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

### Debito aperto: tre colori scelti a mano, da riconciliare col design

L'indicatore di sincronizzazione usa tre colori **che il design non ha mai fornito**.
Sono in `stile.css`, sulle classi `.stato-sync--*`, e vanno riconciliati quando arriverà
il foglio definitivo — sostituiti con i valori veri, o confermati e promossi a variabili:

| dove | valore | perché quello |
|---|---|---|
| in pari | `#4a7c59` | verde spento, non squillante: quando è tutto a posto non deve chiamare |
| in coda | `#b8842b` | ambra calda, di casa nella palette |
| non raggiungibile | `#9b2c2c` | rosso **cupo e poco arancio, apposta**: il terracotta è del ritardo e i due non si devono confondere |

Lo stesso rosso è usato dallo scorrimento che elimina (`.riga.is-elimina`), con un fondo
carta `#fdf1ee` e un bordo `#e7b9ad` che sono anch'essi fuori palette.

Stessa cosa per **i cinque colori delle aree**, sulle variabili `--area-*`, che colorano
una barretta di 3px sul bordo sinistro della card e un pallino accanto ai nomi delle aree
nel dettaglio — che è la loro legenda, l'unico posto dove si vedono tutti insieme:

| area | valore | perché quello |
|---|---|---|
| Accessi | `#7b5f8c` | viola spento |
| Portali e servizi | `#4f6d8f` | blu polvere |
| Integrazioni e dati | `#2f7d7a` | verdazzurro |
| Operativo | `#5d7f52` | verde oliva |
| Sistemi | `#8a6d3b` | bruno dorato |

Sono le cinque tinte più lontane fra loro che restano **fuori dalla banda del terracotta**,
perché quello significa ritardo e non deve avere sosia. Il colore sta sull'**area e non
sulla categoria**: quattordici tinte non si distinguono a colpo d'occhio, cinque sì. Una
nota senza categoria tiene la barretta del colore del bordo — un'assenza, non un sesto
colore da imparare. Il fondo della card resta carta: il colore non ci va mai sopra.

Finché non arriva il foglio, sono gli unici colori dell'applicazione a non venire dal
design: non aggiungerne altri per analogia.

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

`src`, `ca`, `fs`, `rc`, `pf`, `aspetto` e `cl`. Servono a misurare il carico, a far
riemergere le cose, a tenere separato il dove dal che cosa, a dire perché una nota è ferma
e a ritrovare la storia di un cliente. Nessuno dei sette costa un tap alla cattura: cinque
li riempie il classificatore, `cl` pure quando il testo glielo dice, e `aspetto` si chiede
dopo, su un passaggio di stato che avviene comunque (§6). Nient'altro entra per questa
porta.

`aspetto` è l'unico che costa una domanda, e per questo la domanda è saltabile e arriva a
spostamento già fatto. Se un giorno la si trovasse saltata nove volte su dieci, il campo
va tolto, non reso obbligatorio.

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
7. Il peso totale dell'app scaricata resti sotto i 150 KB. **Sono i byte trasferiti, non
   quelli su disco:** GitHub Pages serve compresso, quindi la misura da guardare è quella
   dei file gzippati. Oggi sono 48 KB, meno di un terzo del limite — se un giorno il conto
   tornerà a stare stretto, si misura con `gzip -9c <file> | wc -c` prima di tagliare.
