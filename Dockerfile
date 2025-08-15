FROM ghcr.io/puppeteer/puppeteer:22.12.1
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --only=production
COPY . .
# أهم سطرين: ملكية المجلد للمستخدم pptruser ثم شغّل به
RUN chown -R pptruser:pptruser /app
USER pptruser
ENV PUPPETEER_SKIP_DOWNLOAD=true
CMD ["node","server.js"]
