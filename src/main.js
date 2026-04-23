import fs from "fs";
import { execSync } from "child_process";
import os from "os";
import { Actor } from "apify";

await Actor.init();

const input = await Actor.getInput();

// 🔹 INPUT DINÁMICO
const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const subtitlesText = input.subtitles || "Texto por defecto";

// 🔽 DESCARGA NATIVA (Node 18 ya tiene fetch)
async function download(url, path) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error descargando: ${url}`);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path, Buffer.from(buffer));
}

console.log("⬇️ Descargando...");
await download(videoUrl, "video.mp4");
await download(audioUrl, "audio.mp3");

// ⏱ DURACIÓN VIDEO
console.log("⏱ Analizando video...");
const duration = parseFloat(execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`
).toString());

console.log("Duración:", duration);

// 📝 CREAR SRT AUTOMÁTICO
console.log("📝 Creando subtítulos...");

const srt = `1
00:00:00,000 --> 00:00:${String(Math.floor(duration)).padStart(2, "0")},000
${subtitlesText}
`;

fs.writeFileSync("subs.srt", srt);

// ✂️ CORTAR AUDIO
console.log("✂️ Cortando audio...");
execSync(`ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3`);

// 🧠 AJUSTE POR RAM
const ram = os.totalmem() / 1024 / 1024;

let scale = "854:-2";
let crf = 26;

if (ram > 4000) {
    scale = "1080:-2";
    crf = 23;
} else if (ram > 2000) {
    scale = "720:-2";
    crf = 25;
}

console.log(`Resolución: ${scale} | CRF: ${crf}`);

// 🎬 FFmpeg CORRECTO (UNA SOLA LÍNEA)
console.log("⚙️ Renderizando...");

const command = `ffmpeg -y -i video.mp4 -i audio_cut.mp3 -vf "scale=${scale},subtitles=subs.srt:force_style='FontName=Arial,FontSize=28,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" -map 0:v:0 -map 1:a:0 -c:v libx264 -preset veryfast -crf ${crf} -c:a aac -b:a 128k -shortest output.mp4`;

execSync(command, { stdio: "inherit" });

// 📤 OUTPUT
console.log("📤 Subiendo...");
await Actor.pushData({
    status: "ok",
    file: "output.mp4"
});

console.log("✅ TODO PERFECTO");

await Actor.exit();
