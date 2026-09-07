FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY lib ./lib
COPY index.html public/
RUN mkdir -p /app/data && chown node:node /app/data

EXPOSE 3000

USER node

CMD ["node", "server.js"]
