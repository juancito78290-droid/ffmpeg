import { Actor } from "apify";
import { execSync } from "child_process";

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

// dividir texto en frases
function splitText(text) {
    return text.split(".").map(t => t.trim()).filter(Boolean);
}

for (let i = 0; i < items.length; i++) {
    const item = items[i];

    console.log(`Procesando item ${i}`);

    if (!item.imageUrl || !item.audioUrl) {
        console.log("❌ Faltan URLs");
        continue;
    }

    execSync(`curl -L "${item.imageUrl}" -o image_${i}.jpg`);
    execSync(`curl -L "${item.audioUrl}" -o audio_${i}.mp3`);

    // acelerar audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -filter:a atempo=1.2 audio_fast_${i}.mp3`);

    // duración
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fast_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`)
            .toString()
            .trim()
    );

    const parts = splitText(item.text || "");
    const partDuration = duration / parts.length;

    // generar drawtext dinámico
    let drawTextFilters = "";

    parts.forEach((p, idx) => {
        const start = (idx * partDuration).toFixed(2);
        const end = ((idx + 1) * partDuration).toFixed(2);

        drawTextFilters += `
        drawtext=
        text='${p.replace(/'/g, "")}':
        fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:
        fontsize=48:
        fontcolor=yellow:
        borderw=2:
        bordercolor=black:
        x=(w-text_w)/2:
        y=h-300:
        enable='between(t,${start},${end})'
        ,`;
    });

    drawTextFilters = drawTextFilters.slice(0, -1);

    execSync(`
    ffmpeg -y -loop 1 -i image_${i}.jpg -i audio_fast_${i}.mp3 \
    -filter_complex "
    [0:v]scale=720:1280:force_original_aspect_ratio=decrease,
    pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,split=2[base][blur];

    [blur]gblur=sigma=8[blurred];

    [base]zoompan=z='1+0.005*sin(on/10)':d=125:s=720x1280[normal];

    [blurred][normal]xfade=transition=fade:duration=0.5:offset=0.3,
    ${drawTextFilters}
    " \
    -map 0:v -map 1:a \
    -t ${duration} \
    -c:v libx264 -preset ultrafast -crf 28 \
    -c:a aac -b:a 96k \
    -pix_fmt yuv420p \
    output_${i}.mp4
    `);

    console.log(`🔥 Viral listo: output_${i}.mp4`);

    await Actor.pushData({
        output: `output_${i}.mp4`
    });
}

await Actor.exit();
