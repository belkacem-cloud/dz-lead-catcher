FROM node:20-bullseye
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production
COPY . .
# سنستخدم Chromium المضمّن مع Puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=false
CMD ["node","server.js"]
