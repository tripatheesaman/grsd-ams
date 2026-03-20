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
    
    EXPOSE 3000
    CMD ["node", ".next/standalone/server.js"]