// Pruebas de la API del SIGPI.
// Requieren una base PostgreSQL DESECHABLE: se borra completa al iniciar.
//   TEST_DATABASE_URL=postgresql://... npm test
// Con Neon, crea una rama "test" solo para esto. Nunca uses la base de producción.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const URL_TEST = process.env.TEST_DATABASE_URL;
if (!URL_TEST) {
  test('pruebas omitidas', { skip: 'Define TEST_DATABASE_URL con una base desechable para ejecutar las pruebas' }, () => {});
  return;
}
process.env.DATABASE_URL = URL_TEST;
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.ADMIN_EMAIL = 'admin@test.cl';
process.env.ADMIN_PASSWORD = 'Admin.Test1';
process.env.CRON_SECRET = 'cron-de-prueba';
delete process.env.RESEND_API_KEY;

const { pool, init, hoyISO } = require('../src/db');
const app = require('../src/app');
let server; let base;

// Cliente mínimo con cookie de sesión
function cliente() {
  let cookie = '';
  const call = async (method, path, body) => {
    const opts = { method, headers: {} };
    if (cookie) opts.headers.cookie = cookie;
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(base + path, opts);
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, data };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b ?? {}), del: (p) => call('DELETE', p),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
  };
}
const diasDesdeHoy = (n) => { const d = new Date(hoyISO() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const admin = cliente(); const coord = cliente(); const resp = cliente(); const usu = cliente();
let claves = {}; let areaPED; let accionId;

before(async () => {
  const TABLAS = ['errores', 'tokens_clave', 'avisos_enviados', 'auditoria', 'kpi_cortes', 'kpi_metas', 'capacitacion_convocados', 'capacitaciones',
    'evidencias', 'avances', 'accion_colaboradoras', 'acciones', 'usuarios', 'objetivos', 'dimensiones', 'areas'];
  await pool.query(`DROP TABLE IF EXISTS ${TABLAS.join(', ')} CASCADE`);
  await init();
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server && server.close(); await pool.end(); });

test('login: rechaza clave incorrecta y acepta al administrador', async () => {
  assert.equal((await admin.login('admin@test.cl', 'mala')).status, 401);
  assert.equal((await admin.login('admin@test.cl', 'Admin.Test1')).status, 200);
  const me = await admin.get('/api/auth/me');
  assert.equal(me.data.rol, 'admin');
});

test('importación de usuarios por CSV con validaciones', async () => {
  const r = await admin.post('/api/usuarios/importar', { filas: [
    { nombre: 'Coord PED', email: 'coord@test.cl', rol: 'Coordinación de área', area: 'PED' },
    { nombre: 'Resp PED', email: 'resp@test.cl', rol: 'responsable', area: 'Área Pedagógica' },
    { nombre: 'Usuario COM', email: 'usu@test.cl', rol: 'usuario', area: 'COM' },
    { nombre: 'Sin área', email: 'x@test.cl', rol: 'coordinador' },
    { nombre: 'Correo malo', email: 'malo', rol: 'usuario' },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.data.creados.length, 3);
  assert.equal(r.data.errores.length, 2);
  for (const u of r.data.creados) claves[u.email] = u.clave_temporal;
  const cat = await admin.get('/api/catalogos');
  areaPED = cat.data.areas.find((a) => a.sigla === 'PED').id;
  assert.equal((await coord.login('coord@test.cl', claves['coord@test.cl'])).status, 200);
  assert.equal((await resp.login('resp@test.cl', claves['resp@test.cl'])).status, 200);
  assert.equal((await usu.login('usu@test.cl', claves['usu@test.cl'])).status, 200);
});

test('permisos para registrar acciones', async () => {
  const cat = await admin.get('/api/catalogos');
  const respId = cat.data.usuarios.find((u) => u.nombre === 'Resp PED').id;
  assert.equal((await usu.post('/api/acciones', { nombre: 'No debería', area_id: areaPED })).status, 403);
  const otraArea = cat.data.areas.find((a) => a.sigla === 'TP').id;
  assert.equal((await coord.post('/api/acciones', { nombre: 'Otra área', area_id: otraArea })).status, 403);
  const r = await coord.post('/api/acciones', { nombre: 'Monitoreo de cobertura', area_id: areaPED, responsable_id: respId, fecha_inicio: diasDesdeHoy(-10), fecha_termino: diasDesdeHoy(-1) });
  assert.equal(r.status, 201);
  assert.match(r.data.codigo, /^PED-\d{4}-001$/);
  accionId = r.data.id;
});

test('zona horaria: una acción vencida ayer (hora de Chile) aparece atrasada', async () => {
  const r = await admin.get(`/api/acciones/${accionId}`);
  assert.equal(r.data.situacion, 'atrasada');
  const k = await admin.get('/api/kpi');
  assert.equal(k.data.resumen.atrasadas, 1);
});

test('flujo de avance, validación y reglas de autovalidación', async () => {
  const a = await resp.post(`/api/acciones/${accionId}/avances`, { estado: 'en_curso', porcentaje: 60, descripcion: 'Revisión de 3 asignaturas' });
  assert.equal(a.status, 201);
  assert.equal((await resp.post(`/api/avances/${a.data.id}/validar`, {})).status, 403);
  assert.equal((await coord.post(`/api/avances/${a.data.id}/validar`, { validacion: 'observado' })).status, 400, 'observar exige comentario');
  assert.equal((await coord.post(`/api/avances/${a.data.id}/validar`, { validacion: 'validado' })).status, 200);
  const propio = await coord.post(`/api/acciones/${accionId}/avances`, { estado: 'en_curso', porcentaje: 70, descripcion: 'Avance de la coordinación' });
  assert.equal((await coord.post(`/api/avances/${propio.data.id}/validar`, { validacion: 'validado' })).status, 400);
  const pend = await admin.get('/api/validaciones');
  assert.equal(pend.data.length, 1);
});

test('evidencia: subida, descarga y cierre de la acción', async () => {
  const sinEv = await coord.post(`/api/acciones/${accionId}/cerrar`, { resultado: 'Logrado' });
  assert.equal(sinEv.status, 400);
  assert.equal(sinEv.data.requiere_confirmacion, true);
  const fd = new FormData();
  fd.append('titulo', 'Acta de revisión');
  fd.append('categoria', 'acta');
  fd.append('archivo', new Blob(['%PDF-1.4 prueba'], { type: 'application/pdf' }), 'acta.pdf');
  const up = await resp.post(`/api/acciones/${accionId}/evidencias`, fd);
  assert.equal(up.status, 201);
  const dl = await usu.get(`/api/evidencias/${up.data.id}/archivo`);
  assert.equal(dl.data, '%PDF-1.4 prueba');
  const ok = await coord.post(`/api/acciones/${accionId}/cerrar`, { resultado: 'Cobertura monitoreada en 3 asignaturas' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.cerrada, true);
  assert.equal((await resp.post(`/api/acciones/${accionId}/avances`, { porcentaje: 100, descripcion: 'x' })).status, 400);
  const k = await admin.get('/api/kpi');
  assert.equal(k.data.valores.evidencia.valor, 100);
  assert.equal(k.data.valores.cumplimiento.valor, 100);
  assert.equal(k.data.valores.plazos.valor, 0, 'se cerró después de la fecha de cumplimiento');
});

test('cambio de contraseña invalida las sesiones anteriores', async () => {
  const otro = cliente();
  await otro.login('usu@test.cl', claves['usu@test.cl']);
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal((await usu.post('/api/auth/cambiar-clave', { actual: claves['usu@test.cl'], nueva: 'NuevaClave.2026' })).status, 200);
  assert.equal((await usu.get('/api/auth/me')).status, 200, 'la sesión que cambió la clave sigue activa');
  assert.equal((await otro.get('/api/auth/me')).status, 401, 'la otra sesión queda cerrada');
});

test('tarea programada de avisos exige el secreto', async () => {
  assert.equal((await fetch(`${base}/api/cron/avisos`)).status, 401);
  const r = await fetch(`${base}/api/cron/avisos`, { headers: { authorization: 'Bearer cron-de-prueba' } });
  assert.equal(r.status, 200);
  const prev = await admin.post('/api/avisos/enviar', { dry: true });
  assert.equal(prev.status, 200);
  assert.equal((await resp.post('/api/avisos/enviar', { dry: true })).status, 403);
});

test('respaldo: exporta y restaura sin pérdida', async () => {
  const { exportar, restaurar } = require('../src/respaldo');
  const antes = await exportar();
  await pool.query('DELETE FROM acciones');
  await restaurar(antes);
  const despues = await exportar();
  assert.deepEqual(despues.conteo, antes.conteo);
  const ev = despues.tablas.evidencias[0];
  assert.equal(Buffer.from(ev.contenido, 'base64').toString(), '%PDF-1.4 prueba');
  assert.equal((await resp.get('/api/respaldo')).status, 403);
});
