FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies: Node.js, Dolphin, Xvfb, FFmpeg
RUN apt-get update && apt-get install -y \
    curl \
    software-properties-common \
    xvfb \
    ffmpeg \
    && add-apt-repository ppa:dolphin-emu/ppa -y \
    && apt-get update \
    && apt-get install -y dolphin-emu \
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
