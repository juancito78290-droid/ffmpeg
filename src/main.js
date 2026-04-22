import fs from "fs";
import { execSync } from "child_process";
import { pipeline } from "stream/promises";

// ✅ DESCARGA EN STREAM (NO USA RAM)
async function download(url, path) {
    const res = await fetch(url);

    if (!res.ok) throw new Error(`Error descargando: ${url}`);

    const fileStream = fs.createWriteStream(path);
    await pipeline(res.body, fileStream);
}

// 🔽 URLs (pon las tuyas)
const videoUrl = "https://TU_VIDEO.mp4";
const audioUrl = "https://TU_AUDIO.mp3";

console.log("⬇️ Descargando archivos...");

await download(videoUrl, "video.mp4");
await download(audioUrl, "audio.mp3");

// ⏱ Obtener duración del video
console.log("⏱ Analizando video...");
const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`)
        .toString()
        .trim()
);

console.log("Duración:", duration);

// 📝 Crear subtítulos SRT (SIEMPRE visibles)
console.log("📝 Generando subtítulos...");

const subtitles = `1
00:00:00,000 --> 00:00:${String(Math.floor(duration)).padStart(2, "0")},000
Hola
Este video
Tiene audio nuevo
`;

fs.writeFileSync("subs.srt", subtitles);

// ✂️ Cortar audio a duración del video
console.log("✂️ Ajustando audio...");
execSync(`ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3`);

// ⚙️ CONFIG ANTI-CRASH (CLAVE)
console.log("⚙️ Configurando render...");

// 🔥 Resolución segura (evita muerte del actor)
const scale = "720:-2";   // NUNCA uses 1080 en Apify free
const crf = 28;

console.log(`Resolución: ${scale} | CRF: ${crf}`);

// 🎬 FFmpeg FINAL (ULTRA OPTIMIZADO)
console.log("🚀 Renderizando video...");

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio_cut.mp3 \
-vf "scale=${scale},subtitles=subs.srt:force_style='FontName=DejaVuSans,FontSize=26,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-preset ultrafast \
-crf ${crf} \
-c:a aac \
-b:a 128k \
-shortest \
-movflags +faststart \
output.mp4
`);

// 📤 Resultado
console.log("✅ VIDEO LISTO: output.mp4");
