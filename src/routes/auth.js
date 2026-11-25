const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { query, audit } = require('../db');
const { firmar, salir, requireAuth, ROLES } = require('../auth');

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

router.post('/cambiar-clave', requireAuth, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!nueva || String(nueva).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  const { rows: [u] } = await query('SELECT password_hash FROM usuarios WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(String(actual || ''), u.password_hash))) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  await query('UPDATE usuarios SET password_hash = $1, debe_cambiar_clave = FALSE WHERE id = $2', [await bcrypt.hash(String(nueva), 10), req.user.id]);
  audit(req.user.id, 'cambio_clave', 'usuario', req.user.id);
  res.json({ ok: true });
});

module.exports = router;
