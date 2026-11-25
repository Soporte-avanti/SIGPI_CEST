import { api } from '../api.js';
import { ctx } from '../app.js';
import { esc, $, $$, fDateTime, relTime, badge, icon, modal, formData, run, toast, confirmar, options, initials, parseCSV } from '../ui.js';

let tab = 'usuarios';

export async function render(view) {
  ctx.crumb('<b>Usuarios y catálogos</b>');
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Usuarios y catálogos</h1><p class="sub">Componente 2 · Gobernanza: responsables de información, niveles de acceso, áreas y objetivos estratégicos.</p></div>
  </div>
  <div class="card">
    <div class="tabs" id="tabs">
      <button data-t="usuarios">Usuarios</button><button data-t="roles">Roles y permisos</button><button data-t="areas">Áreas</button><button data-t="objetivos">Objetivos PME</button>
    </div>
    <div id="tab"><div class="empty">Cargando…</div></div>
  </div>`;
  const pintar = async () => {
    $$('#tabs button', view).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const el = $('#tab', view);
    if (tab === 'usuarios') await usuarios(el, pintar);
    else if (tab === 'roles') roles(el);
    else if (tab === 'areas') areas(el, pintar);
    else objetivos(el, pintar);
  };
  $$('#tabs button', view).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; pintar(); }));
  await pintar();
}

async function usuarios(el, refresh) {
  const rows = await api.get('/api/usuarios');
  const R = ctx.cat.roles;
  el.innerHTML = `
    <div class="filters"><input class="search" id="q" placeholder="Buscar funcionario…"><span class="small faint">${rows.filter((u) => u.activo).length} activos</span>
      <div class="right row" style="gap:8px"><button class="btn sm" id="importar">${icon('upload')}Importar CSV</button><button class="btn sm primary" id="nuevo">${icon('plus')}Nuevo usuario</button></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Funcionario</th><th>Rol</th><th>Área</th><th>Último acceso</th><th></th></tr></thead>
      <tbody>${rows.map((u) => `<tr data-q="${esc((u.nombre + ' ' + u.email).toLowerCase())}" style="${u.activo ? '' : 'opacity:.5'}">
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><div class="avatar">${esc(initials(u.nombre))}</div><div><div class="t-main">${esc(u.nombre)}</div><div class="t-sub">${esc(u.email)}${u.cargo ? ' · ' + esc(u.cargo) : ''}</div></div></div></td>
        <td>${badge(R[u.rol], ['admin', 'rectoria', 'encargado_pme'].includes(u.rol) ? 'violet' : u.rol === 'coordinador' ? 'info' : '')}${u.activo ? '' : ' ' + badge('Inactivo')}</td>
        <td>${esc(u.area_sigla || '—')}</td>
        <td class="small faint nowrap">${u.ultimo_acceso ? relTime(u.ultimo_acceso) : 'Nunca'}</td>
        <td class="nowrap" style="text-align:right"><button class="btn sm" data-edit="${u.id}">${icon('edit')}Editar</button> <button class="btn sm" data-reset="${u.id}" title="Generar contraseña temporal">${icon('lock')}</button></td>
      </tr>`).join('')}</tbody></table></div>`;
  $('#q', el).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('tr[data-q]', el).forEach((tr) => { tr.hidden = !tr.dataset.q.includes(q); }); });
  $('#nuevo', el).addEventListener('click', () => usuarioForm(null, refresh));
  $('#importar', el).addEventListener('click', () => importarUsuarios(refresh));
  $$('[data-edit]', el).forEach((b) => b.addEventListener('click', () => usuarioForm(rows.find((u) => u.id === Number(b.dataset.edit)), refresh)));
  $$('[data-reset]', el).forEach((b) => b.addEventListener('click', async () => {
    const u = rows.find((x) => x.id === Number(b.dataset.reset));
    if (!(await confirmar('Restablecer contraseña', `Se generará una contraseña temporal para <b>${esc(u.nombre)}</b>. Deberá cambiarla al ingresar.`))) return;
    const r = await run(null, () => api.post(`/api/usuarios/${u.id}/restablecer`));
    mostrarClave(u.email, r.clave_temporal);
  }));
}

function importarUsuarios(refresh) {
  const ejemplo = 'nombre;email;rol;area;cargo\nAna Pérez Soto;apérez@salesianostalca.cl;coordinador;PED;Jefa UTP\nLuis Rojas;lrojas@salesianostalca.cl;responsable;TP;Docente Electrónica\nMarta Díaz;mdiaz@salesianostalca.cl;usuario;COM;Encargada de Comunicaciones';
  const m = modal({
    title: 'Importar usuarios desde CSV',
    body: `<div class="stack">
      <p class="muted">Crea de una vez a los funcionarios. Columnas: <code>nombre</code>, <code>email</code>, <code>rol</code>, <code>area</code> (sigla o nombre) y <code>cargo</code>. El rol puede ser <code>rectoria</code>, <code>encargado_pme</code>, <code>coordinador</code>, <code>responsable</code> o <code>usuario</code>. Cada persona recibe una contraseña temporal que debe cambiar al ingresar.</p>
      <pre class="card card-pad mono small" style="overflow:auto;margin:0;white-space:pre">${esc(ejemplo)}</pre>
      <div class="row"><a class="btn sm" id="plantilla" download="plantilla_usuarios_sigpi.csv">${icon('download')}Descargar plantilla</a></div>
      <label class="f">Archivo CSV<input type="file" id="csv" accept=".csv,text/csv"></label>
      <div id="prev"></div>
    </div>`,
    foot: '<button class="btn" data-close>Cerrar</button><button class="btn primary" id="go" disabled>Importar</button>',
  });
  $('#plantilla', m.el).href = URL.createObjectURL(new Blob(['\uFEFF' + ejemplo.replace('apérez', 'aperez')], { type: 'text/csv' }));
  let filas = [];
  $('#csv', m.el).addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rows = parseCSV(await f.text());
    const head = rows[0].map((h) => h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    filas = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h === 'correo' ? 'email' : h, (r[i] || '').trim()])));
    $('#prev', m.el).innerHTML = `<div class="notice">${filas.length} funcionarios detectados.</div>`;
    $('#go', m.el).disabled = !filas.length;
  });
  $('#go', m.el).addEventListener('click', async (e) => {
    const r = await run(e.currentTarget, () => api.post('/api/usuarios/importar', { filas }));
    $('#go', m.el).disabled = true;
    await ctx.loadCat(); refresh();
    const csv = '\uFEFFnombre;email;rol;area;clave_temporal\r\n' + r.creados.map((u) => [u.nombre, u.email, u.rol, u.area, u.clave_temporal].join(';')).join('\r\n');
    $('#prev', m.el).innerHTML = `<div class="notice ${r.errores.length ? 'warn' : ''}"><b>${r.creados.length} usuarios creados.</b>${r.errores.length ? `<br>${r.errores.length} filas con error:<br>${r.errores.slice(0, 20).map((x) => `Fila ${x.fila}: ${esc(x.error)}`).join('<br>')}` : ''}</div>
      ${r.creados.length ? `<div class="notice warn" style="margin-top:10px">Descarga ahora las contraseñas temporales: no se vuelven a mostrar. Entrégalas por un canal seguro y elimina el archivo después.</div>
      <div class="row" style="margin-top:10px"><a class="btn primary sm" download="claves_temporales_sigpi.csv" href="${URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))}">${icon('download')}Descargar claves temporales</a></div>` : ''}`;
  });
}

function mostrarClave(email, clave) {
  modal({
    title: 'Contraseña temporal', size: 'sm',
    body: `<div class="stack"><p class="muted">Entrega estos datos al funcionario por un canal seguro. Se le pedirá cambiar la contraseña al primer ingreso.</p>
      <div class="card card-pad"><div class="small faint">Correo</div><div class="mono">${esc(email)}</div><div class="small faint" style="margin-top:8px">Contraseña temporal</div><div class="mono" style="font-size:18px">${esc(clave)}</div></div></div>`,
    foot: '<button class="btn primary" data-close>Listo</button>',
  });
}

function usuarioForm(u, refresh) {
  const nuevo = !u;
  u = u || { activo: true, rol: 'responsable' };
  const R = Object.entries(ctx.cat.roles).filter(([k]) => k !== 'admin' || ctx.user.rol === 'admin');
  const m = modal({
    title: nuevo ? 'Nuevo usuario' : `Editar · ${u.nombre}`,
    body: `<form id="fu" class="form">
      <label class="f">Nombre completo <span class="req">*</span><input name="nombre" required value="${esc(u.nombre || '')}"></label>
      <label class="f">Correo institucional <span class="req">*</span><input name="email" type="email" required value="${esc(u.email || '')}" ${nuevo ? '' : 'disabled'}></label>
      <label class="f">Rol<select name="rol">${R.map(([k, v]) => `<option value="${k}" ${u.rol === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">Área<select name="area_id">${options(ctx.cat.areas, u.area_id, { empty: 'Sin área' })}</select></label>
      <label class="f full">Cargo<input name="cargo" value="${esc(u.cargo || '')}" placeholder="Ej.: Jefe UTP, Docente especialidad…"></label>
      ${nuevo ? '<label class="f full">Contraseña inicial <span class="help">Déjala vacía para generar una temporal</span><input name="password" type="text" autocomplete="off"></label>'
        : `<label class="check full"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}>Usuario activo</label>`}
    </form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fu">${nuevo ? 'Crear usuario' : 'Guardar'}</button>`,
  });
  $('#fu', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const r = await run(e.submitter, () => (nuevo ? api.post('/api/usuarios', d) : api.put(`/api/usuarios/${u.id}`, d)));
    m.close(); await ctx.loadCat();
    if (nuevo) mostrarClave(d.email, r.clave_temporal); else toast('Usuario actualizado');
    refresh();
  });
}

