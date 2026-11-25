// Restaura un respaldo JSON del SIGPI. REEMPLAZA todos los datos de la base indicada en DATABASE_URL.
// Uso: npm run restaurar -- respaldos/sigpi_2026-11-25_1030.json --si
require('dotenv').config();
const fs = require('fs');
const { pool } = require('../src/db');
const { restaurar } = require('../src/respaldo');

const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!archivo || !process.argv.includes('--si')) {
  console.log('Uso: npm run restaurar -- <archivo.json> --si');
  console.log('Esto REEMPLAZA todos los datos de la base indicada en DATABASE_URL.');
  process.exit(1);
}
const host = (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || '(sin DATABASE_URL)';
(async () => {
  const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  console.log(`[SIGPI] Restaurando ${archivo} (${datos.fecha}) en ${host}…`);
  if (!datos.incluye_archivos) console.log('[SIGPI] Aviso: este respaldo no incluye los archivos de evidencia (solo sus datos).');
  await restaurar(datos);
  console.log('[SIGPI] Restauración completa.');
  await pool.end();
})().catch((e) => { console.error('[SIGPI] Error:', e.message); process.exit(1); });
