import { Actor } from 'apify';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const text = input.text || 'SIN TEXTO';

// Validación
if (!videoUrl || !audioUrl) {
    throw new Error('Faltan videoUrl o audioUrl');
}

// Escapar texto para ffmpeg (MUY IMPORTANTE)
function escapeText(t) {
    return t
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\\\'")
        .replace(/,/g, '\\,');
}

// Descargar archivo
function download(url, path) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path);

        https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {

            console.log('STATUS:', res.statusCode);

            if (![200, 206].includes(res.statusCode)) {
                reject(new Error('Status: ' + res.statusCode));
                return;
            }

            res.pipe(file);

            file.on('finish', () => {
                file.close(resolve);
            });

        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('Descargando video...');
        await download(videoUrl, 'video.mp4');

        console.log('Descargando audio...');
        await download(audioUrl, 'audio.mp3');

        console.log('Procesando con subtítulos...');

        const safeText = escapeText(text);

        const command = `ffmpeg -y -i video.mp4 -i audio.mp3 \
-vf "drawtext=fontfile=/usr/share/fonts/TTF/DejaVuSans.ttf:text='${safeText}':x=(w-text_w)/2:y=h-100:fontsize=40:fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.4" \
-shortest output.mp4`;

        execSync(command, { stdio: 'inherit' });

        console.log('✅ VIDEO CON TEXTO LISTO');

        await Actor.pushData({
            videoUrl,
            audioUrl,
            text,
            output: 'output.mp4'
        });

    } catch (err) {
        console.error('❌ ERROR:', err);
    }
})();
