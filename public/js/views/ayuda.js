import { ctx } from '../app.js';
import { $, $$, esc } from '../ui.js';

const PERFILES = {
  responsable: {
    titulo: 'Responsable de información', corto: 'Responsable',
    rol: 'Mantener al día el avance de tus acciones y respaldarlo con evidencias.',
    rutina: [
      ['Cada periodo de reporte (por defecto, cada 15 días)', 'Reportas el avance de cada una de tus acciones abiertas.'],
      ['Al terminar una actividad importante', 'Subes su evidencia: acta, lista de asistencia, fotografía o informe.'],
      ['Cuando la coordinación observa un registro', 'Ingresas un nuevo avance que corrija lo observado.'],
    ],
    pasos: ['Abre la acción desde «Mis acciones», en el tablero.', 'Presiona «Reportar avance».', 'Ajusta el estado y el porcentaje, y describe lo realizado.',
      'Si hubo problemas, escribe las medidas correctivas.', 'Marca «Adjuntar evidencia» y sube el archivo o pega el enlace de Drive.', 'Guarda: tu registro queda pendiente de validación.'],
    ojo: ['Un 100 % significa que la acción está completada.', 'El aviso naranjo «Sin actualizar en plazo» indica que te toca reportar.', 'Nunca subas datos personales de estudiantes ni de familias.'],
  },
  coordinador: {
    titulo: 'Coordinación de área', corto: 'Coordinación',
    rol: 'Garantizar que la información de tu área sea confiable, oportuna y esté respaldada.',
    rutina: [
      ['Una vez por semana', 'Revisas «Validación» y resuelves los registros pendientes.'],
      ['Cada quincena', 'Revisas las acciones atrasadas o sin actualizar de tu área y hablas con sus responsables.'],
      ['Al terminar una acción', 'La cierras registrando su resultado.'],
      ['En la reunión mensual', 'Presentas el «Reporte por área» y las medidas correctivas.'],
    ],
    pasos: ['Entra a «Validación»: el número junto al menú indica los pendientes.', 'Revisa cada registro: ¿es coherente?, ¿está completo?, ¿tiene respaldo?, ¿corresponde a la acción?',
      'Si cumple, presiona «Validar». Si no, presiona «Observar» y explica qué corregir.', 'Para cerrar una acción terminada: «Cerrar acción», con fecha y resultado obtenido.'],
    ojo: ['No puedes validar tus propios registros: los valida el Encargado PME.', 'También puedes registrar acciones nuevas de tu área.'],
  },
  gestion: {
    titulo: 'Encargado PME y Rectoría', corto: 'Encargado PME y Rectoría',
    rol: 'Conducir el seguimiento institucional del PME y transformar los datos en decisiones.',
    rutina: [
      ['Al inicio del año', 'Cargas los objetivos y las acciones del PME (puede ser por CSV), importas usuarios y asignas roles.'],
      ['Cada semana', 'Revisas el tablero: atrasadas, sin actualizar y pendientes de validar.'],
      ['Cada mes', 'Registras un corte de indicadores y lo presentas al equipo directivo con las medidas acordadas.'],
      ['Al final del piloto', 'Comparas con la línea base, defines metas y propones el escalamiento.'],
    ],
    pasos: ['Indicadores → «Registrar corte» → «Línea base» al cerrar la primera semana del piloto.', 'Define la meta de cada indicador con el botón «Meta», una vez validada con las áreas.',
      'Sistema → «Ver a quién le llegaría hoy» para revisar los avisos por correo.', 'Usuarios y catálogos → «Importar CSV» para crear a varios funcionarios de una vez.'],
    ojo: ['Las metas se fijan después de la línea base (sección 33.8 de la propuesta).', 'Desactiva, nunca borres, a los funcionarios que dejan el establecimiento.', 'Descarga un respaldo antes de cambios importantes (Sistema → Respaldo).'],
  },
  usuario: {
    titulo: 'Usuario institucional', corto: 'Usuario',
    rol: 'Conocer el estado del PME y aportar información cuando te asignen una acción.',
    rutina: [['Cuando quieras', 'Consultas el tablero, las acciones y los indicadores.'], ['Si figuras como responsable', 'Reportas avances y evidencias, como un responsable de información.']],
    pasos: ['Entra con tu correo institucional y la contraseña temporal que te entregaron.', 'Define una contraseña propia de al menos 8 caracteres.', 'Revisa el tablero: si aparece «Mis acciones», sigue los pasos del responsable de información.'],
    ojo: ['Si olvidas tu contraseña, usa «¿Olvidaste tu contraseña?» o pide una clave temporal a Rectoría o al Encargado PME.'],
  },
};

