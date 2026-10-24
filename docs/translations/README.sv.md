# Tvijo DSHREM — från en uppgift till ett kontrollerat resultat

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo samlar en webbläsarbaserad arbetsyta, ett VS Code-tillägg och terminalverktyg kring ett gemensamt utvecklingsarbetsflöde. Beskriv uppgiften, välj dess körningsvärd och behörigheter, granska ändringarna och behåll den evidens som användes för att godkänna resultatet. Den här guiden introducerar produkten; repots tekniska README och kommandoreferens är fortfarande normerande för CLI:n.

## Börja med din föredragna arbetsyta

Öppna [DSHREM](https://dsh.tvijo.com/), hämta [VS Code-tillägget och terminalinstruktionerna](https://dsh.tvijo.com/download), eller läs [inställningarna förklarade](https://dsh.tvijo.com/knowledge/settings-explained). Logga in via den inloggningsmetod som tjänsten stöder. Klistra aldrig in leverantörens API-nycklar i en delad prompt, ett publikt ärende eller ett repo.

Node.js-CLI:n kräver Node 22 eller nyare. Från en lokal utcheckning:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Kommandot finns även som `dshrem`. Den här fjärrchatt-CLI:n visar föreslagna verktyg utan att köra dem. Lokal redigering och kommandoexekvering hör till VS Code Agent eller en uttryckligen konfigurerad värdruntime; de har separata behörigheter. Se [CLI-hjälp](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Förstå valen

**Evidens först** skiljer underbyggda fakta från antaganden. **Planera och kontrollera** begär en kort plan och kontrollerar resultatet mot förfrågan. **Granska svaret** utmanar ett utkast; det är självgranskning om ingen separat granskare har utsetts uttryckligen. Ingen av dessa metoder garanterar korrekthet eller lägre tokenanvändning.

Uppgiftsförval lägger till återanvändbara instruktioner och checklistor. De skapar inte ytterligare modellminne. En större kontextsamling måste fortfarande rymmas inom tjänstens och modellens förfrågningsgränser. Avancerade sökvägar för controller, Python och state avser den valda tilläggsvärden; i Remote SSH är det fjärrservern.

## Arbeta i team när det hjälper

Ett AGENTROY-team tilldelar en koordinator, implementerare och granskare olika ansvarsområden. Värdprinciper kan begära DSHREM ds41f och kontobaserade Codex- eller Claude-verktyg, med valfri arkitekturgranskning. Tillgänglighet beror på den installerade runtimemiljön, kontoåtkomst och den valda principen. En saknad prenumeration får inte tyst bli ett betalt API-anrop.

Tre till sex roller är organisatoriska val, inte en formel för kvalitet. Granskare behöver den exakta artefaktversionen och testevidensen. En allvarlig misslyckad kontroll blockerar godkännande även när modellerna är eniga. Läs [agentteam och synliga kostnader](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Återuppta utan att dölja osäkerhet

En frånkopplad tmux-session på serversidan kan fortsätta efter att en laptop eller telefon kopplats från. Arbete på en avstängd lokal dator kan inte det. Serverfel, minnestryck och lagringsförlust kräver fortfarande återställning. Anslut igen till det sparade uppgifts-ID:t och granska dess senast bekräftade händelse innan du startar mer arbete. Upprepa inte blint en debiterbar förfrågan vars utfall är okänt. Se [frånkopplingar och återställning](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Håll kostnader och data synliga

Granska den accepterade offerten, uppgiftens kostnadstak, det reserverade beloppet och användningskvittot. Ett servicetillägg på 8% skulle göra USD1.00 av leverantörens användning till USD1.08 före separat angivna avgifter; detta är ett exempel, inte ett pris erbjudande. Prenumerationskvoter, leverantörsavgifter och serverresurser är olika gränser. Extra budget kräver ett uttryckligt val.

Lokala CLI-inloggningsfiler använder behörigheter som endast ägaren har. Dessa behörigheter är varken kryptering eller en säkerhetskopia. Kunskapsuppladdning är uttrycklig; privata filer bör aldrig hamna i en publik överlämningslänk. [Promptöverlämningar](https://dsh.tvijo.com/knowledge/prompt-handoffs) förklarar hur man kopierar en granskad uppgift till ett annat verktyg.

Det här repots paket är för närvarande märkt `UNLICENSED`; publicering ger inte rätt att återanvända. Rådgör med aktuell paketmetadata och licensmeddelande innan vidaredistribution. Översättningar är introducerande guider, genererade med DSHREM och kontrollerade för strukturell överensstämmelse; engelska är referensen vid tekniska avvikelser.
