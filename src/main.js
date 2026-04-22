import { Actor } from 'apify';

await Actor.init();

try {
    console.log('🚀 Actor iniciado correctamente');

    // Input (por si quieres pasar algo desde Apify)
    const input = await Actor.getInput();
    console.log('Input:', input);

    // Ejemplo simple: devolver datos
    const data = {
        message: 'Actor funcionando ✅',
        timestamp: new Date().toISOString(),
    };

    // Guardar resultado
    await Actor.pushData(data);

    console.log('✅ Datos guardados');

} catch (error) {
    console.error('❌ Error:', error);
} finally {
    await Actor.exit();
}
