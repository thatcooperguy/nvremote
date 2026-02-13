FROM node:20-alpine AS builder

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

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma/

# Install production dependencies only
RUN npm install --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist/

EXPOSE 8080

CMD ["node", "dist/main.js"]
