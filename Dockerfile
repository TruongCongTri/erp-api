# ==========================================
# STAGE 1: BUILDER
# ==========================================
# Use Alpine Linux for a minimal footprint
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the application code
COPY . .

# Compile the NestJS application from TypeScript to JavaScript
RUN npm run build

# ==========================================
# STAGE 2: PRODUCTION DEPENDENCIES
# ==========================================
FROM node:20-alpine AS deps

WORKDIR /usr/src/app

COPY package*.json ./

# Install ONLY production dependencies to keep the image lightweight
RUN npm ci --omit=dev

# ==========================================
# STAGE 3: PRODUCTION RUNTIME
# ==========================================
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Enforce production environment optimizations across Node.js
ENV NODE_ENV=production

# Security: Switch from root to the unprivileged 'node' user provided by the image
USER node

# Copy only the compiled artifacts and production dependencies
# The --chown flag ensures the node user has correct permissions
COPY --chown=node:node --from=deps /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/dist ./dist
COPY --chown=node:node package.json ./

# Expose the standard NestJS port
EXPOSE 3000

# Start the application using raw Node.js (bypassing npm for faster startup and better signal handling)
CMD ["node", "dist/main.js"]