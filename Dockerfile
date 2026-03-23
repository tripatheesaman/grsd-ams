# ---- Build stage ----
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # Install dependencies
    COPY package*.json ./
    RUN npm install --no-audit --no-fund --loglevel=error
    
    # Copy source code
    COPY . .
    
    # Generate Prisma client
    RUN npm run prisma:generate
    
    # Build Next.js standalone output
    RUN npm run build
    
    # ---- Runtime stage ----
    FROM node:20-alpine
    WORKDIR /app
    
    ENV NODE_ENV=production
    

    COPY --from=builder /app/.next/standalone ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/package.json ./package.json
    EXPOSE 3000
    
    CMD ["node", "server.js"]