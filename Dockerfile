FROM apify/actor-node:18

USER root

# ✅ ffmpeg + fuentes + fontconfig
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu

# Copiar archivos
COPY . ./

# Permisos
RUN chown -R myuser:myuser /usr/src/app

# Instalar deps
RUN npm install

# Usuario seguro
USER myuser

CMD ["node", "src/main.js"]
