FROM node:20-bookworm-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  ca-certificates \
  curl \
  python3 \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build
RUN npm run build && npm prune --production

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
