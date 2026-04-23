import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

// 📥 INPUT
const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const subtitlesText = input.subtitles || "Hola\nEste es un video de prueba\nFunciona perfecto";

// 📥 FUNCION DESCARGA
async function download(url, path) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error descargando: ${url}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path, Buffer.from(buffer));
}

// ⬇️ DESCARGAS
console.log("⬇️ Descargando...");
await download(videoUrl, 'video.mp4');
await download(audioUrl, 'audio.mp3');

// ⏱ DURACIÓN VIDEO
console.log("⏱ Analizando video...");
const duration = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`)
    .toString()
    .trim();

console.log("Duración:", duration);

// ✂️ CORTAR AUDIO
console.log("✂️ Cortando audio...");
execSync(`ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3`);

// 📝 CREAR SRT
console.log("📝 Creando subtítulos...");

const lines = subtitlesText.split('\n');
const partDuration = parseFloat(duration) / lines.length;

function formatTime(sec) {
    const date = new Date(sec * 1000);
    return date.toISOString().substr(11, 12).replace('.', ',');
}

let srt = '';

lines.forEach((text, i) => {
    const start = i * partDuration;
    const end = (i + 1) * partDuration;

    srt += `${i + 1}\n`;
    srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
    srt += `${text}\n\n`;
});

fs.writeFileSync('subs.srt', srt);

// 🎬 RENDER FINAL
console.log("⚙️ Renderizando...");

execSync(`ffmpeg -y -i video.mp4 -i audio_cut.mp3 -vf "scale=480:-2,subtitles=subs.srt:force_style='FontName=DejaVuSans,FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" -map 0:v:0 -map 1:a:0 -c:v libx264 -preset ultrafast -crf 30 -c:a aac -b:a 128k -shortest output.mp4`, { stdio: 'inherit' });

// 📤 SUBIR VIDEO (ESTO GENERA LINK)
console.log("📤 Subiendo video...");

await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log("✅ LISTO: revisa Key-Value Store → output.mp4");

await Actor.exit();
