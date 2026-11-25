import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, fDateTime, badge, icon, run, toast, confirmar, fBytes, modal } from '../ui.js';

let tab = 'avisos';

export async function render(view) {
  ctx.crumb('<b>Sistema</b>');
  const admin = ctx.user.rol === 'admin';
  const st = await api.get('/api/avisos/estado');
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Sistema</h1><p class="sub">Avisos por correo, respaldo de la información y registro de errores.</p></div>
  </div>
  <div class="grid g3" style="margin-bottom:16px">
    <div class="card stat ${st.correo_configurado ? 'ok' : 'warn'}"><div class="lbl">Correo</div><div class="num" style="font-size:20px;margin-top:6px">${st.correo_configurado ? 'Configurado' : 'No configurado'}</div><div class="foot">${st.correo_configurado ? 'Avisos y recuperación de contraseña activos' : 'Faltan RESEND_API_KEY y MAIL_FROM'}</div></div>
    <div class="card stat ${st.cron_configurado ? 'ok' : 'warn'}"><div class="lbl">Avisos automáticos</div><div class="num" style="font-size:20px;margin-top:6px">${st.cron_configurado ? 'Programados' : 'Sin programar'}</div><div class="foot">${st.cron_configurado ? 'Lunes y jueves, 8:00 aprox.' : 'Falta CRON_SECRET'}</div></div>
    <div class="card stat"><div class="lbl">Último aviso enviado</div><div class="num" style="font-size:20px;margin-top:6px">${st.historial[0] ? fDateTime(st.historial[0].fecha) : '—'}</div><div class="foot">${st.historial.length} registros recientes</div></div>
  </div>
  <div class="card">
    <div class="tabs" id="tabs"><button data-t="avisos">Avisos por correo</button>${admin ? '<button data-t="respaldo">Respaldo</button>' : ''}<button data-t="errores">Errores</button></div>
    <div id="tab"></div>
  </div>`;
  const pintar = () => {
    $$('#tabs button', view).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const el = $('#tab', view);
    if (tab === 'respaldo' && admin) respaldo(el);
    else if (tab === 'errores') errores(el, admin);
    else avisos(el, st, () => render(view));
  };
  $$('#tabs button', view).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; pintar(); }));
  if (tab === 'respaldo' && !admin) tab = 'avisos';
  pintar();
}

function avisos(el, st, recargar) {
  el.innerHTML = `
    <div class="card-pad stack" style="gap:12px">
      <p class="muted">Cada usuario recibe un resumen con lo que requiere su atención: sus acciones atrasadas, por vencer en 7 días o sin actualizar; a las coordinaciones, además, los registros por validar de su área; y al Encargado PME, un resumen institucional. Nadie recibe más de un aviso al día y cada uno puede desactivarlos desde su cuenta.</p>
      <div class="row"><button class="btn" id="prev">${icon('mail')}Ver a quién le llegaría hoy</button>
        <button class="btn primary" id="send" ${st.correo_configurado ? '' : 'disabled title="Configura el correo primero"'}>${icon('mail')}Enviar avisos ahora</button></div>
      <div id="res"></div>
    </div>
    <div class="card-head" style="border-top:1px solid var(--line)"><h3>Historial de envíos</h3></div>
    ${st.historial.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Destinatario</th><th>Asunto</th><th class="num">Ítems</th><th>Estado</th></tr></thead>
      <tbody>${st.historial.map((h) => `<tr><td class="nowrap small">${fDateTime(h.fecha)}</td><td>${esc(h.nombre || h.email)}<div class="t-sub">${esc(h.email)}</div></td><td class="small">${esc(h.asunto)}</td><td class="num">${h.items}</td>
        <td>${h.estado === 'enviado' ? badge('Enviado', 'ok') : badge('Error', 'bad')}${h.estado !== 'enviado' && h.detalle ? `<div class="t-sub">${esc(h.detalle)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty">Aún no se han enviado avisos.</div>'}`;
  $('#prev', el).addEventListener('click', async (e) => {
    const r = await run(e.currentTarget, () => api.post('/api/avisos/enviar', { dry: true }));
    $('#res', el).innerHTML = r.resultados.length ? `<div class="table-wrap card" style="background:var(--bg-2)"><table><thead><tr><th>Destinatario</th><th>Asunto</th><th>Contenido</th></tr></thead>
      <tbody>${r.resultados.map((x) => `<tr><td>${esc(x.nombre)}<div class="t-sub">${esc(x.email)}</div></td><td class="small">${esc(x.asunto)}</td><td class="small">${x.items.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="notice">Hoy no hay nada que avisar.</div>';
  });
  $('#send', el).addEventListener('click', async (e) => {
    if (!(await confirmar('Enviar avisos ahora', 'Se enviará el resumen por correo a cada usuario con pendientes (excepto a quienes ya recibieron uno hoy).', { ok: 'Enviar' }))) return;
    const r = await run(e.currentTarget, () => api.post('/api/avisos/enviar', { dry: false }));
    const ok = r.resultados.filter((x) => x.estado === 'enviado').length;
    toast(r.mensaje || `${ok} avisos enviados`, !!r.mensaje);
    recargar();
  });
}

async function respaldo(el) {
  const info = await api.get('/api/respaldo/info');
  const cabe = info.bytes_archivos <= info.limite_web;
  el.innerHTML = `<div class="card-pad stack">
    <p class="muted">El respaldo es un archivo con toda la información del SIGPI: acciones, avances, evidencias, usuarios, indicadores y bitácora. Guárdalo en un lugar seguro: contiene datos personales y contraseñas cifradas.</p>
    <div class="notice ${cabe ? '' : 'warn'}">Los archivos de evidencia ocupan <b>${fBytes(info.bytes_archivos || 1)}</b>. ${cabe ? 'Se incluyen en la descarga.' : 'Superan el límite de descarga web, así que se omiten: para un respaldo completo ejecuta <code>npm run respaldo</code> en tu computador.'}</div>
    <div class="row"><a class="btn primary" href="/api/respaldo" download>${icon('database')}Descargar respaldo</a></div>
    <p class="small faint">Para restaurar: <code>npm run restaurar -- archivo.json --si</code>. Reemplaza todos los datos de la base indicada en DATABASE_URL.</p>
  </div>`;
}

async function errores(el, admin) {
  const rows = await api.get('/api/errores');
  el.innerHTML = `
    ${admin && rows.length ? `<div class="filters"><span class="small faint">${rows.length} errores registrados</span><div class="right"><button class="btn sm danger" id="limpiar">${icon('trash')}Limpiar</button></div></div>` : ''}
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Origen</th><th>Ruta</th><th>Mensaje</th><th>Usuario</th></tr></thead>
    <tbody>${rows.map((r) => `<tr class="link" data-id="${r.id}"><td class="nowrap small">${fDateTime(r.fecha)}</td><td>${badge(r.origen === 'servidor' ? 'Servidor' : 'Navegador', r.origen === 'servidor' ? 'bad' : 'warn')}</td>
      <td class="small mono">${esc([r.metodo, r.ruta].filter(Boolean).join(' '))}</td><td class="small">${esc(r.mensaje)}</td><td class="small">${esc(r.usuario || '—')}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty"><b>Sin errores registrados</b>El sistema está funcionando sin fallas reportadas.</div>'}`;
  $$('tr[data-id]', el).forEach((tr) => tr.addEventListener('click', () => {
    const r = rows.find((x) => String(x.id) === tr.dataset.id);
    modal({ title: 'Detalle del error', body: `<p><b>${esc(r.mensaje)}</b></p><p class="small faint" style="margin:6px 0 12px">${fDateTime(r.fecha)} · ${esc(r.ruta || '')}</p><pre class="card card-pad mono small" style="white-space:pre-wrap;margin:0;max-height:360px;overflow:auto">${esc(r.detalle || 'Sin detalle')}</pre>`, foot: '<button class="btn" data-close>Cerrar</button>' });
  }));
  $('#limpiar', el)?.addEventListener('click', async () => {
    if (!(await confirmar('Limpiar errores', 'Se borrará el registro de errores.', { ok: 'Limpiar', danger: true }))) return;
    await run(null, () => api.del('/api/errores')); errores(el, admin);
  });
}
