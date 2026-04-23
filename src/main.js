import axios from "axios";
import { Actor } from "apify";

await Actor.init();

// 👇 API KEY DIRECTA (para evitar problemas con env variables)
const API_KEY = "bb920a640fbb45e2bd1f77cb091991a0";

const input = await Actor.getInput();

// 👇 nombre EXACTO que debes usar en el input
const audio_url = input?.audio_url;

if (!audio_url) {
    throw new Error("Falta audio_url en el input");
}

try {
    // 1. Enviar audio a AssemblyAI
    const response = await axios.post(
        "https://api.assemblyai.com/v2/transcript",
        {
            audio_url: audio_url,
            punctuate: true,
            format_text: true,
            speech_models: ["universal-2"] // 👈 formato correcto nuevo
        },
        {
            headers: {
                authorization: API_KEY,
                "content-type": "application/json"
            }
        }
    );

    const transcriptId = response.data.id;
    console.log("Transcript ID:", transcriptId);

    // 2. Esperar resultado
    let completed = false;
    let result;

    while (!completed) {
        await new Promise(r => setTimeout(r, 5000));

        const polling = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            {
                headers: {
                    authorization: API_KEY
                }
            }
        );

        if (polling.data.status === "completed") {
            completed = true;
            result = polling.data;
        } else if (polling.data.status === "error") {
            throw new Error(polling.data.error);
        } else {
            console.log("Procesando...");
        }
    }

    console.log("Texto final:", result.text);

    await Actor.pushData({
        text: result.text
    });

} catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    throw error;
}

await Actor.exit();
