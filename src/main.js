import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

// Obtener input correctamente (NO uses INPUT.json)
const input = await Actor.getInput();
const items = input?.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, assContent } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    // Descargar archivos
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // Arreglar audio (IMPORTANTE: en una sola línea)
    execSync(`ffmpeg -y -i audio_${i}.mp3 -vn -ar 44100 -ac 2 -b:a 96k audio_fixed_${i}.mp3`);

    // Crear archivo ASS (subtítulos con fondo amarillo y texto negro)
    const ass = `
[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,40,&H00000000,&H0000FFFF,0,0,3,0,0,2,10,10,40,1

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:00.00,0:00:15.00,Default,${assContent || "Texto de ejemplo"}
`;

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // Procesar video (480p + ASS + audio)
    execSync(`ffmpeg -y -i video_${i}.mp4 -i audio_fixed_${i}.mp3 -vf "scale=480:-2,ass=subs_${i}.ass" -c:v libx264 -preset ultrafast -crf 32 -c:a aac -b:a 64k -shortest output_${i}.mp4`);

    console.log(`✅ Video listo: output_${i}.mp4`);

    // Subir a dataset para tener LINK
    const fileBuffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.pushData({
        index: i,
        file: await Actor.setValue(`output_${i}`, fileBuffer, { contentType: 'video/mp4' }),
    });
}

await Actor.exit();
