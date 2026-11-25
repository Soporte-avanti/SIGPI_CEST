// Borra TODAS las tablas del SIGPI y las vuelve a crear vacías.
// Uso: npm run reset          (pide confirmación con --si)
//      npm run reset:demo     (reset + datos de demostración)
require('dotenv').config();
const { pool, init } = require('../src/db');

if (!process.argv.includes('--si')) {
  console.log('Esto BORRA todos los datos de la base indicada en DATABASE_URL.');
  console.log('Para confirmar ejecuta: npm run reset -- --si');
  process.exit(1);
}

const host = (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] || '(sin DATABASE_URL)';
const TABLAS = ['auditoria', 'kpi_cortes', 'kpi_metas', 'capacitacion_convocados', 'capacitaciones', 'evidencias',
  'avances', 'accion_colaboradoras', 'acciones', 'usuarios', 'objetivos', 'dimensiones', 'areas'];

(async () => {
  console.log(`[SIGPI] Reiniciando base en: ${host}`);
  await pool.query(`DROP TABLE IF EXISTS ${TABLAS.join(', ')} CASCADE`);
  await init();
  console.log('[SIGPI] Base reiniciada: tablas vacías, catálogos base y administrador creados.');
  await pool.end();
})().catch((e) => { console.error('[SIGPI] Error:', e.message); process.exit(1); });
