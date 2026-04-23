import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

await Actor.init();

// 1. Leer input correctamente
const input = await Actor.getInput();

if (!input || !input.video_url || !input.audio_url || !input.subtitles) {
    throw new Error('Faltan datos en el input');
}

const { video_url, audio_url, subtitles } = input;

// 2. Descargar video
console.log('Descargando video...');
const videoRes = await fetch(video_url);
const videoBuffer = await videoRes.buffer();
fs.writeFileSync('video.mp4', videoBuffer);

// 3. Descargar audio
console.log('Descargando audio...');
const audioRes = await fetch(audio_url);
const audioBuffer = await audioRes.buffer();
fs.writeFileSync('audio.mp3', audioBuffer);

// 4. Crear archivo SRT
console.log('Creando subtítulos...');

function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 12).replace('.', ',');
}

let srt = '';

subtitles.forEach((sub, i) => {
    srt += `${i + 1}\n`;
    srt += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srt += `${sub.text}\n\n`;
});

fs.writeFileSync('subs.srt', srt);

// 5. Render final (video + audio + subtítulos)
console.log('Renderizando...');

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subs.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,BorderStyle=1,Outline=2,Shadow=1'" \
-c:v libx264 -preset veryfast -crf 28 \
-c:a aac -b:a 128k \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// 6. Subir resultado a Key-Value Store
console.log('Subiendo resultado...');

const buffer = fs.readFileSync('output.mp4');

await Actor.setValue('output.mp4', buffer, {
    contentType: 'video/mp4'
});

// 7. Generar link directo
const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/output.mp4`;

console.log('VIDEO FINAL:', url);

// 8. Guardar en dataset (para verlo fácil)
await Actor.pushData({
    video_url: url
});

await Actor.exit();
