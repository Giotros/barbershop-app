FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV PORT=3000 DB_PATH=/data/barbershop.db
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
