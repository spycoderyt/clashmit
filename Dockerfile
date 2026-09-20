FROM node:22-alpine
RUN apk add --no-cache python3 py3-pip ffmpeg && python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir yt-dlp==2026.8.19
ENV YT_DLP_PATH=/opt/ytdlp/bin/yt-dlp FFMPEG_PATH=/usr/bin/ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY dist ./dist
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["node","server/index.js"]
