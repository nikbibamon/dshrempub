# Tvijo DSHREM — od zadania do sprawdzonego wyniku

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo łączy przestrzeń roboczą w przeglądarce, rozszerzenie VS Code i narzędzia terminala wokół wspólnego przepływu pracy nad rozwojem oprogramowania. Opisz zadanie, wybierz host wykonawczy i uprawnienia, przejrzyj zmiany i zachowaj dowody użyte do zaakceptowania wyniku. Ten przewodnik przedstawia produkt; techniczny README repozytorium i dokumentacja poleceń pozostają źródłem nadrzędnym dla CLI.

## Zacznij od preferowanej przestrzeni roboczej

Otwórz [DSHREM](https://dsh.tvijo.com/), pobierz [rozszerzenie VS Code i instrukcje dla terminala](https://dsh.tvijo.com/download) lub przeczytaj [wyjaśnienie ustawień](https://dsh.tvijo.com/knowledge/settings-explained). Zaloguj się przez obsługiwany przez usługę proces logowania na konto. Nigdy nie wklejaj kluczy API dostawcy do współdzielonego promptu, publicznego zgłoszenia ani repozytorium.

CLI Node.js wymaga Node 22 lub nowszego. Z lokalnego klonu repozytorium:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Polecenie jest dostępne również jako `dshrem`. To zdalne CLI czatu wyświetla sugerowane narzędzia bez ich wykonywania. Lokalna edycja i wykonywanie poleceń należą do VS Code Agent lub jawnie skonfigurowanego środowiska uruchomieniowego hosta; mają one osobne uprawnienia. Zobacz [pomoc CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Zrozum wybory

**Najpierw dowody** oddziela potwierdzone fakty od założeń. **Planuj i sprawdzaj** prosi o krótki plan i porównuje wynik z żądaniem. **Przejrzyj odpowiedź** podważa szkic; jest to samoprzegląd, chyba że jawnie wyznaczono osobnego recenzenta. Żadna z tych metod nie gwarantuje poprawności ani mniejszego zużycia tokenów.

Presety zadań dodają instrukcje i listy kontrolne wielokrotnego użytku. Nie tworzą dodatkowej pamięci modelu. Większa kolekcja kontekstu nadal musi mieścić się w limitach żądań usługi i modelu. Zaawansowane ścieżki kontrolera, Pythona i stanu odnoszą się do wybranego hosta rozszerzenia; w Remote SSH jest to zdalny serwer.

## Pracuj z zespołem, gdy to pomaga

Zespół AGENTROY przydziela koordynatorowi, realizatorom i recenzentom odrębne obowiązki. Zasady hosta mogą wymagać DSHREM ds41f oraz opartych na koncie narzędzi Codex lub Claude, z opcjonalnym przeglądem architektury. Dostępność zależy od zainstalowanego środowiska uruchomieniowego, dostępu do konta i wybranej zasady. Brakująca subskrypcja nie może po cichu stać się płatnym wywołaniem API.

Od trzech do sześciu ról to wybór organizacyjny, a nie recepta na jakość. Recenzenci potrzebują dokładnej wersji artefaktu i dowodów z testów. Poważnie nieudane sprawdzenie blokuje akceptację, nawet gdy modele się zgadzają. Przeczytaj [zespoły agentów i widoczne koszty](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Wznów bez ukrywania niepewności

Odłączona sesja tmux po stronie serwera może działać dalej po rozłączeniu laptopa lub telefonu. Praca na wyłączonym komputerze lokalnym nie może. Awaria serwera, presja na pamięć i utrata pamięci masowej nadal wymagają odzyskania. Połącz się ponownie z zapisanym identyfikatorem zadania i sprawdź jego ostatnie potwierdzone zdarzenie, zanim rozpoczniesz kolejną pracę. Nie powtarzaj bezrefleksyjnie płatnego żądania, którego wynik jest nieznany. Zobacz [rozłączenia i odzyskiwanie](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Utrzymuj koszty i dane widoczne

Przejrzyj zaakceptowaną wycenę, limit zadania, zarezerwowaną kwotę i potwierdzenie zużycia. Marża serwisowa w wysokości 8% zamieniłaby USD1.00 zużycia u dostawcy w USD1.08 przed odrębnie ujawnionymi opłatami; to przykład, a nie oferta cenowa. Limity subskrypcji, opłaty dostawcy i zasoby serwera to odrębne limity. Dodatkowy budżet wymaga jawnego wyboru.

Lokalne pliki poświadczeń CLI mają uprawnienia tylko dla właściciela. Te uprawnienia nie są szyfrowaniem ani kopią zapasową. Przesyłanie wiedzy jest jawne; prywatne pliki nigdy nie powinny trafić do publicznego linku przekazania. [Przekazywanie promptów](https://dsh.tvijo.com/knowledge/prompt-handoffs) wyjaśnia, jak skopiować sprawdzone zadanie do innego narzędzia.

Pakiet tego repozytorium jest obecnie oznaczony jako `UNLICENSED`; publikacja nie przyznaje praw do ponownego użycia. Przed redystrybucją zapoznaj się z bieżącymi metadanymi pakietu i informacją o licencji. Tłumaczenia są przewodnikami wprowadzającymi, generowanymi za pomocą DSHREM i sprawdzanymi pod kątem spójności strukturalnej; w przypadku rozbieżności technicznych wersją odniesienia jest angielska.
