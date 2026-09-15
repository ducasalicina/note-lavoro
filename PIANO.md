# PIANO.md — tappe di costruzione

Ogni tappa è piccola e verificabile. Non passare alla successiva finché la precedente non
soddisfa il suo criterio. Alla fine di ogni tappa fai un commit con un messaggio in italiano
che dica cosa cambia, non quali file tocca.

---

## Stato attuale

| Tappa | Stato |
|---|---|
| 0 · Impalcatura | fatta |
| 1 · Cattura | fatta |
| 2 · Configurazione e sincronizzazione | **fatta, con un criterio non verificato** |
| 3 · Triage e stati | fatta e provata nel browser |
| 4 · Fascia e ricerca | fatta |
| 5 · Cattura da tastiera del PC | **aperta di proposito** |
| 6 · Rifiniture | aperta |
| 7 · Recap | **bloccata**: `recap.mjs` non è mai arrivato in sessione |

### Le due cose da fare prima del primo uso vero

1. **Spegnere l'interruttore delle note di esempio** nel pannello impostazioni. Finché è
   acceso, un archivio vuoto si riempie di sedici note finte, e il primo log vero
   nascerebbe con quelle dentro. `dati-esempio.js` resta nel repo apposta: serve a provare
   sincronizzazione e gesti. Si cancella quando non serve più, insieme alla sua chiamata
   in `avvia()`.
2. **Svuotare la copia locale** dal pannello, dopo le prove. Attenzione a quale delle due
   azioni si tocca: la prima è reversibile dalla sincronizzazione, la seconda no.

### Il criterio 4 non è dimostrato

«Due dispositivi che modificano la stessa nota convergono allo stesso risultato» non è mai
stato provato: in sessione non c'erano né owner, né repo, né token. Il pannello li accetta
e l'indicatore reagisce, ma **il viaggio verso GitHub non è mai partito davvero**. È la
prima cosa da guardare col repo vero collegato, con `Sincronizza adesso` e due dispositivi.

---

## Tappa 0 — Impalcatura ✓

`index.html`, `app.js`, `stile.css` dal design. Schermata unica, tre fasce sovrapposte:
cattura in alto, scadenze sotto, contenuto in fondo con barra a cinque voci. Su desktop le
colonne affiancate, su telefono una lista per volta.

**Provato:** la pagina si apre, il cursore è già nel campo, nessuna chiamata di rete.

## Tappa 1 — Cattura ✓

Invio salva tramite `Store.aggiungi()` e svuota il campo. Sotto il campo, mentre si scrive,
compaiono categoria indovinata, `@persona`, tag, scadenza e priorità.

Alla creazione la nota porta con sé `src`, `rc` e `pf` con una `modifica()` subito dopo:
`aggiungi()` dello store scrive solo i campi che conosceva quando è stato scritto.

**Provato:** le note sopravvivono al ricaricamento e non si duplicano (criteri 3 e 5),
e senza token non parte nessuna chiamata a GitHub (criterio 6).

## Tappa 2 — Configurazione e sincronizzazione ✓

Pannello raggiungibile dall'ingranaggio in testata, con owner, repo dati, nome dispositivo,
token e **Cancella token da questo dispositivo**. Accanto, l'indicatore di stato:
`non configurato` · `in pari` · `in coda N` · `non raggiungibile`, che apre il pannello se
lo tocchi.

L'indicatore è un pallino con una parola solo quando serve dirne una: verde muto in pari,
giallo col numero in coda, rosso con "non raggiungibile". Lo stato per esteso resta nel
`title` e nell'etichetta accessibile.

Dentro al pannello, la sezione **Prove**: l'interruttore delle note di esempio (spento di
suo) e due azioni distinte, entrambe in due tocchi — **Svuota copia locale**, che tocca
solo IndexedDB e da cui i dati tornano alla prima sincronizzazione, e **Cancella tutto,
anche su GitHub**, che azzera i log nel repo dati e non torna indietro da nessuna parte.

Cinque aggiunte a `brt-store.js`, tutte necessarie a quello che è stato chiesto e nessuna
che cambi l'approccio del file: `inCoda()`, `ultimaSync()`, `svuota()`, `cancellaTutto()`
e `ripristina()`.

**Da verificare col repo vero:** il criterio di questa tappa, cioè che una nota inserita
sul PC compaia sul telefono e viceversa senza duplicati.

## Tappa 3 — Triage e stati ✓

Su desktop drag and drop fra le cinque colonne. Su telefono **nessun trascinamento**: la
riga si scorre, a destra chiude, a sinistra manda in corso, con soglia a 70px e le
destinazioni scoperte sotto la card.

Tocco su una nota apre il **dettaglio**, dove si correggono categoria, richiedente,
scadenza, ricontrollo, numero ticket ed esito. La categoria sta in cima e prende il fuoco
da sola; sulle note ancora da classificare il pannello mostra per prime le alternative fra
cui il classificatore stava esitando. Uno scorrimento non apre il dettaglio.

Ogni spostamento lascia cinque secondi di **Annulla**. Rimanda fa eccezione e non la
mostra: è già reversibile rimandando ancora.

Lo **swipe lungo a sinistra** (150px contro i 70 che mandano in corso) elimina, con la
card che vira al rosso strada facendo. Nessuna conferma: scrive un `del` come le altre
azioni e la barretta Annulla lo copre riscrivendo un `new` con lo stesso id.

**Provato nel browser a 390px:** scorrimento nei due versi, entrambe le soglie, virata al
rosso, barretta Annulla che compare, riporta la nota indietro e sparisce.

## Tappa 4 — Fascia e ricerca ✓

Una riga sola di contatori cliccabili che filtrano il board: in ritardo, oggi, da
ricontrollare, in attesa. Ricliccare quello attivo toglie il filtro. Non elenca le note:
elencandole la stessa nota compariva tre volte nella stessa schermata.

