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
