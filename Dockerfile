FROM node:22.12-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npm ci

FROM node:22.12-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22.12-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
RUN mkdir -p uploads && chown -R nextjs:nodejs uploads
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
