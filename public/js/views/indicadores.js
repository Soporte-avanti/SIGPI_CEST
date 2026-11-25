import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, bar, tono, fNum, fDateTime, icon, modal, formData, run, toast, confirmar, options } from '../ui.js';

let area = '';
let piloto = false;

export async function render(view) {
  ctx.crumb('<b>Indicadores (KPI)</b>');
  const p = new URLSearchParams();
  if (area) p.set('area', area);
  if (piloto) p.set('piloto', '1');
  const k = await api.get(`/api/kpi?${p}`);
  const lb = k.linea_base && k.linea_base.valores.valores;
  const gestion = ctx.esGestion();
  const cortes = k.cortes.slice().reverse();

  view.innerHTML = `
  <div class="page-head">
    <div><h1>Indicadores clave de desempeño</h1><p class="sub">Módulo 4 · Fichas técnicas, metas institucionales, línea base y cortes de seguimiento (sección 33.8).</p></div>
    <div class="actions">
      <select id="farea" style="width:auto">${options(ctx.cat.areas.filter((a) => a.activa), area, { empty: 'Todas las áreas' })}</select>
      <div class="seg" id="seg"><button data-p="0" class="${piloto ? '' : 'on'}">Todas</button><button data-p="1" class="${piloto ? 'on' : ''}">Piloto</button></div>
      ${gestion ? `<button class="btn" id="corte">${icon('target')}Registrar corte</button>` : ''}
    </div>
  </div>

  ${!k.linea_base ? `<div class="notice warn" style="margin-bottom:16px">Aún no se registra la <b>línea base</b>. La propuesta indica fijar las metas cuantitativas después de obtenerla durante la etapa piloto.${gestion ? ' Cuando el piloto tenga datos representativos, usa «Registrar corte» y elige «Línea base».' : ''}</div>` : ''}

  <div class="grid g2" style="margin-bottom:16px">
    ${k.fichas.map((f) => {
      const v = k.valores[f.clave]; const t = tono(v.valor, f.meta);
      const base = lb && lb[f.clave] ? lb[f.clave].valor : null;
      const delta = base !== null && v.valor !== null ? Math.round((v.valor - base) * 10) / 10 : null;
      return `<div class="card">
        <div class="card-head"><span class="dot ${t}"></span><h3>${esc(f.nombre)}</h3>
          ${gestion ? `<div class="right"><button class="btn ghost sm" data-meta="${f.clave}">${icon('edit')}Meta</button></div>` : ''}</div>
        <div class="card-pad stack" style="gap:12px">
          <div class="row" style="align-items:flex-end;gap:20px">
            <div><div class="small faint">Valor actual</div><div style="font-size:30px;font-weight:650;font-variant-numeric:tabular-nums">${v.valor === null ? '—' : `${fNum(v.valor)}%`}</div></div>
            <div><div class="small faint">Meta</div><div style="font-size:18px;font-weight:600">${f.meta === null ? '<span class="faint">Por definir</span>' : `${fNum(f.meta)}%`}</div></div>
            <div><div class="small faint">Línea base</div><div style="font-size:18px;font-weight:600">${base === null ? '<span class="faint">—</span>' : `${fNum(base)}%`}
              ${delta !== null && delta !== 0 ? `<span class="small" style="color:var(--${delta > 0 ? 'ok' : 'bad'})">${delta > 0 ? '▲' : '▼'} ${fNum(Math.abs(delta))}</span>` : ''}</div></div>
            <div class="right small faint" style="text-align:right">${v.num} / ${v.den}</div>
          </div>
          ${bar(v.valor, `lg ${t}`, f.meta)}
          ${cortes.length > 1 ? sparkline(cortes.map((c) => c.valores.valores[f.clave]?.valor ?? null)) : ''}
          <div class="dl small" style="grid-template-columns:120px 1fr;margin:0 -20px -16px;border-top:1px solid var(--line)">
            <div>Fórmula</div><div>${esc(f.formula)}</div>
            <div>Propósito</div><div>${esc(f.proposito)}</div>
            <div>Fuente</div><div>${esc(f.fuente)}</div>
            <div>Periodicidad</div><div>${esc(f.periodicidad)}</div>
            <div>Responsable</div><div>${esc(f.responsable)}</div>
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <div class="card-head"><h2>Cortes registrados</h2><span class="hint">Fotografías de los indicadores para comparar la evolución (Fase IV)</span></div>
    ${k.cortes.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Corte</th><th>Fecha</th>${k.fichas.map((f) => `<th class="num" title="${esc(f.nombre)}">${esc(abrev(f.clave))}</th>`).join('')}<th></th></tr></thead>
      <tbody>${k.cortes.map((c) => `<tr>
        <td>${c.tipo === 'linea_base' ? '<span class="badge violet">Línea base</span> ' : ''}${esc(c.etiqueta)}</td>
        <td class="nowrap small">${fDateTime(c.fecha)}</td>
        ${k.fichas.map((f) => { const x = c.valores.valores[f.clave]; return `<td class="num">${x && x.valor !== null ? fNum(x.valor) + '%' : '—'}</td>`; }).join('')}
        <td>${['admin', 'encargado_pme'].includes(ctx.user.rol) ? `<button class="btn ghost icon sm danger" data-del="${c.id}" title="Eliminar corte">${icon('trash')}</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Todavía no hay cortes registrados.</div>'}
  </div>`;

  $('#farea', view).addEventListener('change', (e) => { area = e.target.value; render(view); });
  $$('#seg button', view).forEach((b) => b.addEventListener('click', () => { piloto = b.dataset.p === '1'; render(view); }));
  $$('[data-meta]', view).forEach((b) => b.addEventListener('click', () => metaForm(k.fichas.find((f) => f.clave === b.dataset.meta), () => render(view))));
  $$('[data-del]', view).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Eliminar corte', 'Se eliminará este corte de seguimiento.', { ok: 'Eliminar', danger: true }))) return;
    await run(null, () => api.del(`/api/kpi/cortes/${b.dataset.del}`)); render(view);
  }));
  $('#corte', view)?.addEventListener('click', () => corteForm(!k.linea_base, () => render(view)));
}

const abrev = (c) => ({ responsable: 'Resp.', actualizadas: 'Actual.', evidencia: 'Evid.', cumplimiento: 'Cumpl.', plazos: 'Plazos', validados: 'Valid.', capacitacion: 'Capac.' }[c]);

function sparkline(vals) {
  const pts = vals.map((v, i) => (v === null ? null : [i, v])).filter(Boolean);
  if (pts.length < 2) return '';
  const W = 300; const H = 36; const n = vals.length - 1;
  const xy = pts.map(([i, v]) => `${(i / n) * W},${H - (v / 100) * (H - 4) - 2}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:36px"><polyline points="${xy}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function metaForm(f, onDone) {
  const m = modal({
    title: `Ficha · ${f.nombre}`, size: 'sm',
    body: `<form id="fm" class="stack">
      <label class="f">Meta institucional (%) <span class="help">Déjala vacía si aún no se valida con las áreas</span><input type="number" name="meta" min="0" max="100" step="0.5" value="${f.meta ?? ''}"></label>
      <label class="f">Responsable del indicador<input name="responsable" value="${esc(f.responsable)}"></label>
      <label class="f">Periodicidad<input name="periodicidad" value="${esc(f.periodicidad)}"></label>
    </form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fm">Guardar</button>',
  });
  $('#fm', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(e.submitter, () => api.put(`/api/kpi/metas/${f.clave}`, formData(e.target)));
    m.close(); toast('Ficha actualizada'); onDone();
  });
}

function corteForm(sugerirBase, onDone) {
  const m = modal({
    title: 'Registrar corte de indicadores', size: 'sm',
    body: `<form id="fc" class="stack">
      <p class="muted">Se guarda una fotografía de los valores actuales de todos los indicadores (nivel institucional).</p>
      <label class="f">Tipo<select name="tipo"><option value="seguimiento">Corte de seguimiento</option><option value="linea_base" ${sugerirBase ? 'selected' : ''}>Línea base</option></select></label>
      <label class="f">Etiqueta<input name="etiqueta" placeholder="Ej.: Cierre piloto · semana 10"></label>
      <label class="check"><input type="checkbox" name="piloto">Calcular solo con acciones del piloto</label>
    </form>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fc">Registrar</button>',
  });
  $('#fc', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await run(e.submitter, () => api.post('/api/kpi/cortes', formData(e.target)));
    m.close(); toast('Corte registrado'); onDone();
  });
}
