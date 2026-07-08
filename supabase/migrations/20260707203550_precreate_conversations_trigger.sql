-- 1. Crear la función del trigger para pre-crear conversaciones cuando se asigna un chofer
CREATE OR REPLACE FUNCTION public.trg_fn_create_chofer_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_telefono text;
  v_clean_phone text;
  v_conversation_id bigint;
BEGIN
  IF NEW.chofer_id IS NOT NULL AND NEW.estado_asignacion = 'ASIGNADO' THEN
    -- Obtener teléfono del chofer
    SELECT telefono INTO v_telefono FROM public.choferes WHERE id = NEW.chofer_id;
    
    IF v_telefono IS NOT NULL AND v_telefono <> '' THEN
      v_clean_phone := regexp_replace(v_telefono, '\D', '', 'g');
      
      -- Verificar si ya existe la conversación
      SELECT id INTO v_conversation_id FROM public.conversations 
      WHERE conversation_key = v_clean_phone AND channel = 'whatsapp';
      
      -- Si no existe, crearla de inmediato (confirmándose y comprometiéndose en esta transacción)
      IF v_conversation_id IS NULL THEN
        INSERT INTO public.conversations (
          conversation_key,
          participant_id,
          participant_role,
          remito_actual_id,
          estado_atencion,
          channel
        ) VALUES (
          v_clean_phone,
          NEW.chofer_id,
          'chofer',
          NEW.id,
          'bot_activo',
          'whatsapp'
        )
        ON CONFLICT (channel, conversation_key) DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Crear el trigger en la tabla remitos
CREATE OR REPLACE TRIGGER trg_create_chofer_conversation
AFTER INSERT OR UPDATE OF chofer_id, estado_asignacion ON public.remitos
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_create_chofer_conversation();

-- 3. Backfill de conversaciones para todos los choferes actualmente asignados
INSERT INTO public.conversations (
  conversation_key,
  participant_id,
  participant_role,
  remito_actual_id,
  estado_atencion,
  channel
)
SELECT DISTINCT ON (regexp_replace(c.telefono, '\D', '', 'g'))
  regexp_replace(c.telefono, '\D', '', 'g'),
  r.chofer_id,
  'chofer',
  r.id,
  'bot_activo',
  'whatsapp'
FROM public.remitos r
JOIN public.choferes c ON r.chofer_id = c.id
WHERE r.estado_asignacion = 'ASIGNADO'
  AND c.telefono IS NOT NULL 
  AND c.telefono <> ''
ON CONFLICT (channel, conversation_key) DO NOTHING;
