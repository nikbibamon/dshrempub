# Tvijo DSHREM — tehtävästä tarkistettuun tulokseen

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo kokoaa selaimessa toimivan työtilan, VS Code ‑laajennuksen ja päätetyökalut yhteisen kehitystyönkulun ympärille. Kuvaile tehtävä, valitse sen suoritusympäristö ja käyttöoikeudet, tarkastele muutoksia ja säilytä todisteet, joiden perusteella tulos hyväksyttiin. Tämä opas esittelee tuotteen; repositorion tekninen README ja komentoviite ovat edelleen ratkaisevia CLI:n osalta.

## Aloita haluamastasi työtilasta

Avaa [DSHREM](https://dsh.tvijo.com/), hanki [VS Code ‑laajennus ja päätteelle tarkoitetut ohjeet](https://dsh.tvijo.com/download) tai lue [asetusten selitykset](https://dsh.tvijo.com/knowledge/settings-explained). Kirjaudu sisään palvelun tukemalla tilin kirjautumistavalla. Älä koskaan liitä palveluntarjoajan API-avaimia jaettuun kehotteeseen, julkiseen issueen tai repositorioon.

Node.js-CLI vaatii Node 22:n tai uudemman. Paikallisesta kloonista:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Komento on saatavilla myös nimellä `dshrem`. Tämä etächat-CLI näyttää ehdotetut työkalut suorittamatta niitä. Paikallinen muokkaaminen ja komentojen suorittaminen kuuluvat VS Code Agentille tai erikseen määritetylle isäntäajoympäristölle; niillä on erilliset käyttöoikeudet. Katso [CLI-ohje](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Ymmärrä valinnat

**Todisteet ensin** erottaa tuetut faktat oletuksista. **Suunnittele ja tarkista** pyytää lyhyen suunnitelman ja tarkistaa tuloksen pyyntöä vasten. **Tarkastele vastausta** haastaa luonnoksen; kyse on itsetarkastuksesta, ellei erillistä tarkistajaa ole nimenomaisesti määrätty. Mikään näistä menetelmistä ei takaa virheettömyyttä tai pienempää tokenien käyttöä.

Tehtäväesiasetukset lisäävät uudelleenkäytettäviä ohjeita ja tarkistuslistoja. Ne eivät luo mallille lisämuistia. Suuremman kontekstikokoelman on silti mahduttava palvelun ja mallin pyyntörajoihin. Edistyneet ohjaimen, Pythonin ja tilan polut viittaavat valittuun laajennusisäntään; Remote SSH:ssa se on etäpalvelin.

## Työskentele tiimin kanssa, kun siitä on hyötyä

AGENTROY-tiimi antaa koordinaattorille, toteuttajille ja tarkistajille erilliset vastuut. Isäntäkäytännöt voivat pyytää DSHREM ds41f:tä sekä tiliin perustuvia Codex- tai Claude-työkaluja ja valinnaista arkkitehtuurikatselmointia. Saatavuus riippuu asennetusta ajonaikaisesta ympäristöstä, tilin käyttöoikeuksista ja valitusta käytännöstä. Puuttuva tilaus ei saa hiljaisesti muuttua maksulliseksi API-kutsuksi.

Kolme–kuusi roolia on organisaation valinta, ei laadun kaava. Tarkistajat tarvitsevat tarkan artefaktiversion ja testitodisteet. Vakava epäonnistunut tarkistus estää hyväksynnän, vaikka mallit olisivat samaa mieltä. Lue [agenttitiimit ja näkyvät kustannukset](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Jatka työtä ja tee epävarmuus näkyväksi

Irrotettu palvelinpuolen tmux-istunto voi jatkua, kun kannettava tietokone tai puhelin katkaisee yhteyden. Sammutetulla paikallisella tietokoneella tehtävä työ ei voi jatkua. Palvelinvika, muistipaine ja tallennustilan menetys vaativat silti palautumista. Yhdistä uudelleen tallennettuun tehtävätunnukseen ja tarkista sen viimeisin vahvistettu tapahtuma ennen kuin aloitat lisää työtä. Älä toista sokeasti laskutettavaa pyyntöä, jonka lopputulos on tuntematon. Katso [yhteyden katkeamiset ja palautuminen](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Pidä kustannukset ja tiedot näkyvissä

Tarkista hyväksytty tarjous, tehtäväkohtainen yläraja, varattu summa ja käyttökuitti. 8 %:n palvelulisä muuttaisi USD1.00 palveluntarjoajan käyttöä USD1.08:ksi ennen erikseen ilmoitettuja kuluja; tämä on esimerkki, ei hintatarjous. Tilauskiintiöt, palveluntarjoajan veloitukset ja palvelinresurssit ovat eri rajoja. Lisäbudjetti edellyttää nimenomaista valintaa.

Paikalliset CLI-tunnistetiedostot käyttävät vain omistajalle sallittuja käyttöoikeuksia. Nämä käyttöoikeudet eivät ole salausta eivätkä varmuuskopio. Tietämyksen lataaminen on nimenomaista; yksityiset tiedostot eivät saisi koskaan päätyä julkiseen siirtolinkkiin. [Kehotteiden siirrot](https://dsh.tvijo.com/knowledge/prompt-handoffs) selittävät, miten tarkistettu tehtävä kopioidaan toiseen työkaluun.

Tämän repositorion paketti on tällä hetkellä merkitty merkinnällä `UNLICENSED`; julkaiseminen ei myönnä uudelleenkäyttöoikeuksia. Tarkista nykyiset paketin metatiedot ja lisenssi-ilmoitus ennen edelleen jakamista. Käännökset ovat johdanto-oppaita, jotka on tuotettu DSHREMillä ja tarkistettu rakenteellisen johdonmukaisuuden varalta; englanti on teknisten eroavaisuuksien viite.