function roles(el) {
  const filas = [
    ['Ver tablero, acciones e indicadores', 1, 1, 1, 1, 1, 1],
    ['Registrar acciones', 1, 1, 1, 'Su área', 0, 0],
    ['Editar acciones', 1, 1, 1, 'Su área', 'Su área / propias', 0],
    ['Reportar avances y adjuntar evidencias', 1, 1, 1, 'Su área', 'Su área / propias', 'Si es responsable'],
    ['Validar registros y cerrar acciones', 1, 1, 1, 'Su área', 0, 0],
    ['Reabrir acciones', 1, 1, 1, 0, 0, 0],
    ['Eliminar acciones', 1, 0, 1, 0, 0, 0],
    ['Gestionar capacitaciones', 1, 1, 1, 1, 0, 0],
    ['Metas, cortes y línea base', 1, 1, 1, 0, 0, 0],
    ['Usuarios, áreas, objetivos y bitácora', 1, 1, 1, 0, 0, 0],
  ];
  const v = (x) => (x === 1 ? `<span style="color:var(--ok)">${icon('check')}</span>` : x === 0 ? '<span class="faint">—</span>' : `<span class="small">${x}</span>`);
  el.innerHTML = `<div class="card-pad"><p class="muted small">Niveles de acceso según funciones y responsabilidades (Tabla 20). La estructura definitiva debe validarse respetando el organigrama vigente.</p></div>
    <div class="table-wrap"><table class="roles"><thead><tr><th>Permiso</th>${Object.values(ctx.cat.roles).map((r) => `<th style="text-align:center">${esc(r)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(([p, ...xs]) => `<tr><td>${p}</td>${xs.map((x) => `<td style="text-align:center">${v(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $$('td svg', el).forEach((s) => { s.style.width = '16px'; s.style.height = '16px'; });
}

function areas(el, refresh) {
  el.innerHTML = `
    <div class="filters"><span class="small faint">Áreas consideradas en el alcance del SIGPI (33.4)</span><div class="right"><button class="btn sm primary" id="nueva">${icon('plus')}Nueva área</button></div></div>
    <div class="table-wrap"><table><thead><tr><th>Sigla</th><th>Área</th><th>Estado</th><th></th></tr></thead>
    <tbody>${ctx.cat.areas.map((a) => `<tr><td><span class="tag">${esc(a.sigla)}</span></td><td>${esc(a.nombre)}</td><td>${a.activa ? badge('Activa', 'ok') : badge('Inactiva')}</td>
      <td style="text-align:right"><button class="btn sm" data-a="${a.id}">${a.activa ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-a]', el).forEach((b) => b.addEventListener('click', async () => {
    const a = ctx.area(b.dataset.a);
    await run(null, () => api.put(`/api/areas/${a.id}`, { activa: !a.activa }));
    await ctx.loadCat(); refresh();
  }));
  $('#nueva', el).addEventListener('click', () => {
    const m = modal({
      title: 'Nueva área', size: 'sm',
      body: '<form id="far" class="stack"><label class="f">Nombre<input name="nombre" required></label><label class="f">Sigla <span class="help">Se usa en los códigos de acción</span><input name="sigla" required maxlength="8"></label></form>',
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="far">Crear</button>',
    });
    $('#far', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      await run(e.submitter, () => api.post('/api/areas', formData(e.target)));
      m.close(); await ctx.loadCat(); refresh();
    });
  });
}