La ricerca è un'icona e filtra su testo, richiedente, categoria, ticket e tag, compreso il
chiuso.

## Tappa 5 — Cattura da tastiera del PC ○

**Aperta di proposito**, da fare dopo qualche giorno di uso vero.

Parametro `?add=` in apertura: registra la nota con `src:"urlbar"`, ripulisce l'URL con
`history.replaceState`, conferma per un secondo e chiude la scheda se aperta solo per
quello (`?add=...&chiudi=1`). Più un bookmarklet che prende il testo selezionato nella
pagina corrente e lo manda a `?add=` con `src:"bookmarklet"`.

## Tappa 6 — Rifiniture ○

Service worker per il guscio (mai le chiamate API), manifest, icone. Frasi ricorrenti come
chip sopra il campo. Allegato immagine con `capture="environment"`, solo locale.

## Tappa 7 — Recap ●

Bloccata: `recap.mjs` sta nel repo dati e in sessione non è mai arrivato. Quattro sezioni,
nell'ordine di §11 del `CLAUDE.md`:

1. **Da ricontrollare** in cima, le voci con `rc` passata e stato diverso da `chiuso`,
   dalla più vecchia, col testo originale.
2. **Fuori dal sistema ufficiale**: quante note aperte e quante chiuse senza `ticket`.
3. **Carico**: conteggi per canale e conteggio assoluto delle `fs`, **mai percentuali**.
4. **Media giornaliera in `corso`** nel periodo.

La mappatura `src` → canale sta **lì e solo lì**, in cima al file, dove si ritara in una
riga. Un `ca` esplicito la scavalca sempre.

E va tolta la sezione della giacenza a sette giorni.

---

## Nato strada facendo

Niente di quello che segue era nel piano iniziale. Sta qui perché fra sei mesi la domanda
sarà «perché c'è questa roba», e la risposta deve essere scritta da qualche parte.

**Il ricontrollo (`rc`)** ha sostituito la giacenza fissa a sette giorni, che trattava allo
stesso modo una cosa da rivedere domani e una che può aspettare un mese. Si calcola da solo
alla creazione e a ogni cambio di stato, da una tabella categoria + stato (§7 del
`CLAUDE.md`). **I suoi numeri sono provvisori** e vanno rivisti dopo due settimane di uso
vero. Quando `rc` è passata, sulla card compare **Rimanda**: un tocco e basta.

**Il limite WIP** su "In corso": contatore `n/limite`, default 3, evidenziato quando è
superato e **mai bloccante**. È uno specchio, non un cancello.

**L'eliminazione**, dal dettaglio e con lo swipe lungo a sinistra sul telefono, coperta
dalla barretta Annulla grazie a `ripristina()`, che riscrive un `new` con lo stesso id:
nel log in sola aggiunta non si toglie un `del`, gli si scrive sopra.

**La colonna `chiuso` a sette giorni**, con in fondo la riga che conta le altre e apre la
ricerca. Niente archiviazione manuale: le vecchie restano nel log.

**L'indicatore a pallino** in testata, verde muto quando è in pari, giallo col numero in
coda, rosso quando GitHub non risponde. I tre colori **non vengono dal design** e non sono
l'accento: il terracotta resta del ritardo. Da far confermare.

**Quattro campi nuovi**, tutti riempiti dal classificatore e nessuno dei quali costa un tap
alla cattura: `src` (da dove è entrata la nota — un fatto, mentre il canale dedotto vive
nel recap), `fs` (fuori standard, **conteggio minimo, mai percentuale**), `esito` sulle
note chiuse, `pf` (la piattaforma, tenuta separata dalla categoria).

**Il dizionario diviso in sintomi e piattaforme**, perché il punteggio additivo faceva
vincere il prodotto sul problema. Più schemi regex, confronti sensibili alle maiuscole per
le sigle dei tracciati, e un rilevatore di urgenza separato dalla categoria.

**`prove-classificatore.js`**, che si esegue con `node prove-classificatore.js` e oggi
passa 49 prove su 49, di cui 21 estratti autentici da mail. **Il classificatore è chiuso:**
la prossima taratura si fa sui dati veri, non a tavolino.

**Corretto un bug in `brt-store.js`**: `elenco()` ordinava su `b.pr`, ma `rigioca()` salva
il campo come `priorita`. Il confronto dava `NaN` e l'ordinamento per priorità non è mai
avvenuto, silenziosamente.

**Tolto `oggi()` da `brt-store.js`**: aveva la giacenza a sette giorni e non sapeva niente
di `rc`. La fascia se la calcola l'app.

**`mappaAree(CATEGORIE)` va chiamata all'avvio**, o `elenco({area})` non trova mai niente
e non lo dice. `avvia()` la fa.

**`package.json`** contiene solo `{"type":"module"}`: nessuna dipendenza, nessun build
step. Serve perché `node` legga i `.js` come moduli ES, cosa che il browser fa già da sé.

---

## Come condurre le sessioni successive

- Una tappa per sessione. Alla fine chiedi una verifica dei criteri, non un riassunto.
- Se propone una libreria, una cartella `src/`, un bundler o React, la risposta è no: il
  progetto deve restare apribile e modificabile fra due anni senza ricostruire nulla.
- Ogni modifica al dizionario passa da `node prove-classificatore.js` prima del commit.
- Ogni modifica al CSS o al markup passa da `prove-interfaccia.html`, aperta in un
  browser. Controlla la pagina **appena caricata**, che è dove si era nascosto il difetto
  dei pannelli sempre visibili.
- Quando una prova fallisce, non alzare un peso finché passa: guarda perché, e se è la
  frase attesa a essere sbagliata correggi la prova.
