const router = require('express').Router();
const multer = require('multer');
const { query, tx, audit, HOY, hoyISO } = require('../db');
const { esGestion, puedeEditar, puedeReportar, puedeValidar } = require('../auth');

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 4);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024 } });

const ESTADOS = ['no_iniciada', 'en_curso', 'completada', 'suspendida', 'cancelada'];
const CATEGORIAS = ['documento', 'acta', 'informe', 'fotografia', 'registro_asistencia', 'planilla', 'otro'];

const SITUACION = `
  CASE
    WHEN a.estado = 'cancelada' THEN 'cancelada'
    WHEN a.cerrada THEN 'cerrada'
    WHEN a.estado = 'completada' THEN 'completada'
    WHEN a.estado = 'suspendida' THEN 'suspendida'
    WHEN a.fecha_termino < ${HOY} THEN 'atrasada'
    WHEN a.fecha_termino <= ${HOY} + 7 THEN 'por_vencer'
    ELSE a.estado
  END`;

const DESACTUALIZADA = `
  (NOT a.cerrada AND a.estado NOT IN ('cancelada','completada')
   AND (a.ultima_actualizacion IS NULL OR a.ultima_actualizacion < now() - make_interval(days => a.periodicidad_dias)))`;

const BASE_SELECT = `
  SELECT a.*, ${SITUACION} AS situacion, ${DESACTUALIZADA} AS desactualizada,
         ar.nombre AS area, ar.sigla AS area_sigla, d.nombre AS dimension,
         o.codigo AS objetivo_codigo, o.descripcion AS objetivo,
         u.nombre AS responsable,
         (SELECT count(*)::int FROM evidencias e WHERE e.accion_id = a.id) AS n_evidencias,
         (SELECT count(*)::int FROM avances v WHERE v.accion_id = a.id) AS n_avances,
         (SELECT count(*)::int FROM avances v WHERE v.accion_id = a.id AND v.validacion = 'pendiente') AS n_pendientes,
         (SELECT v.descripcion FROM avances v WHERE v.accion_id = a.id ORDER BY v.fecha DESC LIMIT 1) AS ultimo_avance,
         COALESCE((SELECT json_agg(json_build_object('id', c.area_id, 'sigla', x.sigla, 'nombre', x.nombre) ORDER BY x.orden)
                     FROM accion_colaboradoras c JOIN areas x ON x.id = c.area_id WHERE c.accion_id = a.id), '[]') AS colaboradoras
    FROM acciones a
    LEFT JOIN areas ar ON ar.id = a.area_id
    LEFT JOIN dimensiones d ON d.id = a.dimension_id
    LEFT JOIN objetivos o ON o.id = a.objetivo_id
    LEFT JOIN usuarios u ON u.id = a.responsable_id`;

const intOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10) || null);
const dateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v).slice(0, 10)) ? String(v).slice(0, 10) : null);
const txt = (v, max = 4000) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

async function getAccion(id) {
  const { rows } = await query(`${BASE_SELECT} WHERE a.id = $1`, [id]);
  return rows[0];
}

// ---------- Listado ----------
router.get('/acciones', async (req, res) => {
  const p = [];
  const w = ['TRUE'];
  // '?' se reemplaza (todas sus apariciones) por el mismo parámetro
  const add = (sql, v) => { p.push(v); w.push(sql.replace(/\?/g, `$${p.length}`)); };
  if (req.query.area) {
    add(req.query.colaboradoras === '1'
      ? '(a.area_id = ? OR EXISTS (SELECT 1 FROM accion_colaboradoras c WHERE c.accion_id = a.id AND c.area_id = ?))'
      : 'a.area_id = ?', Number(req.query.area));
  }
  if (req.query.dimension) add('a.dimension_id = ?', Number(req.query.dimension));
  if (req.query.responsable) add('a.responsable_id = ?', Number(req.query.responsable));
  if (req.query.mias === '1') add('a.responsable_id = ?', req.user.id);
  if (req.query.piloto === '1') w.push('a.piloto');
  if (req.query.q) {
    const sa = (c) => `translate(lower(${c}), 'áéíóúüñ', 'aeiouun')`;
    add(`(${sa('a.nombre')} LIKE ${sa('?')} OR ${sa('a.codigo')} LIKE ${sa('?')} OR ${sa("COALESCE(a.descripcion,'')")} LIKE ${sa('?')})`, `%${req.query.q}%`);
  }
  let sql = `SELECT * FROM (${BASE_SELECT} WHERE ${w.join(' AND ')}) t`;
  if (req.query.situacion) {
    p.push(String(req.query.situacion));
    sql += ` WHERE t.situacion = $${p.length}`;
  } else if (req.query.desactualizadas === '1') {
    sql += ' WHERE t.desactualizada';
  }
  sql += ' ORDER BY (t.situacion = \'atrasada\') DESC, t.fecha_termino NULLS LAST, t.codigo';
  const { rows } = await query(sql, p);
  res.json(rows);
});

