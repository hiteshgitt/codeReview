FROM node:20-slim

# git is required by the code-quality service for repo cloning
# Playwright/Chromium deps are installed via playwright install --with-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Chromium and its OS dependencies for Playwright
RUN npx playwright install chromium --with-deps

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/server.js"]
