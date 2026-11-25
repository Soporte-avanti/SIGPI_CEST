// Envío de correo mediante la API de Resend (https://resend.com), sin dependencias adicionales.
// Si RESEND_API_KEY o MAIL_FROM no están definidos, el sistema funciona igual pero no envía correos.

const API = process.env.RESEND_API_URL || 'https://api.resend.com/emails'; // RESEND_API_URL solo para pruebas

const correoConfigurado = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  return '';
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plantilla HTML común (estilos en línea, compatible con clientes de correo)
function plantilla({ titulo, intro, cuerpo = '', boton, url, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6fa;font-family:Segoe UI,Arial,sans-serif;color:#141a26">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dde2ea;border-radius:12px">
    <tr><td style="padding:22px 28px;border-bottom:1px solid #dde2ea">
      <span style="display:inline-block;background:#3a70d6;color:#fff;font-weight:700;border-radius:8px;padding:6px 9px;font-size:13px">SG</span>
      <span style="font-weight:700;font-size:15px;margin-left:8px">SIGPI</span>
      <span style="color:#7b8598;font-size:13px"> · Salesianos Talca</span>
    </td></tr>
    <tr><td style="padding:26px 28px">
      <h1 style="font-size:19px;margin:0 0 10px">${esc(titulo)}</h1>
      <p style="margin:0 0 18px;color:#4a5568;font-size:14px;line-height:1.5">${intro}</p>
      ${cuerpo}
      ${boton && url ? `<p style="margin:24px 0 4px"><a href="${esc(url)}" style="background:#3a70d6;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${esc(boton)}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:16px 28px;border-top:1px solid #dde2ea;color:#7b8598;font-size:12px;line-height:1.5">${pie || 'Mensaje automático del SIGPI. No respondas este correo.'}</td></tr>
  </table></td></tr></table></body></html>`;
}

async function enviarCorreo({ to, subject, html, text }) {
  if (!correoConfigurado()) return { ok: false, motivo: 'correo_no_configurado' };
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, motivo: data.message || `HTTP ${r.status}` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

module.exports = { correoConfigurado, enviarCorreo, plantilla, appUrl, esc };
