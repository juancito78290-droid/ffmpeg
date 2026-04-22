FROM apify/actor-node:18

USER root

# Instalar ffmpeg
RUN apk add --no-cache ffmpeg

# Copiar archivos
COPY . ./

# Dar permisos correctos
RUN chown -R myuser:myuser /usr/src/app

# Instalar dependencias como root
RUN npm install

# Volver a usuario seguro
USER myuser

CMD ["node", "src/main.js"]
