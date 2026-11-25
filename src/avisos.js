// Avisos automáticos por correo: acciones atrasadas, por vencer, sin actualizar y registros por validar.
const { query, HOY, TZ } = require('./db');
const { enviarCorreo, plantilla, correoConfigurado, esc } = require('./mail');

const fmt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : 'sin fecha');

// Calcula, para cada usuario activo que acepta avisos, lo que debe saber hoy.
async function calcular() {
  const { rows: usuarios } = await query(`
    SELECT u.id, u.nombre, u.email, u.rol, u.area_id, a.nombre AS area
      FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id
     WHERE u.activo AND u.recibe_avisos ORDER BY u.id`);

  const { rows: acciones } = await query(`
    SELECT a.id, a.codigo, a.nombre, a.area_id, a.responsable_id, a.fecha_termino, a.porcentaje,
           (a.fecha_termino < ${HOY}) AS atrasada,
           (a.fecha_termino >= ${HOY} AND a.fecha_termino <= ${HOY} + 7) AS por_vencer,
           (a.ultima_actualizacion IS NULL OR a.ultima_actualizacion < now() - make_interval(days => a.periodicidad_dias)) AS desactualizada
      FROM acciones a
     WHERE NOT a.cerrada AND a.estado NOT IN ('completada','cancelada','suspendida')`);

  const { rows: pendientes } = await query(`
    SELECT a.area_id, count(*)::int AS n, min(v.fecha) AS desde
      FROM avances v JOIN acciones a ON a.id = v.accion_id
     WHERE v.validacion = 'pendiente' GROUP BY a.area_id`);

  const resultado = [];
  for (const u of usuarios) {
    const items = [];
    // Como responsable
    for (const a of acciones.filter((x) => x.responsable_id === u.id)) {
      if (a.atrasada) items.push({ tipo: 'atrasada', accion: a, texto: `Atrasada desde el ${fmt(a.fecha_termino)} · ${a.porcentaje}% de avance` });
      else if (a.por_vencer) items.push({ tipo: 'por_vencer', accion: a, texto: `Vence el ${fmt(a.fecha_termino)} · ${a.porcentaje}% de avance` });
      else if (a.desactualizada) items.push({ tipo: 'sin_actualizar', accion: a, texto: 'Sin reporte de avance dentro de su periodicidad' });
    }
    // Como coordinación del área
    if (u.rol === 'coordinador' && u.area_id) {
      const p = pendientes.find((x) => x.area_id === u.area_id);
      if (p) items.push({ tipo: 'por_validar', n: p.n, texto: `${p.n} registro${p.n === 1 ? '' : 's'} de ${u.area} ${p.n === 1 ? 'espera' : 'esperan'} tu validación` });
      const atr = acciones.filter((x) => x.area_id === u.area_id && x.atrasada && x.responsable_id !== u.id).length;
      if (atr) items.push({ tipo: 'area_atrasadas', n: atr, texto: `${atr} acción${atr === 1 ? '' : 'es'} de tu área ${atr === 1 ? 'está atrasada' : 'están atrasadas'}` });
    }
    // Resumen institucional para el Encargado PME
    if (u.rol === 'encargado_pme') {
      const atr = acciones.filter((x) => x.atrasada).length;
      const des = acciones.filter((x) => x.desactualizada).length;
      const pend = pendientes.reduce((s, x) => s + x.n, 0);
      if (atr || des || pend) items.push({ tipo: 'resumen', texto: `Institucional: ${atr} atrasadas · ${des} sin actualizar · ${pend} registros por validar` });
    }
    if (items.length) resultado.push({ usuario: u, items });
  }
  return resultado;
}

