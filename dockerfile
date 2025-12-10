# Dockerfile (this is the industry standard in 2025)
FROM node:24-alpine AS builder
WORKDIR /app

# Copy only package files first (best layer caching)
COPY package*.json ./
# Install ALL dependencies (including devDependencies) because we need them for building
RUN npm ci                     # npm ci = clean exact install (better than npm install)

# Copy source code and build (if you have TypeScript, vite, etc.)
COPY . .
# RUN npm run build              # if you have "build" script (tsc, etc.)
# Optional: run tests in CI, not here

# ───────────────────────────────
# Second stage → Production image (super small!)
FROM node:24-alpine AS production
WORKDIR /app

# Copy only the things needed to RUN the app
COPY package*.json ./
# Install ONLY production dependencies
RUN npm ci --only=production   # This removes all devDependencies automatically!

# Copy built code from builder stage
# COPY --from=builder /app/dist ./dist        # if you have build step
# COPY --from=builder /app/node_modules ./node_modules  # already has only prod deps
# Or if no build step (pure JS):
COPY . .

EXPOSE 3000
CMD ["node", "src/index.js"]