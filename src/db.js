const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Las fechas (DATE) se manejan como texto AAAA-MM-DD para evitar corrimientos por zona horaria
types.setTypeParser(1082, (v) => v);
const bcrypt = require('bcryptjs');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[SIGPI] Falta la variable DATABASE_URL (cadena de conexión de Neon/PostgreSQL).');
}

const local = !url || /localhost|127\.0\.0\.1|host=\/|@\/|\?host=/.test(url);
const pool = new Pool({
  connectionString: url,
  ssl: local ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 10000,
});

const query = (text, params) => pool.query(text, params);

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Catálogos base tomados de la propuesta (33.4) y de las dimensiones del PME
const AREAS = [
  ['Dirección y Rectoría', 'DIR'],
  ['Área Pedagógica', 'PED'],
  ['Área Técnico-Profesional', 'TP'],
  ['Área de Ambiente y Convivencia Escolar', 'ACE'],
  ['Área de Apoyo y Prevención', 'APR'],
  ['Administración y Finanzas', 'ADF'],
  ['Evangelización', 'EVA'],
  ['Comunicaciones', 'COM'],
  ['Ecología Integral', 'ECO'],
];
const DIMENSIONES = ['Gestión Pedagógica', 'Liderazgo', 'Convivencia Escolar', 'Gestión de Recursos'];

let ready = null;
function init() {
  if (!ready) ready = _init().catch((e) => { ready = null; throw e; });
  return ready;
}

async function _init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(sql);

  const { rows: [{ n: nAreas }] } = await query('SELECT count(*)::int n FROM areas');
  if (nAreas === 0) {
    for (let i = 0; i < AREAS.length; i++) {
      await query('INSERT INTO areas (nombre, sigla, orden) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [AREAS[i][0], AREAS[i][1], i + 1]);
    }
  }
  const { rows: [{ n: nDim }] } = await query('SELECT count(*)::int n FROM dimensiones');
  if (nDim === 0) {
    for (let i = 0; i < DIMENSIONES.length; i++) {
      await query('INSERT INTO dimensiones (nombre, orden) VALUES ($1,$2) ON CONFLICT DO NOTHING', [DIMENSIONES[i], i + 1]);
    }
  }

  const { rows: [{ n: nUsers }] } = await query('SELECT count(*)::int n FROM usuarios');
  if (nUsers === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@sigpi.local').toLowerCase();
    const pass = process.env.ADMIN_PASSWORD || 'Cambiar.2026';
    const hash = await bcrypt.hash(pass, 10);
    const { rows: [dir] } = await query("SELECT id FROM areas WHERE sigla='DIR'");
    await query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, area_id, cargo, debe_cambiar_clave)
       VALUES ($1,$2,$3,'admin',$4,'Administrador SIGPI',$5)`,
      ['Administrador SIGPI', email, hash, dir ? dir.id : null, !process.env.ADMIN_PASSWORD]
    );
    console.log(`[SIGPI] Usuario administrador creado: ${email}`);
  }
}

async function audit(usuarioId, evento, entidad, entidadId, detalle) {
  try {
    await query(
      'INSERT INTO auditoria (usuario_id, evento, entidad, entidad_id, detalle) VALUES ($1,$2,$3,$4,$5)',
      [usuarioId || null, evento, entidad || null, entidadId || null, detalle ? JSON.stringify(detalle) : null]
    );
  } catch (e) {
    console.error('[SIGPI] No se pudo registrar auditoría:', e.message);
  }
}

module.exports = { pool, query, tx, init, audit };
