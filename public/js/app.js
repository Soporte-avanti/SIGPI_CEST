import { api } from './api.js';
import { esc, $, $$, icon, initials, toast, modal, formData, run } from './ui.js';

const GESTION = ['admin', 'rectoria', 'encargado_pme'];
export const ctx = {
  user: null, cat: null,
  esGestion: () => GESTION.includes(ctx.user.rol),
  puedeValidar: () => GESTION.includes(ctx.user.rol) || ctx.user.rol === 'coordinador',
  go: (h) => { location.hash = h; },
  async loadCat() { ctx.cat = await api.get('/api/catalogos'); return ctx.cat; },
  area: (id) => ctx.cat.areas.find((a) => a.id === Number(id)),
  crumb: (txt) => { const c = $('#crumb'); if (c) c.innerHTML = txt; },
  refreshBadge,
};

const NAV = [
  { sec: 'Gestión' },
  { h: '#/tablero', t: 'Tablero de control', i: 'dashboard' },
  { h: '#/acciones', t: 'Acciones PME', i: 'list' },
  { h: '#/validacion', t: 'Validación', i: 'shield', when: () => ctx.puedeValidar(), badge: true },
  { h: '#/indicadores', t: 'Indicadores (KPI)', i: 'chart' },
  { sec: 'Institución' },
  { h: '#/capacitacion', t: 'Capacitación', i: 'school' },
  { h: '#/admin', t: 'Usuarios y catálogos', i: 'settings', when: () => ctx.esGestion() },
  { h: '#/auditoria', t: 'Bitácora', i: 'history', when: () => ctx.esGestion() },
];

