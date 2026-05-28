import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const { videoUrl, text, musicUrl } = input;

const store = await Actor.openKeyValueStore();
const storeId = store.id;

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

function cleanText(str) {
    return (str || '')
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/[\x00-\x1F\x7F]/g, ' ')
        .trim();
}

// =========================
// PASO 1: DESCARGAR Y RECORTAR A 30s
// =========================
console.log("Procesando video...");
const videoDirectUrl = getDirectUrl(videoUrl);
execSync(`ffmpeg -y -threads 2 -ss 0 -t 30 -i "${videoDirectUrl}" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 96k -threads 2 video_cut.mp4`, { stdio: 'inherit' });

const cutSize = fs.statSync('video_cut.mp4').size;
if (cutSize < 10000) throw new Error(`Error al procesar el video.`);

// =========================
// PASO 2: OBTENER DIMENSIONES ORIGINALES
// =========================
const origW = parseInt(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 video_cut.mp4`).toString().trim());
const origH = parseInt(execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 video_cut.mp4`).toString().trim());
console.log(`Dimensiones originales: ${origW}x${origH}`);

// =========================
// PASO 3: LOOP x3 SI DURA MENOS DE 10 SEGUNDOS
// =========================
const cutDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
);
if (cutDuration < 10) {
    execSync(`ffmpeg -y -stream_loop 2 -i video_cut.mp4 -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_looped.mp4`, { stdio: 'inherit' });
    execSync(`mv video_looped.mp4 video_cut.mp4`);
}

const finalDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
);
console.log("Duración final:", finalDuration);

// =========================
// PASO 4: ESCALAR VIDEO A 720px DE ANCHO SIN BARRAS LATERALES
// scale=720:-2 escala manteniendo ratio con ancho fijo 720
// Luego pad para llegar a 1280 de alto con negro arriba y abajo
// =========================
const canvasW = 720;
const canvasH = 1280;

// Altura del video escalado a 720px de ancho
const scaledH = Math.round((origH / origW) * canvasW);
// Espacio negro total (arriba + abajo)
const totalPad = canvasH - scaledH;
// Negro arriba para el texto, negro abajo igual
const padTop = Math.max(Math.round(totalPad * 0.5), 80); // mínimo 80px arriba para texto
const padBottom = totalPad - padTop;

console.log(`Video escalado: 720x${scaledH}, padTop=${padTop}, padBottom=${padBottom}`);

execSync(`ffmpeg -y -i video_cut.mp4 -vf "scale=${canvasW}:${scaledH},pad=${canvasW}:${canvasH}:0:${padTop}:black,setsar=1" -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_formatted.mp4`, { stdio: 'inherit' });

// =========================
// TEXTO JUSTO ENCIMA DEL VIDEO — centrado en la zona negra superior
// =========================
const safeText = cleanText(text);
const marginV = Math.round(padTop * 0.1); // 10% desde arriba

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasW}
PlayResY: ${canvasH}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,48,&H00FFFFFF,&H00000000,&H00000000,1,3,1,8,20,20,${marginV},1

[Events]
Format: Start,End,Style,Text
Dialogue: 0:00:00.00,0:${String(Math.floor(finalDuration / 60)).padStart(2,'0')}:${(finalDuration % 60).toFixed(2).padStart(5,'0')},Default,${safeText}
`;

fs.writeFileSync('subs.ass', ass);

// =========================
// DESCARGAR MÚSICA DE FONDO
// =========================
console.log("Descargando música...");
const musicDirectUrl = getDirectUrl(musicUrl);
execSync(`curl -L "${musicDirectUrl}" -o music.mp3 --max-time 120`, { stdio: 'inherit' });

// =========================
// MEZCLAR AUDIO
// =========================
execSync(`ffmpeg -y -i video_cut.mp4 -vn -c:a aac -b:a 96k -ar 48000 original_audio.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -stream_loop -1 -i music.mp3 -t ${finalDuration} -af "volume=0.50" -c:a aac -b:a 96k -ar 48000 music_loop.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -i original_audio.aac -i music_loop.aac -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=2 1[aout]" -map "[aout]" -c:a aac -b:a 96k -ar 48000 mixed_audio.aac`, { stdio: 'inherit' });

// =========================
// VIDEO FINAL
// =========================
console.log("Generando video final...");
execSync(`ffmpeg -y -i video_formatted.mp4 -i mixed_audio.aac -vf "ass=subs.ass,fps=30" -t ${finalDuration} -c:v libx264 -preset ultrafast -crf 28 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 96k -ar 48000 -movflags +faststart -shortest output_final.mp4`, { stdio: 'inherit' });

// =========================
// GUARDAR Y DEVOLVER URL
// =========================
const key = `output-${Date.now()}.mp4`;
const buffer = fs.readFileSync('output_final.mp4');
await Actor.setValue(key, buffer, { contentType: 'video/mp4' });
const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;
console.log("VIDEO LISTO:", url);
await Actor.pushData({ videoUrl: url });

execSync(`rm -f video_cut.mp4 video_formatted.mp4 original_audio.aac music.mp3 music_loop.aac mixed_audio.aac subs.ass output_final.mp4`);
await Actor.exit();
