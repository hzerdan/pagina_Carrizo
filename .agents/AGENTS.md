# Reglas del Espacio de Trabajo - Pagina Arquimedes

Este archivo define las directrices y buenas prácticas de desarrollo para agentes de IA que colaboren en este repositorio.

## ⚠️ Reglas Críticas para Modificaciones en n8n

Para evitar regresiones, pérdidas de configuración o borrado accidental de prompts de usuario/parámetros en los nodos de n8n:

### 1. Prohibido Sobrescribir Listas/Arreglos Completos de Forma Directa
* Cuando se realicen actualizaciones en parámetros de nodos (por ejemplo, a través de la herramienta `update_workflow`), **nunca** se debe enviar un valor hardcodeado para campos que sean listas (como `responses.values` en nodos de modelos de lenguaje) a menos que se esté recreando el nodo completo de manera intencional.
* Si el campo es una lista, se debe modificar **únicamente el elemento específico de interés** (por ejemplo, el prompt de sistema en el índice 1), manteniendo el resto de los elementos (como el prompt de usuario en el índice 0) completamente intactos.

### 2. Metodología de Modificación Quirúrgica (Fetch-Modify-Push)
Antes de realizar cualquier cambio en un nodo de n8n, se debe seguir estrictamente este flujo automatizado:
1. **Fetch:** Descargar la definición actual del workflow o del nodo de interés a través de la API/MCP de n8n.
2. **Modify:** Usar un script (preferentemente Python) para parsear el JSON, buscar el nodo específico por nombre o ID, y realizar la modificación quirúrgica en el campo exacto (ej. `node['parameters']['responses']['values'][1]['content'] = nuevo_prompt`).
3. **Push:** Subir la actualización completa del workflow con el resto de la estructura original intacta.

### 3. Permisos de Inspección y Mutación (n8n MCP)
* **Lecturas e inspecciones automáticas**: El agente tiene autorización permanente para realizar consultas de lectura en n8n (`search_workflows`, `get_workflow_details`, `get_workflow_execution`, `search_workflow_executions`, `get_workflow_history`, etc.) de forma directa y proactiva, sin necesidad de solicitar confirmación previa en el chat.
* **Confirmación para mutaciones y despliegues**: Para cualquier modificación estructural (`update_workflow`, `archive_workflow`), cambios de estado (`publish_workflow`, `unpublish_workflow`) o disparadores manuales con efectos secundarios, el agente **debe** detallar el cambio y solicitar confirmación explícita antes de aplicarlo.

### 4. Advertencia de Pestaña Abierta en n8n al Modificar Vía MCP
* Antes de aplicar mutaciones o cambios de publicación (`update_workflow`, `publish_workflow`, `unpublish_workflow`), el agente **debe recordar y advertir al usuario que salga del canvas del workflow o cierre esa pestaña** (o vuelva a la lista general de flujos). Esto previene conflictos de concurrencia entre la sesión en memoria del navegador y la API, que bloquean el estado de publicación en un loop infinito de *"Publishing..."*.

### 5. Parámetro `forceReconnect` en `Email Trigger (IMAP)` (Hostinger)
No repetir valores descartados empíricamente para el intervalo de reconexión IMAP (`options.forceReconnect`):
* ❌ **3 minutos** (Probado Ago y Sep 2026): **Descartado**. Provoca bloqueos temporales por parte de Hostinger (*rate limiting / fail2ban / exceso de autenticaciones* por 20 logins/hora).
* ❌ **15 minutos** (Probado Sep 2026): **Descartado**. Provoca que el socket TCP quede colgado tras ~10 min de inactividad, perdiendo la recepción de correos entrantes en tiempo real.
* ❌ **20 minutos** (Probado Sep 2026): **Descartado**. Idem al caso de 15 min, el servidor corta la conexión por inactividad y los sockets mueren en silencio.
* ⏳ **7 minutos** (Configurado Sep 2026): **En evaluación**. Representa el equilibrio óptimo (~8.5 logins/hora para no saturar Hostinger y por debajo de la ventana de caída de 10 min de socket inactivo).



## ⚠️ Reglas Críticas para Funciones y RPCs en PostgreSQL (Supabase)

### 1. Incluir Siempre `DROP FUNCTION IF EXISTS` Previas al `CREATE OR REPLACE FUNCTION`
* En PostgreSQL, el comando `CREATE OR REPLACE FUNCTION` **no reemplaza** funciones si cambian los tipos o el orden de sus parámetros, generando versiones sobrecargadas duplicadas en el esquema `public` que provocan errores de ambigüedad (`Could not choose the best candidate function`).
* Antes de definir cualquier `CREATE OR REPLACE FUNCTION`, se deben incluir explícitamente las sentencias `DROP FUNCTION IF EXISTS public.<nombre_funcion>(...);` contemplando las firmas de tipos previas para asegurar un reemplazo canónico limpio sin ambigüedades.

## ⚠️ Permisos y Operaciones en Base de Datos (Supabase MCP y Supabase CLI)

### 1. Consultas de Solo Lectura Automáticas (Sin Confirmación Previa)
* El agente tiene autorización permanente para ejecutar consultas de solo lectura (`SELECT`, inspección de esquemas de tablas, `list_tables`, `list_migrations`, etc.) a través del MCP de Supabase directamente y de forma proactiva, sin necesidad de solicitar confirmación previa al usuario en el chat.

### 2. Confirmación Obligatoria para Escrituras y Mutaciones
* Para cualquier sentencia que implique inserción, actualización, eliminación o alteración estructural (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, o aplicación de migraciones DDL), el agente **debe** presentar la consulta o acción y solicitar confirmación explícita del usuario antes de ejecutarla.

### 3. Uso Exclusivo de Supabase CLI de Scoop (Prohibido npx)
* Para cualquier operación de base de datos o migraciones que requiera el CLI de Supabase (`supabase db push`, `supabase migration new`, `supabase db pull`, etc.), el agente **debe invocar directamente el comando `supabase`** instalado en el sistema operativo mediante **Scoop** (`supabase <subcomando>`).
* **Queda terminantemente prohibido** ejecutar `npx supabase ...`. Debe utilizarse siempre el binario global de Scoop.

## ⚠️ Eficiencia y Uso Estricto de Herramientas Nativas (Prohibición de Terminal/Python Innecesarios)

### 1. Prioridad Absoluta de Herramientas Nativas
* Para cualquier tarea de inspección, lectura, edición o búsqueda de archivos (consultar migraciones, explorar directorios, buscar texto en el código, editar archivos o inspeccionar esquemas), el agente **debe utilizar exclusivamente las herramientas nativas del entorno** (`view_file`, `write_to_file`, `replace_file_content`).
* **Queda terminantemente prohibido** ejecutar comandos de terminal (`dir`, `ls`, `cat`, `python -c ...`, etc.) para lecturas, inspecciones o ediciones que las herramientas nativas resuelvan de forma directa, evitando interrupciones innecesarias con solicitudes de permisos al usuario.

### 2. Restricción Estricta de Scripts de Python
* **No usar Python** si la tarea puede resolverse con herramientas nativas de lectura, edición o consultas MCP de solo lectura.
* El uso de scripts de Python queda restringido de forma exclusiva a situaciones excepcionales de **reducción masiva de datos**: cuando sea estrictamente indispensable procesar o agregar volcados JSON o logs de varios megabytes en disco para no saturar el contexto de la conversación. En esos casos puntuales, el script procesará la información e imprimirá únicamente el resumen final.