const ROUTES = [
  [/^#\/tablero$/, () => import('./views/tablero.js')],
  [/^#\/acciones$/, () => import('./views/acciones.js')],
  [/^#\/acciones\/(\d+)$/, () => import('./views/accion.js')],
  [/^#\/validacion$/, () => import('./views/validacion.js')],
  [/^#\/indicadores$/, () => import('./views/indicadores.js')],
  [/^#\/capacitacion$/, () => import('./views/capacitacion.js')],
  [/^#\/capacitacion\/(\d+)$/, () => import('./views/capacitacion.js'), 'detalle'],
  [/^#\/admin$/, () => import('./views/admin.js')],
  [/^#\/auditoria$/, () => import('./views/admin.js'), 'auditoria'],
];

const root = $('#root');

// ---------- Login ----------
function renderLogin() {
  root.innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brand" style="padding:0"><div class="brand-mark">SG</div><div><b>SIGPI</b><small>Centro Educativo Salesianos Talca</small></div></div>
      <div>
        <h1>Gestión preventiva e inteligencia institucional</h1>
        <p>Seguimiento centralizado de las acciones del Plan de Mejoramiento Educativo: responsables, plazos, evidencias e indicadores en un solo lugar.</p>
        <div class="cycle">
          ${['Generación', 'Registro', 'Validación', 'Consolidación', 'Monitoreo', 'Análisis', 'Decisión', 'Retroalimentación'].map((x, i) => `<span><b>${i + 1}</b>${x}</span>`).join('')}
        </div>
      </div>
      <p class="small faint">Inspirado en el Sistema Preventivo de Don Bosco</p>
    </section>
    <section class="login-form">
      <form id="login" autocomplete="on">
        <div><h1>Iniciar sesión</h1><p class="muted" style="margin-top:6px">Ingresa con tu correo institucional.</p></div>
        <label class="f">Correo<input name="email" type="email" required autocomplete="username"></label>
        <label class="f">Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
        <div class="err-msg" id="lerr"></div>
        <button class="btn primary" type="submit">Entrar</button>
        <p class="small faint">¿Olvidaste tu contraseña? Solicita a Rectoría o al Encargado PME que la restablezca.</p>
      </form>
    </section>
  </div>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.submitter; b.disabled = true; $('#lerr').textContent = '';
    try { await api.post('/api/auth/login', formData(e.target)); await boot(); } catch (err) { $('#lerr').textContent = err.message; } finally { b.disabled = false; }
  });
}

// ---------- Shell ----------
function renderShell() {
  const u = ctx.user;
  root.innerHTML = `
  <div class="app" id="app">
    <aside class="side">
      <div class="brand"><div class="brand-mark">SG</div><div><b>SIGPI</b><small>Salesianos Talca</small></div></div>
      <nav class="nav" id="nav">
        ${NAV.filter((n) => !n.when || n.when()).map((n) => n.sec ? `<div class="nav-label">${n.sec}</div>`
          : `<a href="${n.h}">${icon(n.i)}<span>${n.t}</span>${n.badge ? '<span class="count" id="nav-badge" hidden></span>' : ''}</a>`).join('')}
      </nav>
      <div class="side-user">
        <div class="avatar">${esc(initials(u.nombre))}</div>
        <div class="who"><b>${esc(u.nombre)}</b><small>${esc(u.rol_nombre)}${u.area ? ' · ' + esc(ctx.area(u.area_id)?.sigla || '') : ''}</small></div>
        <button class="btn ghost icon sm" id="pwd" title="Cambiar contraseña">${icon('lock')}</button>
        <button class="btn ghost icon sm" id="out" title="Cerrar sesión">${icon('logout')}</button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="btn ghost icon menu-btn" id="menu" aria-label="Menú">${icon('menu')}</button>
        <div class="crumbs" id="crumb"></div>
        <div class="spacer"></div>
        <span class="small faint date">${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </header>
      <main class="view" id="view"></main>
    </div>
  </div>`;
  $('#menu').onclick = () => $('#app').classList.toggle('open');
  $('#out').onclick = async () => { await api.post('/api/auth/logout'); location.hash = ''; boot(); };
  $('#pwd').onclick = () => cambiarClave(false);
  refreshBadge();
}

async function refreshBadge() {
  const el = $('#nav-badge');
  if (!el) return;
  try { const p = await api.get('/api/validaciones'); el.textContent = p.length; el.hidden = !p.length; } catch { /* sin acceso */ }
}

function cambiarClave(obligatorio) {
  const m = modal({
    title: obligatorio ? 'Define tu contraseña' : 'Cambiar contraseña', size: 'sm',
    body: `${obligatorio ? '<div class="notice warn" style="margin-bottom:16px">Estás usando una contraseña temporal. Define una propia para continuar.</div>' : ''}
      <form id="fpwd" class="stack">
        <label class="f">Contraseña actual<input type="password" name="actual" required autocomplete="current-password"></label>
        <label class="f">Nueva contraseña <span class="help">Mínimo 8 caracteres</span><input type="password" name="nueva" minlength="8" required autocomplete="new-password"></label>
        <label class="f">Repite la nueva contraseña<input type="password" name="repite" minlength="8" required autocomplete="new-password"></label>
      </form>`,
    foot: `${obligatorio ? '' : '<button class="btn" data-close>Cancelar</button>'}<button class="btn primary" form="fpwd">Guardar</button>`,
  });
  $('#fpwd', m.el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    if (d.nueva !== d.repite) return toast('Las contraseñas no coinciden', true);
    await run(e.submitter, () => api.post('/api/auth/cambiar-clave', d));
    ctx.user.debe_cambiar_clave = false;
    m.close(); toast('Contraseña actualizada');
  });
}

// ---------- Router ----------
async function route() {
  if (!ctx.user) return;
  const hash = location.hash || '#/tablero';
  if (!location.hash) { history.replaceState(null, '', '#/tablero'); }
  $('#app')?.classList.remove('open');
  $$('#nav a').forEach((a) => a.classList.toggle('on', hash === a.getAttribute('href') || hash.startsWith(a.getAttribute('href') + '/')));
  const view = $('#view');
  for (const [re, load, mode] of ROUTES) {
    const m = hash.match(re);
    if (m) {
      view.innerHTML = '<div class="empty">Cargando…</div>';
      try {
        const mod = await load();
        await (mode ? mod[mode] : mod.render)(view, ...m.slice(1));
      } catch (e) {
        console.error(e);
        view.innerHTML = `<div class="card empty"><b>No se pudo cargar esta sección</b>${esc(e.message)}</div>`;
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  view.innerHTML = '<div class="card empty"><b>Página no encontrada</b><a href="#/tablero">Volver al tablero</a></div>';
}

async function boot() {
  try {
    ctx.user = await api.get('/api/auth/me');
  } catch {
    ctx.user = null;
    return renderLogin();
  }
  await ctx.loadCat();
  renderShell();
  await route();
  if (ctx.user.debe_cambiar_clave) cambiarClave(true);
}

window.addEventListener('hashchange', route);
window.addEventListener('sigpi:logout', () => { if (ctx.user) { ctx.user = null; toast('Tu sesión expiró. Vuelve a ingresar.', true); renderLogin(); } });
boot();
