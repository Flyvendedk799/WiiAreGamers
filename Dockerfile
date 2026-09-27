FROM debian:12

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies: Node.js, Dolphin, Xvfb, FFmpeg
RUN apt-get update && apt-get install -y \
    curl \
    xvfb \
    ffmpeg \
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

# Copy backend source
COPY . .

# Download a tiny Homebrew game as a placeholder so Dolphin has something to boot immediately
RUN curl -L -o /app/game.dol https://github.com/devkitPro/wii-examples/raw/master/graphics/gx/nehe/lesson1/lesson1.dol

# Ensure ROMs and Save directories exist
RUN mkdir -p /root/.survhub/service-data/dolphin/roms
RUN mkdir -p /root/.survhub/service-data/dolphin/saves
RUN mkdir -p /root/.config/dolphin-emu

# Copy Dolphin config
COPY WiimoteNew.ini /root/.config/dolphin-emu/WiimoteNew.ini

EXPOSE 8080
# Expose DSU UDP Port for iOS App
EXPOSE 26760/udp

# Start the Node.js orchestrator
CMD ["node", "server.js"]
