#!/usr/bin/env bash
# =============================================================================
# Sheet Music Web — Installationsscript für Ubuntu 24.04 LTS
# =============================================================================
# Führe dieses Script als root auf einem frischen Server aus:
#   git clone https://github.com/ccode221908/sheet-music-web.git /opt/sheet-music-web
#   cd /opt/sheet-music-web
#   bash install.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR=/opt/sheet-music-web
AUDIVERIS_DIR=/opt/audiveris
TESSDATA_DIR=/root/.config/AudiverisLtd/audiveris/tessdata
WEB_ROOT=/var/www/sheet-music-web

# Audiveris 5.10.2 — .deb fuer Ubuntu 24.04
AUDIVERIS_DEB_URL="https://github.com/Audiveris/audiveris/releases/download/5.10.2/Audiveris-5.10.2-ubuntu24.04-x86_64.deb"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}==>${NC} $*"; }
warn()    { echo -e "${YELLOW}WARN:${NC} $*"; }
die()     { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Dieses Script muss als root ausgeführt werden."

# -----------------------------------------------------------------------------
# 1. Systempakete
# -----------------------------------------------------------------------------
info "Installiere Systempakete..."
apt-get update -qq
apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    musescore3 \
    xvfb \
    ghostscript \
    python3.12 \
    python3.12-venv \
    python3-pip \
    curl \
    unzip \
    tesseract-ocr-eng \
    tesseract-ocr-deu

# Node.js 20 LTS via NodeSource (Ubuntu-Repo liefert nur v18, zu alt fuer Vite).
# Ubuntu-npm kollidiert mit NodeSource-nodejs (der npm eingebaut hat) —
# deshalb zuerst alle alten Node-Pakete inkl. ihrer dpkg-State-Eintraege entfernen.
if ! node --version 2>/dev/null | grep -qE '^v(20|22|23|24)'; then
    info "Installiere Node.js 20 LTS (NodeSource)..."
    dpkg --force-all --purge npm nodejs 2>/dev/null || true
    apt-get install -f -y 2>/dev/null || true
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# nginx + certbot nur installieren wenn eine Domain angegeben wird
if [[ -n "${1:-}" ]]; then
    apt-get install -y --no-install-recommends nginx certbot python3-certbot-nginx
fi

# -----------------------------------------------------------------------------
# 2. Audiveris installieren (via .deb)
# -----------------------------------------------------------------------------
if [[ ! -f "$AUDIVERIS_DIR/bin/Audiveris" ]]; then
    info "Lade Audiveris 5.10.2 herunter (.deb fuer Ubuntu 24.04)..."

    # Das post-install script ruft xdg-desktop-menu auf, das in Containern/
    # headless-Servern fehlt und exit 3 zurueckgibt — dpkg bricht dann ab.
    # Loesung: Dummy-Wrapper anlegen, der einfach erfolgreich endet.
    if ! command -v xdg-desktop-menu &>/dev/null; then
        echo '#!/bin/sh' > /usr/local/bin/xdg-desktop-menu
        chmod +x /usr/local/bin/xdg-desktop-menu
        info "  Dummy xdg-desktop-menu angelegt (headless Container)"
    fi

    DEB_TMP=$(mktemp /tmp/audiveris-XXXXXX.deb)
    curl -L -o "$DEB_TMP" "$AUDIVERIS_DEB_URL"
    dpkg -i "$DEB_TMP"
    rm -f "$DEB_TMP"
    # Das .deb installiert nach /opt/audiveris
    [[ -f "$AUDIVERIS_DIR/bin/Audiveris" ]] || die "Audiveris-Installation fehlgeschlagen. Pfad: $AUDIVERIS_DIR/bin/Audiveris"
    info "Audiveris installiert: $AUDIVERIS_DIR"
else
    info "Audiveris bereits vorhanden, ueberspringe."
fi

# -----------------------------------------------------------------------------
# 3. Tesseract-Sprachdaten (Legacy-Modus für Audiveris)
# -----------------------------------------------------------------------------
info "Installiere Tesseract-Sprachdaten (Legacy-Format)..."
mkdir -p "$TESSDATA_DIR"
for LANG in eng deu; do
    if [[ ! -f "$TESSDATA_DIR/${LANG}.traineddata" ]] || \
       [[ $(stat -c%s "$TESSDATA_DIR/${LANG}.traineddata" 2>/dev/null || echo 0) -lt 5000000 ]]; then
        info "  Lade ${LANG}.traineddata..."
        curl -L -o "$TESSDATA_DIR/${LANG}.traineddata" \
            "https://github.com/tesseract-ocr/tessdata/raw/main/${LANG}.traineddata"
    else
        info "  ${LANG}.traineddata bereits vorhanden."
    fi
done
# osd.traineddata von apt-Paket übernehmen falls vorhanden
OSD_APT=$(find /usr/share/tesseract-ocr -name "osd.traineddata" 2>/dev/null | head -1)
[[ -n "$OSD_APT" ]] && cp "$OSD_APT" "$TESSDATA_DIR/"

# -----------------------------------------------------------------------------
# 4. App-Verzeichnis einrichten
# -----------------------------------------------------------------------------
if [[ "$REPO_DIR" != "$APP_DIR" ]]; then
    info "Kopiere Repository nach $APP_DIR..."
    rsync -a --exclude=venv --exclude=data --exclude=node_modules --exclude=dist \
        "$REPO_DIR/" "$APP_DIR/"
fi

mkdir -p "$APP_DIR/data"

# -----------------------------------------------------------------------------
# 5. Backend: Python-Virtualenv und Abhängigkeiten
# -----------------------------------------------------------------------------
info "Richte Python-Virtualenv ein..."
python3.12 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip -q
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt" -q
info "Python-Abhängigkeiten installiert."

# Backend .env anlegen (nur wenn noch nicht vorhanden)
if [[ ! -f "$APP_DIR/backend/.env" ]]; then
    cp "$APP_DIR/deploy/backend.env.example" "$APP_DIR/backend/.env"
    sed -i "s|/opt/sheet-music-web/data|$APP_DIR/data|g" "$APP_DIR/backend/.env"
    info "Backend .env angelegt: $APP_DIR/backend/.env"
else
    info "Backend .env bereits vorhanden, überspringe."
fi

# -----------------------------------------------------------------------------
# 6. Frontend bauen
# -----------------------------------------------------------------------------
info "Baue Frontend..."
cd "$APP_DIR/frontend"
npm ci --silent
npm run build
mkdir -p "$WEB_ROOT"
rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
chown -R www-data:www-data "$WEB_ROOT"
info "Frontend deployt nach $WEB_ROOT."

# -----------------------------------------------------------------------------
# 7. systemd-Services einrichten
# -----------------------------------------------------------------------------
info "Installiere systemd-Services..."
cp "$APP_DIR/deploy/sheet-music-xvfb.service"    /etc/systemd/system/
cp "$APP_DIR/deploy/sheet-music-backend.service" /etc/systemd/system/
# Pfad im Backend-Service auf APP_DIR anpassen
sed -i "s|/opt/sheet-music-web|$APP_DIR|g" /etc/systemd/system/sheet-music-backend.service

systemctl daemon-reload
systemctl enable sheet-music-xvfb sheet-music-backend
systemctl restart sheet-music-xvfb
sleep 2
systemctl restart sheet-music-backend
info "Services gestartet."

# -----------------------------------------------------------------------------
# 8. nginx einrichten
# -----------------------------------------------------------------------------
DOMAIN=""
if [[ -n "${1:-}" ]]; then
    DOMAIN="$1"
    info "Richte nginx für Domain $DOMAIN ein..."
    cp "$APP_DIR/deploy/nginx.conf" "/etc/nginx/sites-available/$DOMAIN"
    sed -i "s/DEINE_DOMAIN/$DOMAIN/g" "/etc/nginx/sites-available/$DOMAIN"
    ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
    info "nginx konfiguriert."

    read -rp "SSL-Zertifikat mit Let's Encrypt einrichten? (j/N) " SETUP_SSL
    if [[ "${SETUP_SSL,,}" == "j" ]]; then
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN"
    fi
else
    warn "Kein Domain-Argument übergeben — nginx manuell konfigurieren."
    warn "Vorlage: $APP_DIR/deploy/nginx.conf"
    warn "Aufruf mit Domain: bash install.sh meine-domain.de"
fi

# -----------------------------------------------------------------------------
# Fertig
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} Installation abgeschlossen!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Status prüfen:"
echo "  systemctl status sheet-music-xvfb sheet-music-backend"
echo ""
echo "Logs ansehen:"
echo "  journalctl -u sheet-music-backend -f"
echo ""
if [[ -n "$DOMAIN" ]]; then
    echo "App erreichbar unter: https://$DOMAIN"
else
    echo "App erreichbar unter: http://SERVER-IP (nach nginx-Konfiguration)"
fi
echo ""
echo "Hinweis: Für OCR-Texterkennung (Liedtexte) die Option"
echo "'Liedtexte erkennen (OCR)' beim Upload aktivieren."
echo ""
