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
   - **Tuteo formal/cercano (Por defecto):** Utiliza un trato cálido, respetuoso y directo en primera persona (*"Hola Jesús, ¿cómo estás? Te escribo para contarte..."*).
   - **Trato de Usted (Opcional):** Para comunicaciones corporativas o clientes nuevos (*"Estimado Carlos, le escribo para ponerlo al tanto..."*).
3. **Canal de Envío:**
   - **WhatsApp (Por defecto):** Formato con negritas en asteriscos simples (`*texto*`), viñetas visuales, emojis sobrios y párrafos cortos.
   - **Email:** Estructura con asunto claro, encabezado formal y firma institucional.

---

## 📐 Estructura del Mensaje en 3 Actos (WhatsApp)

Todo mensaje generado debe cumplir rigurosamente esta secuencia:

### 1. Saludo Cálido y Contexto del Viaje
- Saludar por su nombre y mencionar claramente el/los número/s de remito y el/los chofer/es involucrados.
- Transmitir tranquilidad y actitud proactiva.

### 2. Diagnóstico Didáctico (Sin Tecnicismos Oscuros)
- **Reconocer primero el cumplimiento del chofer:** Destacar las acciones correctas que el chofer ya realizó (ej. *"Pablo envió las fotos de carga y pesajes"*, *"Walter avisó que no lo dejaban bajar del camión"*).
- **Explicar el aspecto técnico en lenguaje simple:** En lugar de hablar de *triggers, crons, fallbacks de JSON o queries*, explicarlo como un tema de coordinación o sincronización lógica del asistente automático (ej. *"el proceso automático de recordatorios no interpretó a tiempo que esa etapa ya estaba completa y continuó solicitando la verificación"*).

### 3. Solución Aplicada, Beneficio General y Cierre
- Explicar brevemente qué mejora se implementó y cómo previene que vuelva a ocurrir.
- Resaltar que la solución es **estructural para toda la operatoria**.
- Cierre cordial dejando los canales abiertos para cualquier consulta o coordinación adicional.

---

## 📝 Plantilla Canónica de Referencia (WhatsApp - Tuteo)

```text
Hola {Nombre_Cliente}, ¿cómo estás? Espero que estés teniendo un buen día.

Te escribo para contarte que estuve revisando en detalle la interacción del Remito *{Numero_Remito}* (chofer *{Nombre_Chofer}*), y ya dejamos solucionada la causa que generaba {motivo_breve_ej_mensajes repetitivos}.

📌 *¿Qué ocurrió en la operatoria?*
{Explicacion_didactica_reconociendo_chofer_y_situacion_tecnica_simple}

🛠️ *¿Qué mejoras aplicamos?*
1. *{Mejora_1_en_lenguaje_claro}:* {Explicacion_corta}
2. *{Mejora_2_en_lenguaje_claro}:* {Explicacion_corta}

Con este ajuste, el seguimiento queda 100% ordenado tanto para este viaje como para los futuros remitos de la operación.

Cualquier duda o detalle que quieras repasar, avisame y lo vemos. ¡Te mando un saludo! 🚚🤝
```

---

## 🚫 Reglas de Oro

1. **Nunca culpar injustamente al chofer ni al cliente:** Si el chofer reportó un impedimento o envió la información, destacarlo positivamente.
2. **Evitar la jerga de programación dura:** No mencionar nombres de tablas, funciones SQL internas (`simular_monitoreo_remito`), endpoints ni código fuente, salvo que el cliente sea explícitamente técnico.
3. **Legibilidad móvil prioritaria:** No generar bloques de texto densos de más de 4 líneas continuas en un solo párrafo.
4. **Formato nativo:** No usar formato markdown que no soporte WhatsApp (ej. `# Títulos`, `**doble asterisco**`, tablas complejas); utilizar `*negrita con asterisco simple*` y viñetas `•` o emojis.
