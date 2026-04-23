import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

// Leer input
const input = await Actor.getInput();

const { video_url, audio_url, subtitles } = input;

// Validación
if (!video_url || !audio_url || !subtitles) {
    throw new Error('Faltan datos en el input');
}

// Descargar video
const videoRes = await fetch(video_url);
const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
fs.writeFileSync('video.mp4', videoBuffer);

// Descargar audio
const audioRes = await fetch(audio_url);
const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
fs.writeFileSync('audio.mp3', audioBuffer);

// Crear archivo SRT
function formatTime(sec) {
    const date = new Date(sec * 1000);
    return date.toISOString().substr(11, 12).replace('.', ',');
}

let srt = '';

subtitles.forEach((sub, i) => {
    srt += `${i + 1}\n`;
    srt += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srt += `${sub.text}\n\n`;
});

fs.writeFileSync('subtitles.srt', srt);

// Unir video + audio + subtítulos (hardcoded)
execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subtitles.srt:force_style='FontSize=24,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-preset veryfast \
-crf 28 \
-c:a aac \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// Subir resultado
await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

// Guardar link en dataset
const store = await Actor.openKeyValueStore();
const record = await store.getRecord('output.mp4');

await Actor.pushData({
    video_url: record.url
});

console.log('LISTO:', record.url);

await Actor.exit();
