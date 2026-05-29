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
// LAYOUT 1:1 — 720x720
// Texto arriba, video abajo
// =========================
const canvasW    = 720;
const canvasH    = 720;
const fontSize   = 36;
const lineHeight = fontSize * 1.35;
const marginH    = 40;
const padV       = 24;
const videoSize  = 460; // video cuadrado

const safeText = cleanText(text);

// Calcular líneas del texto
const charsPerLine = Math.floor((canvasW - marginH * 2) / (fontSize * 0.55));
const words = safeText.split(' ');
let lines = 1;
let currentLen = 0;
for (const word of words) {
    if (currentLen + word.length + 1 > charsPerLine && currentLen > 0) {
        lines++;
        currentLen = word.length;
    } else {
        currentLen += word.length + 1;
    }
}

// Barra negra superior adaptativa según líneas del texto
const topBarH = Math.ceil(lines * lineHeight + padV * 2);
// Barra negra inferior fija pequeña
const botBarH = 70;

const totalH = topBarH + videoSize + botBarH;
let finalVideoSize = videoSize;
if (totalH > canvasH) {
    finalVideoSize = canvasH - topBarH - botBarH;
}

console.log(`Layout: topBar=${topBarH} video=${finalVideoSize} botBar=${botBarH} líneas=${lines}`);

// =========================
// PASO 1: OBTENER DURACIÓN SIN DESCARGAR
// =========================
console.log("Obteniendo duración del video...");
const videoDirectUrl = getDirectUrl(videoUrl);

let originalDuration = 0;
try {
    originalDuration = parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoDirectUrl}" 2>/dev/null`).toString().trim()
    );
} catch(e) {
    console.log("No se pudo obtener duración, asumiendo video largo...");
    originalDuration = 999;
}
console.log("Duración original:", originalDuration, "segundos");

// =========================
// PASO 2: DESCARGAR A 720p
// Si dura más de 30s: descarga+escala+recorta simultáneamente
// Si dura 30s o menos: descarga+escala completo
// =========================
if (originalDuration > 30) {
    console.log("Video largo, descargando, escalando a 720p y recortando a 30s...");
    execSync(`ffmpeg -y -threads 2 -t 30 -i "${videoDirectUrl}" -vf "scale=720:-2" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -threads 2 video_cut.mp4`, { stdio: 'inherit' });
} else {
    console.log("Video corto (<=30s), descargando y escalando a 720p...");
    execSync(`ffmpeg -y -threads 2 -i "${videoDirectUrl}" -vf "scale=720:-2" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -threads 2 video_cut.mp4`, { stdio: 'inherit' });
}

const cutSize = fs.statSync('video_cut.mp4').size;
if (cutSize < 10000) throw new Error(`Error al procesar el video. Verifica que el link sea público.`);

// =========================
// PASO 3: LOOP x3 SI DURA MENOS DE 10 SEGUNDOS
// =========================
const cutDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
);
if (cutDuration < 10) {
    execSync(`ffmpeg -y -stream_loop 2 -i video_cut.mp4 -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p video_looped.mp4`, { stdio: 'inherit' });
    execSync(`mv video_looped.mp4 video_cut.mp4`);
}

const finalDuration = parseFloat(
    execSync(`ffprobe -i video_cut.mp4 -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
);
console.log("Duración final:", finalDuration);

// =========================
// PASO 4: FORMATEAR A 1:1 720x720
// Video cuadrado centrado justo debajo del texto
// Fade in 0.5s
// =========================
const videoOffsetY = topBarH;
execSync(
    `ffmpeg -y -i video_cut.mp4 -vf "scale=${finalVideoSize}:${finalVideoSize}:force_original_aspect_ratio=increase,crop=${finalVideoSize}:${finalVideoSize},pad=${canvasW}:${canvasH}:(${canvasW}-${finalVideoSize})/2:${videoOffsetY}:black,setsar=1,fade=t=in:st=0:d=0.5" -an -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p video_formatted.mp4`,
    { stdio: 'inherit' }
);

// =========================
// PASO 5: TEXTO EN BARRA NEGRA SUPERIOR
// Alignment=8 = arriba centrado
// MarginV = padding desde arriba
// =========================
const textMarginV = Math.floor(padV);
const endTime = `0:${String(Math.floor(finalDuration / 60)).padStart(2,'0')}:${(finalDuration % 60).toFixed(2).padStart(5,'0')}`;

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasW}
PlayResY: ${canvasH}
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00000000,&H00000000,1,3,1,8,${marginH},${marginH},${textMarginV},1

[Events]
Format: Start,End,Style,Text
Dialogue: 0:00:00.00,${endTime},Default,${safeText}
`;

fs.writeFileSync('subs.ass', ass);

// =========================
// PASO 6: DESCARGAR MÚSICA DE FONDO
// =========================
console.log("Descargando música...");
const musicDirectUrl = getDirectUrl(musicUrl);
execSync(`curl -L "${musicDirectUrl}" -o music.mp3 --max-time 120`, { stdio: 'inherit' });

// =========================
// PASO 7: MEZCLAR AUDIO — original 100% + música 20%
// =========================
execSync(`ffmpeg -y -i video_cut.mp4 -vn -c:a aac -b:a 128k -ar 48000 original_audio.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -stream_loop -1 -i music.mp3 -t ${finalDuration} -af "volume=0.20" -c:a aac -b:a 128k -ar 48000 music_loop.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -i original_audio.aac -i music_loop.aac -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.2[aout]" -map "[aout]" -c:a aac -b:a 128k -ar 48000 mixed_audio.aac`, { stdio: 'inherit' });

// =========================
// PASO 8: VIDEO FINAL 720x720 EN 720p
// =========================
console.log("Generando video final...");
execSync(`ffmpeg -y -i video_formatted.mp4 -i mixed_audio.aac -vf "ass=subs.ass,fps=30" -t ${finalDuration} -c:v libx264 -preset ultrafast -crf 23 -maxrate 5M -bufsize 10M -pix_fmt yuv420p -c:a aac -b:a 128k -ar 48000 -movflags +faststart -shortest output_final.mp4`, { stdio: 'inherit' });

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
