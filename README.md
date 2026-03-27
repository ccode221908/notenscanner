# Sheet Music Web App

Eine Webanwendung zur automatischen Erkennung und Aufbereitung von Notenscans. Lade ein Bild oder PDF mit handgeschriebenen oder gedruckten Noten hoch – die App erkennt die Noten automatisch, setzt sie neu und ermöglicht das Abspielen einzelner Stimmen sowie den Export als MIDI.

**Live-Demo:** [https://notes.m8u.de](https://notes.m8u.de)

---

## Features

- **Upload** von Notenscans als PNG, JPG, TIFF oder PDF
- **Automatische Notenerkennung (OMR)** via [Audiveris 5.10](https://github.com/Audiveris/audiveris)
- **Neu-Satz** und Export via [MuseScore 3](https://musescore.org)
- **MusicXML-Anzeige** direkt im Browser via [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/)
- **MIDI-Wiedergabe** einzelner Stimmen oder des gesamten Satzes
- **Download** von MIDI-Dateien pro Stimme sowie des neu gesetzten PDFs

---

## Screenshot

```
┌─────────────────────────────────────┐
│  Sheet Music Scanner                │
│  ┌─────────────────────────────┐    │
│  │  Datei hierher ziehen oder  │    │
│  │  zum Auswählen klicken      │    │
│  └─────────────────────────────┘    │
│                                     │
│  Hochgeladene Partituren:           │
│  • Sonate_op13.pdf   ✓ Bereit       │
│  • Menuett.png       ⟳ Verarbeitung │
└─────────────────────────────────────┘
```

---

## Verwendung der Web-App

### 1. Datei hochladen

Öffne [https://notes.m8u.de](https://notes.m8u.de) im Browser. Auf der Startseite kannst du:
- Eine Datei per **Drag & Drop** in die Upload-Zone ziehen
- Oder auf die Zone **klicken** und eine Datei auswählen

Unterstützte Formate: `.png`, `.jpg`, `.jpeg`, `.tiff`, `.pdf`

### 2. Verarbeitung abwarten

Nach dem Upload startet die automatische Verarbeitung in drei Schritten:

| Schritt | Beschreibung |
|---------|-------------|
| `processing` | Datei wird verarbeitet |
| `omr_done` | Notenerkennung abgeschlossen (MusicXML erstellt) |
| `ready` | Neu-Satz und MIDI-Export fertig |

Der Status wird **live** aktualisiert – kein manuelles Neuladen nötig.

### 3. Partitur ansehen und abspielen

Sobald der Status `ready` zeigt, öffnet sich die Detailansicht automatisch mit:

- **Notenansicht:** Die erkannte Partitur wird als interaktive Notation im Browser gerendert
- **Wiedergabe:** Mit dem Play-Button die gesamte Partitur oder einzelne Stimmen abspielen
- **Stimmenwahl:** Im Dropdown eine bestimmte Stimme (z. B. Violine, Klavier rechts) auswählen

### 4. Dateien herunterladen

Unter der Wiedergabe-Leiste stehen Download-Links bereit:

- **MIDI (aktuelle Stimme):** MIDI-Datei der gewählten Stimme
- **PDF:** Neu gesetztes PDF der Partitur

---

## Technischer Überblick

```
Upload (PNG/JPG/TIFF/PDF)
         │
         ▼
   Audiveris CLI          ← Java-basierte OMR-Engine
         │ MusicXML
         ▼
   MuseScore 3 CLI        ← Neu-Satz, MIDI-Export
         │
   ┌─────┴──────────────┐
   │                    │
  PDF            MIDI pro Stimme
   │                    │
   └──────┬─────────────┘
          │
   FastAPI Backend        ← REST-API + SQLite
          │
   React + Vite Frontend
          │
   ┌──────┴──────────────┐
   │                     │
OpenSheetMusicDisplay   html-midi-player
(Notenansicht)          (MIDI-Wiedergabe)
```

### Stack

| Schicht | Technologie |
|---------|------------|
| OMR | Audiveris 5.10.2 |
| Notation | MuseScore 3 + Xvfb |
| Backend | Python 3.12 + FastAPI + SQLModel |
| Datenbank | SQLite |
| Frontend | React 18 + TypeScript + Vite |
| Notenansicht | OpenSheetMusicDisplay 1.9.x |
| MIDI-Wiedergabe | html-midi-player (Tone.js) |
| Container | Docker + Docker Compose |
| Reverse Proxy | nginx + Let's Encrypt |

---

## Lokale Installation

### Voraussetzungen

- Docker und Docker Compose
- Git

### Schnellstart

```bash
git clone https://github.com/ccode221908/sheet-music-web.git
cd sheet-music-web
docker compose up --build
```

Die App ist dann erreichbar unter:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API-Dokumentation:** http://localhost:8000/docs

Beim ersten Start wird das Docker-Image gebaut (ca. 5–10 Minuten, da Audiveris und MuseScore heruntergeladen werden).

### Produktions-Deployment mit HTTPS

```bash
# 1. Repository klonen
git clone https://github.com/ccode221908/sheet-music-web.git
cd sheet-music-web

# 2. Container starten
docker compose up -d --build

# 3. nginx installieren und konfigurieren
apt install nginx certbot python3-certbot-nginx

# 4. nginx-Config für deine Domain anlegen (Beispiel):
cat > /etc/nginx/sites-available/deine-domain.de << 'EOF'
server {
    listen 80;
    server_name deine-domain.de;
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 310s;
    }
}
EOF

ln -s /etc/nginx/sites-available/deine-domain.de /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 5. SSL-Zertifikat
certbot --nginx -d deine-domain.de
```

---

## API-Referenz

Die vollständige interaktive API-Dokumentation ist unter `/docs` verfügbar (Swagger UI).

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `POST` | `/api/scores` | Datei hochladen, gibt `{id, status}` zurück |
| `GET` | `/api/scores` | Alle Partituren auflisten |
| `GET` | `/api/scores/{id}` | Partitur-Metadaten + Stimmenliste |
| `GET` | `/api/scores/{id}/status` | Verarbeitungsstatus (SSE-Stream) |
| `GET` | `/api/scores/{id}/musicxml` | MusicXML-Datei für Notenansicht |
| `GET` | `/api/scores/{id}/pdf` | Neu gesetztes PDF herunterladen |
| `GET` | `/api/scores/{id}/midi` | Gesamtes MIDI herunterladen |
| `GET` | `/api/scores/{id}/parts/{name}/midi` | MIDI einer einzelnen Stimme |

---

## Projektstruktur

```
sheet-music-web/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI App, DB-Init
│   │   ├── models.py            # SQLModel-Tabellen (Score, Part)
│   │   ├── config.py            # Konfiguration via Umgebungsvariablen
│   │   ├── api/routes/
│   │   │   ├── scores.py        # Upload, Liste, Verarbeitungs-Pipeline
│   │   │   └── files.py         # Datei-Endpoints (XML, PDF, MIDI, SSE)
│   │   └── services/
│   │       ├── audiveris.py     # Audiveris CLI-Wrapper
│   │       ├── musescore.py     # MuseScore CLI-Wrapper
│   │       ├── xml_parser.py    # MusicXML-Parser (Stimmen extrahieren)
│   │       └── storage.py       # Verzeichnis-Verwaltung
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadZone.tsx   # Drag & Drop Upload
│   │   │   ├── ScoreList.tsx    # Übersicht aller Partituren
│   │   │   ├── ScoreViewer.tsx  # OSMD Notenansicht
│   │   │   └── PartPlayer.tsx   # MIDI-Player mit Stimmenwahl
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   └── Score.tsx        # Detailseite mit SSE-Status
│   │   └── api.ts               # Axios API-Client
│   ├── nginx.conf               # nginx für SPA + API-Proxy
│   └── Dockerfile
├── docker-compose.yml
└── .gitignore
```

---

## Hinweise zur Erkennungsqualität

Die Qualität der automatischen Notenerkennung hängt stark von der Qualität des Scans ab:

- **Gut geeignet:** Klare Schwarz-Weiß-Scans gedruckter Noten, mindestens 300 DPI
- **Eingeschränkt:** Handgeschriebene Noten, stark verzerrte oder rauscharme Scans
- **Nicht geeignet:** Fotos mit starken Schatten oder Perspektivverzerrung

Die MusicXML-Ausgabe von Audiveris kann manuell in MuseScore nachbearbeitet werden.

---

## Lizenz

MIT
