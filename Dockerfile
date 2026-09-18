# ==========================================
# STAGE 1: BUILDER
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
# Use npm install instead of npm ci to resolve tree mismatches dynamically
RUN npm install

COPY . .
RUN npm run build

# ==========================================
# STAGE 2: PRODUCTION DEPENDENCIES
# ==========================================
FROM node:22-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

# ==========================================
# STAGE 3: PRODUCTION RUNTIME
# ==========================================
FROM node:22-alpine AS production

WORKDIR /usr/src/app

ENV NODE_ENV=production

# (Optional) If your app uses Puppeteer for PDF/export generation on Alpine:
# RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

USER node

# Copy production dependencies and build output
COPY --chown=node:node --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node package.json ./

# CRITICAL FOR TSCONFIG-PATHS:
# tsconfig-paths/register reads tsconfig.json at runtime to map your path aliases
COPY --chown=node:node tsconfig.json ./

EXPOSE 3000

CMD ["node", "dist/main.js"]