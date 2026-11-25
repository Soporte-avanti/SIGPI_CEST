import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, fDate, relTime, badgeSit, pctCell, options, icon, modal, formData, run, toast, parseCSV, SITUACIONES, today } from '../ui.js';

const filtros = { q: '', area: '', dimension: '', situacion: '', piloto: false, mias: false };

export async function render(view) {
  ctx.crumb('<b>Acciones PME</b>');
  const fa = sessionStorage.getItem('sigpi:filtro-area');
  if (fa) { filtros.area = fa; sessionStorage.removeItem('sigpi:filtro-area'); }
  const { areas, dimensiones } = ctx.cat;
  const puedeCrear = ctx.esGestion() || ctx.user.rol === 'coordinador';

  view.innerHTML = `
  <div class="page-head">
    <div><h1>Acciones PME</h1><p class="sub">Módulo 1 · Registro de acciones, responsables, plazos y estado de avance.</p></div>
    <div class="actions">
      <a class="btn" href="/api/reportes/acciones.csv">${icon('download')}Exportar CSV</a>
      ${ctx.esGestion() ? `<button class="btn" id="imp">${icon('upload')}Importar</button>` : ''}
      ${puedeCrear ? `<button class="btn primary" id="nueva">${icon('plus')}Nueva acción</button>` : ''}
    </div>
  </div>
  <div class="card">
    <form class="filters" id="filtros">
      <input class="search" name="q" placeholder="Buscar por nombre o código…" value="${esc(filtros.q)}">
      <select name="area">${options(areas.filter((a) => a.activa), filtros.area, { empty: 'Todas las áreas' })}</select>
      <select name="dimension">${options(dimensiones, filtros.dimension, { empty: 'Todas las dimensiones' })}</select>
      <select name="situacion">${options(Object.entries(SITUACIONES).map(([id, [nombre]]) => ({ id, nombre })), filtros.situacion, { empty: 'Cualquier situación' })}</select>
      <label class="check"><input type="checkbox" name="piloto" ${filtros.piloto ? 'checked' : ''}>Piloto</label>
      <label class="check"><input type="checkbox" name="mias" ${filtros.mias ? 'checked' : ''}>Solo mías</label>
      <span class="right small faint" id="cuenta"></span>
    </form>
    <div id="tabla"><div class="empty">Cargando…</div></div>
  </div>`;

  const cargar = async () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) p.set(k, v === true ? '1' : v);
    const rows = await api.get(`/api/acciones?${p}`);
    $('#cuenta', view).textContent = `${rows.length} acción${rows.length === 1 ? '' : 'es'}`;
    $('#tabla', view).innerHTML = rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Acción</th><th>Área</th><th>Responsable</th><th>Plazo</th><th>Avance</th><th>Situación</th><th class="num" title="Evidencias">Evid.</th><th>Actualizada</th></tr></thead>
      <tbody>${rows.map((a) => `<tr class="link" data-id="${a.id}">
        <td style="min-width:280px"><div class="t-main">${esc(a.nombre)}</div><div class="t-sub"><span class="tag">${esc(a.codigo)}</span> ${esc(a.dimension || 'Sin dimensión')}${a.piloto ? ' · <span class="badge violet">Piloto</span>' : ''}</div></td>
        <td class="nowrap" title="${esc(a.area || '')}">${esc(a.area_sigla || '—')}${a.colaboradoras.length ? `<div class="t-sub">+ ${a.colaboradoras.map((c) => esc(c.sigla)).join(', ')}</div>` : ''}</td>
        <td>${a.responsable ? esc(a.responsable) : '<span class="badge warn">Sin asignar</span>'}</td>
        <td class="nowrap small">${fDate(a.fecha_inicio)}<div class="t-sub">al ${fDate(a.fecha_termino)}</div></td>
        <td style="width:140px">${pctCell(a.porcentaje)}</td>
        <td>${badgeSit(a.situacion)}${a.n_pendientes ? `<div class="t-sub">${a.n_pendientes} por validar</div>` : ''}</td>
        <td class="num">${a.n_evidencias || '<span class="faint">0</span>'}</td>
        <td class="nowrap small ${a.desactualizada ? '' : 'faint'}" style="${a.desactualizada ? 'color:var(--warn)' : ''}">${relTime(a.ultima_actualizacion)}</td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><b>Sin resultados</b>No hay acciones que coincidan con los filtros.</div>';
    $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/acciones/${tr.dataset.id}`)));
  };

  let t;
  const f = $('#filtros', view);
  f.addEventListener('input', (e) => {
    Object.assign(filtros, formData(f));
    clearTimeout(t); t = setTimeout(cargar, e.target.name === 'q' ? 250 : 0);
  });
  f.addEventListener('submit', (e) => e.preventDefault());
  $('#nueva', view)?.addEventListener('click', () => accionForm(null, (a) => ctx.go(`#/acciones/${a.id}`)));
  $('#imp', view)?.addEventListener('click', () => importar(cargar));
  await cargar();
}