function objetivos(el, refresh) {
  const { objetivos: obj, dimensiones } = ctx.cat;
  el.innerHTML = `
    <div class="filters"><span class="small faint">Objetivos estratégicos del PME vigente, para vincular cada acción (33.15)</span><div class="right"><button class="btn sm primary" id="nuevo">${icon('plus')}Nuevo objetivo</button></div></div>
    ${obj.length ? `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Dimensión</th><th>Objetivo</th><th></th></tr></thead>
    <tbody>${obj.map((o) => `<tr><td><span class="tag">${esc(o.codigo)}</span></td><td class="nowrap">${esc(o.dimension || '—')}</td><td>${esc(o.descripcion)}</td>
      <td><button class="btn ghost icon sm danger" data-o="${o.id}" title="Desactivar">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><b>Sin objetivos</b>Registra los objetivos estratégicos del PME para vincularlos a las acciones.</div>'}`;
  $$('[data-o]', el).forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('Desactivar objetivo', 'El objetivo dejará de estar disponible para nuevas acciones. Las acciones vinculadas lo conservan.'))) return;
    await run(null, () => api.del(`/api/objetivos/${b.dataset.o}`)); await ctx.loadCat(); refresh();
  }));
  $('#nuevo', el).addEventListener('click', () => {
    const m = modal({
      title: 'Nuevo objetivo estratégico', size: 'sm',
      body: `<form id="fo" class="stack"><label class="f">Dimensión<select name="dimension_id">${options(dimensiones, '', { empty: 'Seleccionar…' })}</select></label>
        <label class="f">Código<input name="codigo" required placeholder="Ej.: OE-GP-1"></label><label class="f">Descripción<textarea name="descripcion" required></textarea></label></form>`,
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" form="fo">Crear</button>',
    });
    $('#fo', m.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      await run(e.submitter, () => api.post('/api/objetivos', formData(e.target)));
      m.close(); await ctx.loadCat(); refresh();
    });
  });
}

