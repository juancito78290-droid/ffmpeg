import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const { videoUrl, text, musicUrl } = input;

const store = await Actor.openKeyValueStore();
const storeId = store.id;

// =========================
// COLORES ALEATORIOS LEGIBLES
// =========================
const colors = [
    '&H0000FFFF',  // Amarillo
    '&H00FFFFFF',  // Blanco
    '&H000000FF',  // Rojo
    '&H00FF0000',  // Azul
    '&H0000FF00',  // Verde lima
    '&H00FF00FF',  // Magenta
    '&H0080FF00',  // Verde brillante
];
const randomColor = colors[Math.floor(Math.random() * colors.length)];

// =========================
// OBTENER URL DIRECTA DE GOOGLE DRIVE
// =========================
function getDirectUrl(url) {
    const match1 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    let fileId = null;
    if (match1) fileId = match1[1];
    else if (match2) fileId = match2[1];
    if (fileId) {
        return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
    }
    return url;
}

// =========================
// PASO 1: DESCARGAR VIDEO COMPLETO
// =========================
console.log("Descargando video...");
const videoDirectUrl = getDirectUrl(videoUrl);
console.log("URL:", videoDirectUrl);
execSync(`curl -L -c /tmp/cookies.txt -b /tmp/cookies.txt "${videoDirectUrl}" -o input_raw.mp4 --max-time 3600`, { stdio: 'inherit' });

const rawSize = fs.statSync('input_raw.mp4').size;
console.log(`Descargado: ${(rawSize / 1024 / 1024).toFixed(2)} MB`);
if (rawSize < 10000) {
    throw new Error(`Error al descargar el video. Verifica que el link sea público.`);
}

// =========================
// PASO 2: RECORTAR A 30s + ESCALAR A 480p EN UN SOLO PASO
// -vf scale reduce RAM drasticamente antes de codificar
// -threads 1 minimiza uso de memoria
// =========================
console.log("Recortando y escalando a 480p...");
execSync(`ffmpeg -y -threads 1 -i input_raw.mp4 -t 30 -vf "scale=854:480:force_original_aspect_ratio=decrease,setsar=1" -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 128k -threads 1 video_cut.mp4`, { stdio: 'inherit' });

execSync(`rm -f input_raw.mp4`);

const cutSize = fs.statSync('video_cut.mp4').size;
console.log(`Video recortado: ${(cutSize / 1024 / 1024).toFixed(2)} MB`);
if (cutSize < 10000) {
    throw new Error(`Error al procesar el video.`);
}

// =========================
// PASO 3: LOOP x3 SI DURA MENOS DE 10 SEGUNDOS
// =========================
const cutDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString().trim()
);
console.log("Duración tras recorte:", cutDuration);

if (cutDuration < 10) {
    console.log(`Video corto (${cutDuration}s), aplicando loop x3...`);
    execSync(`ffmpeg -y -stream_loop 2 -i video_cut.mp4 -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p video_looped.mp4`, { stdio: 'inherit' });
    execSync(`mv video_looped.mp4 video_cut.mp4`);
}

// =========================
// DURACIÓN FINAL
// =========================
const finalDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`)
        .toString().trim()
);
console.log("Duración final:", finalDuration);

// =========================
// ESCALAR A FORMATO VERTICAL 9:16 (720x1280)
// =========================
execSync(`ffmpeg -y -i video_cut.mp4 -vf "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2,pad=720:1280:0:280:black,setsar=1" -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_formatted.mp4`, { stdio: 'inherit' });

// =========================
// TEXTO SUPERIOR CON COLOR ALEATORIO
// =========================
const safeText = (text || "").replace(/[\x00-\x1F\x7F]/g, " ").trim();

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,46,${randomColor},&H00000000,&H00000000,1,3,1,8,30,30,20,1

[Events]
Format: Start,End,Style,Text
Dialogue: 0:00:00.00,0:${String(Math.floor(finalDuration / 60)).padStart(2,'0')}:${(finalDuration % 60).toFixed(2).padStart(5,'0')},Default,${safeText}
`;

fs.writeFileSync('subs.ass', ass);

// =========================
// DESCARGAR MÚSICA DE FONDO
// =========================
console.log("Descargando música de fondo...");
const musicDirectUrl = getDirectUrl(musicUrl);
execSync(`curl -L "${musicDirectUrl}" -o music.mp3 --max-time 120`, { stdio: 'inherit' });

// =========================
// EXTRAER AUDIO ORIGINAL + MEZCLAR
// =========================
execSync(`ffmpeg -y -i video_cut.mp4 -vn -c:a aac -b:a 128k -ar 48000 original_audio.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -stream_loop -1 -i music.mp3 -t ${finalDuration} -af "volume=0.35" -c:a aac -b:a 128k -ar 48000 music_loop.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -i original_audio.aac -i music_loop.aac -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.35[aout]" -map "[aout]" -c:a aac -b:a 128k -ar 48000 mixed_audio.aac`, { stdio: 'inherit' });

// =========================
// VIDEO FINAL
// =========================
console.log("Generando video final...");
execSync(`ffmpeg -y -i video_formatted.mp4 -i mixed_audio.aac -vf "ass=subs.ass,fps=30" -t ${finalDuration} -c:v libx264 -preset ultrafast -crf 28 -maxrate 5M -bufsize 10M -pix_fmt yuv420p -c:a aac -b:a 128k -ar 48000 -movflags +faststart -shortest output_final.mp4`, { stdio: 'inherit' });

// =========================
// GUARDAR Y DEVOLVER URL
// =========================
const key = `output-${Date.now()}.mp4`;
const buffer = fs.readFileSync('output_final.mp4');
await Actor.setValue(key, buffer, { contentType: 'video/mp4' });

const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;
console.log("VIDEO LISTO:", url);
await Actor.pushData({ videoUrl: url });

// =========================
// LIMPIEZA
// =========================
execSync(`rm -f video_cut.mp4 video_formatted.mp4 original_audio.aac music.mp3 music_loop.aac mixed_audio.aac subs.ass output_final.mp4`);

await Actor.exit();
