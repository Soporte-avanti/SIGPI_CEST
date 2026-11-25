# SIGPI · Salesianos Talca

Sistema Integral de Gestión Preventiva e Inteligencia Institucional del Centro Educativo Salesianos Talca. Es la herramienta digital que describe la propuesta de mejora (sección 33.7). Tiene cuatro módulos:

| Módulo | Dónde está en la app |
|---|---|
| 1. Registro de acciones | **Acciones PME**: alta de acciones (también por CSV), áreas responsables y colaboradoras, objetivo y dimensión PME, plazos, piloto |
| 2. Seguimiento y control | Detalle de cada acción: avances con %, estado, medidas correctivas, **validación** por la coordinación, cierre con resultado |
| 3. Evidencias y documentación | Archivos (hasta 4 MB) o enlaces a Drive/OneDrive, asociados a la acción o a un avance |
| 4. Indicadores y reportabilidad | **Tablero de control** + **Indicadores (KPI)** con los 7 indicadores de la Tabla 19, fichas técnicas, metas, línea base, cortes y exportación CSV |

Además incluye **Capacitación** (convocatoria y asistencia, que alimenta el KPI 7), **Usuarios y catálogos** (roles, áreas, objetivos, importación de usuarios por CSV), **Reporte por área** imprimible, **Ayuda** con el instructivo de cada perfil, **Sistema** (avisos por correo, respaldo y registro de errores) y una **Bitácora** que deja registro de cada operación.

**Tecnología:** Node.js + Express, PostgreSQL (Neon) y un frontend sin compilación (HTML, CSS y JS nativos). Todo vive en un solo servicio.

---

## 1. Base de datos en Neon (gratis)

1. Entra a <https://neon.tech> y crea un proyecto (por ejemplo `sigpi-cest`). Elige la región **AWS São Paulo (sa-east-1)**, que es la más cercana a Chile.
2. En **Dashboard → Connect**, copia la cadena de conexión **Pooled connection**. Tiene esta forma:
   `postgresql://usuario:clave@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require`
3. No hay que crear tablas a mano: la app las crea sola la primera vez que arranca.

## 2. Subir el código a GitHub

```bash
cd SIGPI_CEST/03_Herramienta/sigpi
git init
git add .
git commit -m "SIGPI v1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sigpi-cest.git
git push -u origin main
```

## 3A. Publicar en Render (recomendado)

1. En <https://render.com> elige **New → Blueprint** y selecciona el repositorio. Render lee el archivo `render.yaml` automáticamente.
2. Completa las variables que te pide:
   - `DATABASE_URL`: la cadena de Neon
   - `ADMIN_EMAIL`: tu correo, que será el primer administrador
   - `ADMIN_PASSWORD`: una contraseña segura
   - `JWT_SECRET` se genera solo
3. Espera el despliegue y abre `https://sigpi-cest.onrender.com`.

> Con el plan gratuito, Render apaga el servicio tras 15 minutos sin uso y tarda unos 30 a 50 segundos en volver a despertar. Para el piloto es suficiente; para uso diario conviene el plan Starter.

## 3B. Publicar en Vercel (alternativa)

