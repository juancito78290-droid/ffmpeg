import fs from "fs";
import { execSync } from "child_process";
import { Actor } from "apify";

await Actor.init();

console.log("🔥 MODO PRO ACTIVADO 🔥");

const input = await Actor.getInput();

const {
    videoUrl,
    audioUrl,
    subtitleText = "Texto por defecto"
} = input;

// --------------------
// 📥 DESCARGA SEGURA
// --------------------
const download = async (url, path) => {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Error descargando: ${url} - ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
};

console.log("⬇️ Descargando archivos...");
await download(videoUrl, "video.mp4");
await download(audioUrl, "audio.mp3");

// --------------------
// ⏱ DURACIÓN VIDEO
// --------------------
console.log("⏱ Analizando video...");
const duration = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`
)
    .toString()
    .trim();

const videoDuration = Math.floor(parseFloat(duration));
console.log("Duración:", videoDuration);

// --------------------
// 📝 GENERAR SRT REAL
// --------------------
console.log("📝 Generando subtítulos...");

const srt = `1
00:00:00,000 --> 00:00:${videoDuration
    .toString()
    .padStart(2, "0")},000
${subtitleText}
`;

fs.writeFileSync("subs.srt", srt);

// DEBUG opcional
console.log(fs.readFileSync("subs.srt", "utf-8"));

// --------------------
// ✂️ CORTAR AUDIO
// --------------------
console.log("✂️ Ajustando audio...");

execSync(
    `ffmpeg -y -i audio.mp3 -t ${videoDuration} -c copy audio_cut.mp3`,
    { stdio: "inherit" }
);

// --------------------
// 🧠 AJUSTE SEGÚN RAM
// --------------------
const totalMemMB = (await import("os")).totalmem() / 1024 / 1024;

let scale = "720:-2";
let crf = 28;

if (totalMemMB < 2048) {
    scale = "480:-2";
    crf = 32;
} else if (totalMemMB > 8000) {
    scale = "1080:-2";
    crf = 23;
}

console.log(`RAM: ${totalMemMB.toFixed(0)} MB`);
console.log(`Resolución: ${scale} | CRF: ${crf}`);

// --------------------
// 🎬 FFmpeg PRO
// --------------------
console.log("⚙️ Ejecutando FFmpeg PRO...");

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio_cut.mp3 \
-vf "scale=${scale},subtitles=subs.srt:force_style='FontName=DejaVuSans,FontSize=28,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2'" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -preset veryfast -crf ${crf} \
-c:a aac -b:a 128k \
-shortest \
output.mp4
`, { stdio: "inherit" });

// --------------------
// 📤 SUBIR RESULTADO
// --------------------
console.log("📤 Subiendo resultado...");

await Actor.setValue("OUTPUT", fs.createReadStream("output.mp4"), {
    contentType: "video/mp4",
});

console.log("✅ TODO PERFECTO");

await Actor.exit();
