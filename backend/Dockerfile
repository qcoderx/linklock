FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

RUN mkdir -p data uploads

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/index.js"]
