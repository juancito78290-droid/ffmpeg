import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

// ====== INPUT ======
const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const subtitles = input.subtitles || [
    { start: "00:00:00,000", end: "00:00:03,000", text: "Hola mundo" }
];

// ====== DESCARGAR VIDEO ======
console.log('Descargando video...');
execSync(`curl -L "${videoUrl}" -o video.mp4`, { stdio: 'inherit' });

// ====== DESCARGAR AUDIO ======
console.log('Descargando audio...');
execSync(`curl -L "${audioUrl}" -o audio.mp3`, { stdio: 'inherit' });

// ====== CREAR SRT ======
console.log('Creando subtítulos...');

let srtContent = '';
subtitles.forEach((sub, i) => {
    srtContent += `${i + 1}\n${sub.start} --> ${sub.end}\n${sub.text}\n\n`;
});

fs.writeFileSync('subs.srt', srtContent);

// ====== RENDER ======
console.log('Renderizando video...');

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf subtitles=subs.srt \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-preset veryfast \
-crf 28 \
-c:a aac \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// ====== OUTPUT ======
console.log('Subiendo resultado...');

await Actor.setValue('OUTPUT', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4'
});

await Actor.exit();