// ---------- Detalle ----------
router.get('/acciones/:id', async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  const [{ rows: avances }, { rows: evidencias }] = await Promise.all([
    query(`SELECT v.*, u.nombre AS usuario, w.nombre AS validador
             FROM avances v LEFT JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN usuarios w ON w.id = v.validado_por
            WHERE v.accion_id = $1 ORDER BY v.fecha DESC`, [a.id]),
    query(`SELECT e.id, e.avance_id, e.tipo, e.categoria, e.titulo, e.url, e.nombre_archivo, e.mime, e.tamano, e.fecha, e.subido_por, u.nombre AS autor
             FROM evidencias e LEFT JOIN usuarios u ON u.id = e.subido_por
            WHERE e.accion_id = $1 ORDER BY e.fecha DESC`, [a.id]),
  ]);
  res.json({
    ...a, avances, evidencias,
    permisos: {
      editar: puedeEditar(req.user, a),
      reportar: puedeReportar(req.user, a) && !a.cerrada,
      validar: puedeValidar(req.user, a),
      eliminar: ['admin', 'encargado_pme'].includes(req.user.rol),
    },
  });
});

// ---------- Crear ----------
async function siguienteCodigo(areaId) {
  const { rows: [ar] } = await query('SELECT sigla FROM areas WHERE id = $1', [areaId]);
  const pref = `${ar ? ar.sigla : 'GEN'}-${new Date().getFullYear()}-`;
  const { rows: [m] } = await query(
    "SELECT COALESCE(max(substring(codigo from '(\\d+)$')::int),0) AS n FROM acciones WHERE codigo LIKE $1", [`${pref}%`]);
  return pref + String(m.n + 1).padStart(3, '0');
}

function leerCampos(b) {
  return {
    nombre: txt(b.nombre, 300),
    descripcion: txt(b.descripcion),
    dimension_id: intOrNull(b.dimension_id),
    objetivo_id: intOrNull(b.objetivo_id),
    area_id: intOrNull(b.area_id),
    responsable_id: intOrNull(b.responsable_id),
    fecha_inicio: dateOrNull(b.fecha_inicio),
    fecha_termino: dateOrNull(b.fecha_termino),
    periodicidad_dias: Math.min(365, Math.max(1, intOrNull(b.periodicidad_dias) || 15)),
    piloto: !!b.piloto,
    observaciones: txt(b.observaciones),
    medidas_correctivas: txt(b.medidas_correctivas),
  };
}

function validarCampos(c) {
  if (!c.nombre) return 'El nombre de la acción es obligatorio';
  if (!c.area_id) return 'Debes indicar el área responsable';
  if (c.fecha_inicio && c.fecha_termino && c.fecha_termino < c.fecha_inicio) return 'La fecha de cumplimiento no puede ser anterior a la de inicio';
  return null;
}

async function guardarColaboradoras(client, accionId, ids, areaPrincipal) {
  await client.query('DELETE FROM accion_colaboradoras WHERE accion_id = $1', [accionId]);
  const unicos = [...new Set((ids || []).map(Number).filter((x) => x && x !== areaPrincipal))];
  for (const id of unicos) await client.query('INSERT INTO accion_colaboradoras VALUES ($1,$2) ON CONFLICT DO NOTHING', [accionId, id]);
}

