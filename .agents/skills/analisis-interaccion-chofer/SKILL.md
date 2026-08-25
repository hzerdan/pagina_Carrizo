---
name: analisis-interaccion-chofer
description: Analiza la interacción y cronología de mensajes de WhatsApp con choferes para un remito específico (por ID o referencia externa), diagnostica inconsistencias operativas o de debounce, propone correcciones quirúrgicas y gestiona el reinicio del viaje para pruebas limpias.
---

# Skill: Análisis de Interacción con Choferes (`analisis-interaccion-chofer`)

Esta skill permite auditar, diagnosticar y corregir de manera quirúrgica las conversaciones entre choferes de camiones y el Asistente Automático de WhatsApp de Arquímedes Carrizo para un remito determinado.

---

## 🎯 Cuándo Activar esta Skill

Activa esta skill cuando el usuario:
- Proporcione el número humano o ID de un remito (ej. `"Analizá la conversación del remito 0000100005289"`, `"Fijate qué pasó con el remito 44"`).
- Pregunte sobre problemas de interacción, duplicación de respuestas, saltos indebidos de tareas o incoherencias con un chofer.
- Solicite resetear o reiniciar un remito para volver a probar el flujo desde cero.

---

## 🔄 Flujo de Trabajo en 4 Pasos

### Paso 1: Extracción de Cronología y Estado (Fetch)
1. Extraer el identificador del remito provisto por el usuario (puede ser ID numérico `44` o `remito_ref_externa` como `0000100005289`).
2. Ejecutar en Supabase (servidor `supabase-pagina-arquimedes`) la consulta de línea de tiempo generada por:
   ```bash
   python .agents/skills/analisis-interaccion-chofer/scripts/fetch_remito_timeline.py <remito_id_o_ref>
   ```
3. La consulta devuelve:
   - Metadatos del remito (`mision_estado`, chofer asignado, balanzas, depósitos, horarios programados, sobres preparados).
   - Protocolo de control actual con estados de cada tarea (`COMPLETADO`, `REPORTADO_CHOFER`, `PENDIENTE`, `NO_REALIZABLE`).
   - Línea de tiempo completa de mensajes con:
     - `sender_role` (`sistema`, `chofer`, `humano`).
     - `body_text`.
     - `created_at_local` (hora de Buenos Aires).
     - `segundos_desde_anterior` (diferencia en segundos con el mensaje inmediatamente previo).

---

### Paso 2: Diagnóstico e Identificación de Incoherencias
Analizar sistemáticamente los siguientes 5 patrones clave:

1. **Carreras de Mensajes / Problemas de Debounce (Ráfagas de mensajes del chofer)**:
   - Identificar si el chofer envió 2 o más mensajes consecutivos con intervalos menores a 5 segundos (ej. a los 1.5s o 4.2s).
   - Verificar si el bot disparó múltiples respuestas paralelas o contradictorias.
2. **Respeto de Precondiciones Operativas (Documentación / Sobres)**:
   - Si el chofer indicó no tener los papeles (*"No todavía"*), verificar si el bot esperó la confirmación o si avanzó indebidamente a pedir horario o enviar a la balanza.
3. **Manejo de Respuestas Inciertas o Tentativas**:
   - Si el chofer respondió de forma condicional (*"Creo que sí"*, *"Voy a saber al llegar"*), verificar si el bot aceptó la incertidumbre o si forzó una confirmación errónea (*"el horario es correcto"*).
4. **Redundancias durante el Viaje / Tránsito**:
   - Si el chofer indicó que ya está en viaje (*"ya estoy en camino"*), verificar que el bot NO le pida *"avisame cuando inicies el viaje"*, sino únicamente el aviso de llegada a destino.
5. **Cierre de Entrega y Escalamiento**:
   - Si el chofer no envió foto de remito firmado y declaró llevarlo físico, verificar que el bot haya activado `"Escalar": true` y NO haya auto-aprobado la entrega sin supervisión humana.

---

### Paso 3: Presentación del Reporte y Propuesta Quirúrgica
Presentar al usuario un informe claro y estructurado con:
- **Resumen del Remito y Chofer**: Estado actual, origen, destino y tareas cumplidas vs pendientes.
- **Línea de Tiempo Detallada**: Mostrando los mensajes clave y los segundos transcurridos.
- **Diagnóstico de Inconsistencias**: Explicación precisa de qué falló y por qué.
- **Propuesta de Corrección Quirúrgica**: Detallando el ajuste exacto propuesto en:
  - System Prompt de `AI Agent3` en n8n.
  - Nodos de Debounce / Lógica en el workflow `jpM64sBOgp3D4A8o`.
  - Triggers o funciones SQL en PostgreSQL.
- **Solicitud de Aprobación**: Esperar la confirmación del usuario antes de modificar.

---

### Paso 4: Ejecución Quirúrgica y Reset Opcional
1. **Modificación Quirúrgica**:
   - Seguir estrictamente las directivas de `AGENTS.md` (Fetch-Modify-Push atómico).
   - Actualizar el workflow en n8n mediante script de MCP (`npx mcp-remote` o `update_workflow`) y publicar la nueva versión (`publish_workflow`).
2. **Reset de Misión (Si el usuario lo solicita)**:
   - Ejecutar la función canónica `reset_remito_mision(p_remito_id)` en Supabase.
   - Asegurar que `mi_sobre_proveedor_preparado` y `mi_sobre_cliente_preparado` queden en `false`.
   - **Regla Crítica**: El reset **NUNCA debe modificar ni borrar** los IDs de depósitos (`deposito_carga_id`, `deposito_descarga_id`) ni de balanzas (`tara_pesaje_lugar_id`, `bruto_pesaje_lugar_id`).
   - Confirmar al usuario que la conversación previa fue vaciada a 0 mensajes y el remito quedó listo para iniciar desde cero.
