require('dotenv').config();
const { init, pool } = require('../src/db');
init().then(() => { console.log('[SIGPI] Esquema listo.'); return pool.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
