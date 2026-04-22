import { execSync } from "child_process";
import fs from "fs";
import { Actor } from "apify";

// 🔽 DESCARGA CON TIMEOUT + REINTENTO
async function download(url, path, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const buffer = await res.arrayBuffer();
            fs.writeFileSync(path, Buffer.from(buffer));
            return;

        } catch (err) {
            if (i === retries) {
                throw new Error(`No se pudo descargar: ${url}`);
            }
        }
    }
}

// 🔽 DURACIÓN
function getDuration(file) {
    const out = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`
    ).toString();
    return Math.floor(parseFloat(out));
}

// 🔽 FORMATO TIEMPO
function formatTime(t) {
    const h = String(Math.floor(t / 3600)).padStart(2, "0");
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(t % 60)).padStart(2, "0");
    return `${h}:${m}:${s},000`;
}

// 🔽 GENERAR SRT
function generarSRT(textos, duracion) {
    const tiempo = duracion / textos.length;
    let srt = "";

    textos.forEach((txt, i) => {
        const inicio = i * tiempo;
        const fin = (i + 1) * tiempo;

        srt += `${i + 1}\n${formatTime(inicio)} --> ${formatTime(fin)}\n${txt}\n\n`;
    });

    return srt;
}

// 🔥 MAIN
await Actor.init();

try {
    const input = await Actor.getInput();

    const videoUrl = input.videoUrl;
    const audioUrl = input.audioUrl;
    const subtitlesText = input.subtitles;

    if (!videoUrl || !audioUrl) {
        throw new Error("Faltan URLs de video o audio");
    }

    if (!subtitlesText || !subtitlesText.length) {
        throw new Error("Debes enviar 'subtitles' como array de texto");
    }

    console.log("⬇️ Descargando...");
    await download(videoUrl, "video.mp4");
    await download(audioUrl, "audio.mp3");

    console.log("⏱ Analizando video...");
    const duration = getDuration("video.mp4");
    console.log("Duración:", duration);

    console.log("📝 Creando subtítulos...");
    fs.writeFileSync("subs.srt", generarSRT(subtitlesText, duration));

    console.log("✂️ Cortando audio...");
    execSync(
        `ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3`,
        { stdio: "inherit" }
    );

    // 🔽 AJUSTE ANTI-CRASH (clave)
    let scale = "720:-2";
    let crf = 28;

    if (duration < 30) {
        scale = "854:-2";
        crf = 26;
    }

    if (duration > 90) {
        scale = "640:-2";
        crf = 30;
    }

    console.log(`Resolución: ${scale} | CRF: ${crf}`);

    console.log("⚙️ Renderizando...");

    execSync(`
        ffmpeg -y
        -i video.mp4
        -i audio_cut.mp3
        -vf "scale=${scale},subtitles=subs.srt"
        -map 0:v:0
        -map 1:a:0
        -c:v libx264
        -preset veryfast
        -crf ${crf}
        -c:a aac
        -b:a 128k
        -shortest
        output.mp4
    `, { stdio: "inherit" });

    console.log("📤 Subiendo resultado...");

    await Actor.pushData({
        status: "ok",
        file: "output.mp4"
    });

    console.log("✅ TERMINADO");

} catch (err) {
    console.error("❌ ERROR:", err.message);

    await Actor.pushData({
        status: "error",
        message: err.message
    });
}

await Actor.exit();
