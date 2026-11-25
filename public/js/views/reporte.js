import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, fDate, fNum, badgeSit, pctCell, tono, icon, options, SITUACIONES } from '../ui.js';

let area = null;
let piloto = false;

export async function render(view) {
  ctx.crumb('<b>Reporte por área</b>');
  const areas = ctx.cat.areas.filter((a) => a.activa);
  if (area === null) area = ctx.esGestion() ? '' : String(ctx.user.area_id || '');
  const q = new URLSearchParams();
  if (area) q.set('area', area);
  if (piloto) q.set('piloto', '1');
  const [k, acciones] = await Promise.all([api.get(`/api/kpi?${q}`), api.get(`/api/acciones?${q}`)]);
  const nombreArea = area ? ctx.area(area)?.nombre : 'Todas las áreas';
  const vigentes = acciones.filter((a) => a.estado !== 'cancelada');
  const atencion = vigentes.filter((a) => ['atrasada', 'por_vencer'].includes(a.situacion) || a.desactualizada);
  const r = k.resumen;
  const ahora = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' });

  view.innerHTML = `
  <div class="page-head no-print">
    <div><h1>Reporte por área</h1><p class="sub">Estado del PME listo para imprimir o guardar como PDF, para el consejo o la reunión mensual (P-06).</p></div>
    <div class="actions">
      <select id="farea" style="width:auto">${options(areas, area, { empty: 'Todas las áreas' })}</select>
      <label class="check"><input type="checkbox" id="fpil" ${piloto ? 'checked' : ''}>Solo piloto</label>
      <button class="btn primary" onclick="window.print()">${icon('print')}Imprimir o guardar PDF</button>
    </div>
  </div>

  <div class="card card-pad" style="margin-bottom:16px">
    <div class="row" style="align-items:flex-start">
      <div><div class="small faint">SIGPI · Centro Educativo Salesianos Talca</div><h2 style="font-size:22px;margin-top:4px">${esc(nombreArea)}${piloto ? ' · acciones piloto' : ''}</h2>
        <div class="small muted" style="margin-top:4px">Estado del seguimiento del PME al ${esc(ahora)}</div></div>
      <div class="right row" style="gap:28px;text-align:right">
        <div><div class="small faint">Acciones</div><div style="font-size:24px;font-weight:650">${r.total}</div></div>
        <div><div class="small faint">Atrasadas</div><div style="font-size:24px;font-weight:650;color:${r.atrasadas ? 'var(--bad)' : 'inherit'}">${r.atrasadas}</div></div>
        <div><div class="small faint">Completadas</div><div style="font-size:24px;font-weight:650">${r.completadas}</div></div>
        <div><div class="small faint">Avance promedio</div><div style="font-size:24px;font-weight:650">${r.avance_promedio}%</div></div>
        <div><div class="small faint">Por validar</div><div style="font-size:24px;font-weight:650">${r.pendientes_validar}</div></div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>Indicadores</h3><span class="hint">${k.linea_base ? `Línea base: ${esc(k.linea_base.etiqueta)}` : 'Sin línea base registrada'}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Indicador</th><th>Valor</th><th class="num">Detalle</th><th class="num">Meta</th></tr></thead>
      <tbody>${k.fichas.map((f) => { const v = k.valores[f.clave]; return `<tr><td>${esc(f.nombre)}</td>
        <td style="width:220px">${v.valor === null ? '<span class="faint">—</span>' : pctCell(v.valor, tono(v.valor, f.meta))}</td>
        <td class="num small faint">${v.num} de ${v.den}</td><td class="num">${f.meta === null ? '<span class="faint">por definir</span>' : `${fNum(f.meta)}%`}</td></tr>`; }).join('')}</tbody>
    </table></div>
  </div>

  ${atencion.length ? `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>Requieren atención</h3><span class="hint">${atencion.length} acciones atrasadas, por vencer o sin actualizar</span></div>
    <div class="table-wrap"><table><thead><tr><th>Acción</th><th>Responsable</th><th>Plazo</th><th>Situación</th><th>Medidas correctivas</th></tr></thead>
    <tbody>${atencion.map((a) => `<tr><td><div class="t-main">${esc(a.nombre)}</div><div class="t-sub"><span class="tag">${esc(a.codigo)}</span></div></td>
      <td>${esc(a.responsable || 'Sin asignar')}</td><td class="nowrap small">${fDate(a.fecha_termino)}</td>
      <td>${badgeSit(a.situacion)}${a.desactualizada ? '<div class="t-sub">sin actualizar</div>' : ''}</td><td class="small">${esc(a.medidas_correctivas || '—')}</td></tr>`).join('')}</tbody></table></div>
  </div>` : ''}

  <div class="card">
    <div class="card-head"><h3>Detalle de acciones</h3><span class="hint">${vigentes.length} acciones vigentes</span></div>
    ${vigentes.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Acción</th>${area ? '' : '<th>Área</th>'}<th>Responsable</th><th>Plazo</th><th>Avance</th><th>Situación</th><th class="num">Evid.</th><th>Último avance</th></tr></thead>
      <tbody>${vigentes.map((a) => `<tr>
        <td style="min-width:200px"><div class="t-main">${esc(a.nombre)}</div><div class="t-sub"><span class="tag">${esc(a.codigo)}</span></div></td>
        ${area ? '' : `<td>${esc(a.area_sigla || '—')}</td>`}
        <td class="small">${esc(a.responsable || 'Sin asignar')}</td>
        <td class="nowrap small">${fDate(a.fecha_inicio)}<div class="t-sub">al ${fDate(a.fecha_termino)}</div></td>
        <td style="width:130px">${pctCell(a.porcentaje)}</td>
        <td>${badgeSit(a.situacion)}</td>
        <td class="num">${a.n_evidencias}</td>
        <td class="small muted" style="max-width:320px">${esc((a.resultado || a.ultimo_avance || '—').slice(0, 220))}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">No hay acciones para este filtro.</div>'}
  </div>
  <p class="small faint" style="margin-top:12px">Generado desde el SIGPI. Situaciones: ${Object.values(SITUACIONES).map(([t]) => t).join(', ')}.</p>`;

  $('#farea', view).addEventListener('change', (e) => { area = e.target.value; render(view); });
  $('#fpil', view).addEventListener('change', (e) => { piloto = e.target.checked; render(view); });
}
