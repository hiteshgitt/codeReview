FROM node:20-alpine

# git is required by the code-quality service for repo cloning
RUN apk add --no-cache git ca-certificates openssl

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 8080

CMD ["node", "dist/server.js"]
