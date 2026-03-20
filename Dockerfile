# ---- Build stage ----
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    COPY package*.json ./
    RUN npm install --no-audit --no-fund --loglevel=error
    
    COPY . .
    
    RUN npm run build
    
    # ---- Runtime stage ----
    FROM node:20-alpine
    WORKDIR /app
    
    ENV NODE_ENV=production
    
    COPY --from=builder /app ./
    
    EXPOSE 3000
    
    CMD ["npm", "start"]