router.post('/acciones', async (req, res) => {
  const c = leerCampos(req.body);
  const err = validarCampos(c);
  if (err) return res.status(400).json({ error: err });
  if (!esGestion(req.user) && !(req.user.rol === 'coordinador' && req.user.area_id === c.area_id)) {
    return res.status(403).json({ error: 'Solo la gestión institucional o la coordinación del área pueden registrar acciones' });
  }
  const codigo = txt(req.body.codigo, 40) || (await siguienteCodigo(c.area_id));
  try {
    const id = await tx(async (cl) => {
      const { rows: [r] } = await cl.query(
        `INSERT INTO acciones (codigo, nombre, descripcion, dimension_id, objetivo_id, area_id, responsable_id,
           fecha_inicio, fecha_termino, periodicidad_dias, piloto, observaciones, medidas_correctivas, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [codigo, c.nombre, c.descripcion, c.dimension_id, c.objetivo_id, c.area_id, c.responsable_id,
          c.fecha_inicio, c.fecha_termino, c.periodicidad_dias, c.piloto, c.observaciones, c.medidas_correctivas, req.user.id]);
      await guardarColaboradoras(cl, r.id, req.body.colaboradoras, c.area_id);
      return r.id;
    });
    audit(req.user.id, 'crear_accion', 'accion', id, { codigo });
    res.status(201).json(await getAccion(id));
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: `Ya existe una acción con el código ${codigo}` });
    throw e;
  }
});

// Importación masiva (filas ya interpretadas en el navegador desde CSV)
router.post('/acciones/importar', async (req, res) => {
  if (!esGestion(req.user)) return res.status(403).json({ error: 'Solo la gestión institucional puede importar acciones' });
  const filas = Array.isArray(req.body.filas) ? req.body.filas.slice(0, 500) : [];
  const { rows: areas } = await query('SELECT id, sigla, lower(nombre) nombre FROM areas');
  const { rows: dims } = await query('SELECT id, lower(nombre) nombre FROM dimensiones');
  const { rows: users } = await query('SELECT id, lower(email) email, lower(nombre) nombre FROM usuarios');
  const buscarArea = (v) => { const s = String(v || '').trim().toLowerCase(); return areas.find((a) => a.sigla.toLowerCase() === s || a.nombre === s); };
  const resultado = { creadas: 0, errores: [] };
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const area = buscarArea(f.area);
    const dim = dims.find((d) => d.nombre === String(f.dimension || '').trim().toLowerCase());
    const u = users.find((x) => x.email === String(f.responsable || '').trim().toLowerCase() || x.nombre === String(f.responsable || '').trim().toLowerCase());
    const c = leerCampos({ ...f, area_id: area && area.id, dimension_id: dim && dim.id, responsable_id: u && u.id, piloto: /^(s|si|sí|1|true|x)$/i.test(String(f.piloto || '')) });
    const err = validarCampos(c);
    if (err) { resultado.errores.push({ fila: i + 2, error: err }); continue; }
    try {
      const codigo = txt(f.codigo, 40) || (await siguienteCodigo(c.area_id));
      await query(
        `INSERT INTO acciones (codigo, nombre, descripcion, dimension_id, area_id, responsable_id, fecha_inicio, fecha_termino, periodicidad_dias, piloto, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [codigo, c.nombre, c.descripcion, c.dimension_id, c.area_id, c.responsable_id, c.fecha_inicio, c.fecha_termino, c.periodicidad_dias, c.piloto, req.user.id]);
      resultado.creadas++;
    } catch (e) {
      resultado.errores.push({ fila: i + 2, error: e.code === '23505' ? 'Código duplicado' : e.message });
    }
  }
  audit(req.user.id, 'importar_acciones', 'accion', null, { creadas: resultado.creadas, errores: resultado.errores.length });
  res.json(resultado);
});

// ---------- Editar ----------
router.put('/acciones/:id', async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  if (!puedeEditar(req.user, a)) return res.status(403).json({ error: 'No puedes editar esta acción' });
  const c = leerCampos({ ...a, ...req.body });
  const err = validarCampos(c);
  if (err) return res.status(400).json({ error: err });
  if (!esGestion(req.user) && c.area_id !== a.area_id) return res.status(403).json({ error: 'Solo la gestión institucional puede reasignar el área' });
  await tx(async (cl) => {
    await cl.query(
      `UPDATE acciones SET nombre=$1, descripcion=$2, dimension_id=$3, objetivo_id=$4, area_id=$5, responsable_id=$6,
         fecha_inicio=$7, fecha_termino=$8, periodicidad_dias=$9, piloto=$10, observaciones=$11, medidas_correctivas=$12
       WHERE id=$13`,
      [c.nombre, c.descripcion, c.dimension_id, c.objetivo_id, c.area_id, c.responsable_id,
        c.fecha_inicio, c.fecha_termino, c.periodicidad_dias, c.piloto, c.observaciones, c.medidas_correctivas, a.id]);
    if (req.body.colaboradoras) await guardarColaboradoras(cl, a.id, req.body.colaboradoras, c.area_id);
  });
  audit(req.user.id, 'editar_accion', 'accion', a.id, { codigo: a.codigo });
  res.json(await getAccion(a.id));
});

router.delete('/acciones/:id', async (req, res) => {
  if (!['admin', 'encargado_pme'].includes(req.user.rol)) return res.status(403).json({ error: 'Solo administración o Encargado PME pueden eliminar acciones' });
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  await query('DELETE FROM acciones WHERE id = $1', [a.id]);
  audit(req.user.id, 'eliminar_accion', 'accion', a.id, { codigo: a.codigo, nombre: a.nombre });
  res.json({ ok: true });
});

// ---------- Avances (Módulo 2) ----------
router.post('/acciones/:id/avances', async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  if (!puedeReportar(req.user, a)) return res.status(403).json({ error: 'No puedes reportar avances en esta acción' });
  if (a.cerrada) return res.status(400).json({ error: 'La acción está cerrada' });
  const estado = ESTADOS.includes(req.body.estado) ? req.body.estado : a.estado;
  let porcentaje = Math.min(100, Math.max(0, Number.parseInt(req.body.porcentaje, 10)));
  if (Number.isNaN(porcentaje)) porcentaje = a.porcentaje;
  if (estado === 'completada') porcentaje = 100;
  if (estado === 'no_iniciada' && porcentaje > 0) return res.status(400).json({ error: 'Una acción con avance no puede quedar como "No iniciada"' });
  const descripcion = txt(req.body.descripcion);
  if (!descripcion) return res.status(400).json({ error: 'Describe el avance realizado' });
  const medidas = txt(req.body.medidas_correctivas);

  const avanceId = await tx(async (cl) => {
    const { rows: [v] } = await cl.query(
      `INSERT INTO avances (accion_id, usuario_id, estado, porcentaje, descripcion, medidas_correctivas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [a.id, req.user.id, estado, porcentaje, descripcion, medidas]);
    await cl.query(
      `UPDATE acciones SET estado=$1, porcentaje=$2, ultima_actualizacion=now(),
         medidas_correctivas = COALESCE($3, medidas_correctivas),
         fecha_cierre = CASE WHEN $1 = 'completada' THEN COALESCE(fecha_cierre, ${HOY}) ELSE NULL END
       WHERE id=$4`, [estado, porcentaje, medidas, a.id]);
    return v.id;
  });
  audit(req.user.id, 'reportar_avance', 'accion', a.id, { codigo: a.codigo, estado, porcentaje });
  res.status(201).json({ id: avanceId });
});

router.post('/avances/:id/validar', async (req, res) => {
  const { rows: [v] } = await query('SELECT * FROM avances WHERE id = $1', [req.params.id]);
  if (!v) return res.status(404).json({ error: 'Registro no encontrado' });
  const a = await getAccion(v.accion_id);
  if (!puedeValidar(req.user, a)) return res.status(403).json({ error: 'No puedes validar registros de esta área' });
  if (v.usuario_id === req.user.id && req.user.rol !== 'admin') return res.status(400).json({ error: 'No puedes validar un registro ingresado por ti' });
  const validacion = req.body.validacion === 'observado' ? 'observado' : 'validado';
  const comentario = txt(req.body.comentario);
  if (validacion === 'observado' && !comentario) return res.status(400).json({ error: 'Indica la observación para que el responsable corrija' });
  await query('UPDATE avances SET validacion=$1, comentario_validacion=$2, validado_por=$3, fecha_validacion=now() WHERE id=$4',
    [validacion, comentario, req.user.id, v.id]);
  audit(req.user.id, validacion === 'validado' ? 'validar_registro' : 'observar_registro', 'avance', v.id, { accion: a.codigo });
  res.json({ ok: true });
});

router.get('/validaciones', async (req, res) => {
  const p = [];
  let filtro = '';
  if (!esGestion(req.user)) {
    if (req.user.rol !== 'coordinador') return res.json([]);
    p.push(req.user.area_id); filtro = 'AND a.area_id = $1';
  }
  const { rows } = await query(
    `SELECT v.*, a.codigo, a.nombre AS accion, a.area_id, ar.sigla AS area_sigla, u.nombre AS usuario,
            (SELECT count(*)::int FROM evidencias e WHERE e.avance_id = v.id) AS n_evidencias
       FROM avances v JOIN acciones a ON a.id = v.accion_id
       LEFT JOIN areas ar ON ar.id = a.area_id LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.validacion = 'pendiente' ${filtro} ORDER BY v.fecha`, p);
  res.json(rows);
});

// ---------- Cierre ----------
router.post('/acciones/:id/cerrar', async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  if (!puedeValidar(req.user, a)) return res.status(403).json({ error: 'No puedes cerrar esta acción' });
  const resultado = txt(req.body.resultado);
  if (!resultado) return res.status(400).json({ error: 'Registra el resultado obtenido antes de cerrar' });
  const estado = req.body.estado === 'cancelada' ? 'cancelada' : 'completada';
  const fecha = dateOrNull(req.body.fecha_cierre) || a.fecha_cierre || hoyISO();
  if (estado === 'completada' && a.n_evidencias === 0 && !req.body.sin_evidencia) {
    return res.status(400).json({ error: 'La acción no tiene evidencias asociadas. Adjunta al menos una o confirma el cierre sin evidencia.', requiere_confirmacion: true });
  }
  await query(
    `UPDATE acciones SET cerrada=TRUE, estado=$1, porcentaje=CASE WHEN $1='completada' THEN 100 ELSE porcentaje END,
       resultado=$2, fecha_cierre=$3, cerrada_por=$4, ultima_actualizacion=now() WHERE id=$5`,
    [estado, resultado, fecha, req.user.id, a.id]);
  audit(req.user.id, 'cerrar_accion', 'accion', a.id, { codigo: a.codigo, estado });
  res.json(await getAccion(a.id));
});

router.post('/acciones/:id/reabrir', async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  if (!esGestion(req.user)) return res.status(403).json({ error: 'Solo la gestión institucional puede reabrir acciones' });
  await query(`UPDATE acciones SET cerrada=FALSE, cerrada_por=NULL,
                 estado = CASE WHEN estado='cancelada' THEN 'en_curso' ELSE estado END WHERE id=$1`, [a.id]);
  audit(req.user.id, 'reabrir_accion', 'accion', a.id, { codigo: a.codigo, motivo: txt(req.body.motivo) });
  res.json(await getAccion(a.id));
});

// ---------- Evidencias (Módulo 3) ----------
router.post('/acciones/:id/evidencias', (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `El archivo supera ${MAX_MB} MB. Súbelo a Drive y registra el enlace.` : err.message });
    next();
  });
}, async (req, res) => {
  const a = await getAccion(req.params.id);
  if (!a) return res.status(404).json({ error: 'Acción no encontrada' });
  if (!puedeReportar(req.user, a)) return res.status(403).json({ error: 'No puedes adjuntar evidencias en esta acción' });
  const titulo = txt(req.body.titulo, 200);
  if (!titulo) return res.status(400).json({ error: 'Indica un título para la evidencia' });
  const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : 'documento';
  const avanceId = intOrNull(req.body.avance_id);
  let id;
  if (req.file) {
    ({ rows: [{ id }] } = await query(
      `INSERT INTO evidencias (accion_id, avance_id, tipo, categoria, titulo, nombre_archivo, mime, tamano, contenido, subido_por)
       VALUES ($1,$2,'archivo',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [a.id, avanceId, categoria, titulo, req.file.originalname.slice(0, 200), req.file.mimetype, req.file.size, req.file.buffer, req.user.id]));
  } else {
    const url = txt(req.body.url, 1000);
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Adjunta un archivo o un enlace válido (https://…)' });
    ({ rows: [{ id }] } = await query(
      `INSERT INTO evidencias (accion_id, avance_id, tipo, categoria, titulo, url, subido_por)
       VALUES ($1,$2,'enlace',$3,$4,$5,$6) RETURNING id`, [a.id, avanceId, categoria, titulo, url, req.user.id]));
  }
  audit(req.user.id, 'agregar_evidencia', 'accion', a.id, { codigo: a.codigo, titulo });
  res.status(201).json({ id });
});

router.get('/evidencias/:id/archivo', async (req, res) => {
  const { rows: [e] } = await query('SELECT nombre_archivo, mime, contenido FROM evidencias WHERE id = $1 AND tipo = \'archivo\'', [req.params.id]);
  if (!e) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.setHeader('Content-Type', e.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(e.nombre_archivo || 'evidencia')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(e.contenido);
});

router.delete('/evidencias/:id', async (req, res) => {
  const { rows: [e] } = await query('SELECT id, accion_id, subido_por, titulo FROM evidencias WHERE id = $1', [req.params.id]);
  if (!e) return res.status(404).json({ error: 'Evidencia no encontrada' });
  const a = await getAccion(e.accion_id);
  if (e.subido_por !== req.user.id && !puedeValidar(req.user, a)) return res.status(403).json({ error: 'No puedes eliminar esta evidencia' });
  if (a.cerrada && !esGestion(req.user)) return res.status(400).json({ error: 'La acción está cerrada' });
  await query('DELETE FROM evidencias WHERE id = $1', [e.id]);
  audit(req.user.id, 'eliminar_evidencia', 'accion', a.id, { codigo: a.codigo, titulo: e.titulo });
  res.json({ ok: true });
});

module.exports = router;
