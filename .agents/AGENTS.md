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


## ⚠️ Reglas Críticas para Funciones y RPCs en PostgreSQL (Supabase)

### 1. Incluir Siempre `DROP FUNCTION IF EXISTS` Previas al `CREATE OR REPLACE FUNCTION`
* En PostgreSQL, el comando `CREATE OR REPLACE FUNCTION` **no reemplaza** funciones si cambian los tipos o el orden de sus parámetros, generando versiones sobrecargadas duplicadas en el esquema `public` que provocan errores de ambigüedad (`Could not choose the best candidate function`).
* Antes de definir cualquier `CREATE OR REPLACE FUNCTION`, se deben incluir explícitamente las sentencias `DROP FUNCTION IF EXISTS public.<nombre_funcion>(...);` contemplando las firmas de tipos previas para asegurar un reemplazo canónico limpio sin ambigüedades.

## ⚠️ Permisos y Operaciones en Base de Datos (Supabase MCP)

### 1. Consultas de Solo Lectura Automáticas (Sin Confirmación Previa)
* El agente tiene autorización permanente para ejecutar consultas de solo lectura (`SELECT`, inspección de esquemas de tablas, `list_tables`, `list_migrations`, etc.) a través del MCP de Supabase directamente y de forma proactiva, sin necesidad de solicitar confirmación previa al usuario en el chat.

### 2. Confirmación Obligatoria para Escrituras y Mutaciones
* Para cualquier sentencia que implique inserción, actualización, eliminación o alteración estructural (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, o aplicación de migraciones DDL), el agente **debe** presentar la consulta o acción y solicitar confirmación explícita del usuario antes de ejecutarla.

## ⚠️ Eficiencia y Uso de Herramientas Nativas (Evitar Terminal para Lecturas)

### 1. Priorizar Herramientas Nativas de Lectura
* Para cualquier tarea de inspección, listado o búsqueda de archivos (ej. consultar migraciones de Supabase, explorar directorios, buscar texto en el código o inspeccionar archivos descargados), el agente **debe utilizar exclusivamente las herramientas nativas del entorno** (`find_by_name`, `list_dir`, `view_file`, `grep_search`).
* **Queda prohibido** ejecutar comandos de terminal (`python -c ...`, `dir`, `ls`, `cat`, etc.) para tareas de lectura o listado que puedan resolverse con las herramientas nativas, evitando interrupciones innecesarias con solicitudes de permisos al usuario.

### 2. Uso Justificado de Python (Reducción Masiva de Datos y Ahorro de Tokens)
* Se autoriza y recomienda el uso de scripts de Python cuando se deba procesar, filtrar o agregar información de archivos JSON, volcados o logs muy voluminosos (evitando volcar miles de líneas al contexto de la conversación con `view_file`).
* En tales casos, el script de Python debe procesar los datos en disco/memoria e imprimir **únicamente el resultado o resumen final**, minimizando el consumo de tokens.



