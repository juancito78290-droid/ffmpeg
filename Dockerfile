FROM apify/actor-node:18

USER root

# ✅ Instalar ffmpeg correctamente en Alpine
RUN apk add --no-cache ffmpeg

USER myuser

COPY . ./

RUN npm install

CMD ["node", "src/main.js"]