const REGLAS = [
  ['Código de acción', 'SIGLA-AÑO-NÚMERO (ej.: TP-2026-004). Lo asigna el sistema.'],
  ['Periodicidad de reporte', 'Por defecto, quincenal. Puede ser semanal, mensual o bimestral según la acción.'],
  ['Plazo de validación', 'Propuesto: 5 días hábiles desde que se ingresa el registro.'],
  ['Acción atrasada', 'Su fecha de cumplimiento ya pasó y no está completada. El sistema la marca sola.'],
  ['Acción sin actualizar', 'No tiene reporte de avance dentro de su periodicidad.'],
  ['Evidencias', 'Archivo de hasta 4 MB o enlace a Drive con acceso restringido. Sin datos sensibles de estudiantes ni familias.'],
  ['Autovalidación', 'No se permite: nadie valida un registro que ingresó él mismo.'],
  ['Trazabilidad', 'Toda operación queda en la bitácora con usuario, fecha y hora.'],
];

const FAQ = [
  ['Me equivoqué en un avance, ¿cómo lo corrijo?', 'Los registros no se editan, para conservar la trazabilidad. Ingresa un nuevo avance con la información correcta; si el anterior estaba pendiente, la coordinación puede observarlo.'],
  ['¿Por qué no puedo editar una acción?', 'Solo editan las acciones la gestión institucional, la coordinación del área y los responsables de información del área. Si la acción está cerrada, ya no recibe cambios.'],
  ['Mi archivo es muy grande', 'El límite es 4 MB. Súbelo a la carpeta del área en el Drive institucional y registra el enlace como evidencia.'],
  ['¿Qué significa «Sin actualizar en plazo»?', 'Que el último reporte de la acción es más antiguo que su periodicidad. Se resuelve reportando un avance.'],
  ['No me llegan los avisos por correo', 'Revisa en tu cuenta (ícono del candado) que estén activados y busca en la carpeta de correo no deseado. Si el problema sigue, avisa al Encargado PME.'],
  ['¿Cómo imprimo el estado de mi área?', 'En «Reporte por área», elige el área y presiona «Imprimir o guardar PDF».'],
];

const perfilDe = (rol) => (['admin', 'rectoria', 'encargado_pme'].includes(rol) ? 'gestion' : PERFILES[rol] ? rol : 'usuario');
let sel = null;

export async function render(view) {
  ctx.crumb('<b>Ayuda</b>');
  sel = sel || perfilDe(ctx.user.rol);
  const p = PERFILES[sel];
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Ayuda</h1><p class="sub">Instructivos por perfil, reglas comunes y preguntas frecuentes.</p></div>
  </div>
  <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px;align-items:start" id="cols">
    <div class="card">
      <div class="tabs" id="perfiles">${Object.entries(PERFILES).map(([k, v]) => `<button data-p="${k}" class="${k === sel ? 'on' : ''}">${esc(v.corto)}${k === perfilDe(ctx.user.rol) ? ' <span class="n">· tu perfil</span>' : ''}</button>`).join('')}</div>
      <div class="card-pad stack">
        <h2>${esc(p.titulo)}</h2>
        <div class="notice"><b>El rol:</b> ${esc(p.rol)}</div>
        <div><h3 style="margin-bottom:8px">Tu rutina</h3>
          <div class="table-wrap card"><table><thead><tr><th>Cuándo</th><th>Qué haces</th></tr></thead><tbody>${p.rutina.map(([a, b]) => `<tr><td style="width:40%">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><h3 style="margin-bottom:8px">Paso a paso</h3><ol style="margin:0;padding-left:20px">${p.pasos.map((x) => `<li style="margin-bottom:6px">${esc(x)}</li>`).join('')}</ol></div>
        <div><h3 style="margin-bottom:8px">No olvides</h3><ul style="margin:0;padding-left:20px">${p.ojo.map((x) => `<li style="margin-bottom:6px">${esc(x)}</li>`).join('')}</ul></div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h3>Reglas comunes</h3></div>
        <div class="dl" style="grid-template-columns:1fr">${REGLAS.map(([k, v]) => `<div style="padding-bottom:0;border:0"><b class="small" style="color:var(--text)">${esc(k)}</b></div><div class="small muted">${esc(v)}</div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><h3>Preguntas frecuentes</h3></div>
        <div>${FAQ.map(([q, a], i) => `<details style="border-bottom:1px solid var(--line);padding:12px 20px" ${i === 0 ? 'open' : ''}><summary style="cursor:pointer;font-weight:500">${esc(q)}</summary><p class="small muted" style="margin-top:8px">${esc(a)}</p></details>`).join('')}</div></div>
    </div>
  </div>`;
  $$('#perfiles button', view).forEach((b) => b.addEventListener('click', () => { sel = b.dataset.p; render(view); }));
  if (window.innerWidth < 860) $('#cols', view).style.gridTemplateColumns = '1fr';
}
