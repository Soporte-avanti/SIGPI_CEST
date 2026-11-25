require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { init, registrarError } = require('./db');
const { requireAuth } = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Asegura el esquema antes de atender la API (también en arranques en frío de Vercel)
app.use('/api', async (req, res, next) => {
  try { await init(); next(); } catch (e) {
    console.error('[SIGPI] Error de base de datos:', e.message);
    res.status(503).json({ error: 'No hay conexión con la base de datos. Revisa DATABASE_URL.' });
  }
});

app.get('/api/salud', (req, res) => res.json({ ok: true, hora: new Date().toISOString() }));
app.use('/api/auth', require('./routes/auth'));
const sistema = require('./routes/sistema');
app.use('/api', sistema.publico);
app.use('/api', requireAuth, require('./routes/acciones'));
app.use('/api', requireAuth, require('./routes/gestion'));
app.use('/api', ...sistema.privado);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Manejador de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[SIGPI]', err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Solicitud demasiado grande' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud con formato inválido' });
  registrarError({ metodo: req.method, ruta: req.originalUrl, mensaje: err.message, detalle: err.stack, usuarioId: req.user && req.user.id });
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
