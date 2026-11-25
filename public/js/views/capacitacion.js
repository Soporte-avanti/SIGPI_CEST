import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, fDate, pctCell, tono, icon, modal, formData, run, toast, confirmar, today } from '../ui.js';

const puedeGestionar = () => ctx.esGestion() || ctx.user.rol === 'coordinador';

export async function render(view) {
  ctx.crumb('<b>Capacitación</b>');
  const rows = await api.get('/api/capacitaciones');
  const tot = rows.reduce((s, r) => ({ c: s.c + r.convocados, a: s.a + r.asistentes }), { c: 0, a: 0 });
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Capacitación y gestión del cambio</h1><p class="sub">Componente 5 · Jornadas de inducción, capacitación por área y registro de asistencia.</p></div>
    <div class="actions">${puedeGestionar() ? `<button class="btn primary" id="nueva">${icon('plus')}Nueva jornada</button>` : ''}</div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card stat"><div class="lbl">Jornadas</div><div class="num">${rows.length}</div></div>
    <div class="card stat"><div class="lbl">Convocatorias</div><div class="num">${tot.c}</div><div class="foot">${tot.a} asistencias registradas</div></div>
    <div class="card stat"><div class="lbl">Participación</div><div class="num">${tot.c ? Math.round((tot.a / tot.c) * 1000) / 10 : 0}%</div><div class="foot">Funcionarios capacitados / convocados</div></div>
  </div>
  <div class="card">
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Jornada</th><th>Fecha</th><th>Modalidad</th><th class="num">Convocados</th><th>Asistencia</th></tr></thead>
      <tbody>${rows.map((c) => {
        const p = c.convocados ? Math.round((c.asistentes / c.convocados) * 100) : 0;
        return `<tr class="link" data-id="${c.id}"><td><div class="t-main">${esc(c.titulo)}</div>${c.descripcion ? `<div class="t-sub">${esc(c.descripcion)}</div>` : ''}</td>
        <td class="nowrap">${fDate(c.fecha)}</td><td>${esc(c.modalidad)}</td><td class="num">${c.convocados}</td><td style="width:180px">${pctCell(p, tono(p))}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><b>Sin jornadas registradas</b>Registra la jornada de inducción al modelo SIGPI para comenzar.</div>'}
  </div>`;
  $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/capacitacion/${tr.dataset.id}`)));
  $('#nueva', view)?.addEventListener('click', () => nueva((id) => ctx.go(`#/capacitacion/${id}`)));
}

function nueva(onDone) {
  const { areas, usuarios } = ctx.cat;
  const m = modal({
    title: 'Nueva jornada de capacitación',
    body: `<form id="fc" class="form">
      <label class="f full">Título <span class="req">*</span><input name="titulo" required placeholder="Ej.: Inducción al modelo SIGPI"></label>
      <label class="f">Fecha <span class="req">*</span><input type="date" name="fecha" required value="${today()}"></label>
      <label class="f">Modalidad<select name="modalidad"><option>presencial</option><option>en línea</option><option>mixta</option></select></label>
      <label class="f full">Descripción<textarea name="descripcion"></textarea></label>
      <div class="f full"><span>Convocar áreas completas</span><div class="chips">${areas.filter((a) => a.activa).map((a) => `<label class="chip-check"><input type="checkbox" name="areas" data-multi value="${a.id}">${esc(a.sigla)}</label>`).join('')}</div></div>
      <div class="f full"><span>…o funcionarios específicos</span>
        <div class="card" style="max-height:220px;overflow:auto;background:var(--bg-2)">${usuarios.map((u) => `<label class="check" style="display:flex;padding:6px 12px;border-bottom:1px solid var(--line)"><input type="checkbox" name="usuarios" data-multi value="${u.id}">${esc(u.nombre)} <span class="faint small">${esc(ctx.area(u.area_id)?.sigla || '')}</span></label>`).join('')}</div></div>
    </form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fc">Crear jornada</button>',
  });
  $('#fc', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run(e.submitter, () => api.post('/api/capacitaciones', formData(e.target)));
    m.close(); toast('Jornada creada'); onDone(r.id);
  });
}

export async function detalle(view, id) {
  const c = await api.get(`/api/capacitaciones/${id}`);
  ctx.crumb(`<a href="#/capacitacion">Capacitación</a> / <b>${esc(c.titulo)}</b>`);
  const g = puedeGestionar();
  view.innerHTML = `
  <div class="row no-print" style="margin-bottom:12px"><a class="btn ghost sm" href="#/capacitacion">${icon('back')}Volver</a></div>
  <div class="page-head">
    <div><h1>${esc(c.titulo)}</h1><p class="sub">${fDate(c.fecha)} · ${esc(c.modalidad)}${c.descripcion ? ` · ${esc(c.descripcion)}` : ''}</p></div>
    <div class="actions">
      <button class="btn" onclick="window.print()">${icon('print')}Imprimir lista</button>
      ${ctx.esGestion() ? `<button class="btn ghost danger icon" id="del" title="Eliminar">${icon('trash')}</button>` : ''}
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Registro de asistencia</h2><span class="hint" id="cnt"></span>
      ${g ? `<div class="right no-print"><button class="btn sm" id="todos">Marcar todos</button><button class="btn sm primary" id="guardar">Guardar asistencia</button></div>` : ''}</div>
    ${c.convocados.length ? `<div class="table-wrap"><table>
      <thead><tr><th style="width:60px">Asistió</th><th>Funcionario</th><th>Área</th><th>Cargo</th></tr></thead>
      <tbody>${c.convocados.map((u) => `<tr><td><input type="checkbox" data-u="${u.id}" ${u.asistio ? 'checked' : ''} ${g ? '' : 'disabled'}></td>
        <td>${esc(u.nombre)}</td><td>${esc(u.area_sigla || '—')}</td><td class="muted">${esc(u.cargo || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">No hay funcionarios convocados.</div>'}
  </div>`;
  const contar = () => { const ch = $$('[data-u]', view); $('#cnt', view).textContent = `${ch.filter((x) => x.checked).length} de ${ch.length} asistentes`; };
  $$('[data-u]', view).forEach((x) => x.addEventListener('change', contar)); contar();
  $('#todos', view)?.addEventListener('click', () => { $$('[data-u]', view).forEach((x) => { x.checked = true; }); contar(); });
  $('#guardar', view)?.addEventListener('click', async (e) => {
    const asistencia = Object.fromEntries($$('[data-u]', view).map((x) => [x.dataset.u, x.checked]));
    await run(e.currentTarget, () => api.put(`/api/capacitaciones/${id}/asistencia`, { asistencia }));
    toast('Asistencia guardada');
  });
  $('#del', view)?.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar jornada', 'Se eliminará la jornada y su registro de asistencia.', { ok: 'Eliminar', danger: true }))) return;
    await run(null, () => api.del(`/api/capacitaciones/${id}`)); ctx.go('#/capacitacion');
  });
}
