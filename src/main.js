import { execSync } from 'child_process';
import fs from 'fs';

const items = JSON.parse(fs.readFileSync('INPUT.json', 'utf-8'));

items.forEach((item, i) => {
    console.log(`🎬 Procesando item ${i}`);

    const videoUrl = item.video;
    const audioUrl = item.audio;

    // Descargar video y audio
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // Reparar audio
    execSync(`ffmpeg -y -err_detect ignore_err -i audio_${i}.mp3 -ac 2 -ar 44100 -b:a 96k audio_fixed_${i}.mp3`);

    // 🔥 FILTROS CORRECTOS
    const filter = `
    scale=720:1280,
    delogo=x=0:y=1080:w=720:h=200,
    ass=subs_${i}.ass
    `.replace(/\s+/g, '');

    // Render final
    execSync(`
        ffmpeg -y \
        -i video_${i}.mp4 \
        -i audio_fixed_${i}.mp3 \
        -vf "${filter}" \
        -t 15 \
        -map 0:v -map 1:a \
        -c:v libx264 -preset ultrafast -crf 32 -threads 1 \
        -c:a aac -b:a 96k \
        output_${i}.mp4
    `);

    console.log(`✅ Listo output_${i}.mp4`);
});
