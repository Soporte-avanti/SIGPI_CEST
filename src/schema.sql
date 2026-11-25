-- SIGPI · Esquema de base de datos (PostgreSQL / Neon)
-- Idempotente: se puede ejecutar todas las veces que sea necesario.

CREATE TABLE IF NOT EXISTS areas (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  sigla       TEXT NOT NULL,
  activa      BOOLEAN NOT NULL DEFAULT TRUE,
  orden       INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dimensiones (
  id      SERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,
  orden   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS objetivos (
  id            SERIAL PRIMARY KEY,
  dimension_id  INT REFERENCES dimensiones(id) ON DELETE SET NULL,
  codigo        TEXT NOT NULL,
  descripcion   TEXT NOT NULL,
  activo        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'usuario'
                 CHECK (rol IN ('admin','rectoria','encargado_pme','coordinador','responsable','usuario')),
  area_id        INT REFERENCES areas(id) ON DELETE SET NULL,
  cargo          TEXT,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE,
  creado         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS acciones (
  id                  SERIAL PRIMARY KEY,
  codigo              TEXT NOT NULL UNIQUE,
  nombre              TEXT NOT NULL,
  descripcion         TEXT,
  dimension_id        INT REFERENCES dimensiones(id) ON DELETE SET NULL,
  objetivo_id         INT REFERENCES objetivos(id) ON DELETE SET NULL,
  area_id             INT REFERENCES areas(id) ON DELETE SET NULL,
  responsable_id      INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_inicio        DATE,
  fecha_termino       DATE,
  estado              TEXT NOT NULL DEFAULT 'no_iniciada'
                      CHECK (estado IN ('no_iniciada','en_curso','completada','suspendida','cancelada')),
  porcentaje          INT NOT NULL DEFAULT 0 CHECK (porcentaje BETWEEN 0 AND 100),
  resultado           TEXT,
  observaciones       TEXT,
  medidas_correctivas TEXT,
  periodicidad_dias   INT NOT NULL DEFAULT 15 CHECK (periodicidad_dias BETWEEN 1 AND 365),
  piloto              BOOLEAN NOT NULL DEFAULT FALSE,
  cerrada             BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cierre        DATE,
  cerrada_por         INT REFERENCES usuarios(id) ON DELETE SET NULL,
  ultima_actualizacion TIMESTAMPTZ,
  creado_por          INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accion_colaboradoras (
  accion_id  INT NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  area_id    INT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (accion_id, area_id)
);

-- Cada reporte de avance es un registro trazable que debe ser validado
CREATE TABLE IF NOT EXISTS avances (
  id                  SERIAL PRIMARY KEY,
  accion_id           INT NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  usuario_id          INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha               TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado              TEXT NOT NULL,
  porcentaje          INT NOT NULL CHECK (porcentaje BETWEEN 0 AND 100),
  descripcion         TEXT NOT NULL,
  medidas_correctivas TEXT,
  validacion          TEXT NOT NULL DEFAULT 'pendiente' CHECK (validacion IN ('pendiente','validado','observado')),
  validado_por        INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_validacion    TIMESTAMPTZ,
  comentario_validacion TEXT
);

CREATE TABLE IF NOT EXISTS evidencias (
  id              SERIAL PRIMARY KEY,
  accion_id       INT NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  avance_id       INT REFERENCES avances(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('archivo','enlace')),
  categoria       TEXT NOT NULL DEFAULT 'documento',
  titulo          TEXT NOT NULL,
  url             TEXT,
  nombre_archivo  TEXT,
  mime            TEXT,
  tamano          INT,
  contenido       BYTEA,
  subido_por      INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capacitaciones (
  id           SERIAL PRIMARY KEY,
  titulo       TEXT NOT NULL,
  fecha        DATE NOT NULL,
  modalidad    TEXT NOT NULL DEFAULT 'presencial',
  descripcion  TEXT,
  creado_por   INT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capacitacion_convocados (
  capacitacion_id  INT NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
  usuario_id       INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  asistio          BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (capacitacion_id, usuario_id)
);

-- Metas por indicador (se fijan después de la línea base, sección 33.8)
CREATE TABLE IF NOT EXISTS kpi_metas (
  clave        TEXT PRIMARY KEY,
  meta         NUMERIC(5,1),
  responsable  TEXT,
  periodicidad TEXT,
  actualizado  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fotografías de los indicadores: línea base y cortes de seguimiento
CREATE TABLE IF NOT EXISTS kpi_cortes (
  id          SERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL DEFAULT 'seguimiento' CHECK (tipo IN ('linea_base','seguimiento')),
  etiqueta    TEXT NOT NULL,
  valores     JSONB NOT NULL,
  creado_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  evento      TEXT NOT NULL,
  entidad     TEXT,
  entidad_id  INT,
  detalle     JSONB,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acciones_area ON acciones(area_id);
CREATE INDEX IF NOT EXISTS idx_acciones_resp ON acciones(responsable_id);
CREATE INDEX IF NOT EXISTS idx_avances_accion ON avances(accion_id);
CREATE INDEX IF NOT EXISTS idx_avances_validacion ON avances(validacion);
CREATE INDEX IF NOT EXISTS idx_evidencias_accion ON evidencias(accion_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);
