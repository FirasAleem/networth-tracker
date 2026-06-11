# ---- Build stage: compile the React frontend ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime stage: only what's needed to serve ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=2307
ENV DB_PATH=/app/data/networth.db

# Install only production dependencies (express, cors, multer, sql.js)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy the built frontend, server code and seed CSVs
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY seed ./seed

EXPOSE 2307
CMD ["node", "server/index.js"]
