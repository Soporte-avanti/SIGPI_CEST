const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, audit } = require('../db');
const { ROLES, esGestion, requireRol } = require('../auth');
const { FICHAS, calcular } = require('../kpi');

const ADMIN_USUARIOS = ['admin', 'rectoria', 'encargado_pme'];
const txt = (v, max = 4000) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

// ---------- Catálogos ----------
router.get('/catalogos', async (req, res) => {
  const [areas, dimensiones, objetivos, usuarios] = await Promise.all([
    query('SELECT * FROM areas ORDER BY orden, nombre'),
    query('SELECT * FROM dimensiones ORDER BY orden'),
    query('SELECT o.*, d.nombre AS dimension FROM objetivos o LEFT JOIN dimensiones d ON d.id = o.dimension_id WHERE o.activo ORDER BY o.codigo'),
    query('SELECT id, nombre, rol, area_id, cargo FROM usuarios WHERE activo ORDER BY nombre'),
  ]);
  res.json({ areas: areas.rows, dimensiones: dimensiones.rows, objetivos: objetivos.rows, usuarios: usuarios.rows, roles: ROLES });
});

// ---------- Indicadores (Módulo 4) ----------
router.get('/kpi', async (req, res) => {
  const areaId = req.query.area ? Number(req.query.area) : null;
  const soloPiloto = req.query.piloto === '1';
  const [general, metas, cortes, areas] = await Promise.all([
    calcular({ areaId, soloPiloto }),
    query('SELECT * FROM kpi_metas'),
    query('SELECT id, tipo, etiqueta, valores, fecha FROM kpi_cortes ORDER BY fecha DESC LIMIT 24'),
    query('SELECT id, nombre, sigla FROM areas WHERE activa ORDER BY orden'),
  ]);
  let porArea = [];
  if (!areaId) {
    porArea = await Promise.all(areas.rows.map(async (a) => ({ ...a, ...(await calcular({ areaId: a.id, soloPiloto })) })));
    porArea = porArea.filter((a) => a.resumen.total > 0);
  }
  const lineaBase = cortes.rows.find((c) => c.tipo === 'linea_base') || null;
  const metaMap = Object.fromEntries(metas.rows.map((m) => [m.clave, m]));
  res.json({
    fichas: FICHAS.map((f) => ({ ...f, ...(metaMap[f.clave] ? { meta: metaMap[f.clave].meta !== null ? Number(metaMap[f.clave].meta) : null, responsable: metaMap[f.clave].responsable || f.responsable, periodicidad: metaMap[f.clave].periodicidad || f.periodicidad } : { meta: null }) })),
    ...general,
    por_area: porArea,
    linea_base: lineaBase,
    cortes: cortes.rows,
  });
});

router.put('/kpi/metas/:clave', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  if (!FICHAS.find((f) => f.clave === req.params.clave)) return res.status(404).json({ error: 'Indicador desconocido' });
  const meta = req.body.meta === '' || req.body.meta === null || req.body.meta === undefined ? null : Math.min(100, Math.max(0, Number(req.body.meta)));
  await query(
    `INSERT INTO kpi_metas (clave, meta, responsable, periodicidad, actualizado) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (clave) DO UPDATE SET meta=$2, responsable=$3, periodicidad=$4, actualizado=now()`,
    [req.params.clave, meta, txt(req.body.responsable, 120), txt(req.body.periodicidad, 60)]);
  audit(req.user.id, 'definir_meta', 'kpi', null, { clave: req.params.clave, meta });
  res.json({ ok: true });
});

router.post('/kpi/cortes', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const tipo = req.body.tipo === 'linea_base' ? 'linea_base' : 'seguimiento';
  const etiqueta = txt(req.body.etiqueta, 120) || (tipo === 'linea_base' ? 'Línea base' : `Corte ${new Date().toLocaleDateString('es-CL')}`);
  const { valores, resumen } = await calcular({ soloPiloto: req.body.piloto === true });
  const { rows: [c] } = await query('INSERT INTO kpi_cortes (tipo, etiqueta, valores, creado_por) VALUES ($1,$2,$3,$4) RETURNING id',
    [tipo, etiqueta, JSON.stringify({ valores, resumen }), req.user.id]);
  audit(req.user.id, 'registrar_corte', 'kpi', c.id, { tipo, etiqueta });
  res.status(201).json({ id: c.id });
});

