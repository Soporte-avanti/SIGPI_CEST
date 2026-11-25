const jwt = require('jsonwebtoken');
const { query } = require('./db');

const SECRET = process.env.JWT_SECRET || 'sigpi-dev-secret-cambiar';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[SIGPI] ADVERTENCIA: define JWT_SECRET en producción.');
}
const COOKIE = 'sigpi_token';
const HORAS = 12;

const ROLES = {
  admin: 'Administrador',
  rectoria: 'Rectoría',
  encargado_pme: 'Encargado PME',
  coordinador: 'Coordinación de área',
  responsable: 'Responsable de información',
  usuario: 'Usuario institucional',
};

// Roles con visión y control institucional completo
const GESTION = ['admin', 'rectoria', 'encargado_pme'];

function firmar(res, user) {
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: `${HORAS}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: HORAS * 3600 * 1000,
  });
}

function salir(res) {
  res.clearCookie(COOKIE);
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE];
    if (!token) return res.status(401).json({ error: 'Sesión no iniciada' });
    const { id } = jwt.verify(token, SECRET);
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.rol, u.area_id, u.cargo, u.debe_cambiar_clave, a.nombre AS area
         FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id
        WHERE u.id = $1 AND u.activo`, [id]);
    if (!rows[0]) return res.status(401).json({ error: 'Usuario no válido o desactivado' });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión expirada' });
  }
}

const requireRol = (...roles) => (req, res, next) =>
  roles.includes(req.user.rol) ? next() : res.status(403).json({ error: 'No tienes permisos para esta operación' });

const esGestion = (u) => GESTION.includes(u.rol);

// ¿Puede editar / reportar avance sobre la acción?
function puedeEditar(u, accion) {
  if (esGestion(u)) return true;
  if (u.rol === 'coordinador' && accion.area_id === u.area_id) return true;
  if (u.rol === 'responsable' && (accion.responsable_id === u.id || accion.area_id === u.area_id)) return true;
  return false;
}

// ¿Puede reportar avances y subir evidencias? (también el responsable directo, sea cual sea su rol)
function puedeReportar(u, accion) {
  return puedeEditar(u, accion) || accion.responsable_id === u.id;
}

// ¿Puede validar registros y cerrar acciones?
function puedeValidar(u, accion) {
  if (esGestion(u)) return true;
  return u.rol === 'coordinador' && accion.area_id === u.area_id;
}

module.exports = { ROLES, GESTION, firmar, salir, requireAuth, requireRol, esGestion, puedeEditar, puedeReportar, puedeValidar };
