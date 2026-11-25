import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, fDate, relTime, diasHasta, badgeSit, bar, tono, fNum, icon, pctCell } from '../ui.js';

let piloto = false;

export async function render(view) {
  ctx.crumb('<b>Tablero de control</b>');
  const q = piloto ? '?piloto=1' : '';
  const [k, acciones] = await Promise.all([api.get(`/api/kpi${q}`), api.get(`/api/acciones${q}`)]);
  const r = k.resumen;
  const atrasadas = acciones.filter((a) => a.situacion === 'atrasada');
  const porVencer = acciones.filter((a) => a.situacion === 'por_vencer');
  const desact = acciones.filter((a) => a.desactualizada && a.situacion !== 'atrasada').slice(0, 8);
  const mias = acciones.filter((a) => a.responsable_id === ctx.user.id && !a.cerrada && a.estado !== 'cancelada');

  view.innerHTML = `
  <div class="page-head">
    <div><h1>Hola, ${esc(ctx.user.nombre.split(' ')[0])}</h1><p class="sub">Estado de las acciones del Plan de Mejoramiento Educativo al ${fDate(new Date().toISOString())}.</p></div>
    <div class="actions">
      <div class="seg" id="seg"><button data-p="0" class="${piloto ? '' : 'on'}">Todas las acciones</button><button data-p="1" class="${piloto ? 'on' : ''}">Solo piloto</button></div>
      <button class="btn" onclick="window.print()">${icon('print')}Imprimir</button>
    </div>
  </div>

  <div class="grid g4" style="margin-bottom:16px">
    <div class="card stat"><div class="lbl">Acciones vigentes</div><div class="num">${r.total}</div><div class="foot">${r.en_curso} en curso · ${r.no_iniciadas} sin iniciar</div></div>
    <div class="card stat ${r.atrasadas ? 'bad' : 'ok'}"><div class="lbl">Atrasadas</div><div class="num">${r.atrasadas}</div><div class="foot">fecha de cumplimiento vencida</div></div>
    <div class="card stat"><div class="lbl">Avance promedio</div><div class="num">${r.avance_promedio}%</div><div style="margin-top:8px">${bar(r.avance_promedio)}</div></div>
    <div class="card stat ${r.pendientes_validar ? 'warn' : ''}"><div class="lbl">Registros por validar</div><div class="num">${r.pendientes_validar}</div><div class="foot">${r.registros} registros ingresados · ${r.observados} observados</div></div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="card-head"><h2>Indicadores clave</h2><span class="hint">La línea vertical marca la meta, si está definida</span><div class="right"><a class="btn sm" href="#/indicadores">Ver fichas</a></div></div>
    <div class="grid g4" style="padding:16px;gap:12px">
      ${k.fichas.map((f) => {
        const v = k.valores[f.clave]; const t = tono(v.valor, f.meta);
        return `<div class="card kpi" style="background:var(--bg-2)" title="${esc(f.formula)}">
          <div class="top-line"><span class="dot ${t}"></span><span class="name">${esc(f.nombre)}</span></div>
          <div class="val">${v.valor === null ? '—' : fNum(v.valor)}<small>${v.valor === null ? '' : '%'}</small></div>
          ${bar(v.valor, t, f.meta)}
          <div class="ratio">${v.num} de ${v.den}${f.meta !== null ? ` · meta ${fNum(f.meta)}%` : ''}</div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="grid g2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-head"><h2>Atención inmediata</h2><span class="hint">${atrasadas.length} atrasadas · ${porVencer.length} vencen en 7 días</span></div>
      ${lista([...atrasadas, ...porVencer].slice(0, 10), 'No hay acciones atrasadas ni por vencer.')}
    </div>
    <div class="card">
      <div class="card-head"><h2>Sin actualizar en plazo</h2><span class="hint">Superan su periodicidad de reporte</span></div>
      ${desact.length ? `<div class="table-wrap"><table><tbody>${desact.map((a) => `
        <tr class="link" data-id="${a.id}"><td><div class="t-main">${esc(a.nombre)}</div><div class="t-sub"><span class="tag">${esc(a.codigo)}</span> ${esc(a.responsable || 'Sin responsable')}</div></td>
        <td class="nowrap small faint num">${relTime(a.ultima_actualizacion)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todas las acciones están al día.</div>'}
    </div>
  </div>

  ${mias.length ? `<div class="card" style="margin-bottom:16px">
    <div class="card-head"><h2>Mis acciones</h2><span class="hint">Acciones en que figuras como responsable</span></div>
    ${lista(mias, '')}
  </div>` : ''}

  ${k.por_area.length ? `<div class="card">
    <div class="card-head"><h2>Avance por área</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Área</th><th class="num">Acciones</th><th class="num">Atrasadas</th><th>Avance promedio</th><th>Con evidencia</th><th>Actualizadas</th><th>Validados</th></tr></thead>
      <tbody>${k.por_area.map((a) => `<tr class="link" data-area="${a.id}">
        <td><div class="t-main">${esc(a.nombre)}</div></td>
        <td class="num">${a.resumen.total}</td>
        <td class="num">${a.resumen.atrasadas ? `<span class="badge bad">${a.resumen.atrasadas}</span>` : '<span class="faint">0</span>'}</td>
        <td>${pctCell(a.resumen.avance_promedio)}</td>
        <td>${pctCell(a.valores.evidencia.valor, tono(a.valores.evidencia.valor))}</td>
        <td>${pctCell(a.valores.actualizadas.valor, tono(a.valores.actualizadas.valor))}</td>
        <td>${a.valores.validados.valor === null ? '<span class="faint">—</span>' : pctCell(a.valores.validados.valor, tono(a.valores.validados.valor))}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : ''}`;

  $$('#seg button', view).forEach((b) => b.addEventListener('click', () => { piloto = b.dataset.p === '1'; render(view); }));
  $$('tr[data-id]', view).forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/acciones/${tr.dataset.id}`)));
  $$('tr[data-area]', view).forEach((tr) => tr.addEventListener('click', () => { sessionStorage.setItem('sigpi:filtro-area', tr.dataset.area); ctx.go('#/acciones'); }));
}

function lista(items, vacio) {
  if (!items.length) return `<div class="empty">${vacio}</div>`;
  return `<div class="table-wrap"><table><tbody>${items.map((a) => {
    const d = diasHasta(a.fecha_termino);
    const plazo = d === null ? 'Sin fecha' : d < 0 ? `${-d} días de atraso` : d === 0 ? 'Vence hoy' : `Vence en ${d} días`;
    return `<tr class="link" data-id="${a.id}">
      <td><div class="t-main">${esc(a.nombre)}</div><div class="t-sub"><span class="tag">${esc(a.codigo)}</span> ${esc(a.area_sigla || '')} · ${esc(a.responsable || 'Sin responsable')}</div></td>
      <td style="width:130px">${pctCell(a.porcentaje)}</td>
      <td class="nowrap" style="text-align:right">${badgeSit(a.situacion)}<div class="t-sub">${plazo}</div></td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}
