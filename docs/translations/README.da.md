# Tvijo DSHREM — fra en opgave til et kontrolleret resultat

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo samler et browser-arbejdsområde, en VS Code-udvidelse og terminalværktøjer omkring en fælles udviklingsarbejdsgang. Beskriv opgaven, vælg dens udførelsesvært og tilladelser, gennemgå ændringerne, og gem de beviser, der blev brugt til at acceptere resultatet. Denne guide introducerer produktet; repositoriets tekniske README og kommandoreference er fortsat den autoritative kilde for CLI'en.

## Start med dit foretrukne arbejdsområde

Åbn [DSHREM](https://dsh.tvijo.com/), hent [VS Code-udvidelsen og terminalinstruktionerne](https://dsh.tvijo.com/download), eller læs [indstillinger forklaret](https://dsh.tvijo.com/knowledge/settings-explained). Log ind via tjenestens understøttede kontoflow. Indsæt aldrig udbyderes API-nøgler i en delt prompt, et offentligt issue eller et repository.

Node.js-CLI'en kræver Node 22 eller nyere. Fra et lokalt checkout:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Kommandoen er også tilgængelig som `dshrem`. Denne remote chat-CLI viser foreslåede værktøjer uden at udføre dem. Lokal redigering og kommandoafvikling hører til VS Code Agent eller en eksplicit konfigureret vært-runtime; de har separate tilladelser. Se [CLI-hjælp](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Forstå valgmulighederne

**Beviser først** adskiller understøttede fakta fra antagelser. **Planlæg og kontrollér** beder om en kort plan og kontrollerer resultatet op imod forespørgslen. **Gennemgå svaret** udfordrer et udkast; det er selvrevision, medmindre en separat reviewer er eksplicit tildelt. Ingen af disse metoder garanterer korrekthed eller lavere tokenforbrug.

Opgavepresets tilføjer genanvendelige instruktioner og tjeklister. De skaber ikke yderligere modelhukommelse. En større kontekstsamling skal stadig passe inden for tjenestens og modellens forespørgselsgrænser. Avancerede controller-, Python- og state-stier refererer til den valgte udvidelsesvært; i Remote SSH er det den eksterne server.

## Arbejd i et team, når det hjælper

Et AGENTROY-team tildeler en koordinator, implementører og reviewere forskellige ansvarsområder. Værtspolitikker kan anmode om DSHREM ds41f og kontobaserede Codex- eller Claude-værktøjer, med valgfri arkitekturrevision. Tilgængelighed afhænger af den installerede runtime, kontoadgang og den valgte politik. Et manglende abonnement må ikke stiltiende blive til et betalt API-kald.

Tre til seks roller er organisationsvalg, ikke en kvalitetsformel. Reviewere har brug for den præcise artefaktversion og testbeviser. En alvorlig fejlet kontrol blokerer accept, selv når modellerne er enige. Læs [agentteams og synlige omkostninger](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Genoptag uden at skjule usikkerhed

En løsrevet server-side tmux-session kan fortsætte, efter at en laptop eller telefon afbryder forbindelsen. Arbejde på en lokal computer, der er slukket, kan ikke. Serverfejl, hukommelsespres og tab af lager kræver stadig genopretning. Genopret forbindelsen til det gemte opgave-ID, og undersøg dets seneste bekræftede hændelse, før du starter mere arbejde. Gentag ikke blindt en fakturerbar forespørgsel, hvis udfald er ukendt. Se [afbrydelser og genopretning](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Hold omkostninger og data synlige

Gennemgå det accepterede tilbud, opgavens loft, det reserverede beløb og kvitteringen for forbrug. Et servicepåslag på 8% ville gøre USD1.00 af udbyderforbrug til USD1.08 før særskilt oplyste gebyrer; dette er et eksempel, ikke et pristilbud. Abonnementskvoter, udbydergebyrer og serverressourcer er forskellige grænser. Ekstra budget kræver et eksplicit valg.

Lokale CLI-legitimationsfiler bruger rettigheder, der kun gælder for ejeren. Disse rettigheder er ikke kryptering eller en backup. Vidensupload er eksplicit; private filer bør aldrig havne i et offentligt handoff-link. [Prompt-handoffs](https://dsh.tvijo.com/knowledge/prompt-handoffs) forklarer, hvordan man kopierer en gennemgået opgave til et andet værktøj.

Dette repositories pakke er i øjeblikket markeret som `UNLICENSED`; offentliggørelse giver ikke ret til genbrug. Rådfør dig med de aktuelle pakke-metadata og licensmeddelelsen før videredistribution. Oversættelser er introducerende guides, genereret med DSHREM og kontrolleret for strukturel konsistens; engelsk er reference for tekniske afvigelser.
