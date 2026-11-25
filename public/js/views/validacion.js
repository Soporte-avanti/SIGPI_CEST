import { api } from '../api.js';
import { ctx } from '../app.js';
import { validar } from './accion.js';
import { esc, $$, fDateTime, badge, icon, ESTADOS, relTime } from '../ui.js';

export async function render(view) {
  ctx.crumb('<b>Validación de registros</b>');
  const rows = await api.get('/api/validaciones');
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Validación de registros</h1><p class="sub">Etapa 3 del ciclo: verificar la consistencia, integridad, origen y pertinencia de cada avance reportado.</p></div>
  </div>
  <div class="card">
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Acción</th><th>Registro</th><th>Reportado por</th><th class="num">Evid.</th><th></th></tr></thead>
      <tbody>${rows.map((v) => `<tr>
        <td style="min-width:240px"><a href="#/acciones/${v.accion_id}" class="t-main">${esc(v.accion)}</a><div class="t-sub"><span class="tag">${esc(v.codigo)}</span> ${esc(v.area_sigla || '')}</div></td>
        <td style="min-width:300px"><div class="row" style="gap:6px"><b>${v.porcentaje}%</b>${badge(ESTADOS[v.estado] || v.estado, 'info')}</div><div class="small" style="margin-top:4px;white-space:pre-wrap">${esc(v.descripcion)}</div></td>
        <td class="nowrap">${esc(v.usuario || '—')}<div class="t-sub">${fDateTime(v.fecha)} · ${relTime(v.fecha)}</div></td>
        <td class="num">${v.n_evidencias || '<span class="faint">0</span>'}</td>
        <td class="nowrap" style="text-align:right">${v.usuario_id === ctx.user.id && ctx.user.rol !== 'admin' ? '<span class="small faint">Registro propio</span>'
          : `<button class="btn sm ok" data-v="${v.id}" data-m="validado">${icon('check')}Validar</button> <button class="btn sm" data-v="${v.id}" data-m="observado">Observar</button>`}</td>
      </tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><b>No hay registros pendientes</b>Todos los avances de tus áreas están validados.</div>'}
  </div>`;
  $$('[data-v]', view).forEach((b) => b.addEventListener('click', () => validar(Number(b.dataset.v), b.dataset.m, () => render(view))));
}
