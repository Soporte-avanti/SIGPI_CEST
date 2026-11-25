// Utilidades de interfaz: escape, formatos, insignias, modales y avisos

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const tz = 'America/Santiago';
export const fDate = (v) => {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return d ? `${d}-${m}-${y}` : '—';
};
export const fDateTime = (v) => (v ? new Date(v).toLocaleString('es-CL', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: tz });
export const relTime = (v) => {
  if (!v) return 'sin registros';
  const dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const m = Math.floor(dias / 30);
  return m === 1 ? 'hace 1 mes' : `hace ${m} meses`;
};
export const diasHasta = (v) => (v ? Math.round((new Date(String(v).slice(0, 10) + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null);
export const fBytes = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fNum = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }));
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

export const ESTADOS = { no_iniciada: 'No iniciada', en_curso: 'En curso', completada: 'Completada', suspendida: 'Suspendida', cancelada: 'Cancelada' };
export const SITUACIONES = {
  no_iniciada: ['No iniciada', ''],
  en_curso: ['En curso', 'info'],
  por_vencer: ['Por vencer', 'warn'],
  atrasada: ['Atrasada', 'bad'],
  completada: ['Completada', 'ok'],
  cerrada: ['Cerrada', 'ok'],
  suspendida: ['Suspendida', 'violet'],
  cancelada: ['Cancelada', ''],
};
export const CATEGORIAS = { documento: 'Documento', acta: 'Acta', informe: 'Informe', fotografia: 'Fotografía', registro_asistencia: 'Registro de asistencia', planilla: 'Planilla', otro: 'Otro' };
export const VALIDACION = { pendiente: ['Pendiente de validación', 'warn'], validado: ['Validado', 'ok'], observado: ['Observado', 'bad'] };

export const badge = (txt, cls = '') => `<span class="badge ${cls}">${esc(txt)}</span>`;
export const badgeSit = (s) => { const [t, c] = SITUACIONES[s] || [s, '']; return badge(t, c); };
export const badgeVal = (v) => { const [t, c] = VALIDACION[v] || [v, '']; return badge(t, c); };

export const tono = (valor, meta) => {
  if (valor === null || valor === undefined) return '';
  if (meta === null || meta === undefined) return valor >= 80 ? 'ok' : valor >= 50 ? 'warn' : 'bad';
  return valor >= meta ? 'ok' : valor >= meta * 0.8 ? 'warn' : 'bad';
};
export const bar = (pct, cls = '', meta = null) =>
  `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct || 0))}%"></i>${meta !== null && meta !== undefined ? `<span class="meta" style="left:${meta}%" title="Meta ${meta}%"></span>` : ''}</div>`;
export const pctCell = (pct, cls = '') => `<div class="pct-cell">${bar(pct, cls)}<span>${fNum(pct ?? 0)}%</span></div>`;

export const options = (list, sel, { value = 'id', label = 'nombre', empty } = {}) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  list.map((x) => `<option value="${esc(x[value])}" ${String(x[value]) === String(sel ?? '') ? 'selected' : ''}>${esc(typeof label === 'function' ? label(x) : x[label])}</option>`).join('');

// ---------- Íconos (trazo, 24px) ----------
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.5 5.5"/>',
  school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- Avisos ----------
export function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = `toast${err ? ' err' : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}

// ---------- Modal ----------
// modal({ title, body, foot, size, onMount }) → { el, close }
export function modal({ title, body, foot = '', size = '', onMount }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="btn ghost icon right" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  $$('[data-close]', ov).forEach((b) => b.addEventListener('click', close));
  document.body.appendChild(ov);
  const first = $('input:not([type=hidden]), textarea, select', ov);
  if (first) setTimeout(() => first.focus(), 30);
  const ctx = { el: ov, close };
  if (onMount) onMount(ctx);
  return ctx;
}

export function confirmar(titulo, texto, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    const m = modal({
      title: titulo, size: 'sm', body: `<p class="muted">${texto}</p>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
    });
    let done = false;
    $('[data-ok]', m.el).addEventListener('click', () => { done = true; m.close(); resolve(true); });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// Serializa un formulario a objeto (checkbox → boolean, múltiples → array)
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (o[el.name] ||= []); if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked;
    } else if (el.multiple) o[el.name] = [...el.selectedOptions].map((x) => x.value);
    else if (el.type !== 'file') o[el.name] = el.value;
  }
  return o;
}

// Ejecuta una acción asíncrona deshabilitando el botón y mostrando errores
export async function run(btn, fn) {
  const prev = btn ? btn.innerHTML : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try { return await fn(); } catch (e) { toast(e.message, true); throw e; } finally { if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = prev; } }
}

// Interpretación de CSV simple (separador ; o ,) con comillas
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
