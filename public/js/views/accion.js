import { api } from '../api.js';
import { ctx } from '../app.js';
import { accionForm } from './acciones.js';
import {
  esc, $, $$, fDate, fDateTime, relTime, diasHasta, badge, badgeSit, badgeVal, icon, modal, formData, run, toast, confirmar,
  ESTADOS, CATEGORIAS, fBytes, today,
} from '../ui.js';

let tab = 'seguimiento';

export async function render(view, id) {
  const a = await api.get(`/api/acciones/${id}`);
  ctx.crumb(`<a href="#/acciones">Acciones PME</a> / <b>${esc(a.codigo)}</b>`);
  const p = a.permisos;
  const d = diasHasta(a.fecha_termino);
  const plazo = a.cerrada ? `Cerrada el ${fDate(a.fecha_cierre)}` : d === null ? 'Sin fecha de cumplimiento' : d < 0 ? `${-d} días de atraso` : d === 0 ? 'Vence hoy' : `Quedan ${d} días`;
  const C = 2 * Math.PI * 38;
  const color = a.situacion === 'atrasada' ? 'var(--bad)' : ['completada', 'cerrada'].includes(a.situacion) ? 'var(--ok)' : 'var(--accent)';

  view.innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><a class="btn ghost sm" href="#/acciones">${icon('back')}Volver</a></div>
  <div class="card" style="margin-bottom:16px">
    <div class="hero">
      <div>
        <div class="row" style="gap:8px"><span class="tag">${esc(a.codigo)}</span>${badgeSit(a.situacion)}${a.piloto ? badge('Piloto', 'violet') : ''}${a.desactualizada ? badge('Sin actualizar en plazo', 'warn') : ''}</div>
        <h1>${esc(a.nombre)}</h1>
        <div class="meta-line">
          <span>${esc(a.area || 'Sin área')}</span><span class="faint">·</span>
          <span>${a.responsable ? esc(a.responsable) : '<span style="color:var(--warn)">Sin responsable</span>'}</span><span class="faint">·</span>
          <span>${fDate(a.fecha_inicio)} → ${fDate(a.fecha_termino)}</span><span class="faint">·</span>
          <span style="${d !== null && d < 0 && !a.cerrada ? 'color:var(--bad)' : ''}">${plazo}</span>
        </div>
        <div class="row no-print" style="margin-top:16px;gap:8px">
          ${p.reportar ? `<button class="btn primary" id="avance">${icon('flag')}Reportar avance</button>` : ''}
          ${p.reportar ? `<button class="btn" id="evid">${icon('upload')}Adjuntar evidencia</button>` : ''}
          ${p.editar && !a.cerrada ? `<button class="btn" id="editar">${icon('edit')}Editar</button>` : ''}
          ${p.validar && !a.cerrada ? `<button class="btn ok" id="cerrar">${icon('check')}Cerrar acción</button>` : ''}
          ${a.cerrada && ctx.esGestion() ? `<button class="btn" id="reabrir">Reabrir</button>` : ''}
          ${p.eliminar ? `<button class="btn ghost danger icon" id="eliminar" title="Eliminar acción">${icon('trash')}</button>` : ''}
        </div>
      </div>
      <div class="ring">
        <svg viewBox="0 0 88 88"><circle class="bg" cx="44" cy="44" r="38"/><circle class="fg" cx="44" cy="44" r="38" style="stroke:${color};stroke-dasharray:${C};stroke-dashoffset:${C * (1 - a.porcentaje / 100)}"/></svg>
        <div class="lbl"><b>${a.porcentaje}%</b><span class="small muted">${esc(ESTADOS[a.estado])}</span><div class="small faint">Actualizada ${relTime(a.ultima_actualizacion)}</div></div>
      </div>
    </div>
    <div class="tabs" id="tabs">
      <button data-t="seguimiento">Seguimiento<span class="n">${a.avances.length}</span></button>
      <button data-t="evidencias">Evidencias<span class="n">${a.evidencias.length}</span></button>
      <button data-t="ficha">Ficha de la acción</button>
    </div>
    <div id="tab"></div>
  </div>`;

  const pintar = () => {
    $$('#tabs button', view).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    $('#tab', view).innerHTML = tab === 'ficha' ? ficha(a) : tab === 'evidencias' ? evidencias(a) : seguimiento(a);
    bindTab();
  };
  const recargar = () => render(view, id);

  const bindTab = () => {
    $$('[data-validar]', view).forEach((b) => b.addEventListener('click', () => validar(Number(b.dataset.validar), b.dataset.modo, recargar)));
    $$('[data-del-ev]', view).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('Eliminar evidencia', 'La evidencia se eliminará de la acción. Esta operación queda registrada en la bitácora.', { ok: 'Eliminar', danger: true }))) return;
      await run(null, () => api.del(`/api/evidencias/${b.dataset.delEv}`)); toast('Evidencia eliminada'); recargar();
    }));
    $('#ev-add', view)?.addEventListener('click', () => evidenciaForm(a, null, recargar));
  };

  $$('#tabs button', view).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; pintar(); }));
  $('#avance', view)?.addEventListener('click', () => avanceForm(a, recargar));
  $('#evid', view)?.addEventListener('click', () => evidenciaForm(a, null, recargar));
  $('#editar', view)?.addEventListener('click', () => accionForm(a, recargar));
  $('#cerrar', view)?.addEventListener('click', () => cerrarForm(a, recargar));
  $('#reabrir', view)?.addEventListener('click', async () => {
    if (!(await confirmar('Reabrir acción', 'La acción volverá a quedar abierta para registrar avances.'))) return;
    await run(null, () => api.post(`/api/acciones/${a.id}/reabrir`)); toast('Acción reabierta'); recargar();
  });
  $('#eliminar', view)?.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar acción', `Se eliminará <b>${esc(a.codigo)}</b> junto con sus avances y evidencias. No se puede deshacer.`, { ok: 'Eliminar definitivamente', danger: true }))) return;
    await run(null, () => api.del(`/api/acciones/${a.id}`)); toast('Acción eliminada'); ctx.go('#/acciones');
  });
  pintar();
}

function seguimiento(a) {
  if (!a.avances.length) {
    return `<div class="empty"><b>Aún no hay avances registrados</b>${a.permisos.reportar ? 'Usa «Reportar avance» para dejar el primer registro.' : ''}</div>`;
  }
  const evPorAvance = (id) => a.evidencias.filter((e) => e.avance_id === id);
  return `<ul class="timeline">${a.avances.map((v) => {
    const pin = v.validacion === 'validado' ? 'ok' : v.validacion === 'observado' ? 'bad' : 'warn';
    const evs = evPorAvance(v.id);
    const puedeVal = a.permisos.validar && v.validacion !== 'validado' && (v.usuario_id !== ctx.user.id || ctx.user.rol === 'admin');
    return `<li><span class="pin ${pin}"></span>
      <div class="head"><b>${v.porcentaje}%</b>${badge(ESTADOS[v.estado] || v.estado, 'info')}${badgeVal(v.validacion)}
        <span class="small faint">${esc(v.usuario || '—')} · ${fDateTime(v.fecha)}</span>
        ${puedeVal ? `<span class="right no-print row" style="gap:6px"><button class="btn sm ok" data-validar="${v.id}" data-modo="validado">${icon('check')}Validar</button><button class="btn sm" data-validar="${v.id}" data-modo="observado">Observar</button></span>` : ''}
      </div>
      <div class="body">${esc(v.descripcion)}</div>
      ${v.medidas_correctivas ? `<div class="small muted" style="margin-top:6px"><b>Medidas correctivas:</b> ${esc(v.medidas_correctivas)}</div>` : ''}
      ${evs.length ? `<div class="row small" style="margin-top:6px;gap:6px">${evs.map((e) => `<a href="${e.tipo === 'archivo' ? `/api/evidencias/${e.id}/archivo` : esc(e.url)}" target="_blank" rel="noopener" class="tag">${esc(e.titulo)}</a>`).join('')}</div>` : ''}
      ${v.validacion !== 'pendiente' ? `<div class="obs ${v.validacion === 'validado' ? 'ok' : ''}"><b>${v.validacion === 'validado' ? 'Validado' : 'Observado'}</b> por ${esc(v.validador || '—')} · ${fDateTime(v.fecha_validacion)}${v.comentario_validacion ? `<br>${esc(v.comentario_validacion)}` : ''}</div>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function evidencias(a) {
  return `<div class="card-head" style="border-top:0"><span class="hint">Módulo 3 · Documentos, actas, informes y registros que acreditan la ejecución.</span>
    ${a.permisos.reportar ? `<div class="right no-print"><button class="btn sm" id="ev-add">${icon('plus')}Agregar</button></div>` : ''}</div>
  ${a.evidencias.length ? `<div class="ev-list">${a.evidencias.map((e) => `
    <div class="ev">
      <div class="ico">${icon(e.tipo === 'archivo' ? (String(e.mime).startsWith('image/') ? 'camera' : 'file') : 'link')}</div>
      <div class="info"><b>${esc(e.titulo)}</b><span class="small faint">${esc(CATEGORIAS[e.categoria] || e.categoria)} · ${e.tipo === 'archivo' ? `${esc(e.nombre_archivo)} · ${fBytes(e.tamano)}` : 'Enlace externo'} · ${esc(e.autor || '—')} · ${fDateTime(e.fecha)}</span></div>
      <a class="btn sm" target="_blank" rel="noopener" href="${e.tipo === 'archivo' ? `/api/evidencias/${e.id}/archivo` : esc(e.url)}">${icon(e.tipo === 'archivo' ? 'download' : 'link')}Abrir</a>
      ${(e.subido_por === ctx.user.id || a.permisos.validar) && (!a.cerrada || ctx.esGestion()) ? `<button class="btn ghost icon sm danger no-print" data-del-ev="${e.id}" title="Eliminar">${icon('trash')}</button>` : ''}
    </div>`).join('')}</div>` : '<div class="empty"><b>Sin evidencias</b>Las acciones sin evidencia no suman al indicador de trazabilidad documental.</div>'}`;
}

function ficha(a) {
  const f = [
    ['Identificación', `<span class="tag">${esc(a.codigo)}</span>`],
    ['Acción', esc(a.nombre)],
    ['Descripción', `<span class="pre">${esc(a.descripcion || '—')}</span>`],
    ['Dimensión PME', esc(a.dimension || '—')],
    ['Objetivo estratégico', a.objetivo ? `<b>${esc(a.objetivo_codigo)}</b> · ${esc(a.objetivo)}` : '—'],
    ['Área responsable', esc(a.area || '—')],
    ['Responsable principal', esc(a.responsable || 'Sin asignar')],
    ['Áreas colaboradoras', a.colaboradoras.length ? a.colaboradoras.map((c) => esc(c.nombre)).join(', ') : '—'],
    ['Fecha de inicio', fDate(a.fecha_inicio)],
    ['Fecha de cumplimiento', fDate(a.fecha_termino)],
    ['Estado de avance', `${esc(ESTADOS[a.estado])} · ${badgeSit(a.situacion)}`],
    ['Porcentaje de ejecución', `${a.porcentaje}%`],
    ['Evidencia documental', `${a.evidencias.length} evidencia${a.evidencias.length === 1 ? '' : 's'}`],
    ['Resultado obtenido', `<span class="pre">${esc(a.resultado || '—')}</span>`],
    ['Observaciones', `<span class="pre">${esc(a.observaciones || '—')}</span>`],
    ['Medidas correctivas', `<span class="pre">${esc(a.medidas_correctivas || '—')}</span>`],
    ['Periodicidad de actualización', `Cada ${a.periodicidad_dias} días`],
    ['Fecha de actualización', fDateTime(a.ultima_actualizacion)],
    ['Estado de cierre', a.cerrada ? `${badge('Cerrada', 'ok')} el ${fDate(a.fecha_cierre)}` : badge('Abierta')],
  ];
  return `<div class="dl">${f.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}</div>`;
}

function avanceForm(a, onDone) {
  const m = modal({
    title: `Reportar avance · ${a.codigo}`,
    body: `<form id="fav" class="form">
      <label class="f">Estado<select name="estado" id="fest">${Object.entries(ESTADOS).filter(([k]) => k !== 'cancelada').map(([k, v]) => `<option value="${k}" ${k === (a.estado === 'no_iniciada' ? 'en_curso' : a.estado) ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">Porcentaje de ejecución: <b id="pval">${a.porcentaje}%</b><input type="range" name="porcentaje" min="0" max="100" step="5" value="${a.porcentaje}" id="prange"></label>
      <label class="f full">¿Qué se realizó en este periodo? <span class="req">*</span><textarea name="descripcion" required placeholder="Actividades ejecutadas, participantes, productos obtenidos…"></textarea></label>
      <label class="f full">Dificultades y medidas correctivas<textarea name="medidas_correctivas" placeholder="Opcional. Si hubo desviaciones, indica qué se hará para corregirlas."></textarea></label>
      <div class="full stack" style="gap:8px">
        <label class="check"><input type="checkbox" id="conev">Adjuntar evidencia a este avance</label>
        <div id="evbox" hidden class="card card-pad stack" style="background:var(--bg-2)">${evidenciaCampos()}</div>
      </div>
      <div class="notice full small">El registro quedará <b>pendiente de validación</b> por la coordinación del área.</div>
    </form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fav">Registrar avance</button>',
  });
  const r = $('#prange', m.el); const est = $('#fest', m.el);
  r.addEventListener('input', () => { $('#pval', m.el).textContent = `${r.value}%`; });
  est.addEventListener('change', () => { if (est.value === 'completada') { r.value = 100; r.dispatchEvent(new Event('input')); } });
  $('#conev', m.el).addEventListener('change', (e) => { $('#evbox', m.el).hidden = !e.target.checked; });
  bindEvidenciaCampos(m.el);
  $('#fav', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const conEv = $('#conev', m.el).checked;
    if (conEv && !validarEvidencia(m.el)) return;
    await run(e.submitter, async () => {
      const { id } = await api.post(`/api/acciones/${a.id}/avances`, { estado: d.estado, porcentaje: d.porcentaje, descripcion: d.descripcion, medidas_correctivas: d.medidas_correctivas });
      if (conEv) await enviarEvidencia(m.el, a.id, id);
    });
    m.close(); toast('Avance registrado'); ctx.refreshBadge(); tab = 'seguimiento'; onDone();
  });
}

const evidenciaCampos = () => `
  <div class="seg" id="evtipo"><button type="button" data-t="archivo" class="on">Archivo</button><button type="button" data-t="enlace">Enlace (Drive, OneDrive…)</button></div>
  <label class="f">Título de la evidencia<input name="ev_titulo" maxlength="200" placeholder="Ej.: Acta consejo de profesores 12/05"></label>
  <label class="f">Tipo<select name="ev_categoria">${Object.entries(CATEGORIAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label class="f" data-box="archivo">Archivo <span class="help">PDF, imagen u otro documento · máx. 4 MB</span><input type="file" name="ev_archivo"></label>
  <label class="f" data-box="enlace" hidden>Enlace<input name="ev_url" type="url" placeholder="https://drive.google.com/…"></label>
  <p class="small faint">No adjuntes documentos con datos personales sensibles de estudiantes o familias; si es imprescindible, comparte un enlace con acceso restringido.</p>`;

function bindEvidenciaCampos(el) {
  $$('#evtipo button', el).forEach((b) => b.addEventListener('click', () => {
    $$('#evtipo button', el).forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-box]', el).forEach((x) => { x.hidden = x.dataset.box !== b.dataset.t; });
  }));
}
const tipoEv = (el) => $('#evtipo button.on', el).dataset.t;
function validarEvidencia(el) {
  if (!$('[name=ev_titulo]', el).value.trim()) { toast('Indica un título para la evidencia', true); return false; }
  if (tipoEv(el) === 'archivo' && !$('[name=ev_archivo]', el).files[0]) { toast('Selecciona un archivo', true); return false; }
  if (tipoEv(el) === 'archivo' && $('[name=ev_archivo]', el).files[0].size > 4 * 1048576) { toast('El archivo supera 4 MB. Súbelo a Drive y registra el enlace.', true); return false; }
  if (tipoEv(el) === 'enlace' && !/^https?:\/\//.test($('[name=ev_url]', el).value)) { toast('Ingresa un enlace válido', true); return false; }
  return true;
}
async function enviarEvidencia(el, accionId, avanceId) {
  const fd = new FormData();
  fd.append('titulo', $('[name=ev_titulo]', el).value);
  fd.append('categoria', $('[name=ev_categoria]', el).value);
  if (avanceId) fd.append('avance_id', avanceId);
  if (tipoEv(el) === 'archivo') fd.append('archivo', $('[name=ev_archivo]', el).files[0]);
  else fd.append('url', $('[name=ev_url]', el).value);
  return api.post(`/api/acciones/${accionId}/evidencias`, fd);
}

function evidenciaForm(a, avanceId, onDone) {
  const m = modal({
    title: `Adjuntar evidencia · ${a.codigo}`, size: 'sm',
    body: `<form id="fev" class="stack">${evidenciaCampos()}</form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fev">Adjuntar</button>',
  });
  bindEvidenciaCampos(m.el);
  $('#fev', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validarEvidencia(m.el)) return;
    await run(e.submitter, () => enviarEvidencia(m.el, a.id, avanceId));
    m.close(); toast('Evidencia adjuntada'); tab = 'evidencias'; onDone();
  });
}

export function validar(avanceId, modo, onDone) {
  const obs = modo === 'observado';
  const m = modal({
    title: obs ? 'Observar registro' : 'Validar registro', size: 'sm',
    body: `<form id="fval" class="stack">
      <p class="muted">${obs ? 'Indica qué debe corregir o complementar el responsable. El registro quedará marcado como observado.' : 'Confirmas que el registro es consistente, íntegro y está respaldado.'}</p>
      <label class="f">${obs ? 'Observación' : 'Comentario (opcional)'}<textarea name="comentario" ${obs ? 'required' : ''}></textarea></label>
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn ${obs ? 'danger' : 'primary'}" form="fval">${obs ? 'Registrar observación' : 'Validar'}</button>`,
  });
  $('#fval', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(e.submitter, () => api.post(`/api/avances/${avanceId}/validar`, { validacion: modo, comentario: formData(e.target).comentario }));
    m.close(); toast(obs ? 'Observación registrada' : 'Registro validado'); ctx.refreshBadge(); onDone();
  });
}

function cerrarForm(a, onDone) {
  const sinEv = a.evidencias.length === 0;
  const m = modal({
    title: `Cerrar acción · ${a.codigo}`,
    body: `<form id="fcl" class="form">
      <label class="f">Tipo de cierre<select name="estado"><option value="completada">Completada (ejecutada)</option><option value="cancelada">Cancelada (no se ejecutará)</option></select></label>
      <label class="f">Fecha de cierre<input type="date" name="fecha_cierre" value="${esc(String(a.fecha_cierre || today()).slice(0, 10))}"></label>
      <label class="f full">Resultado obtenido <span class="req">*</span><textarea name="resultado" required placeholder="¿Qué se logró? ¿Cómo se verifica?">${esc(a.resultado || '')}</textarea></label>
      ${sinEv ? '<div class="notice warn full">Esta acción no tiene evidencias asociadas. Lo recomendable es adjuntar al menos una antes de cerrar.</div><label class="check full"><input type="checkbox" name="sin_evidencia">Cerrar de todas formas sin evidencia</label>' : ''}
      ${a.n_pendientes ? `<div class="notice full">Hay ${a.n_pendientes} registro(s) pendientes de validación.</div>` : ''}
    </form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn ok" form="fcl">Cerrar acción</button>',
  });
  $('#fcl', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(e.submitter, () => api.post(`/api/acciones/${a.id}/cerrar`, formData(e.target)));
    m.close(); toast('Acción cerrada'); onDone();
  });
}
