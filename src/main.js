import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

const store = await Actor.openKeyValueStore();
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
    const { imageUrl, videoUrl, audioUrl, text } = items[i];

    console.log(`Procesando item ${i}`);

    // =========================
    // DESCARGAS
    // =========================
    execSync(`curl -L "${imageUrl}" -o image_${i}.jpg`, { stdio: 'inherit' });
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`, { stdio: 'inherit' });
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`, { stdio: 'inherit' });

    // =========================
    // AUDIO 1.3x
    // =========================
    execSync(`
        ffmpeg -y -i audio_${i}.mp3 \
        -filter:a "atempo=1.3" \
        -vn audio_fast_${i}.mp3
    `, { stdio: 'inherit' });

    // DURACIÓN REAL (ya acelerado)
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fast_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`)
            .toString().trim()
    );

    console.log("Duración final:", duration);

    // =========================
    // TEXTO (ASS)
    // =========================
    const words = text.toUpperCase().split(" ");
    const chunkSize = Math.ceil(words.length / 5);
    const parts = [];

    for (let j = 0; j < words.length; j += chunkSize) {
        parts.push(words.slice(j, j + chunkSize).join(" "));
    }

    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,DejaVu Sans Bold,56,&H0000FFFF,&H00000000,&H00000000,1,2,0,2,20,20,220

[Events]
Format: Start,End,Style,Text
`;

    function formatTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
    }

    const partDuration = duration / parts.length;

    parts.forEach((p, idx) => {
        const start = idx * partDuration;
        const end = start + partDuration;
        ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,${p}\n`;
    });

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // =========================
    // 🖼️ IMAGEN (EFECTO VIRAL REAL)
    // =========================
    execSync(`
        ffmpeg -y -loop 1 -i image_${i}.jpg \
        -vf "
        scale=720:1280:force_original_aspect_ratio=decrease,
        pad=720:1280:(ow-iw)/2:(oh-ih)/2,

        zoompan=
        z='if(lte(on,8),1+0.18*on, if(lte(on,30),1.4-(on-8)*0.02,1.1))':
        d=125:s=720x1280,

        boxblur='if(lte(on,8),5,0)',

        eq=contrast=1.2:saturation=1.3,
        unsharp=5:5:1.0,
        setsar=1
        " \
        -t 5 \
        -c:v libx264 -preset ultrafast -crf 28 \
        -pix_fmt yuv420p \
        image_part_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // 🎥 VIDEO (1.5x velocidad)
    // =========================
    const remaining = Math.max(duration - 5, 1);

    execSync(`
        ffmpeg -y -i video_${i}.mp4 \
        -filter:v "setpts=PTS/1.5,
        scale=720:1280:force_original_aspect_ratio=decrease,
        pad=720:1280:(ow-iw)/2:(oh-ih)/2,
        setsar=1" \
        -t ${remaining} \
        -an \
        -c:v libx264 -preset ultrafast -crf 28 \
        video_part_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // UNIR
    // =========================
    fs.writeFileSync(`list_${i}.txt`,
`file 'image_part_${i}.mp4'
file 'video_part_${i}.mp4'`);

    execSync(`
        ffmpeg -y -f concat -safe 0 -i list_${i}.txt \
        -c copy combined_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // FINAL
    // =========================
    execSync(`
        ffmpeg -y -i combined_${i}.mp4 -i audio_fast_${i}.mp3 \
        -vf "ass=subs_${i}.ass" \
        -t ${duration} \
        -c:v libx264 -preset ultrafast -crf 28 \
        -c:a aac -b:a 128k \
        -shortest \
        output_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // GUARDAR
    // =========================
    const key = `output-${i}-${Date.now()}.mp4`;
    const videoBuffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(key, videoBuffer, {
        contentType: 'video/mp4'
    });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;

    console.log("VIDEO LISTO:", url);

    await Actor.pushData({ videoUrl: url });
}

await Actor.exit();
