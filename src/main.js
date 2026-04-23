import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    // =============================
    // Descargar archivos
    // =============================
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // =============================
    // Arreglar audio (evita errores mp3)
    // =============================
    execSync(`
        ffmpeg -y 
        -i audio_${i}.mp3 
        -vn 
        -ar 44100 
        -ac 2 
        -b:a 96k 
        audio_fixed_${i}.mp3
    `);

    // =============================
    // Crear subtítulos ASS
    // =============================
    const safeText = text.replace(/\n/g, ' ');

    const ass = `
[Script Info]
ScriptType: v4.00+
PlayResX: 480
PlayResY: 854

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,Arial,24,&H00000000,&H00FFFF00,3,0,0,2,20,20,60

[Events]
Format: Start,End,Style,Text
Dialogue: 0,0:00:00.00,0:00:30.00,Default,{\\b1}${safeText}
`;

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // =============================
    // Crear video final (ULTRA BARATO)
    // =============================
    execSync(`
        ffmpeg -y 
        -i video_${i}.mp4 
        -i audio_fixed_${i}.mp3 
        -vf "scale=480:854,ass=subs_${i}.ass" 
        -map 0:v:0 -map 1:a:0 
        -c:v libx264 
        -preset ultrafast 
        -crf 32 
        -pix_fmt yuv420p 
        -c:a aac 
        -b:a 64k 
        -shortest 
        output_${i}.mp4
    `);

    console.log(`✅ Video listo: output_${i}.mp4`);

    // =============================
    // Subir a Apify (CLAVE)
    // =============================
    const buffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(`video_${i}.mp4`, buffer, {
        contentType: 'video/mp4',
    });

    const url = `https://api.apify.com/v2/key-value-stores/${process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID}/records/video_${i}.mp4`;

    console.log("🎥 LINK:", url);
}

await Actor.exit();
