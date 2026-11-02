FROM node:24-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# Test image: all dependencies + tests. Used by `docker compose --profile test`.
FROM base AS test
RUN npm ci
COPY . .
CMD ["npm", "test"]

# Production image: runtime dependencies only, runs as non-root user.
FROM base AS production
ENV NODE_ENV=production
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
