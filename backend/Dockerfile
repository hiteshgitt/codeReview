FROM node:20-alpine

# Install Chromium for Lighthouse (Alpine repos, much lighter than Google Chrome .deb)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont openssl

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/server.js"]
