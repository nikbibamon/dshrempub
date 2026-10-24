# Tvijo DSHREM — de la sarcină la rezultat verificat

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo reunește un spațiu de lucru în browser, o extensie VS Code și instrumente de terminal într-un flux de dezvoltare comun. Descrieți sarcina, alegeți gazda de execuție și permisiunile acesteia, inspectați modificările și păstrați dovezile folosite pentru a accepta rezultatul. Acest ghid prezintă produsul; README-ul tehnic al depozitului și referința de comenzi rămân autoritare pentru CLI.

## Începeți cu spațiul de lucru preferat

Deschideți [DSHREM](https://dsh.tvijo.com/), obțineți [extensia VS Code și instrucțiunile pentru terminal](https://dsh.tvijo.com/download) sau citiți [setările explicate](https://dsh.tvijo.com/knowledge/settings-explained). Autentificați-vă prin fluxul de cont acceptat de serviciu. Nu lipiți niciodată chei API ale furnizorilor într-un prompt partajat, într-un tichet public sau într-un depozit.

CLI-ul Node.js necesită Node 22 sau o versiune mai nouă. Dintr-o copie locală a depozitului:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Comanda este disponibilă și ca `dshrem`. Acest CLI de chat la distanță afișează instrumentele sugerate fără a le executa. Editarea locală și execuția comenzilor aparțin Agentului VS Code sau unui runtime gazdă configurat explicit; acestea au permisiuni separate. Consultați [ajutorul CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Înțelegeți opțiunile

**Dovezile pe primul loc** separă faptele susținute de presupuneri. **Planifică și verifică** cere un plan scurt și verifică rezultatul față de cerință. **Revizuiește răspunsul** contestă o schiță; este o auto-revizuire dacă nu este desemnat explicit un revizor separat. Niciuna dintre aceste metode nu garantează corectitudinea sau un consum mai mic de tokenuri.

Presetările de sarcini adaugă instrucțiuni și liste de verificare reutilizabile. Ele nu creează memorie suplimentară pentru model. O colecție de context mai mare trebuie totuși să încapă în limitele de cerere ale serviciului și ale modelului. Căile avansate pentru controller, Python și stare se referă la gazda extensiei selectată; în Remote SSH aceasta este serverul la distanță.

## Lucrați în echipă când ajută

O echipă AGENTROY atribuie unui coordonator, unor implementatori și unor revizori responsabilități distincte. Politicile gazdă pot solicita DSHREM ds41f și instrumente Codex sau Claude bazate pe cont, cu o revizuire arhitecturală opțională. Disponibilitatea depinde de runtime-ul instalat, de accesul la cont și de politica aleasă. Un abonament lipsă nu trebuie să devină în mod silențios un apel API plătit.

Trei până la șase roluri sunt alegeri organizaționale, nu o formulă pentru calitate. Revizorii au nevoie de versiunea exactă a artefactului și de dovezile testelor. O verificare eșuată serioasă blochează acceptarea chiar și atunci când modelele sunt de acord. Citiți [echipele de agenți și costurile vizibile](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Reluați fără a ascunde incertitudinea

O sesiune tmux detașată pe server poate continua după ce un laptop sau un telefon se deconectează. Lucrul pe un computer local oprit nu poate continua. Defecțiunea serverului, presiunea pe memorie și pierderea spațiului de stocare necesită în continuare recuperare. Reconectați-vă la ID-ul sarcinii salvate și inspectați ultimul eveniment confirmat înainte de a începe mai mult lucru. Nu repetați orbește o cerere facturabilă al cărei rezultat este necunoscut. Consultați [deconectări și recuperare](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Păstrați costurile și datele vizibile

Examinați oferta acceptată, plafonul sarcinii, suma rezervată și chitanța de utilizare. Un adaos de serviciu de 8% ar transforma USD1.00 de utilizare la furnizor în USD1.08 înainte de taxele dezvăluite separat; acesta este un exemplu, nu o ofertă de preț. Cotele abonamentelor, taxele furnizorilor și resursele serverului sunt limite diferite. Un buget suplimentar necesită o alegere explicită.

Fișierele locale de acreditări ale CLI folosesc permisiuni doar pentru proprietar. Aceste permisiuni nu sunt criptare și nici o copie de rezervă. Încărcarea cunoștințelor este explicită; fișierele private nu ar trebui să ajungă niciodată într-un link public de predare. [Predările de prompturi](https://dsh.tvijo.com/knowledge/prompt-handoffs) explică modul de copiere a unei sarcini revizuite într-un alt instrument.

Pachetul acestui depozit este marcat în prezent `UNLICENSED`; publicarea nu acordă drepturi de reutilizare. Consultați metadatele actuale ale pachetului și notificarea de licențiere înainte de redistribuire. Traducerile sunt ghiduri introductive, generate cu DSHREM și verificate pentru coerență structurală; engleza este referința pentru discrepanțele tehnice.
