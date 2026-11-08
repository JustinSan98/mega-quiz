# Mega Quiz – Quelldateien

Die fertige App (`index.html` im Hauptordner) wird aus diesen Dateien gebaut.

- `fragen.txt`, `neu.txt` – alle Fragen. Format: `Kategorie|Typ|Frage|Antwort|Einheit` (Typ `n` = Zahl, `w` = Wort mit Varianten per `;`, `s` = Größenvergleich)
- `bilder.py` – Frage → Wikipedia-Artikel für das Antwortbild
- `shapes.js` – Silhouetten für die Größenvergleiche
- `online.js` – Online-Modus (Lobby, Firebase)
- `template.html` – Layout, Design und Spiellogik
- `firebase.json` – Firebase-Konfiguration

Bauen: `./setup.sh` (einmalig), dann `python3 build.py`.
