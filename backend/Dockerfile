FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    openjdk-17-jre-headless \
    wget \
    xvfb \
    musescore3 \
    libsndfile1 \
    python3.12 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Audiveris
RUN wget -q https://github.com/Audiveris/audiveris/releases/download/5.10.2/Audiveris-5.10.2-ubuntu24.04-x86_64.deb -O /tmp/audiveris.deb \
    && dpkg -i /tmp/audiveris.deb || true \
    && rm /tmp/audiveris.deb

# Install Python dependencies
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --break-system-packages -r requirements.txt

# Copy application code
COPY . .

# Environment variables
ENV MUSESCORE_BIN=musescore3
ENV DATA_DIR=/data
ENV XVFB_DISPLAY=:99

EXPOSE 8000

CMD Xvfb :99 -screen 0 1024x768x24 & sleep 1 && cd /app && uvicorn app.main:app --host 0.0.0.0 --port 8000