// Formulario de creación / edición (se reutiliza en el detalle)
export function accionForm(a, onSaved) {
  const { areas, dimensiones, objetivos, usuarios } = ctx.cat;
  const nueva = !a;
  a = a || { area_id: ctx.esGestion() ? '' : ctx.user.area_id, periodicidad_dias: 15, fecha_inicio: today(), colaboradoras: [] };
  const colab = new Set((a.colaboradoras || []).map((c) => c.id));
  const areaBloqueada = !ctx.esGestion();
  const m = modal({
    title: nueva ? 'Nueva acción' : `Editar ${a.codigo}`,
    body: `<form id="fa" class="form">
      <label class="f full">Nombre de la acción <span class="req">*</span><input name="nombre" required maxlength="300" value="${esc(a.nombre || '')}"></label>
      <label class="f full">Descripción<textarea name="descripcion" placeholder="¿En qué consiste? ¿Qué se espera lograr?">${esc(a.descripcion || '')}</textarea></label>
      <label class="f">Dimensión PME<select name="dimension_id" id="fdim">${options(dimensiones, a.dimension_id, { empty: 'Seleccionar…' })}</select></label>
      <label class="f">Objetivo estratégico<select name="objetivo_id" id="fobj"></select></label>
      <label class="f">Área responsable <span class="req">*</span><select name="area_id" required ${areaBloqueada ? 'disabled' : ''}>${options(areas.filter((x) => x.activa || x.id === a.area_id), a.area_id, { empty: 'Seleccionar…' })}</select>
        ${areaBloqueada ? `<input type="hidden" name="area_id" value="${esc(a.area_id)}">` : ''}</label>
      <label class="f">Responsable principal<select name="responsable_id">${options(usuarios, a.responsable_id, { empty: 'Sin asignar', label: (u) => `${u.nombre}${u.cargo ? ' — ' + u.cargo : ''}` })}</select></label>
      <label class="f">Fecha de inicio<input type="date" name="fecha_inicio" value="${esc(String(a.fecha_inicio || '').slice(0, 10))}"></label>
      <label class="f">Fecha de cumplimiento<input type="date" name="fecha_termino" value="${esc(String(a.fecha_termino || '').slice(0, 10))}"></label>
      <label class="f">Periodicidad de reporte de avance
        <select name="periodicidad_dias">${[[7, 'Semanal (7 días)'], [15, 'Quincenal (15 días)'], [30, 'Mensual (30 días)'], [60, 'Bimestral (60 días)']].map(([v, t]) => `<option value="${v}" ${Number(a.periodicidad_dias) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Código <span class="help">${nueva ? 'opcional · automático' : 'no editable'}</span><input name="codigo" maxlength="40" value="${esc(a.codigo || '')}" ${nueva ? '' : 'disabled'} placeholder="Ej.: PED-2026-004"></label>
      <div class="f full"><span>Áreas colaboradoras</span><div class="chips">${areas.filter((x) => x.activa).map((x) => `<label class="chip-check"><input type="checkbox" name="colaboradoras" data-multi value="${x.id}" ${colab.has(x.id) ? 'checked' : ''}>${esc(x.sigla)}</label>`).join('')}</div></div>
      <label class="check full"><input type="checkbox" name="piloto" ${a.piloto ? 'checked' : ''}>Incluir en la implementación piloto (Fase III)</label>
      ${nueva ? '' : `<label class="f full">Observaciones<textarea name="observaciones">${esc(a.observaciones || '')}</textarea></label>`}
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fa">${nueva ? 'Registrar acción' : 'Guardar cambios'}</button>`,
  });
  const fobj = $('#fobj', m.el);
  const pintarObj = () => {
    const d = $('#fdim', m.el).value;
    fobj.innerHTML = options(objetivos.filter((o) => !d || String(o.dimension_id) === d), a.objetivo_id, { empty: objetivos.length ? 'Seleccionar…' : 'Sin objetivos registrados', label: (o) => `${o.codigo} · ${o.descripcion.slice(0, 80)}` });
  };
  pintarObj();
  $('#fdim', m.el).addEventListener('change', pintarObj);
  $('#fa', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await run(e.submitter, () => (nueva ? api.post('/api/acciones', d) : api.put(`/api/acciones/${a.id}`, d)));
    m.close(); toast(nueva ? `Acción ${r.codigo} registrada` : 'Cambios guardados');
    onSaved && onSaved(r);
  });
}

