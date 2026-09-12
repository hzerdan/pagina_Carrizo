# Reglas Globales de Desarrollo - Antigravity

Este archivo define las directrices y buenas prácticas globales de desarrollo que aplican a todos los proyectos y espacios de trabajo en este equipo.

---

## ⚠️ Eficiencia y Uso de Herramientas Nativas (Evitar Terminal para Lecturas)

### 1. Priorizar Herramientas Nativas de Lectura
* Para cualquier tarea de inspección, listado o búsqueda de archivos (ej. consultar migraciones, explorar directorios, buscar texto en el código o inspeccionar archivos descargados), el agente **debe utilizar exclusivamente las herramientas nativas del entorno** (`find_by_name`, `list_dir`, `view_file`, `grep_search`).
* **Queda prohibido** ejecutar comandos de terminal (`python -c ...`, `dir`, `ls`, `cat`, etc.) para tareas de lectura o listado que puedan resolverse con las herramientas nativas, evitando interrupciones innecesarias con solicitudes de permisos al usuario.

### 2. Uso Justificado de Python (Reducción Masiva de Datos y Ahorro de Tokens)
* Se autoriza y recomienda el uso de scripts de Python cuando se deba procesar, filtrar o agregar información de archivos JSON, volcados o logs muy voluminosos (evitando volcar miles de líneas al contexto de la conversación con `view_file`).
* En tales casos, el script de Python debe procesar los datos en disco/memoria e imprimir **únicamente el resultado o resumen final**, minimizando el consumo de tokens.

---

## ⚠️ Permisos y Operaciones en Base de Datos (Supabase MCP / PostgreSQL)

### 1. Consultas de Solo Lectura Automáticas (Sin Confirmación Previa)
* El agente tiene autorización permanente para ejecutar consultas de solo lectura (`SELECT`, inspección de esquemas de tablas, `list_tables`, `list_migrations`, etc.) a través de los servidores MCP de Supabase directamente y de forma proactiva, sin necesidad de solicitar confirmación previa al usuario en el chat.

### 2. Confirmación Obligatoria para Escrituras y Mutaciones
* Para cualquier sentencia que implique inserción, actualización, eliminación o alteración estructural (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, o aplicación de migraciones DDL), el agente **debe** presentar la consulta o acción y solicitar confirmación explícita del usuario antes de ejecutarla.

### 3. Evitar Ambigüedades en Funciones de PostgreSQL
* Antes de definir cualquier `CREATE OR REPLACE FUNCTION`, se deben incluir explícitamente las sentencias `DROP FUNCTION IF EXISTS public.<nombre_funcion>(...);` contemplando las firmas de tipos previas para asegurar un reemplazo canónico limpio sin errores de ambigüedad (`Could not choose the best candidate function`).

---

## ⚠️ Operaciones en n8n (n8n MCP)

### 1. Inspección y Lecturas Automáticas
* El agente tiene autorización permanente para realizar consultas de lectura en n8n (`search_workflows`, `get_workflow_details`, `get_workflow_execution`, `search_workflow_executions`, `get_workflow_history`, etc.) de forma directa y proactiva, sin necesidad de solicitar confirmación previa en el chat.

### 2. Confirmación para Mutaciones y Despliegues
* Para cualquier modificación estructural (`update_workflow`, `archive_workflow`), cambios de estado (`publish_workflow`, `unpublish_workflow`) o disparadores manuales con efectos secundarios, el agente **debe** detallar el cambio y solicitar confirmación explícita antes de aplicarlo.

### 3. Metodología Quirúrgica (Fetch-Modify-Push)
* Al modificar parámetros o nodos de workflows, nunca sobrescribir arreglos o listas completas con valores planos hardcodeados si contienen otros elementos (como prompts de usuario o configuraciones preexistentes).
* Seguir el flujo: 1) Descargar definición, 2) Modificar con script el campo o índice exacto, 3) Subir la actualización completa preservando la estructura original.
