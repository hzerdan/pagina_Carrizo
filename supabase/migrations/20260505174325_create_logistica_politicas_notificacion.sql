-- Create set_updated_at function if it doesn't exist
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Table: public.logistica_politicas_notificacion
create table if not exists public.logistica_politicas_notificacion (
  id bigserial primary key,
  nombre text not null unique,
  descripcion text null,
  activa boolean not null default true,

  espera_respuesta_minutos integer not null default 5,
  umbral_carga_larga_minutos integer not null default 180,
  intervalo_recordatorio_carga_corta_minutos integer not null default 60,
  intervalo_recordatorio_carga_larga_minutos integer not null default 90,
  max_recordatorios_sin_respuesta integer not null default 2,

  pedir_confirmacion_fecha_carga boolean not null default true,
  pedir_estimacion_demora_carga boolean not null default true,
  enviar_recordatorios_carga boolean not null default true,
  escalar_sin_respuesta boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint check_espera_respuesta_minutos check (espera_respuesta_minutos > 0),
  constraint check_umbral_carga_larga_minutos check (umbral_carga_larga_minutos > 0),
  constraint check_intervalo_recordatorio_carga_corta_minutos check (intervalo_recordatorio_carga_corta_minutos > 0),
  constraint check_intervalo_recordatorio_carga_larga_minutos check (intervalo_recordatorio_carga_larga_minutos > 0),
  constraint check_max_recordatorios_sin_respuesta check (max_recordatorios_sin_respuesta >= 0)
);

-- Insert default policy
insert into public.logistica_politicas_notificacion (
  nombre,
  descripcion,
  espera_respuesta_minutos,
  umbral_carga_larga_minutos,
  intervalo_recordatorio_carga_corta_minutos,
  intervalo_recordatorio_carga_larga_minutos,
  max_recordatorios_sin_respuesta,
  pedir_confirmacion_fecha_carga,
  pedir_estimacion_demora_carga,
  enviar_recordatorios_carga,
  escalar_sin_respuesta
) values (
  'default',
  'Política estándar para seguimiento automático de fecha/hora de carga, estimación de demora y recordatorios al chofer.',
  5,
  180,
  60,
  90,
  2,
  true,
  true,
  true,
  true
) on conflict (nombre) do nothing;

-- Trigger for updated_at
drop trigger if exists set_logistica_politicas_notificacion_updated_at on public.logistica_politicas_notificacion;
create trigger set_logistica_politicas_notificacion_updated_at
before update on public.logistica_politicas_notificacion
for each row
execute function public.set_updated_at();

-- Table: public.logistica_politicas_notificacion_override
create table if not exists public.logistica_politicas_notificacion_override (
  id bigserial primary key,
  remito_id bigint not null references public.remitos(id) on delete cascade,
  vigente boolean not null default true,

  espera_respuesta_minutos integer null,
  umbral_carga_larga_minutos integer null,
  intervalo_recordatorio_carga_corta_minutos integer null,
  intervalo_recordatorio_carga_larga_minutos integer null,
  max_recordatorios_sin_respuesta integer null,

  pedir_confirmacion_fecha_carga boolean null,
  pedir_estimacion_demora_carga boolean null,
  enviar_recordatorios_carga boolean null,
  escalar_sin_respuesta boolean null,

  omitir_notificaciones_chofer boolean null,
  omitir_confirmacion_fecha_carga boolean null,
  omitir_estimacion_demora_carga boolean null,
  omitir_recordatorios_carga boolean null,

  motivo text null,
  creado_por_id integer null,
  creado_por_email text null,
  created_at timestamptz not null default now(),

  constraint check_espera_respuesta_minutos_override check (espera_respuesta_minutos is null or espera_respuesta_minutos > 0),
  constraint check_umbral_carga_larga_minutos_override check (umbral_carga_larga_minutos is null or umbral_carga_larga_minutos > 0),
  constraint check_intervalo_recordatorio_carga_corta_minutos_override check (intervalo_recordatorio_carga_corta_minutos is null or intervalo_recordatorio_carga_corta_minutos > 0),
  constraint check_intervalo_recordatorio_carga_larga_minutos_override check (intervalo_recordatorio_carga_larga_minutos is null or intervalo_recordatorio_carga_larga_minutos > 0),
  constraint check_max_recordatorios_sin_respuesta_override check (max_recordatorios_sin_respuesta is null or max_recordatorios_sin_respuesta >= 0)
);

-- Unique index for active override per remito
create unique index if not exists logistica_politicas_notificacion_override_one_active
on public.logistica_politicas_notificacion_override (remito_id)
where vigente = true;

-- Indexes
create index if not exists idx_logistica_politicas_override_remito_id
on public.logistica_politicas_notificacion_override(remito_id);

create index if not exists idx_logistica_politicas_override_created_at
on public.logistica_politicas_notificacion_override(created_at desc);
