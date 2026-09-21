---
name: comunicacion-cliente-auditoria
description: Redacta mensajes y resúmenes ejecutivos dirigidos a clientes (vía WhatsApp o email) explicando de forma didáctica, formal, empática y cercana las auditorías, fallas detectadas y mejoras aplicadas en remitos u operaciones logísticas.
---

# Skill: Comunicación con Clientes sobre Auditorías e Incidencias (`comunicacion-cliente-auditoria`)

Esta skill estandariza la redacción de mensajes de comunicación hacia clientes (como coordinadores logísticos, dueños de carga o supervisores externos) tras realizar auditorías operativas, resolver inconsistencias en el bot de WhatsApp o aplicar mejoras al sistema.

---

## 🎯 Cuándo Activar esta Skill

Activa esta skill cuando el usuario:
- Solicite redactar una explicación o informe para el cliente (ej. *"Explicáselo a Jesús por WhatsApp"*, *"Armame un mensaje para el cliente contándole qué pasó"*).
- Pida traducir un diagnóstico técnico complejo de Supabase/n8n/PostgreSQL a un lenguaje de negocios transparente, amigable y comprensible.
- Necesite comunicar la resolución de un incidente, reinicio de viaje o mejoras estructurales aplicadas a los remitos.

---

## ⚙️ Parámetros de Personalización

Al redactar el mensaje, identificar o consultar:
1. **Nombre del Cliente:** (Ej. `Jesús`, `Carlos`, `María`). Si no se especifica, consultar o usar un saludo cordial configurable.
2. **Modalidad de Trato:**
   - **Tuteo formal/cercano (Por defecto):** Utiliza un trato cálido, respetuoso y directo en primera persona (*"Hola Jesús, Que tal? Te comento que..."*).
   - **Trato de Usted (Opcional):** Para comunicaciones corporativas o clientes nuevos (*"Estimado Carlos, le escribo para ponerlo al tanto..."*).
3. **Canal de Envío:**
   - **WhatsApp (Por defecto):** Formato con negritas en asteriscos simples (`*texto*`), viñetas visuales, emojis sobrios y párrafos cortos. No usar signos de apertura (`¿`, `¡`).
   - **Email:** Estructura con asunto claro, encabezado formal y firma institucional.

---

## 📐 Estructura del Mensaje en 3 Actos (WhatsApp)

Todo mensaje generado debe cumplir rigurosamente esta secuencia:

### 1. Saludo Ágil y Contexto del Viaje
- Saludar por su nombre de forma directa y coloquial (*"Hola {Nombre}, Que tal?"*) y contextualizar con *"Te comento que..."*.
- Mencionar claramente el/los número/s de remito y el/los chofer/es involucrados.
- Transmitir tranquilidad y actitud proactiva.

### 2. Diagnóstico Didáctico (Sin Tecnicismos Oscuros)
- **Reconocer primero el cumplimiento del chofer:** Destacar las acciones correctas que el chofer ya realizó (ej. *"Pablo envió las fotos de carga y pesajes"*, *"Walter avisó que no lo dejaban bajar del camión"*).
- **Explicar el aspecto técnico en lenguaje simple:** En lugar de hablar de *triggers, crons, fallbacks de JSON o queries*, explicarlo como un tema de coordinación o sincronización lógica del asistente automático (ej. *"el proceso automático de recordatorios no interpretó a tiempo que esa etapa ya estaba completa y continuó solicitando la verificación"*).

### 3. Solución Aplicada, Beneficio General y Cierre
- Explicar brevemente qué mejora se implementó y cómo previene que vuelva a ocurrir.
- Incluir llamados a la acción claros si el cliente debe reintentar o validar algo (ej. *"Decime si los podés vincular correctamente..."*).
- Cierre natural y directo (*"Quedo a tu disposición por cualquier consulta. Saludos! 🤝🚚"*).

---

## 📝 Plantilla Canónica de Referencia (WhatsApp - Tuteo Natural)

```text
Hola {Nombre_Cliente}, Que tal?

Te comento que estuvimos revisando en detalle el Remito *{Numero_Remito}* (chofer *{Nombre_Chofer}*), y ya dejamos solucionada la causa que generaba {motivo_breve_ej_mensajes repetitivos}.

📌 *Sobre {aspecto_o_remito}:*
{Explicacion_didactica_simple_y_accion_a_tomar}

📋 *{Estado_o_seguimiento}:*
{Detalle_o_adjunto_de_control}

Quedo a tu disposición por cualquier consulta. Saludos! 🤝🚚
```

---

## 🚫 Reglas de Oro

1. **Cero signos de apertura (`¿`, `¡`):** En WhatsApp cotidiano profesional (especialmente en Argentina y la región), no utilizar signos de apertura. Emplear únicamente los de cierre (`?`, `!`) para una lectura fluida, fresca y 100% natural.
2. **Lenguaje llano y coloquial:** Usar aperturas naturales como *"Hola [Nombre], Que tal?"* y conectores sencillos como *"Te comento que..."*. Cerrar directamente con *"Saludos!"*.
3. **Nunca culpar injustamente al chofer ni al cliente:** Si el chofer reportó un impedimento o envió la información, destacarlo positivamente.
4. **Evitar la jerga de programación dura:** No mencionar nombres de tablas, funciones SQL internas, endpoints ni código fuente.
5. **Legibilidad móvil prioritaria:** No generar bloques densos de texto; separar por párrafos cortos con viñetas o emojis sobrios.
6. **Formato nativo:** Usar únicamente `*negrita con asterisco simple*` y viñetas compatibles con WhatsApp.
