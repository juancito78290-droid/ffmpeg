FROM apify/actor-node:18

USER root
RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app

COPY . ./

RUN npm install

USER myuser

CMD ["node", "src/main.js"]