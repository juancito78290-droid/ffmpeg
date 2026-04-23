FROM apify/actor-node:18

USER root

RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu

COPY . ./
RUN npm install

USER myuser

CMD ["node", "src/main.js"]
