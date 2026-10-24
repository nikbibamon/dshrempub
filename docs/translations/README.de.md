# Tvijo DSHREM — vom Auftrag zum geprüften Ergebnis

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo verbindet einen Browser-Arbeitsbereich, eine VS-Code-Erweiterung und Terminal-Werkzeuge rund um einen gemeinsamen Entwicklungsablauf. Beschreiben Sie die Aufgabe, wählen Sie den Ausführungs-Host und die Berechtigungen, prüfen Sie die Änderungen und bewahren Sie die Belege auf, mit denen Sie das Ergebnis akzeptieren. Diese Anleitung führt in das Produkt ein; für die CLI bleiben die technische README und die Befehlsreferenz des Repositories maßgeblich.

## Beginnen Sie mit Ihrem bevorzugten Arbeitsbereich

Öffnen Sie [DSHREM](https://dsh.tvijo.com/), holen Sie sich die [VS-Code-Erweiterung und die Terminanweisungen](https://dsh.tvijo.com/download) oder lesen Sie [Einstellungen erklärt](https://dsh.tvijo.com/knowledge/settings-explained). Melden Sie sich über den unterstützten Konto-Ablauf des Dienstes an. Fügen Sie Provider-API-Schlüssel niemals in einen geteilten Prompt, ein öffentliches Issue oder ein Repository ein.

Die Node.js-CLI erfordert Node 22 oder neuer. Aus einem lokalen Checkout:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Der Befehl ist auch als `dshrem` verfügbar. Diese Remote-Chat-CLI zeigt vorgeschlagene Werkzeuge an, ohne sie auszuführen. Lokales Bearbeiten und Ausführen von Befehlen gehören zum VS-Code-Agent oder zu einer ausdrücklich konfigurierten Host-Laufzeit; sie haben eigene Berechtigungen. Siehe [CLI-Hilfe](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Verstehen Sie die Auswahlmöglichkeiten

**Belege zuerst** trennt gestützte Fakten von Annahmen. **Planen und prüfen** verlangt einen kurzen Plan und prüft das Ergebnis gegen den Auftrag. **Die Antwort überprüfen** stellt einen Entwurf infrage; das ist Selbstprüfung, sofern nicht ausdrücklich eine separate Prüfinstanz zugewiesen ist. Keine dieser Methoden garantiert Korrektheit oder einen geringeren Token-Verbrauch.

Aufgaben-Presets fügen wiederverwendbare Anweisungen und Checklisten hinzu. Sie erzeugen kein zusätzliches Modellgedächtnis. Eine größere Kontextsammlung muss weiterhin in die Anfragegrenzen des Dienstes und des Modells passen. Erweiterte Controller-, Python- und State-Pfade beziehen sich auf den gewählten Erweiterungs-Host; bei Remote SSH ist das der Remote-Server.

## Arbeiten Sie im Team, wenn es hilft

Ein AGENTROY-Team weist einem Koordinator, Implementierern und Prüfern unterschiedliche Verantwortlichkeiten zu. Host-Richtlinien können DSHREM ds41f sowie kontobasierte Codex- oder Claude-Werkzeuge anfordern, mit optionaler Architekturprüfung. Die Verfügbarkeit hängt von der installierten Laufzeit, dem Kontozugang und der gewählten Richtlinie ab. Ein fehlendes Abonnement darf nicht stillschweigend zu einem kostenpflichtigen API-Aufruf werden.

Drei bis sechs Rollen sind eine organisatorische Entscheidung, keine Qualitätsformel. Prüfer brauchen die exakte Artefaktversion und die Testbelege. Eine ernsthaft fehlgeschlagene Prüfung blockiert die Abnahme, auch wenn die Modelle übereinstimmen. Lesen Sie [Agent-Teams und sichtbare Kosten](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Setzen Sie fort, ohne Unsicherheit zu verbergen

Eine abgekoppelte serverseitige tmux-Sitzung kann weiterlaufen, nachdem ein Laptop oder Telefon die Verbindung getrennt hat. Arbeit auf einem ausgeschalteten lokalen Computer kann das nicht. Serverausfall, Speicherdruck und Datenverlust erfordern weiterhin eine Wiederherstellung. Verbinden Sie sich mit der gespeicherten Aufgaben-ID erneut und prüfen Sie deren letztes bestätigtes Ereignis, bevor Sie weitere Arbeit beginnen. Wiederholen Sie nicht blind eine kostenpflichtige Anfrage, deren Ausgang unbekannt ist. Siehe [Verbindungsabbrüche und Wiederherstellung](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Halten Sie Kosten und Daten sichtbar

Prüfen Sie das akzeptierte Angebot, das Aufgabenlimit, den reservierten Betrag und den Nutzungsbeleg. Ein Service-Aufschlag von 8% würde USD1.00 an Provider-Nutzung zu USD1.08 machen, bevor getrennt ausgewiesene Kosten hinzukommen; das ist ein Beispiel, kein Preisangebot. Abonnement-Kontingente, Provider-Kosten und Server-Ressourcen sind unterschiedliche Grenzen. Zusätzliches Budget erfordert eine ausdrückliche Entscheidung.

Lokale CLI-Anmeldedateien verwenden Berechtigungen nur für den Eigentümer. Diese Berechtigungen sind weder Verschlüsselung noch Backup. Das Hochladen von Wissen ist ausdrücklich; private Dateien sollten niemals in einen öffentlichen Übergabe-Link gelangen. [Prompt-Übergaben](https://dsh.tvijo.com/knowledge/prompt-handoffs) erklären, wie eine geprüfte Aufgabe in ein anderes Werkzeug kopiert wird.

Das Paket dieses Repositories ist derzeit als `UNLICENSED` gekennzeichnet; eine Veröffentlichung gewährt keine Wiederverwendungsrechte. Konsultieren Sie die aktuellen Paket-Metadaten und den Lizenzhinweis, bevor Sie Inhalte weitergeben. Übersetzungen sind einführende Anleitungen, mit DSHREM erzeugt und auf strukturelle Konsistenz geprüft; bei technischen Abweichungen ist Englisch maßgeblich.
