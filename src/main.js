import { Actor } from 'apify';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const text = input.text || 'TEST';

if (!videoUrl || !audioUrl) {
    throw new Error('Faltan videoUrl o audioUrl');
}

// Descargar archivos
function download(url, path) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path);

        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {

            if (![200, 206].includes(res.statusCode)) {
                reject(new Error('Status: ' + res.statusCode));
                return;
            }

            res.pipe(file);

            file.on('finish', () => file.close(resolve));

        }).on('error', reject);
    });
}

// Crear subtítulo ASS (NO usa fuentes del sistema)
function createASS(text) {
    const content = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment
Style: Default,Arial,40,&H00FFFFFF,&H00000000,1,2,0,2

[Events]
Format: Start, End, Style, Text
Dialogue: 0:00:00.00,0:00:10.00,Default,${text}
`;

    fs.writeFileSync('subs.ass', content);
}

(async () => {
    try {
        console.log('Descargando video...');
        await download(videoUrl, 'video.mp4');

        console.log('Descargando audio...');
        await download(audioUrl, 'audio.mp3');

        console.log('Creando subtítulos...');
        createASS(text);

        console.log('Procesando video...');

        const command = `ffmpeg -y -i video.mp4 -i audio.mp3 \
-vf "ass=subs.ass" \
-map 0:v -map 1:a \
-c:v libx264 -c:a aac -shortest output.mp4`;

        execSync(command, { stdio: 'inherit' });

        console.log('Subiendo video...');

        const store = await Actor.openKeyValueStore();

        await store.setValue('OUTPUT_VIDEO', fs.createReadStream('output.mp4'), {
            contentType: 'video/mp4'
        });

        const url = `https://api.apify.com/v2/key-value-stores/${store.id}/records/OUTPUT_VIDEO`;

        console.log('🎥 VIDEO URL:', url);

        await Actor.pushData({ url });

        await Actor.exit();

    } catch (err) {
        console.error('❌ ERROR:', err);
        await Actor.exit();
    }
})();
