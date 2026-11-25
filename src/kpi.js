const { query, HOY } = require('./db');

// Fichas técnicas de los indicadores (sección 33.8, Tabla 19)
const FICHAS = [
  {
    clave: 'responsable', nombre: 'Acciones con responsable definido',
    formula: 'Acciones con responsable / total de acciones × 100',
    proposito: 'Medir la asignación de responsabilidades.',
    fuente: 'Módulo 1 · Registro de acciones', periodicidad: 'Mensual', responsable: 'Encargado PME',
  },
  {
    clave: 'actualizadas', nombre: 'Acciones con estado actualizado',
    formula: 'Acciones actualizadas en plazo / total de acciones × 100',
    proposito: 'Evaluar la oportunidad del seguimiento.',
    fuente: 'Módulo 2 · Seguimiento (fecha del último avance vs. periodicidad de la acción)', periodicidad: 'Quincenal', responsable: 'Coordinaciones de área',
  },
  {
    clave: 'evidencia', nombre: 'Acciones con evidencia asociada',
    formula: 'Acciones con evidencia / total de acciones × 100',
    proposito: 'Verificar la trazabilidad documental.',
    fuente: 'Módulo 3 · Evidencias', periodicidad: 'Mensual', responsable: 'Responsables de información',
  },
  {
    clave: 'cumplimiento', nombre: 'Cumplimiento de acciones',
    formula: 'Acciones ejecutadas / acciones programadas a la fecha × 100',
    proposito: 'Medir el nivel de ejecución.',
    fuente: 'Módulo 2 · Acciones con fecha de cumplimiento vencida o cerradas', periodicidad: 'Mensual', responsable: 'Encargado PME',
  },
  {
    clave: 'plazos', nombre: 'Cumplimiento de plazos',
    formula: 'Acciones finalizadas en plazo / acciones finalizadas × 100',
    proposito: 'Evaluar la oportunidad de ejecución.',
    fuente: 'Módulo 2 · Fecha de cierre vs. fecha de cumplimiento', periodicidad: 'Mensual', responsable: 'Encargado PME',
  },
  {
    clave: 'validados', nombre: 'Registros validados',
    formula: 'Registros validados / total de registros ingresados × 100',
    proposito: 'Controlar la calidad de la información.',
    fuente: 'Módulo 2 · Validación de avances', periodicidad: 'Quincenal', responsable: 'Coordinaciones de área',
  },
  {
    clave: 'capacitacion', nombre: 'Participación en capacitación',
    formula: 'Funcionarios capacitados / funcionarios convocados × 100',
    proposito: 'Evaluar la cobertura de capacitación.',
    fuente: 'Módulo de capacitación · Registro de asistencia', periodicidad: 'Por jornada', responsable: 'Equipo directivo',
  },
];

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

async function calcular({ areaId = null, soloPiloto = false } = {}) {
  const cond = ["a.estado <> 'cancelada'"];
  const params = [];
  if (areaId) { params.push(areaId); cond.push(`a.area_id = $${params.length}`); }
  if (soloPiloto) cond.push('a.piloto');
  const where = cond.join(' AND ');

  const { rows: [r] } = await query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE a.responsable_id IS NOT NULL)::int AS con_responsable,
      count(*) FILTER (WHERE a.cerrada OR (a.ultima_actualizacion IS NOT NULL
                       AND a.ultima_actualizacion >= now() - make_interval(days => a.periodicidad_dias)))::int AS actualizadas,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM evidencias e WHERE e.accion_id = a.id))::int AS con_evidencia,
      count(*) FILTER (WHERE a.estado = 'completada' OR (a.fecha_termino IS NOT NULL AND a.fecha_termino <= ${HOY}))::int AS programadas,
      count(*) FILTER (WHERE a.estado = 'completada')::int AS ejecutadas,
      count(*) FILTER (WHERE a.estado = 'completada' AND a.fecha_cierre IS NOT NULL
                       AND (a.fecha_termino IS NULL OR a.fecha_cierre <= a.fecha_termino))::int AS en_plazo,
      count(*) FILTER (WHERE NOT a.cerrada AND a.estado <> 'completada'
                       AND a.fecha_termino < ${HOY})::int AS atrasadas,
      count(*) FILTER (WHERE a.estado = 'en_curso')::int AS en_curso,
      count(*) FILTER (WHERE a.estado = 'no_iniciada')::int AS no_iniciadas,
      COALESCE(round(avg(a.porcentaje)),0)::int AS avance_promedio
    FROM acciones a WHERE ${where}`, params);

  const { rows: [v] } = await query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE av.validacion = 'validado')::int AS validados,
           count(*) FILTER (WHERE av.validacion = 'pendiente')::int AS pendientes,
           count(*) FILTER (WHERE av.validacion = 'observado')::int AS observados
      FROM avances av JOIN acciones a ON a.id = av.accion_id WHERE ${where}`, params);

  const capParams = [];
  let capWhere = 'TRUE';
  if (areaId) { capParams.push(areaId); capWhere = `u.area_id = $1`; }
  const { rows: [c] } = await query(`
    SELECT count(*)::int AS convocados, count(*) FILTER (WHERE cc.asistio)::int AS capacitados
      FROM capacitacion_convocados cc JOIN usuarios u ON u.id = cc.usuario_id WHERE ${capWhere}`, capParams);

  const valores = {
    responsable: { valor: pct(r.con_responsable, r.total), num: r.con_responsable, den: r.total },
    actualizadas: { valor: pct(r.actualizadas, r.total), num: r.actualizadas, den: r.total },
    evidencia: { valor: pct(r.con_evidencia, r.total), num: r.con_evidencia, den: r.total },
    cumplimiento: { valor: pct(r.ejecutadas, r.programadas), num: r.ejecutadas, den: r.programadas },
    plazos: { valor: pct(r.en_plazo, r.ejecutadas), num: r.en_plazo, den: r.ejecutadas },
    validados: { valor: pct(v.validados, v.total), num: v.validados, den: v.total },
    capacitacion: { valor: pct(c.capacitados, c.convocados), num: c.capacitados, den: c.convocados },
  };

  return {
    valores,
    resumen: {
      total: r.total, atrasadas: r.atrasadas, en_curso: r.en_curso, no_iniciadas: r.no_iniciadas,
      completadas: r.ejecutadas, avance_promedio: r.avance_promedio,
      registros: v.total, pendientes_validar: v.pendientes, observados: v.observados,
    },
  };
}

module.exports = { FICHAS, calcular };
