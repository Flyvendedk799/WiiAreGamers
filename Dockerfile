FROM debian:12

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies: Node.js, Dolphin, Xvfb, FFmpeg
RUN apt-get update && apt-get install -y \
    curl \
    xvfb \
    fluxbox \
    ffmpeg \
    xdotool \
    python3 \
    python3-xlib \
    dolphin-emu \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Setup working directory
WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm install

# Install and build frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Download Wii Sports as the default game for the emulator
RUN curl -L -o /app/game.wbfs "https://archive.org/download/wii-sports-usa-rev-1/Wii%20Sports%20%28USA%29%20%28Rev%201%29.wbfs"

# Copy backend source
COPY . .

# Ensure ROMs and Save directories exist
RUN mkdir -p /root/.survhub/service-data/dolphin/roms
RUN mkdir -p /root/.survhub/service-data/dolphin/saves
RUN mkdir -p /root/.config/dolphin-emu

RUN echo "[Core]\nAudioBackend = Null\nEnableAlternateInputSources = True\n[Wii]\nWidescreen = True\n" > /root/.config/dolphin-emu/Dolphin.ini
RUN echo "[Settings]\nAspectRatio = 1\nFullscreen = True\n" > /root/.config/dolphin-emu/GFX.ini
RUN echo "[Server]\nEnabled = True\nEntries = DSU:127.0.0.1:26760;\n" > /root/.config/dolphin-emu/DSUClient.ini && cp /root/.config/dolphin-emu/DSUClient.ini /root/.config/dolphin-emu/DualShockUDPClient.ini
COPY WiimoteNew.ini /root/.config/dolphin-emu/WiimoteNew.ini

EXPOSE 8080
# Expose DSU UDP Port for iOS App
EXPOSE 26760/udp

# Start the Node.js orchestrator
CMD ["node", "server.js"]
