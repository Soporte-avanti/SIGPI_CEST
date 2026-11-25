// Carga datos de demostración para probar el SIGPI (no usar en la base definitiva).
// Uso: npm run seed:demo
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { init, query, pool } = require('../src/db');

const CLAVE = 'Demo.2026';

const USUARIOS = [
  ['Rectoría CEST', 'rectoria@demo.cl', 'rectoria', 'DIR', 'Rector'],
  ['Encargado PME', 'pme@demo.cl', 'encargado_pme', 'DIR', 'Encargado PME'],
  ['Coordinación Pedagógica', 'coord.ped@demo.cl', 'coordinador', 'PED', 'Jefe UTP'],
  ['Coordinación TP', 'coord.tp@demo.cl', 'coordinador', 'TP', 'Jefe de Producción'],
  ['Coordinación Convivencia', 'coord.ace@demo.cl', 'coordinador', 'ACE', 'Encargado de Convivencia'],
  ['Docente Electrónica', 'docente.tp@demo.cl', 'responsable', 'TP', 'Docente especialidad'],
  ['Docente Lenguaje', 'docente.ped@demo.cl', 'responsable', 'PED', 'Docente'],
  ['Psicóloga Apoyo', 'apoyo@demo.cl', 'responsable', 'APR', 'Psicóloga'],
  ['Inspector General', 'inspector@demo.cl', 'responsable', 'ACE', 'Inspector'],
  ['Administración', 'admin.fin@demo.cl', 'responsable', 'ADF', 'Jefe Administrativo'],
  ['Pastoral', 'pastoral@demo.cl', 'responsable', 'EVA', 'Coordinador Pastoral'],
  ['Comunicaciones', 'comunicaciones@demo.cl', 'usuario', 'COM', 'Encargado de Comunicaciones'],
];

const OBJETIVOS = [
  ['Gestión Pedagógica', 'OE-GP-1', 'Fortalecer el monitoreo de la cobertura curricular y los aprendizajes en Formación General y Diferenciada TP.'],
  ['Gestión Pedagógica', 'OE-GP-2', 'Articular la formación técnico-profesional con el medio productivo y las prácticas profesionales.'],
  ['Liderazgo', 'OE-LI-1', 'Instalar mecanismos de seguimiento y evaluación de las acciones del PME basados en evidencia.'],
  ['Convivencia Escolar', 'OE-CE-1', 'Consolidar un clima escolar preventivo inspirado en el Sistema Preventivo de Don Bosco.'],
  ['Gestión de Recursos', 'OE-GR-1', 'Optimizar el uso de recursos y la gestión de información institucional.'],
];

// [área, dimensión, objetivo, responsable(email), nombre, inicio(offset días), término(offset), estado, %, piloto, colaboradoras]
const ACCIONES = [
  ['DIR', 'Liderazgo', 'OE-LI-1', 'pme@demo.cl', 'Implementación piloto del SIGPI para el seguimiento del PME', -60, 25, 'en_curso', 55, true, ['PED', 'TP', 'ACE']],
  ['DIR', 'Liderazgo', 'OE-LI-1', 'pme@demo.cl', 'Jornadas de análisis de resultados con consejo de profesores', -90, -10, 'completada', 100, true, ['PED']],
  ['PED', 'Gestión Pedagógica', 'OE-GP-1', 'docente.ped@demo.cl', 'Monitoreo trimestral de cobertura curricular por asignatura', -80, 30, 'en_curso', 60, true, []],
  ['PED', 'Gestión Pedagógica', 'OE-GP-1', 'coord.ped@demo.cl', 'Acompañamiento al aula con pauta común y retroalimentación', -70, -5, 'en_curso', 70, true, ['TP']],
  ['PED', 'Gestión Pedagógica', 'OE-GP-1', 'docente.ped@demo.cl', 'Plan de reforzamiento en Lectura y Matemática para 1° y 2° medio', -40, 60, 'en_curso', 25, false, ['APR']],
  ['TP', 'Gestión Pedagógica', 'OE-GP-2', 'docente.tp@demo.cl', 'Actualización de guías de taller de Electrónica según perfil de egreso', -50, 10, 'en_curso', 80, true, []],
  ['TP', 'Gestión Pedagógica', 'OE-GP-2', 'coord.tp@demo.cl', 'Convenios de práctica profesional con empresas de la región del Maule', -100, -20, 'completada', 100, false, ['DIR']],
  ['TP', 'Gestión Pedagógica', 'OE-GP-2', 'docente.tp@demo.cl', 'Participación de estudiantes en competencias de robótica', -30, 45, 'en_curso', 40, false, ['COM']],
  ['TP', 'Gestión de Recursos', 'OE-GR-1', 'coord.tp@demo.cl', 'Inventario y mantención de equipamiento de talleres', -45, -3, 'en_curso', 65, true, ['ADF']],
  ['ACE', 'Convivencia Escolar', 'OE-CE-1', 'inspector@demo.cl', 'Protocolo de registro y seguimiento de situaciones de convivencia', -60, -15, 'en_curso', 50, true, ['APR']],
  ['ACE', 'Convivencia Escolar', 'OE-CE-1', 'coord.ace@demo.cl', 'Talleres de mediación escolar entre pares', -20, 50, 'no_iniciada', 0, false, []],
  ['APR', 'Convivencia Escolar', 'OE-CE-1', 'apoyo@demo.cl', 'Detección temprana y derivación de estudiantes con necesidades de apoyo', -75, 15, 'en_curso', 45, false, ['ACE', 'PED']],
  ['ADF', 'Gestión de Recursos', 'OE-GR-1', 'admin.fin@demo.cl', 'Rendición y seguimiento de recursos SEP asociados al PME', -90, -30, 'completada', 100, false, ['DIR']],
  ['ADF', 'Gestión de Recursos', 'OE-GR-1', null, 'Digitalización de archivo documental institucional', -10, 90, 'no_iniciada', 0, false, ['COM']],
  ['EVA', 'Convivencia Escolar', 'OE-CE-1', 'pastoral@demo.cl', 'Jornadas de formación salesiana por nivel', -55, 20, 'en_curso', 50, false, []],
  ['COM', 'Gestión de Recursos', 'OE-GR-1', 'comunicaciones@demo.cl', 'Boletín mensual de avances del PME a la comunidad', -60, 40, 'en_curso', 35, false, ['DIR']],
  ['ECO', 'Convivencia Escolar', 'OE-CE-1', null, 'Programa de reciclaje y huerto escolar', 5, 120, 'no_iniciada', 0, false, ['EVA']],
];

