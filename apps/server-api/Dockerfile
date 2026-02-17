FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies needed for build)
RUN npm install

COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production

RUN apk add --no-cache openssl dumb-init

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nvremote \
 && adduser --system --uid 1001 --ingroup nvremote api

COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/

# Install production dependencies only
RUN npm install --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist/

# Startup script: run migrations then start the app
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Own the workdir to the non-root user
RUN chown -R api:nvremote /app

USER api

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/v1/health || exit 1

# Use dumb-init to properly handle PID 1 and signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["/app/start.sh"]