function importar(onDone) {
  const ejemplo = 'codigo;nombre;descripcion;area;dimension;responsable;fecha_inicio;fecha_termino;periodicidad_dias;piloto\n;Monitoreo de cobertura curricular;Revisión trimestral por asignatura;PED;Gestión Pedagógica;coord.ped@colegio.cl;2026-03-01;2026-11-30;30;si';
  const m = modal({
    title: 'Importar acciones desde CSV',
    body: `<div class="stack">
      <p class="muted">Carga de una vez las acciones del PME vigente. Usa una planilla con estas columnas (separador <code>;</code> o <code>,</code>). El área puede ir como sigla (PED, TP, ACE…) o nombre completo; el responsable, como correo o nombre exacto.</p>
      <pre class="card card-pad mono small" style="overflow:auto;margin:0;white-space:pre">${esc(ejemplo)}</pre>
      <div class="row"><a class="btn sm" id="plantilla" download="plantilla_acciones_sigpi.csv">${icon('download')}Descargar plantilla</a></div>
      <label class="f">Archivo CSV<input type="file" id="csv" accept=".csv,text/csv"></label>
      <div id="prev"></div>
    </div>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" id="go" disabled>Importar</button>',
  });
  $('#plantilla', m.el).href = URL.createObjectURL(new Blob(['﻿' + ejemplo], { type: 'text/csv' }));
  let filas = [];
  $('#csv', m.el).addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const rows = parseCSV(await file.text());
    const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'));
    filas = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
    $('#prev', m.el).innerHTML = `<div class="notice">${filas.length} filas detectadas. Columnas: ${head.map((h) => `<code>${esc(h)}</code>`).join(', ')}</div>`;
    $('#go', m.el).disabled = !filas.length;
  });
  $('#go', m.el).addEventListener('click', async (e) => {
    const r = await run(e.currentTarget, () => api.post('/api/acciones/importar', { filas }));
    $('#prev', m.el).innerHTML = `<div class="notice ${r.errores.length ? 'warn' : ''}"><b>${r.creadas} acciones importadas.</b>${r.errores.length ? `<br>${r.errores.length} filas con error:<br>${r.errores.slice(0, 15).map((x) => `Fila ${x.fila}: ${esc(x.error)}`).join('<br>')}` : ''}</div>`;
    $('#go', m.el).disabled = true;
    onDone();
  });
}
