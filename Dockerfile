# صورة فيها كل تبعيات Chromium جاهزة
FROM ghcr.io/puppeteer/puppeteer:22.12.1
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production
COPY . .
ENV PUPPETEER_SKIP_DOWNLOAD=true
CMD ["node","server.js"]   # وضع HTTP
