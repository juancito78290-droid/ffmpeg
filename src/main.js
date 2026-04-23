import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    const videoFile = `video_${i}.mp4`;
    const audioFile = `audio_${i}.mp3`;
    const fixedAudio = `audio_fixed_${i}.mp3`;
    const subsFile = `subs_${i}.ass`;
    const outputFile = `output_${i}.mp4`;

    // 📥 DESCARGAR (IMPORTANTE: -L para redirects como tu link)
    execSync(`curl -L --fail "${videoUrl}" -o ${videoFile}`);
    execSync(`curl -L --fail "${audioUrl}" -o ${audioFile}`);

    // 🔧 REPARAR AUDIO (CLAVE PARA TU LINK)
    execSync(`
        ffmpeg -y \
        -fflags +genpts+discardcorrupt \
        -i ${audioFile} \
        -vn \
        -acodec libmp3lame \
        -ar 44100 \
        -ac 2 \
        -b:a 128k \
        ${fixedAudio}
    `);

    // ⏱ DURACIÓN REAL DEL AUDIO
    const duration = parseFloat(
        execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${fixedAudio}`)
            .toString()
            .trim()
    );

    // ✂️ DIVIDIR TEXTO (más natural)
    const sentences = text.split(/(?<=\.)\s+/); // divide por frases
    const chunks = sentences.length > 1 ? sentences : [
        text.slice(0, text.length / 2),
        text.slice(text.length / 2)
    ];

    // 🎬 SUBTÍTULOS PRO
    let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment
Style: Default,Arial,48,&H00FFFFFF,&H00000000,1,2,0,2

[Events]
Format: Start, End, Style, Text
`;

    const partDuration = duration / chunks.length;

    chunks.forEach((chunk, index) => {
        const start = index * partDuration;
        const end = (index + 1) * partDuration;

        const format = (t) => {
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const s = (t % 60).toFixed(2).padStart(5, '0');
            return `${h}:${m}:${s}`;
        };

        ass += `Dialogue: ${format(start)},${format(end)},Default,{\\b1}${chunk}\n`;
    });

    fs.writeFileSync(subsFile, ass);

    // 🎥 FFmpeg FINAL (ULTRA ESTABLE)
    execSync(`
        ffmpeg -y \
        -i ${videoFile} \
        -i ${fixedAudio} \
        -vf "ass=${subsFile}" \
        -map 0:v:0 \
        -map 1:a:0 \
        -c:v libx264 -preset veryfast -crf 28 \
        -c:a aac -b:a 128k \
        -shortest \
        ${outputFile}
    `);

    // ☁️ SUBIR VIDEO
    const { url } = await Actor.uploadFile(outputFile, {
        contentType: 'video/mp4',
    });

    console.log(`✅ Video listo: ${url}`);

    // 📦 DATASET
    await Actor.pushData({
        videoUrl: url,
        inputVideo: videoUrl,
        inputAudio: audioUrl,
    });

    // 💾 KEY VALUE
    await Actor.setValue(`VIDEO_${i}`, url);
}

await Actor.exit();