router.delete('/kpi/cortes/:id', requireRol('admin', 'encargado_pme'), async (req, res) => {
  await query('DELETE FROM kpi_cortes WHERE id = $1', [req.params.id]);
  audit(req.user.id, 'eliminar_corte', 'kpi', Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Capacitación (Componente 5) ----------
router.get('/capacitaciones', async (req, res) => {
  const { rows } = await query(`
    SELECT c.*, count(cc.usuario_id)::int AS convocados, count(cc.usuario_id) FILTER (WHERE cc.asistio)::int AS asistentes
      FROM capacitaciones c LEFT JOIN capacitacion_convocados cc ON cc.capacitacion_id = c.id
     GROUP BY c.id ORDER BY c.fecha DESC`);
  res.json(rows);
});

router.get('/capacitaciones/:id', async (req, res) => {
  const { rows: [c] } = await query('SELECT * FROM capacitaciones WHERE id = $1', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Capacitación no encontrada' });
  const { rows } = await query(`
    SELECT u.id, u.nombre, u.cargo, a.sigla AS area_sigla, cc.asistio
      FROM capacitacion_convocados cc JOIN usuarios u ON u.id = cc.usuario_id LEFT JOIN areas a ON a.id = u.area_id
     WHERE cc.capacitacion_id = $1 ORDER BY a.orden NULLS LAST, u.nombre`, [c.id]);
  res.json({ ...c, convocados: rows });
});

router.post('/capacitaciones', requireRol(...ADMIN_USUARIOS, 'coordinador'), async (req, res) => {
  const titulo = txt(req.body.titulo, 200);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fecha || '') ? req.body.fecha : null;
  if (!titulo || !fecha) return res.status(400).json({ error: 'Indica título y fecha' });
  const { rows: [c] } = await query(
    'INSERT INTO capacitaciones (titulo, fecha, modalidad, descripcion, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [titulo, fecha, txt(req.body.modalidad, 40) || 'presencial', txt(req.body.descripcion), req.user.id]);
  let ids = (req.body.usuarios || []).map(Number).filter(Boolean);
  const areas = (req.body.areas || []).map(Number).filter(Boolean);
  if (areas.length) {
    const { rows } = await query('SELECT id FROM usuarios WHERE activo AND area_id = ANY($1)', [areas]);
    ids = ids.concat(rows.map((r) => r.id));
  }
  for (const id of new Set(ids)) await query('INSERT INTO capacitacion_convocados (capacitacion_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.id, id]);
  audit(req.user.id, 'crear_capacitacion', 'capacitacion', c.id, { titulo });
  res.status(201).json({ id: c.id });
});

router.put('/capacitaciones/:id/asistencia', requireRol(...ADMIN_USUARIOS, 'coordinador'), async (req, res) => {
  const asistencia = req.body.asistencia || {};
  for (const [uid, asistio] of Object.entries(asistencia)) {
    await query('UPDATE capacitacion_convocados SET asistio = $1 WHERE capacitacion_id = $2 AND usuario_id = $3', [!!asistio, req.params.id, Number(uid)]);
  }
  audit(req.user.id, 'registrar_asistencia', 'capacitacion', Number(req.params.id));
  res.json({ ok: true });
});

router.delete('/capacitaciones/:id', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  await query('DELETE FROM capacitaciones WHERE id = $1', [req.params.id]);
  audit(req.user.id, 'eliminar_capacitacion', 'capacitacion', Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Usuarios ----------
router.get('/usuarios', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const { rows } = await query(`SELECT u.id, u.nombre, u.email, u.rol, u.area_id, u.cargo, u.activo, u.ultimo_acceso, u.creado, a.sigla AS area_sigla
                                  FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id ORDER BY u.activo DESC, u.nombre`);
  res.json(rows);
});

const claveTemporal = () => `Sigpi-${crypto.randomBytes(3).toString('hex')}`;

router.post('/usuarios', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const nombre = txt(req.body.nombre, 120);
  const email = (txt(req.body.email, 160) || '').toLowerCase();
  const rol = Object.keys(ROLES).includes(req.body.rol) ? req.body.rol : 'usuario';
  if (!nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Nombre y correo válido son obligatorios' });
  if (rol === 'admin' && req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede crear administradores' });
  const clave = txt(req.body.password, 100) || claveTemporal();
  try {
    const { rows: [u] } = await query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, area_id, cargo, debe_cambiar_clave)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING id`,
      [nombre, email, await bcrypt.hash(clave, 10), rol, Number(req.body.area_id) || null, txt(req.body.cargo, 120)]);
    audit(req.user.id, 'crear_usuario', 'usuario', u.id, { email, rol });
    res.status(201).json({ id: u.id, clave_temporal: clave });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });
    throw e;
  }
});

router.put('/usuarios/:id', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const { rows: [u] } = await query('SELECT * FROM usuarios WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const rol = Object.keys(ROLES).includes(req.body.rol) ? req.body.rol : u.rol;
  if ((rol === 'admin' || u.rol === 'admin') && req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede modificar administradores' });
  if (u.id === req.user.id && (rol !== u.rol || req.body.activo === false)) return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni desactivarte' });
  await query('UPDATE usuarios SET nombre=$1, rol=$2, area_id=$3, cargo=$4, activo=$5 WHERE id=$6',
    [txt(req.body.nombre, 120) || u.nombre, rol, req.body.area_id === undefined ? u.area_id : Number(req.body.area_id) || null,
      req.body.cargo === undefined ? u.cargo : txt(req.body.cargo, 120), req.body.activo === undefined ? u.activo : !!req.body.activo, u.id]);
  audit(req.user.id, 'editar_usuario', 'usuario', u.id, { rol, activo: req.body.activo });
  res.json({ ok: true });
});

router.post('/usuarios/:id/restablecer', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const { rows: [u] } = await query('SELECT id, rol FROM usuarios WHERE id = $1', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.rol === 'admin' && req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede restablecer administradores' });
  const clave = claveTemporal();
  await query('UPDATE usuarios SET password_hash=$1, debe_cambiar_clave=TRUE WHERE id=$2', [await bcrypt.hash(clave, 10), u.id]);
  audit(req.user.id, 'restablecer_clave', 'usuario', u.id);
  res.json({ clave_temporal: clave });
});

// ---------- Áreas y objetivos ----------
router.post('/areas', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const nombre = txt(req.body.nombre, 120); const sigla = (txt(req.body.sigla, 8) || '').toUpperCase();
  if (!nombre || !sigla) return res.status(400).json({ error: 'Nombre y sigla son obligatorios' });
  const { rows: [{ m }] } = await query('SELECT COALESCE(max(orden),0)+1 m FROM areas');
  await query('INSERT INTO areas (nombre, sigla, orden) VALUES ($1,$2,$3)', [nombre, sigla, m]);
  audit(req.user.id, 'crear_area', 'area', null, { nombre });
  res.status(201).json({ ok: true });
});

router.put('/areas/:id', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  await query('UPDATE areas SET nombre=COALESCE($1,nombre), sigla=COALESCE($2,sigla), activa=COALESCE($3,activa) WHERE id=$4',
    [txt(req.body.nombre, 120), txt(req.body.sigla, 8) && txt(req.body.sigla, 8).toUpperCase(), typeof req.body.activa === 'boolean' ? req.body.activa : null, req.params.id]);
  audit(req.user.id, 'editar_area', 'area', Number(req.params.id));
  res.json({ ok: true });
});

router.post('/objetivos', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const codigo = txt(req.body.codigo, 30); const descripcion = txt(req.body.descripcion, 600);
  if (!codigo || !descripcion) return res.status(400).json({ error: 'Código y descripción son obligatorios' });
  await query('INSERT INTO objetivos (dimension_id, codigo, descripcion) VALUES ($1,$2,$3)', [Number(req.body.dimension_id) || null, codigo, descripcion]);
  audit(req.user.id, 'crear_objetivo', 'objetivo', null, { codigo });
  res.status(201).json({ ok: true });
});

router.delete('/objetivos/:id', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  await query('UPDATE objetivos SET activo = FALSE WHERE id = $1', [req.params.id]);
  audit(req.user.id, 'desactivar_objetivo', 'objetivo', Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Auditoría y reportes ----------
router.get('/auditoria', requireRol(...ADMIN_USUARIOS), async (req, res) => {
  const { rows } = await query(`SELECT l.*, u.nombre AS usuario FROM auditoria l LEFT JOIN usuarios u ON u.id = l.usuario_id
                                 ORDER BY l.fecha DESC LIMIT 300`);
  res.json(rows);
});

const ESTADO_TXT = { no_iniciada: 'No iniciada', en_curso: 'En curso', completada: 'Completada', suspendida: 'Suspendida', cancelada: 'Cancelada' };
router.get('/reportes/acciones.csv', async (req, res) => {
  const { rows } = await query(`
    SELECT a.codigo, a.nombre, d.nombre dimension, o.codigo objetivo, ar.nombre area,
           (SELECT string_agg(x.sigla, ' / ') FROM accion_colaboradoras c JOIN areas x ON x.id=c.area_id WHERE c.accion_id=a.id) colaboradoras,
           u.nombre responsable, a.fecha_inicio, a.fecha_termino, a.estado, a.porcentaje,
           (SELECT count(*) FROM evidencias e WHERE e.accion_id=a.id) evidencias,
           a.resultado, a.observaciones, a.medidas_correctivas, a.ultima_actualizacion, a.cerrada, a.fecha_cierre, a.piloto
      FROM acciones a LEFT JOIN dimensiones d ON d.id=a.dimension_id LEFT JOIN objetivos o ON o.id=a.objetivo_id
      LEFT JOIN areas ar ON ar.id=a.area_id LEFT JOIN usuarios u ON u.id=a.responsable_id
     ORDER BY ar.orden, a.codigo`);
  const head = ['Código', 'Acción', 'Dimensión', 'Objetivo', 'Área responsable', 'Áreas colaboradoras', 'Responsable', 'Fecha inicio', 'Fecha cumplimiento',
    'Estado', '% ejecución', 'N° evidencias', 'Resultado', 'Observaciones', 'Medidas correctivas', 'Última actualización', 'Cerrada', 'Fecha cierre', 'Piloto'];
  const f = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) v = v.toISOString().slice(0, 10);
    if (typeof v === 'boolean') v = v ? 'Sí' : 'No';
    v = ESTADO_TXT[v] || String(v);
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const csv = '﻿' + [head.join(';'), ...rows.map((r) => Object.values(r).map(f).join(';'))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="SIGPI_acciones_${new Date().toISOString().slice(0, 10)}.csv"`);
  audit(req.user.id, 'exportar_reporte', 'reporte', null);
  res.send(csv);
});

module.exports = router;
