# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5006
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 5006
CMD ["node", "index.js"]
