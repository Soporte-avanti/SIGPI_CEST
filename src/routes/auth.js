const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, audit } = require('../db');
const crypto = require('crypto');
const { firmar, salir, requireAuth, ROLES } = require('../auth');
const { correoConfigurado, enviarCorreo, plantilla, appUrl } = require('../mail');

// Freno simple contra fuerza bruta (por proceso)
const intentos = new Map();
function bloqueado(key) {
  const i = intentos.get(key);
  return i && i.n >= 8 && Date.now() - i.t < 10 * 60 * 1000;
}
function fallo(key) {
  const i = intentos.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - i.t > 10 * 60 * 1000) { i.n = 0; i.t = Date.now(); }
  i.n++; intentos.set(key, i);
}

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Ingresa correo y contraseña' });
  if (bloqueado(email)) return res.status(429).json({ error: 'Demasiados intentos. Espera 10 minutos.' });

  const { rows } = await query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const u = rows[0];
  if (!u || !u.activo || !(await bcrypt.compare(password, u.password_hash))) {
    fallo(email);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  }
  intentos.delete(email);
  await query('UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1', [u.id]);
  firmar(res, u);
  audit(u.id, 'login', 'usuario', u.id);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => { salir(res); res.json({ ok: true }); });

router.get('/me', requireAuth, (req, res) => {
  res.json({ ...req.user, rol_nombre: ROLES[req.user.rol] });
});

// Indica al navegador si está habilitada la recuperación por correo
router.get('/config', (req, res) => res.json({ correo: correoConfigurado() }));

const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Solicitud de recuperación: responde siempre igual para no revelar qué correos existen
router.post('/recuperar', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const respuesta = { ok: true, mensaje: 'Si el correo está registrado, recibirás un enlace para definir una nueva contraseña.' };
  if (!correoConfigurado()) return res.status(503).json({ error: 'La recuperación por correo no está habilitada. Solicita una clave temporal a Rectoría o al Encargado PME.' });
  if (!email || bloqueado('rec:' + email)) return res.json(respuesta);
  fallo('rec:' + email);
  const { rows: [u] } = await query('SELECT id, nombre, email FROM usuarios WHERE email = $1 AND activo', [email]);
  if (!u) return res.json(respuesta);
  const token = crypto.randomBytes(32).toString('hex');
  await query("DELETE FROM tokens_clave WHERE usuario_id = $1 OR expira < now()", [u.id]);
  await query("INSERT INTO tokens_clave (token_hash, usuario_id, expira) VALUES ($1,$2, now() + interval '1 hour')", [hash(token), u.id]);
  const url = `${appUrl(req)}/#/restablecer?token=${token}`;
  const r = await enviarCorreo({
    to: u.email,
    subject: 'SIGPI · Restablecer tu contraseña',
    html: plantilla({
      titulo: 'Restablecer contraseña',
      intro: `Hola, ${u.nombre.split(' ')[0]}. Recibimos una solicitud para definir una nueva contraseña en el SIGPI. El enlace vale por 1 hora y se puede usar una sola vez.`,
      boton: 'Definir nueva contraseña', url,
      pie: 'Si no solicitaste este cambio, ignora este correo: tu contraseña actual sigue vigente.',
    }),
    text: `Para definir una nueva contraseña en el SIGPI abre este enlace (vale por 1 hora): ${url}`,
  });
  audit(u.id, 'solicitar_recuperacion', 'usuario', u.id, { enviado: r.ok });
  res.json(respuesta);
});

router.post('/restablecer', async (req, res) => {
  const token = String(req.body.token || '');
  const nueva = String(req.body.nueva || '');
  if (nueva.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  const { rows: [t] } = await query('SELECT * FROM tokens_clave WHERE token_hash = $1 AND NOT usado AND expira > now()', [hash(token)]);
  if (!t) return res.status(400).json({ error: 'El enlace no es válido o ya expiró. Solicita uno nuevo.' });
  await query('UPDATE tokens_clave SET usado = TRUE WHERE token_hash = $1', [t.token_hash]);
  await query('UPDATE usuarios SET password_hash = $1, debe_cambiar_clave = FALSE, clave_cambiada = now() WHERE id = $2', [await bcrypt.hash(nueva, 10), t.usuario_id]);
  audit(t.usuario_id, 'restablecer_por_correo', 'usuario', t.usuario_id);
  res.json({ ok: true });
});

router.put('/preferencias', requireAuth, async (req, res) => {
  await query('UPDATE usuarios SET recibe_avisos = $1 WHERE id = $2', [req.body.recibe_avisos !== false, req.user.id]);
  res.json({ ok: true });
});

router.post('/cambiar-clave', requireAuth, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!nueva || String(nueva).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  const { rows: [u] } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(actual || ''), u.password_hash))) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  await query('UPDATE usuarios SET password_hash = $1, debe_cambiar_clave = FALSE, clave_cambiada = now() WHERE id = $2', [await bcrypt.hash(String(nueva), 10), req.user.id]);
  firmar(res, req.user); // nueva sesión: las anteriores (otros equipos) quedan invalidadas
  audit(req.user.id, 'cambio_clave', 'usuario', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
