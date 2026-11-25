// Rutas de sistema: tarea programada de avisos, errores, respaldo.
const express = require('express');
const crypto = require('crypto');
const { query, audit, registrarError } = require('../db');
const { requireAuth, requireRol } = require('../auth');
const avisos = require('../avisos');
const { appUrl, correoConfigurado } = require('../mail');
const { exportar, pesoArchivos } = require('../respaldo');

const GESTION = ['admin', 'rectoria', 'encargado_pme'];

// ---------- Tarea programada (sin sesión, protegida con CRON_SECRET) ----------
const publico = express.Router();

function secretoValido(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const dado = (req.get('authorization') || '').replace(/^Bearer\s+/i, '') || String(req.query.token || '');
  const a = Buffer.from(dado); const b = Buffer.from(secreto);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const cron = async (req, res) => {
  if (!secretoValido(req)) return res.status(401).json({ error: 'No autorizado' });
  const r = await avisos.enviar({ base: appUrl(req) });
  audit(null, 'avisos_automaticos', 'aviso', null, { destinatarios: r.destinatarios, configurado: r.correo_configurado });
  res.json(r);
};
publico.get('/cron/avisos', cron);
publico.post('/cron/avisos', cron);

// ---------- Rutas con sesión ----------
const privado = express.Router();

privado.get('/avisos/estado', requireRol(...GESTION), async (req, res) => {
  const { rows } = await query(`SELECT a.*, u.nombre FROM avisos_enviados a LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.fecha DESC LIMIT 100`);
  res.json({ correo_configurado: correoConfigurado(), cron_configurado: Boolean(process.env.CRON_SECRET), historial: rows });
});

// Vista previa (dry) o envío inmediato de los avisos
privado.post('/avisos/enviar', requireRol(...GESTION), async (req, res) => {
  const dry = req.body.dry !== false;
  const r = await avisos.enviar({ base: appUrl(req), dry, forzar: !dry && req.body.forzar === true });
  if (!dry) audit(req.user.id, 'avisos_manual', 'aviso', null, { destinatarios: r.destinatarios });
  res.json(r);
});

// Errores capturados en el navegador
privado.post('/errores/cliente', async (req, res) => {
  const b = req.body || {};
  await registrarError({ origen: 'navegador', ruta: b.ruta, mensaje: b.mensaje, detalle: [b.detalle, b.agente].filter(Boolean).join('\n'), usuarioId: req.user.id });
  res.json({ ok: true });
});

privado.get('/errores', requireRol(...GESTION), async (req, res) => {
  const { rows } = await query(`SELECT e.*, u.nombre AS usuario FROM errores e LEFT JOIN usuarios u ON u.id = e.usuario_id ORDER BY e.fecha DESC LIMIT 200`);
  res.json(rows);
});

privado.delete('/errores', requireRol('admin'), async (req, res) => {
  await query('DELETE FROM errores');
  audit(req.user.id, 'limpiar_errores', 'error', null);
  res.json({ ok: true });
});

// Descarga del respaldo desde el navegador (solo administrador).
// Si los archivos de evidencia superan ~3 MB se omiten (límite de respuesta en Vercel): usar npm run respaldo.
privado.get('/respaldo', requireRol('admin'), async (req, res) => {
  const bytes = await pesoArchivos();
  const incluirArchivos = bytes <= 3 * 1048576 && req.query.sin_archivos !== '1';
  const datos = await exportar({ incluirArchivos });
  const sello = new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 16).replace(' ', '_').replace(':', '');
  audit(req.user.id, 'descargar_respaldo', 'respaldo', null, { incluye_archivos: incluirArchivos });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sigpi_respaldo_${sello}${incluirArchivos ? '' : '_sin_archivos'}.json"`);
  res.send(JSON.stringify(datos));
});

privado.get('/respaldo/info', requireRol('admin'), async (req, res) => {
  res.json({ bytes_archivos: await pesoArchivos(), limite_web: 3 * 1048576 });
});

module.exports = { publico, privado: [requireAuth, privado] };
