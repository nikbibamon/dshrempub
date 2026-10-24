# Tvijo DSHREM — a feladattól az ellenőrzött eredményig

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

A Tvijo böngészőalapú munkaterületet, VS Code-bővítményt és termináleszközöket fog közös fejlesztési munkafolyamat köré. Írja le a feladatot, válassza ki a végrehajtás helyét és a jogosultságokat, vizsgálja meg a módosításokat, és őrizze meg az eredmény elfogadásához használt bizonyítékokat. Ez az útmutató a terméket mutatja be; a CLI-re a tároló műszaki README-je és parancsreferenciája az irányadó.

## Kezdje a kedvenc munkaterületével

Nyissa meg a [DSHREM](https://dsh.tvijo.com/) oldalt, kérje le a [VS Code-bővítményt és a terminálutasításokat](https://dsh.tvijo.com/download), vagy olvassa el a [beállítások magyarázatát](https://dsh.tvijo.com/knowledge/settings-explained). Jelentkezzen be a szolgáltatás által támogatott fiókfolyamaton keresztül. Soha ne illesszen be szolgáltatói API-kulcsokat megosztott kérésbe, nyilvános hibajegybe vagy tárolóba.

A Node.js CLI-hez Node 22 vagy újabb verzió szükséges. Helyi másolatból:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

A parancs `dshrem` néven is elérhető. Ez a távoli chat CLI javasolt eszközöket jelenít meg anélkül, hogy végrehajtaná őket. A helyi szerkesztés és a parancsvégrehajtás a VS Code Agenthez vagy egy kifejezetten konfigurált hoszt-futtatókörnyezethez tartozik; ezek külön jogosultságokkal rendelkeznek. Lásd: [CLI-súgó](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Értse meg a választásokat

A **Bizonyíték először** elv a támogatott tényeket a feltételezésektől választja el. A **Tervezés és ellenőrzés** rövid tervet kér, és a kéréshez méri az eredményt. A **Válasz felülvizsgálata** megkérdőjelezi a piszkozatot; ez önfelülvizsgálat, hacsak külön felülvizsgálót nem jelöltek ki kifejezetten. E módszerek egyike sem garantálja a helyességet vagy az alacsonyabb tokenszámot.

A feladat-előbeállítások újrafelhasználható utasításokat és ellenőrzőlistákat adnak. Nem hoznak létre további modellmemóriát. A nagyobb kontextusgyűjteménynek is bele kell férnie a szolgáltatás és a modell kérési korlátaiba. A speciális vezérlő-, Python- és állapotútvonalak a kiválasztott bővítményhosztra utalnak; Remote SSH esetén ez a távoli kiszolgáló.

## Dolgozzon csapatban, ha ez segít

Az AGENTROY-csapat külön felelősségi köröket ad a koordinátornak, a megvalósítóknak és a felülvizsgálóknak. A hoszt-szabályzatok kérhetik a DSHREM ds41f-et és a fiókalapú Codex- vagy Claude-eszközöket, opcionális architekturális felülvizsgálattal. Az elérhetőség a telepített futtatókörnyezettől, a fiókhozzáféréstől és a választott szabályzattól függ. A hiányzó előfizetés nem válhat csendben fizetős API-hívássá.

A három–hat szerep szervezési döntés, nem a minőség formulája. A felülvizsgálóknak az artefaktum pontos verziójára és teszteredményekre van szükségük. Egy komolyan meghiúsult ellenőrzés az elfogadást akkor is megakadályozza, ha a modellek egyetértenek. Olvassa el az [agentcsapatok és látható költségek](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs) című részt.

## Folytatás a bizonytalanság elrejtése nélkül

A leválasztott, kiszolgálóoldali tmux-munkamenet a laptop vagy telefon kapcsolatbontása után is folytatódhat. Kikapcsolt helyi számítógépen futó munka nem. A kiszolgálóhiba, a memórianyomás és a tároló elvesztése továbbra is helyreállítást igényel. Csatlakozzon újra a mentett feladat-ID-hez, és a további munka megkezdése előtt vizsgálja meg az utolsó megerősített eseményét. Ne ismételjen meg vakon egy számlázható kérést, amelynek kimenetele ismeretlen. Lásd: [kapcsolatbontások és helyreállítás](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Tartsa láthatóan a költségeket és az adatokat

Tekintse át az elfogadott árajánlatot, a feladatkorlátot, a lefoglalt összeget és a használati bizonylatot. Egy 8% szolgáltatási felár a USD1.00 szolgáltatói használatot USD1.08-ra változtatná a külön feltüntetett díjak előtt; ez példa, nem árajánlat. Az előfizetési keretek, a szolgáltatói díjak és a kiszolgálóerőforrások különböző korlátok. A további költségkeret kifejezett döntést igényel.

A helyi CLI hitelesítőadat-fájljai csak tulajdonosi jogosultságokat használnak. Ezek a jogosultságok nem titkosítást és nem biztonsági mentést jelentenek. A tudásfeltöltés kifejezett; a privát fájlok soha nem kerülhetnek nyilvános átadási hivatkozásba. A [prompt-átadások](https://dsh.tvijo.com/knowledge/prompt-handoffs) elmagyarázzák, hogyan másoljon egy felülvizsgált feladatot egy másik eszközbe.

A tároló csomagja jelenleg `UNLICENSED` jelöléssel szerepel; a közzététel nem ad újrafelhasználási jogokat. Az újraelosztás előtt tekintse meg az aktuális csomagmetaadatokat és a licencértesítést. A fordítások bevezető útmutatók, amelyeket a DSHREM generált és szerkezeti konzisztenciára ellenőriztek; a műszaki eltérések esetén az angol a mérvadó.
