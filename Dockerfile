FROM node:18-bullseye-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "src/main.js"]
