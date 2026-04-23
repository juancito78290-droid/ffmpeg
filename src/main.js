import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';

// 🔽 DESCARGA SEGURA
const download = (url, path) => {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(path);

        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(`Error descargando: ${res.statusCode}`);
                return;
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', reject);
    });
};

await Actor.init();

const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const subtitlesText = input.subtitles || "Hola\nSubtítulos automáticos";

// ⬇️ DESCARGAS
console.log("⬇️ Descargando...");
await download(videoUrl, 'video.mp4');
await download(audioUrl, 'audio.mp3');

// ⏱ DURACIÓN
console.log("⏱ Analizando video...");
const duration = parseFloat(execSync(
`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.mp4`
).toString());

console.log("Duración:", duration);

// 📝 SUBTÍTULOS
console.log("📝 Creando subtítulos...");

const lines = subtitlesText.split("\n").filter(Boolean);
let srt = "";
const segment = duration / lines.length;

lines.forEach((line, i) => {
    const start = i * segment;
    const end = (i + 1) * segment;

    const format = (t) => {
        const h = String(Math.floor(t / 3600)).padStart(2, '0');
        const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
        const s = String(Math.floor(t % 60)).padStart(2, '0');
        return `${h}:${m}:${s},000`;
    };

    srt += `${i + 1}\n${format(start)} --> ${format(end)}\n${line}\n\n`;
});

fs.writeFileSync("subs.srt", srt);

// ✂️ AUDIO
console.log("✂️ Cortando audio...");
execSync(`ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3`);

// 🚀 RENDER (480P ULTRA ESTABLE)
console.log("⚙️ Renderizando...");

execSync(`
ffmpeg -y -i video.mp4 -i audio_cut.mp3 \
-vf "scale=480:-2,subtitles=subs.srt:force_style='FontName=DejaVuSans,FontSize=22,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -preset ultrafast -crf 30 \
-c:a aac -b:a 128k \
-shortest output.mp4
`, { stdio: 'inherit' });

// 📤 OUTPUT
console.log("📤 Subiendo...");
await Actor.pushData({
    status: "OK",
    resolution: "480p",
    message: "Video generado sin fallos"
});

await Actor.exit();
