import { Actor } from 'apify';
import fs from 'fs';
import fetch from 'node-fetch';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const { url, texto } = input;

console.log('🔥 CODIGO CON SUBTITULOS DINAMICOS 🔥');

// Descargar video
console.log('Descargando...');
const response = await fetch(url);

if (!response.ok) {
    throw new Error(`Error descargando video: ${response.status}`);
}

const buffer = await response.arrayBuffer();
fs.writeFileSync('input.mp4', Buffer.from(buffer));

console.log('Procesando con subtítulos...');

// Escapar caracteres peligrosos para FFmpeg
const safeText = texto
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');

// FFmpeg con texto dinámico
execSync(`
ffmpeg -i input.mp4 -vf "drawtext=text='${safeText}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=h-100" -codec:a copy output.mp4
`, { stdio: 'inherit' });

console.log('Guardando en Apify...');

// Subir resultado
await Actor.setValue('OUTPUT_VIDEO', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log('✅ VIDEO CON SUBTITULOS LISTO');

await Actor.exit();
