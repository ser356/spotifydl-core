FROM node:20-bookworm-slim

# Install ffmpeg for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
  ffmpeg \
  ca-certificates \
  wget \
  curl \
  python3 \
  youtube-dl \
  yt-dlp \
  && rm -rf /var/lib/apt/lists/*
## Fetch static yt-dlp Linux binary (no runtime deps)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp_linux \
  && chmod a+rx /usr/local/bin/yt-dlp_linux
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build && npm prune --production

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server.js"]