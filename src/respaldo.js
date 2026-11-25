// Respaldo y restauración completa de la base del SIGPI en un archivo JSON.
const { pool, query, init } = require('./db');

// Orden que respeta las llaves foráneas al restaurar
const TABLAS = ['areas', 'dimensiones', 'objetivos', 'usuarios', 'acciones', 'accion_colaboradoras', 'avances', 'evidencias',
  'capacitaciones', 'capacitacion_convocados', 'kpi_metas', 'kpi_cortes', 'auditoria', 'errores', 'avisos_enviados'];

async function tiposDe(tabla, client = pool) {
  const { rows } = await client.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [tabla]);
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
}

// incluirArchivos=false omite el contenido binario de las evidencias (para descargas web livianas)
async function exportar({ incluirArchivos = true } = {}) {
  await init();
  const tablas = {};
  for (const t of TABLAS) {
    const tipos = await tiposDe(t);
    const { rows } = await query(`SELECT * FROM ${t}`);
    tablas[t] = rows.map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) {
        if (tipos[k] === 'bytea') o[k] = v && incluirArchivos ? Buffer.from(v).toString('base64') : null;
        else o[k] = v;
      }
      return o;
    });
  }
  const conteo = Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, v.length]));
  return { sistema: 'SIGPI', formato: 1, fecha: new Date().toISOString(), incluye_archivos: incluirArchivos, conteo, tablas };
}

async function pesoArchivos() {
  const { rows: [r] } = await query('SELECT COALESCE(sum(octet_length(contenido)),0)::bigint AS bytes FROM evidencias');
  return Number(r.bytes);
}

async function restaurar(respaldo) {
  if (!respaldo || respaldo.sistema !== 'SIGPI' || !respaldo.tablas) throw new Error('El archivo no es un respaldo válido del SIGPI');
  await init();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${[...TABLAS, 'tokens_clave'].join(', ')} RESTART IDENTITY CASCADE`);
    for (const t of TABLAS) {
      const filas = respaldo.tablas[t] || [];
      if (!filas.length) continue;
      const tipos = await tiposDe(t, client);
      for (const f of filas) {
        const cols = Object.keys(f).filter((c) => c in tipos);
        const vals = cols.map((c) => {
          const v = f[c];
          if (v === null || v === undefined) return null;
          if (tipos[c] === 'bytea') return Buffer.from(v, 'base64');
          if (tipos[c] === 'jsonb' || tipos[c] === 'json') return JSON.stringify(v);
          return v;
        });
        await client.query(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
      }
      // Ajusta la secuencia del id
      if ('id' in tipos) {
        await client.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), GREATEST((SELECT COALESCE(max(id), 0) FROM ${t}), 1), (SELECT count(*) > 0 FROM ${t}))`);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { exportar, restaurar, pesoArchivos, TABLAS };
