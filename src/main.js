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
// PASO 4: CALCULAR LAYOUT
// Canvas: 720x1280
// Texto ocupa exactamente lo que necesita arriba (font 52px + padding 20px arriba y abajo)
// Video justo debajo del texto, escalado a 720px de ancho
// =========================
const canvasW = 720;
const canvasH = 1280;
const fontSize = 52;
const textPadding = 20; // padding arriba y abajo del texto
// Altura estimada del texto (2 líneas máx)
const textAreaH = (fontSize * 2) + (textPadding * 2); // ~144px

// Video ocupa el resto del canvas desde textAreaH hasta abajo
const videoAreaH = canvasH - textAreaH;

// Escalar video para llenar 720px de ancho en videoAreaH de alto
// Usamos force_original_aspect_ratio=decrease para no distorsionar
const scaledH = Math.min(Math.round((origH / origW) * canvasW), videoAreaH);
const videoPadTop = textAreaH; // video empieza justo debajo del texto
const videoPadBottom = canvasH - textAreaH - scaledH;

console.log(`textAreaH=${textAreaH}, scaledH=${scaledH}, videoPadTop=${videoPadTop}, videoPadBottom=${videoPadBottom}`);

// Formatear: negro arriba (textAreaH) + video escalado + negro abajo
execSync(`ffmpeg -y -i video_cut.mp4 -vf "scale=${canvasW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:black,pad=${canvasW}:${canvasH}:0:${videoPadTop}:black,setsar=1,fade=t=in:st=0:d=0.5" -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_formatted.mp4`, { stdio: 'inherit' });

// =========================
// PASO 5: TEXTO JUSTO ENCIMA DEL VIDEO
// Alignment=2 = centro abajo
// Ponemos el texto en la zona negra superior usando posición absoluta
// y = borde inferior de textAreaH - padding
// En ASS usamos \pos(x,y) para posición exacta
// x = centro = 360, y = textAreaH - textPadding
// =========================
const safeText = cleanText(text);
const textY = textAreaH - textPadding; // pegado al borde inferior de la zona de texto

const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvasW}
PlayResY: ${canvasH}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,${fontSize},&H00FFFFFF,&H00000000,&H00000000,1,3,1,2,20,20,0,1

[Events]
Format: Start,End,Style,Text
Dialogue: 0:00:00.00,0:${String(Math.floor(finalDuration / 60)).padStart(2,'0')}:${(finalDuration % 60).toFixed(2).padStart(5,'0')},Default,{\\pos(360,${textY})}${safeText}
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
execSync(`ffmpeg -y -i video_cut.mp4 -vn -c:a aac -b:a 96k -ar 48000 original_audio.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -stream_loop -1 -i music.mp3 -t ${finalDuration} -af "volume=0.20" -c:a aac -b:a 96k -ar 48000 music_loop.aac`, { stdio: 'inherit' });
execSync(`ffmpeg -y -i original_audio.aac -i music_loop.aac -filter_complex "[0:a][1:a]amix=inputs=2:duration=first:weights=1 0.2[aout]" -map "[aout]" -c:a aac -b:a 96k -ar 48000 mixed_audio.aac`, { stdio: 'inherit' });

// =========================
// PASO 8: VIDEO FINAL
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
