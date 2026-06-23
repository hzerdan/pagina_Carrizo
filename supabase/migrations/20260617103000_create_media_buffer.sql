-- Crear tabla de buffer de fotos
CREATE TABLE IF NOT EXISTS public.media_buffer (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  remito_id BIGINT REFERENCES public.remitos(id) ON DELETE SET NULL,
  message_id BIGINT REFERENCES public.conversation_messages(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  content_type TEXT,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.media_buffer ENABLE ROW LEVEL SECURITY;

-- Políticas RLS estándar para usuarios autenticados (Dashboard/Operadores)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Autenticados pueden ver media_buffer' AND tablename = 'media_buffer'
  ) THEN
    CREATE POLICY "Autenticados pueden ver media_buffer" ON public.media_buffer 
      FOR SELECT TO public USING (auth.role() = 'authenticated'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Autenticados pueden crear media_buffer' AND tablename = 'media_buffer'
  ) THEN
    CREATE POLICY "Autenticados pueden crear media_buffer" ON public.media_buffer 
      FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Autenticados pueden actualizar media_buffer' AND tablename = 'media_buffer'
  ) THEN
    CREATE POLICY "Autenticados pueden actualizar media_buffer" ON public.media_buffer 
      FOR UPDATE TO public USING (auth.role() = 'authenticated'::text) WITH CHECK (auth.role() = 'authenticated'::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Autenticados pueden borrar media_buffer' AND tablename = 'media_buffer'
  ) THEN
    CREATE POLICY "Autenticados pueden borrar media_buffer" ON public.media_buffer 
      FOR DELETE TO public USING (auth.role() = 'authenticated'::text);
  END IF;
END
$$;
