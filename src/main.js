import { execSync } from 'child_process';
import fs from 'fs';
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput();

const videoUrl = input.video_url;
const audioUrl = input.audio_url;
const subtitles = input.subtitles;

if (!videoUrl || !audioUrl || !subtitles) {
    throw new Error('Falta video_url, audio_url o subtitles');
}

console.log('Descargando video...');
execSync(`wget -O video.mp4 "${videoUrl}"`);

console.log('Descargando audio...');
execSync(`wget -O audio.mp3 "${audioUrl}"`);

console.log('Generando SRT...');

// 🔥 Crear archivo SRT real
let srt = '';
subtitles.forEach((sub, i) => {
    const formatTime = (s) => {
        const date = new Date(s * 1000);
        return date.toISOString().substr(11, 12).replace('.', ',');
    };

    srt += `${i + 1}\n`;
    srt += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srt += `${sub.text}\n\n`;
});

fs.writeFileSync('subtitles.srt', srt);

console.log('Renderizando video...');

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subtitles.srt" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -c:a aac \
-shortest output.mp4
`);

console.log('Subiendo resultado...');

await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log('VIDEO FINAL listo 🚀');

await Actor.exit();