const EVENTOS = {
  login: 'Inicio de sesión', cambio_clave: 'Cambio de contraseña', crear_accion: 'Registró acción', editar_accion: 'Editó acción', eliminar_accion: 'Eliminó acción',
  importar_acciones: 'Importó acciones', reportar_avance: 'Reportó avance', validar_registro: 'Validó registro', observar_registro: 'Observó registro',
  cerrar_accion: 'Cerró acción', reabrir_accion: 'Reabrió acción', agregar_evidencia: 'Adjuntó evidencia', eliminar_evidencia: 'Eliminó evidencia',
  definir_meta: 'Definió meta', registrar_corte: 'Registró corte KPI', eliminar_corte: 'Eliminó corte KPI', crear_capacitacion: 'Creó capacitación',
  registrar_asistencia: 'Registró asistencia', eliminar_capacitacion: 'Eliminó capacitación', crear_usuario: 'Creó usuario', editar_usuario: 'Editó usuario',
  restablecer_clave: 'Restableció contraseña', crear_area: 'Creó área', editar_area: 'Editó área', crear_objetivo: 'Creó objetivo', desactivar_objetivo: 'Desactivó objetivo',
  exportar_reporte: 'Exportó reporte',
};

export async function auditoria(view) {
  ctx.crumb('<b>Bitácora</b>');
  const rows = await api.get('/api/auditoria');
  view.innerHTML = `
  <div class="page-head"><div><h1>Bitácora del sistema</h1><p class="sub">Trazabilidad de las operaciones realizadas · últimos 300 eventos.</p></div></div>
  <div class="card"><div class="filters"><input class="search" id="q" placeholder="Filtrar por usuario, evento o código…"></div>
    <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Evento</th><th>Detalle</th></tr></thead>
    <tbody>${rows.map((r) => {
      const d = r.detalle || {};
      const det = [d.codigo || d.accion, d.titulo, d.nombre, d.email, d.etiqueta, d.estado, d.porcentaje !== undefined ? d.porcentaje + '%' : null, d.creadas !== undefined ? `${d.creadas} creadas` : null].filter(Boolean).join(' · ');
      const link = r.entidad === 'accion' && r.entidad_id && r.evento !== 'eliminar_accion' ? `#/acciones/${r.entidad_id}` : null;
      return `<tr data-q="${esc(`${r.usuario} ${EVENTOS[r.evento] || r.evento} ${det}`.toLowerCase())}">
        <td class="nowrap small">${fDateTime(r.fecha)}</td><td>${esc(r.usuario || '—')}</td><td>${esc(EVENTOS[r.evento] || r.evento)}</td>
        <td class="small">${link ? `<a href="${link}">${esc(det)}</a>` : esc(det)}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  $('#q', view).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('tr[data-q]', view).forEach((tr) => { tr.hidden = !tr.dataset.q.includes(q); }); });
}
