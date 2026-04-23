import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

// ================= INPUT =================
const input = await Actor.getInput() || {};

const videoUrl = input.video_url;
const audioUrl = input.audio_url;
const subtitles = input.subtitles;

// Validación REAL
if (!videoUrl || !audioUrl || !subtitles || !Array.isArray(subtitles)) {
    throw new Error('Falta video_url, audio_url o subtitles');
}

// ================= DESCARGAR ARCHIVOS =================
async function download(url, path) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error descargando ${url}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
}

console.log('Descargando video...');
await download(videoUrl, 'video.mp4');

console.log('Descargando audio...');
await download(audioUrl, 'audio.mp3');

// ================= CREAR SRT =================
function toSrtTime(sec) {
    const d = new Date(sec * 1000);
    return d.toISOString().substr(11, 12).replace('.', ',');
}

let srt = '';

subtitles.forEach((s, i) => {
    srt += `${i + 1}\n`;
    srt += `${toSrtTime(s.start)} --> ${toSrtTime(s.end)}\n`;
    srt += `${s.text}\n\n`;
});

fs.writeFileSync('subs.srt', srt);

// ================= FFMPEG =================
console.log('Renderizando video...');

// 🔥 SUPER OPTIMIZADO (evita KILL / RAM)
execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subs.srt:charenc=UTF-8" \
-c:v libx264 \
-preset ultrafast \
-crf 30 \
-c:a aac \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// ================= GUARDAR =================
await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

// ================= RESPUESTA =================
const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

const urlFinal = `https://api.apify.com/v2/key-value-stores/${storeId}/records/output.mp4`;

await Actor.pushData({
    status: 'ok',
    video_url: urlFinal
});

console.log('VIDEO FINAL:', urlFinal);

await Actor.exit();
