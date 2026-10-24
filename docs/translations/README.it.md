# Tvijo DSHREM — da un compito a un risultato verificato

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo riunisce un workspace nel browser, un'estensione per VS Code e strumenti da terminale attorno a un flusso di sviluppo condiviso. Descrivi il compito, scegli il suo host di esecuzione e i permessi, esamina le modifiche e conserva le prove usate per accettare il risultato. Questa guida introduce il prodotto; il README tecnico del repository e il riferimento dei comandi restano autorevoli per la CLI.

## Inizia con il workspace che preferisci

Apri [DSHREM](https://dsh.tvijo.com/), ottieni le [istruzioni per l'estensione VS Code e il terminale](https://dsh.tvijo.com/download), oppure leggi [le impostazioni spiegate](https://dsh.tvijo.com/knowledge/settings-explained). Accedi tramite il flusso di account supportato dal servizio. Non incollare mai chiavi API del provider in un prompt condiviso, in una issue pubblica o in un repository.

La CLI Node.js richiede Node 22 o versione successiva. Da un checkout locale:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Il comando è disponibile anche come `dshrem`. Questa CLI di chat remota mostra gli strumenti suggeriti senza eseguirli. La modifica locale e l'esecuzione dei comandi appartengono all'Agent di VS Code o a un host runtime configurato esplicitamente; hanno permessi separati. Vedi [aiuto CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Comprendi le scelte

**Prima le prove** separa i fatti supportati dalle ipotesi. **Pianifica e verifica** richiede un piano breve e confronta il risultato con la richiesta. **Rivedi la risposta** mette alla prova una bozza; è un'autorevisione, a meno che non venga assegnato esplicitamente un revisore separato. Nessuno di questi metodi garantisce correttezza o un minor consumo di token.

I preset dei compiti aggiungono istruzioni e checklist riutilizzabili. Non creano memoria aggiuntiva per il modello. Una raccolta di contesto più ampia deve comunque rispettare i limiti di richiesta del servizio e del modello. I percorsi avanzati di controller, Python e stato si riferiscono all'host dell'estensione selezionato; in Remote SSH si tratta del server remoto.

## Lavora con un team quando è utile

Un team AGENTROY assegna a un coordinatore, agli implementatori e ai revisori responsabilità distinte. Le policy dell'host possono richiedere DSHREM ds41f e strumenti Codex o Claude basati sull'account, con revisione architetturale opzionale. La disponibilità dipende dal runtime installato, dall'accesso all'account e dalla policy scelta. Un abbonamento mancante non deve diventare silenziosamente una chiamata API a pagamento.

Da tre a sei ruoli sono scelte organizzative, non una formula di qualità. I revisori hanno bisogno della versione esatta dell'artefatto e delle prove dei test. Un controllo fallito in modo grave blocca l'accettazione anche quando i modelli concordano. Leggi [team di agenti e costi visibili](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Riprendi senza nascondere l'incertezza

Una sessione tmux staccata lato server può continuare dopo che un laptop o un telefono si disconnette. Il lavoro su un computer locale spento non può. Guasti del server, pressione sulla memoria e perdita dello storage richiedono comunque un recupero. Riconnettiti all'ID del compito salvato ed esamina il suo ultimo evento confermato prima di iniziare altro lavoro. Non ripetere alla cieca una richiesta fatturabile il cui esito è sconosciuto. Vedi [disconnessioni e recupero](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Mantieni visibili costi e dati

Esamina il preventivo accettato, il tetto del compito, l'importo riservato e la ricevuta di utilizzo. Un ricarico di servizio dell'8% trasformerebbe USD1.00 di utilizzo del provider in USD1.08 prima delle spese comunicate separatamente; questo è un esempio, non un'offerta di prezzo. Le quote degli abbonamenti, gli addebiti dei provider e le risorse del server sono limiti diversi. Un budget aggiuntivo richiede una scelta esplicita.

I file delle credenziali della CLI locale usano permessi riservati al proprietario. Questi permessi non sono cifratura né un backup. Il caricamento della Knowledge è esplicito; i file privati non dovrebbero mai entrare in un link di passaggio pubblico. I [passaggi di prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) spiegano come copiare un compito revisionato in un altro strumento.

Il pacchetto di questo repository è attualmente contrassegnato `UNLICENSED`; la pubblicazione non concede diritti di riutilizzo. Consulta i metadati attuali del pacchetto e l'avviso di licenza prima della ridistribuzione. Le traduzioni sono guide introduttive, generate con DSHREM e verificate per coerenza strutturale; l'inglese è il riferimento per le discrepanze tecniche.
