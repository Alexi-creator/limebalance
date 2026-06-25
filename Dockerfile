# ============================================
# Stage 1: Builder
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

# ============================================
# Stage 2: Development
# ============================================
FROM node:22-alpine AS development

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci && npx prisma generate

COPY . .

CMD ["npm", "run", "start:dev"]

# ============================================
# Stage 3: Production
# ============================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
