// @ts-ignore - Deno type injected by runtime
declare const Deno: any;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// @ts-ignore - Deno.serve injected by runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { inspeccionId, origin } = await req.json();
    if (!inspeccionId) throw new Error("Falta inspeccionId");

    const siteUrl = Deno.env.get('SITE_URL') || Deno.env.get('FRONTEND_URL') || origin || "http://localhost:5173";


    // 1. Get Inspección data
    const { data: inspeccion, error: insError } = await supabase
      .from('inspecciones')
      .select('*, inspector:personal_ac(nombre_completo, email), lugar:depositos(nombre)')
      .eq('id', inspeccionId)
      .single();

    if (insError || !inspeccion) throw new Error("Error obteniendo la inspección: " + (insError?.message || 'No existe'));

    console.log("Datos Inspección:", inspeccion);

    const inspector = inspeccion.inspector;
    if (!inspector || !inspector.email) {
      throw new Error(`El inspector no tiene email asociado. ID Inspector: ${inspeccion.inspector_id}`);
    }

    // Invalidate previous tokens (if any)
    await supabase
      .from('magic_links')
      .update({ used_at: new Date().toISOString() })
      .eq('instancia_id', inspeccionId)
      .eq('tipo_entidad', 'INSPECCION')
      .is('used_at', null);

    // 2. Generate Magic Link
    const token = crypto.randomUUID(); 
    // Expiración: fecha_hora_carga_pactada + 48 horas
    const expiresAt = new Date(new Date(inspeccion.fecha_hora_carga_pactada).getTime() + 48 * 60 * 60 * 1000).toISOString();
    
    // Insert into magic_links
    const { error: mlError } = await supabase
      .from('magic_links')
      .insert([
        {
          token: token,
          tipo_entidad: 'INSPECCION',
          instancia_id: inspeccionId,
          usuario_email: inspector.email,
          expires_at: expiresAt
        }
      ]);

    if (mlError) throw new Error("Error creando magic link: " + mlError.message);

    // 3. Build HTML Body
    const portalUrl = `${siteUrl}/inspect/${token}`;
    const fechaPactadaHtml = new Date(inspeccion.fecha_hora_carga_pactada).toLocaleString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const lugarCarga = inspeccion.lugar?.nombre || 'Depósito Asignado';

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb; padding: 20px; border-radius: 8px;">
        <div style="background-color: #2563eb; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Inspección Documental Asignada</h1>
        </div>
        <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
          <p style="font-size: 16px; color: #374151; margin-top: 0;">Hola <strong>${inspector.nombre_completo}</strong>,</p>
          <p style="font-size: 16px; color: #374151;">Se te ha asignado una nueva tarea de inspección de carga para el cliente. A continuación tienes los detalles:</p>
          
          <div style="background-color: #f3f4f6; border-left: 4px solid #2563eb; padding: 16px; margin: 24px 0; border-radius: 4px;">
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #4b5563;"><strong>ID de Inspección:</strong> #INS-${inspeccionId}</p>
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #4b5563;"><strong>Tipo de Carga:</strong> <span style="text-transform: capitalize;">${inspeccion.tipo_carga}</span></p>
            <p style="margin: 0 0 8px 0; font-size: 15px; color: #4b5563;"><strong>Lugar de Carga:</strong> ${lugarCarga}</p>
            <p style="margin: 0; font-size: 15px; color: #4b5563;"><strong>Fecha Pactada:</strong> <span style="text-transform: capitalize;">${fechaPactadaHtml}</span></p>
          </div>

          <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">Por favor, haz clic en el siguiente enlace para descargar la planilla de trabajo y subir los resultados una vez finalizada la inspección.</p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="${portalUrl}" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Acceder al Portal de Inspección</a>
          </div>

          <p style="font-size: 13px; color: #6b7280; text-align: center; margin-top: 32px; margin-bottom: 0;">
            Este enlace es único y seguro, expirará automáticamente en 48 horas tras la fecha de carga pactada.
          </p>
        </div>
      </div>
    `;

    // 4. Send to n8n Webhook
    const n8nWebhookUrl = "https://hzerdan.app.n8n.cloud/webhook/envia-email-desde-frontend";
    
    const payload = {
      inspeccionId: inspeccionId,
      inspectorEmail: inspector.email,
      inspectorNombre: inspector.nombre_completo,
      fechaPactada: inspeccion.fecha_hora_carga_pactada,
      planillaDescargaUrl: inspeccion.planilla_personalizada_url,
      uploadToken: token,
      lugarId: inspeccion.lugar_carga_id,
      htmlBody: htmlContent
    };

    const webhookRes = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 753159*Arquimedes'
      },
      body: JSON.stringify(payload)
    });

    console.log(`Respuesta n8n status: ${webhookRes.status}`);

    if (!webhookRes.ok) {
        const msg = await webhookRes.text();
        throw new Error(`Error en llamada a n8n: ${webhookRes.status} ${msg}`);
    }

    // 5. Update inspection status (Transition)
    const { error: transitionError } = await supabase.rpc('inspeccion_intentar_transicion', {
      p_inspeccion_id: inspeccionId,
      p_nuevo_estado_code: '3.D1',
      p_usuario_actor: 'EDGE_FUNCTION_SYSTEM'
    });

    // Auditoria Envío Email
    await supabase.rpc('log_inspeccion_evento', {
      p_inspeccion_id: inspeccionId,
      p_accion: 'ENVÍO_EMAIL_INSPECCION',
      p_usuario_actor: 'EDGE_FUNCTION_SYSTEM',
      p_detalles: {
        email_enviado_a: inspector.email,
        token_generado: token
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email enviado y transición a 3.D1 completada (si era posible).",
        transitionError: transitionError?.message || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err: any) {
    console.error("=== Error Detallado en send-inspection-email ===");
    console.error("Mensaje:", err.message);
    if (err.stack) console.error("Stack:", err.stack);
    console.error("Objeto Error Completo:", err);

    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