1. En <https://vercel.com>, **Add New → Project** e importa el repositorio. No hay que cambiar nada de la configuración: ya viene en `vercel.json`.
2. En **Settings → Environment Variables** agrega `DATABASE_URL`, `JWT_SECRET` (un texto largo y aleatorio), `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `NODE_ENV=production`.
3. Ejecuta **Deploy**.

> En Vercel, el límite por solicitud es de 4,5 MB. Por eso las evidencias quedan limitadas a 4 MB; para archivos más grandes, usa enlaces a Drive.

## 4. Primer uso

1. Ingresa con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
2. En **Usuarios y catálogos → Objetivos PME**, carga los objetivos estratégicos del PME vigente.
3. Crea a los usuarios (coordinadores y responsables de información por área). Cada uno recibe una contraseña temporal y debe cambiarla al entrar por primera vez.
4. Carga las acciones del PME: una por una o con **Importar**, usando la plantilla CSV que se descarga desde la misma ventana. Marca como **Piloto** las acciones que vayan a la Fase III.
5. Registra la jornada de inducción en **Capacitación**.
6. Cuando el piloto tenga datos representativos, ve a **Indicadores → Registrar corte → Línea base**. Recién entonces define las metas, tal como indica la sección 33.8.

## Variables de entorno

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a Neon |
| `JWT_SECRET` | Sí | Firma de las sesiones |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Sí (primera vez) | Primer administrador cuando la base está vacía |
| `NODE_ENV` | Sí en producción | `production`: la cookie de sesión viaja solo por HTTPS |
| `RESEND_API_KEY`, `MAIL_FROM` | No | Habilitan los avisos por correo y la recuperación de contraseña |
| `APP_URL` | No | Dirección pública usada en los enlaces de los correos |
| `CRON_SECRET` | No | Protege la tarea programada de avisos |
| `MAX_UPLOAD_MB` | No | Límite de las evidencias (4 por defecto) |
| `TZ_INSTITUCION` | No | Zona horaria para calcular "hoy" (`America/Santiago`) |

Sin las variables de correo, el sistema funciona igual: los avisos no se envían y las contraseñas olvidadas las restablece un administrador.

## Avisos por correo

1. Crea una cuenta en [resend.com](https://resend.com), verifica el dominio del remitente y genera una API key.
2. En Vercel agrega `RESEND_API_KEY`, `MAIL_FROM` (por ejemplo `SIGPI <sigpi@salesianostalca.cl>`), `APP_URL` y `CRON_SECRET` (un texto aleatorio). Luego haz Redeploy.
3. La tarea programada de `vercel.json` corre los **lunes y jueves a las 11:00 UTC** (8:00 en horario de verano de Chile). Cada persona recibe como máximo un aviso al día y puede desactivarlos desde su cuenta.
4. En **Sistema → Ver a quién le llegaría hoy** se revisa el contenido antes de enviar.

En Render, que no tiene tareas programadas gratuitas, usa un servicio externo como cron-job.org para llamar a `https://TU-APP/api/cron/avisos?token=CRON_SECRET`.

## Respaldo y restauración

```bash
npm run respaldo                                     # crea respaldos/sigpi_AAAA-MM-DD_HHMM.json con todo, archivos incluidos
npm run restaurar -- respaldos/archivo.json --si     # REEMPLAZA la base de DATABASE_URL con el respaldo
```

El administrador también puede descargar un respaldo desde **Sistema → Respaldo**. Si las evidencias superan 3 MB, esa descarga las omite por el límite de Vercel; para un respaldo completo usa `npm run respaldo`. Los respaldos contienen datos personales: guárdalos en un lugar seguro. La carpeta `respaldos/` no se sube a GitHub.

## Pruebas automáticas

```bash
TEST_DATABASE_URL="postgresql://...rama-test..." npm test
```

Cubren el ingreso, la importación de usuarios, los permisos, la zona horaria, el flujo de reporte, validación y cierre, las evidencias, la invalidación de sesiones al cambiar la contraseña, la tarea programada y el respaldo. **La base de prueba se borra completa**: crea en Neon una rama `test` solo para esto.

## Roles

| Rol | Alcance |
|---|---|
| Administrador / Rectoría / Encargado PME | Visión y control institucional completo |
| Coordinación de área | Registra, edita, valida y cierra acciones de su área |
| Responsable de información | Edita y reporta avances con evidencias en su área o en sus acciones |
| Usuario institucional | Consulta, y reporta solo en las acciones donde figura como responsable |

Nadie puede validar un registro que ingresó él mismo, salvo el administrador.

## Desarrollo local

```bash
npm install
cp .env.example .env    # completa DATABASE_URL (puede ser la misma de Neon o un PostgreSQL local)
npm run seed:demo       # opcional: datos de prueba (usuarios @demo.cl, clave Demo.2026)
npm run reset -- --si   # borra todo y deja la base vacía con el administrador
npm run reset:demo      # borra todo y carga los datos de demostración
npm run dev             # http://localhost:3000
```

**No cargues los datos de demostración en la base definitiva.** Para eso puedes crear una rama `dev` en Neon.

## Protección de datos

- Las contraseñas se guardan con bcrypt y la sesión viaja en una cookie httpOnly que dura 12 horas.
- La bitácora registra quién hizo qué y cuándo.
- No subas documentos con datos sensibles de estudiantes o familias. Si es indispensable, registra un enlace con acceso restringido (Ley 19.628).
