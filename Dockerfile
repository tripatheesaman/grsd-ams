# ---- Build stage ----
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    COPY package*.json ./
    RUN npm install --no-audit --no-fund --loglevel=error
    
    COPY . .
    
    # Ensure Prisma client is generated during the image build.
    # This avoids "Can't resolve '@/generated/prisma/client'" when `src/generated` isn't present in the build context.
    RUN npm run prisma:generate
    
    RUN npm run build
    
    # ---- Runtime stage ----
    FROM node:20-alpine
    WORKDIR /app
    
    ENV NODE_ENV=production
    
    COPY --from=builder /app ./
    # Next's `output: "standalone"` serves static assets from:
    #   .next/standalone/.next/static
    # Copy them there explicitly, otherwise `_next/static/*` returns 404.
    COPY --from=builder /app/.next/static ./.next/standalone/.next/static
    
    EXPOSE 3000
    CMD ["node", ".next/standalone/server.js"]