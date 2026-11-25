// Exporta toda la base del SIGPI a respaldos/sigpi_AAAA-MM-DD_HHMM.json (incluye los archivos de evidencia).
// Uso: npm run respaldo
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');
const { exportar } = require('../src/respaldo');

(async () => {
  const datos = await exportar({ incluirArchivos: true });
  const dir = path.join(__dirname, '..', 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  const sello = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 16).replace(' ', '_').replace(':', '');
  const archivo = path.join(dir, `sigpi_${sello}.json`);
  fs.writeFileSync(archivo, JSON.stringify(datos));
  const mb = (fs.statSync(archivo).size / 1048576).toFixed(2);
  console.log(`[SIGPI] Respaldo creado: ${archivo} (${mb} MB)`);
  console.log('[SIGPI] Registros:', Object.entries(datos.conteo).filter(([, n]) => n).map(([t, n]) => `${t}=${n}`).join(', '));
  await pool.end();
})().catch((e) => { console.error('[SIGPI] Error:', e.message); process.exit(1); });
