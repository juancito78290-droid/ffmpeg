import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando ${i}`);

    const video = `video_${i}.mp4`;
    const audio = `audio_${i}.mp3`;
    const subs = `subs_${i}.ass`;
    const output = `output_${i}.mp4`;

    // Descargar archivos (rápido)
    execSync(`curl -L "${videoUrl}" -o ${video}`);
    execSync(`curl -L "${audioUrl}" -o ${audio}`);

    // Crear subtítulos simples (ULTRA LIGHT)
    const words = text.split(' ');
    const chunkSize = 4;

    let chunks = [];
    for (let j = 0; j < words.length; j += chunkSize) {
        chunks.push(words.slice(j, j + chunkSize).join(' '));
    }

    const duration = 15; // fallback si no detectamos
    const chunkDuration = duration / chunks.length;

    let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1

[Events]
`;

    let currentTime = 0;

    chunks.forEach((chunk) => {
        const start = new Date(currentTime * 1000).toISOString().substr(11, 8) + ".00";
        currentTime += chunkDuration;
        const end = new Date(currentTime * 1000).toISOString().substr(11, 8) + ".00";

        ass += `Dialogue: 0,${start},${end},Default,,0,0,0,,${chunk}\n`;
    });

    fs.writeFileSync(subs, ass);

    // 🎥 FFmpeg ULTRA FAST
    execSync(`
        ffmpeg -y \
        -i ${video} \
        -i ${audio} \
        -vf "ass=${subs}" \
        -map 0:v:0 -map 1:a:0 \
        -c:v libx264 -preset ultrafast -crf 30 \
        -c:a aac -b:a 96k \
        -shortest \
        ${output}
    `);

    // Guardar resultado
    const fileBuffer = fs.readFileSync(output);

    await Actor.setValue(`video_${i}.mp4`, fileBuffer, {
        contentType: 'video/mp4'
    });

    console.log(`✅ Listo ${i}`);
}

await Actor.exit();
