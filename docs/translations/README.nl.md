# Tvijo DSHREM — van een taak naar een gecontroleerd resultaat

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo brengt een browswerkruimte, een VS Code-extensie en terminaltools samen rond een gedeelde ontwikkelworkflow. Beschrijf de taak, kies de uitvoeringshost en machtigingen, inspecteer de wijzigingen en bewaar het bewijs waarmee je het resultaat aanvaardt. Deze gids is een inleiding tot het product; de technische README en de opdrachtenreferentie van de repository blijven leidend voor de CLI.

## Begin met je voorkeurswerkruimte

Open [DSHREM](https://dsh.tvijo.com/), haal de [VS Code-extensie en terminalinstructies](https://dsh.tvijo.com/download) op, of lees [instellingen uitgelegd](https://dsh.tvijo.com/knowledge/settings-explained). Meld je aan via de ondersteunde accountflow van de dienst. Plak nooit API-sleutels van providers in een gedeelde prompt, een openbare issue of een repository.

De Node.js CLI vereist Node 22 of nieuwer. Vanuit een lokale checkout:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Het commando is ook beschikbaar als `dshrem`. Deze remote chat-CLI toont voorgestelde tools zonder ze uit te voeren. Lokaal bewerken en opdrachten uitvoeren horen bij de VS Code Agent of een expliciet geconfigureerde hostruntime; die hebben afzonderlijke machtigingen. Zie [CLI-hulp](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Begrijp de keuzes

**Bewijs eerst** scheidt onderbouwde feiten van aannames. **Plannen en controleren** vraagt om een kort plan en toetst het resultaat aan de opdracht. **Het antwoord beoordelen** daagt een concept uit; dat is zelfbeoordeling, tenzij expliciet een aparte reviewer is aangewezen. Geen van deze methoden garandeert juistheid of een lager tokengebruik.

Taakpresets voegen herbruikbare instructies en checklists toe. Ze creëren geen extra modelgeheugen. Een grotere contextverzameling moet nog steeds binnen de limieten van de dienst en het modeloaanvraag passen. Geavanceerde controller-, Python- en state-paden verwijzen naar de geselecteerde extensiehost; bij Remote SSH is dat de remote server.

## Werk met een team wanneer dat helpt

Een AGENTROY-team kent een coördinator, implementeerders en reviewers verschillende verantwoordelijkheden toe. Hostbeleid kan DSHREM ds41f en accountgebonden Codex- of Claude-tools aanvragen, met optionele architectuurreview. Beschikbaarheid hangt af van de geïnstalleerde runtime, accounttoegang en het gekozen beleid. Een ontbrekend abonnement mag niet stilzwijgend een betaalde API-aanroep worden.

Drie tot zes rollen zijn organisatorische keuzes, geen kwaliteitsformule. Reviewers hebben de exacte versie van het artefact en het testbewijs nodig. Een ernstig mislukte controle blokkeert aanvaarding, ook wanneer modellen het eens zijn. Lees [agentteams en zichtbare kosten](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Hervat zonder onzekerheid te verbergen

Een losgekoppelde server-side tmux-sessie kan doorgaan nadat een laptop of telefoon de verbinding verbreekt. Werk op een uitgeschakelde lokale computer kan dat niet. Serverstoring, geheugendruk en gegevensverlies vereisen nog steeds herstel. Maak opnieuw verbinding met de opgeslagen taak-ID en inspecteer de laatste bevestigde gebeurtenis voordat je meer werk start. Herhaal niet blindelings een factureerbare aanvraag waarvan de uitkomst onbekend is. Zie [verbrekingen en herstel](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Houd kosten en gegevens zichtbaar

Controleer de aanvaarde offerte, de taaklimiet, het gereserveerde bedrag en de gebruiksbon. Een servicetoeslag van 8% zou USD1.00 aan providergebruik omzetten in USD1.08 vóór afzonderlijk vermelde kosten; dit is een voorbeeld, geen prijsaanbod. Abonnementsquota, providerkosten en serverresources zijn verschillende limieten. Extra budget vereist een expliciete keuze.

Lokale CLI-referentiebestanden gebruiken machtigingen die alleen de eigenaar toekent. Deze machtigingen zijn geen versleuteling en geen back-up. Kennisupload is expliciet; privébestanden horen nooit in een openbare overdrachtslink. [Promptoverdrachten](https://dsh.tvijo.com/knowledge/prompt-handoffs) leggen uit hoe je een beoordeelde taak naar een ander hulpmiddel kopieert.

Het pakket van deze repository is momenteel gemarkeerd als `UNLICENSED`; publicatie verleent geen hergebruiksrechten. Raadpleeg de actuele pakketmetadata en de licentiemelding voordat je opnieuw distribueert. Vertalingen zijn inleidende gidsen, gegenereerd met DSHREM en gecontroleerd op structurele consistentie; Engels is de referentie bij technische afwijkingen.