const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };

(async () => {
  await init();
  const { rows: [{ n }] } = await query("SELECT count(*)::int n FROM usuarios WHERE email LIKE '%@demo.cl'");
  if (n > 0) { console.log('Los datos de demostración ya están cargados.'); return pool.end(); }

  const areas = Object.fromEntries((await query('SELECT id, sigla FROM areas')).rows.map((r) => [r.sigla, r.id]));
  const dims = Object.fromEntries((await query('SELECT id, nombre FROM dimensiones')).rows.map((r) => [r.nombre, r.id]));
  const hash = await bcrypt.hash(CLAVE, 10);
  const users = {};
  for (const [nombre, email, rol, area, cargo] of USUARIOS) {
    const { rows: [u] } = await query(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, area_id, cargo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [nombre, email, hash, rol, areas[area], cargo]);
    users[email] = u.id;
  }
  const objs = {};
  for (const [dim, cod, desc] of OBJETIVOS) {
    const { rows: [o] } = await query('INSERT INTO objetivos (dimension_id, codigo, descripcion) VALUES ($1,$2,$3) RETURNING id', [dims[dim], cod, desc]);
    objs[cod] = o.id;
  }

  const year = new Date().getFullYear();
  const cont = {};
  for (const [area, dim, obj, resp, nombre, ini, fin, estado, pct, piloto, colab] of ACCIONES) {
    cont[area] = (cont[area] || 0) + 1;
    const codigo = `${area}-${year}-${String(cont[area]).padStart(3, '0')}`;
    const completada = estado === 'completada';
    const { rows: [a] } = await query(
      `INSERT INTO acciones (codigo, nombre, descripcion, dimension_id, objetivo_id, area_id, responsable_id, fecha_inicio, fecha_termino,
         estado, porcentaje, piloto, cerrada, fecha_cierre, resultado, ultima_actualizacion, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [codigo, nombre, `Acción de demostración asociada al objetivo ${obj}.`, dims[dim], objs[obj], areas[area], resp ? users[resp] : null,
        d(ini), d(fin), estado, pct, piloto, completada, completada ? d(fin - (cont[area] % 2 ? 2 : -4)) : null,
        completada ? 'Acción ejecutada según lo programado; se adjuntan actas y registros.' : null,
        pct > 0 ? new Date(Date.now() - (cont[area] % 3) * 12 * 86400000) : null, users['pme@demo.cl']]);
    for (const s of colab) await query('INSERT INTO accion_colaboradoras VALUES ($1,$2)', [a.id, areas[s]]);

    if (pct > 0) {
      const pasos = completada ? [40, 75, 100] : [Math.round(pct / 2), pct];
      for (let i = 0; i < pasos.length; i++) {
        const val = i < pasos.length - 1 || completada ? 'validado' : (cont[area] % 2 ? 'pendiente' : 'validado');
        const { rows: [v] } = await query(
          `INSERT INTO avances (accion_id, usuario_id, fecha, estado, porcentaje, descripcion, validacion, validado_por, fecha_validacion)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [a.id, resp ? users[resp] : users['pme@demo.cl'], new Date(Date.now() - (pasos.length - i) * 15 * 86400000),
            pasos[i] === 100 ? 'completada' : 'en_curso', pasos[i], `Avance ${i + 1}: se ejecutaron las actividades planificadas del periodo.`,
            val, val === 'validado' ? users['pme@demo.cl'] : null, val === 'validado' ? new Date() : null]);
        if (i === 0 && cont[area] % 3 !== 0) {
          await query(`INSERT INTO evidencias (accion_id, avance_id, tipo, categoria, titulo, url, subido_por)
                       VALUES ($1,$2,'enlace','acta',$3,'https://drive.google.com/',$4)`, [a.id, v.id, `Acta de trabajo ${codigo}`, resp ? users[resp] : users['pme@demo.cl']]);
        }
      }
    }
  }

  const { rows: [c] } = await query("INSERT INTO capacitaciones (titulo, fecha, descripcion, creado_por) VALUES ('Inducción al modelo SIGPI', $1, 'Presentación del ciclo de gestión de información y uso de la herramienta.', $2) RETURNING id",
    [d(-14), users['pme@demo.cl']]);
  const ids = Object.values(users);
  for (let i = 0; i < ids.length; i++) await query('INSERT INTO capacitacion_convocados VALUES ($1,$2,$3)', [c.id, ids[i], i % 4 !== 3]);

  console.log(`Datos de demostración cargados. Todos los usuarios @demo.cl usan la clave: ${CLAVE}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
