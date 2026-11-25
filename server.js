const app = require('./src/app');
const { init } = require('./src/db');

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`[SIGPI] Servidor en http://localhost:${PORT}`)))
  .catch((e) => { console.error('[SIGPI] No se pudo inicializar la base de datos:', e.message); process.exit(1); });