function correoPara({ usuario, items }, base) {
  const orden = { atrasada: 0, por_validar: 1, area_atrasadas: 2, por_vencer: 3, sin_actualizar: 4, resumen: 5 };
  const color = { atrasada: '#d64545', por_vencer: '#c77d12', sin_actualizar: '#c77d12', por_validar: '#3a70d6', area_atrasadas: '#d64545', resumen: '#7a5cf0' };
  const lista = items.slice().sort((a, b) => orden[a.tipo] - orden[b.tipo]);
  const filas = lista.map((i) => {
    const titulo = i.accion ? `${esc(i.accion.codigo)} · ${esc(i.accion.nombre)}` : esc(i.texto);
    const link = i.accion ? `${base}/#/acciones/${i.accion.id}` : i.tipo === 'por_validar' ? `${base}/#/validacion` : `${base}/#/tablero`;
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #eef1f6">
      <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${color[i.tipo]};margin-right:8px"></span>
      <a href="${esc(link)}" style="color:#141a26;font-weight:600;text-decoration:none;font-size:14px">${titulo}</a>
      ${i.accion ? `<div style="color:#4a5568;font-size:13px;margin:3px 0 0 16px">${esc(i.texto)}</div>` : ''}</td></tr>`;
  }).join('');
  const nAcc = items.filter((i) => i.accion).length;
  const asunto = nAcc
    ? `SIGPI · ${nAcc} acción${nAcc === 1 ? '' : 'es'} necesita${nAcc === 1 ? '' : 'n'} tu atención`
    : 'SIGPI · Tienes tareas pendientes';
  const html = plantilla({
    titulo: `Hola, ${usuario.nombre.split(' ')[0]}`,
    intro: 'Este es el resumen de lo que requiere tu atención en el seguimiento del PME.',
    cuerpo: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas}</table>`,
    boton: 'Abrir el SIGPI', url: `${base}/#/tablero`,
    pie: 'Recibes este aviso porque participas en el seguimiento del PME. Puedes desactivar los avisos desde el ícono del candado en el SIGPI.',
  });
  const text = [`Hola, ${usuario.nombre}`, '', ...lista.map((i) => `- ${i.accion ? `${i.accion.codigo} · ${i.accion.nombre}: ` : ''}${i.texto}`), '', `${base}/#/tablero`].join('\n');
  return { asunto, html, text };
}

// Envía los avisos. Con dry=true solo devuelve la vista previa.
async function enviar({ base, dry = false, forzar = false } = {}) {
  if (!dry && !correoConfigurado()) {
    return { correo_configurado: false, destinatarios: 0, resultados: [], mensaje: 'El correo no está configurado (RESEND_API_KEY y MAIL_FROM). No se envió nada.' };
  }
  const lista = await calcular();
  const salida = [];
  for (const entrada of lista) {
    const { usuario, items } = entrada;
    const { asunto, html, text } = correoPara(entrada, base);
    if (dry) { salida.push({ email: usuario.email, nombre: usuario.nombre, asunto, items: items.map((i) => i.texto), estado: 'vista_previa' }); continue; }
    if (!forzar) {
      const { rows } = await query(`SELECT 1 FROM avisos_enviados WHERE usuario_id = $1 AND estado = 'enviado' AND (fecha AT TIME ZONE '${TZ}')::date = ${HOY}`, [usuario.id]);
      if (rows.length) { salida.push({ email: usuario.email, asunto, estado: 'omitido_ya_enviado_hoy' }); continue; }
    }
    const r = await enviarCorreo({ to: usuario.email, subject: asunto, html, text });
    const estado = r.ok ? 'enviado' : 'error';
    await query('INSERT INTO avisos_enviados (usuario_id, email, asunto, items, estado, detalle) VALUES ($1,$2,$3,$4,$5,$6)',
      [usuario.id, usuario.email, asunto, items.length, estado, r.ok ? r.id : r.motivo]);
    salida.push({ email: usuario.email, asunto, estado, detalle: r.ok ? undefined : r.motivo });
  }
  return { correo_configurado: correoConfigurado(), destinatarios: salida.length, resultados: salida };
}

module.exports = { calcular, enviar };
