import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Eye, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  Save,
  Check,
  Plus,
  Trash2
} from 'lucide-react';
import { DateTimePicker } from './DateTimePicker';

interface SeccionDisclaimerProps {
  remitoId: number;
  remitoRef: string;
  choferNombre: string;
  camionPatente: string;
  depositoDescargaNombre: string;
  cliente: {
    razon_social: string;
    email_general?: string;
    email_secundario_1?: string;
    email_secundario_2?: string;
  } | null;
  personalAcList: Array<{
    id: number;
    nombre: string;
    email: string;
    rol?: string;
  }>;
  initialDisclaimerData: {
    disclaimer_template_id?: number | null;
    disclaimer_emails_destino?: string[] | null;
    disclaimer_cc_personal_ids?: number[] | null;
    disclaimer_fecha_programada?: string | null;
    disclaimer_enviado_at?: string | null;
    disclaimer_enviado_por?: string | null;
  };
  onUpdateSuccess?: () => void;
}

interface TemplateItem {
  id: number;
  codigo: string;
  titulo: string;
  cuerpo: string;
}

export function SeccionDisclaimerCliente({
  remitoId,
  remitoRef,
  choferNombre,
  camionPatente,
  depositoDescargaNombre,
  cliente,
  personalAcList,
  initialDisclaimerData,
  onUpdateSuccess
}: SeccionDisclaimerProps) {
  const { user } = useAuth();

  const [isExpanded, setIsExpanded] = useState(true);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Form states
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    initialDisclaimerData.disclaimer_template_id || null
  );
  const [selectedEmails, setSelectedEmails] = useState<string[]>(
    initialDisclaimerData.disclaimer_emails_destino || []
  );
  const [customEmailInput, setCustomEmailInput] = useState('');
  const [selectedCcIds, setSelectedCcIds] = useState<number[]>(
    initialDisclaimerData.disclaimer_cc_personal_ids || []
  );
  const [fechaProgramada, setFechaProgramada] = useState<string | null>(
    initialDisclaimerData.disclaimer_fecha_programada || null
  );

  // Status & Actions
  const [enviadoAt, setEnviadoAt] = useState<string | null>(
    initialDisclaimerData.disclaimer_enviado_at || null
  );
  const [enviadoPor, setEnviadoPor] = useState<string | null>(
    initialDisclaimerData.disclaimer_enviado_por || null
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Cargar plantillas de disclaimer activas
  useEffect(() => {
    async function loadTemplates() {
      try {
        setLoadingTemplates(true);
        const { data, error } = await supabase
          .from('disclaimer_templates')
          .select('id, codigo, titulo, cuerpo')
          .eq('activo', true)
          .order('id', { ascending: true });

        if (error) throw error;
        setTemplates(data || []);

        // Si no hay plantilla seleccionada, seleccionar la primera por defecto
        if (!selectedTemplateId && data && data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      } catch (err) {
        console.error('Error cargando plantillas de disclaimer:', err);
      } finally {
        setLoadingTemplates(false);
      }
    }
    loadTemplates();
  }, []);

  // Pre-cargar los emails del cliente si aún no se guardó configuración previa
  useEffect(() => {
    if ((!initialDisclaimerData.disclaimer_emails_destino || initialDisclaimerData.disclaimer_emails_destino.length === 0) && cliente) {
      const defaultEmails: string[] = [];
      if (cliente.email_general && cliente.email_general.includes('@')) defaultEmails.push(cliente.email_general.trim());
      if (cliente.email_secundario_1 && cliente.email_secundario_1.includes('@')) defaultEmails.push(cliente.email_secundario_1.trim());
      if (cliente.email_secundario_2 && cliente.email_secundario_2.includes('@')) defaultEmails.push(cliente.email_secundario_2.trim());
      if (defaultEmails.length > 0) {
        setSelectedEmails(defaultEmails);
      }
    }
  }, [cliente, initialDisclaimerData.disclaimer_emails_destino]);

  // Sincronizar estado cuando cambien props iniciales
  useEffect(() => {
    if (initialDisclaimerData.disclaimer_enviado_at) {
      setEnviadoAt(initialDisclaimerData.disclaimer_enviado_at);
    }
    if (initialDisclaimerData.disclaimer_enviado_por) {
      setEnviadoPor(initialDisclaimerData.disclaimer_enviado_por);
    }
  }, [initialDisclaimerData]);

  // Lista de emails conocidos del cliente (hasta 3)
  const clientEmailsAvailable = useMemo(() => {
    if (!cliente) return [];
    const list: { key: string; label: string; email: string }[] = [];
    if (cliente.email_general?.trim()) {
      list.push({ key: 'general', label: 'Email Principal', email: cliente.email_general.trim() });
    }
    if (cliente.email_secundario_1?.trim()) {
      list.push({ key: 'sec1', label: 'Email Secundario 1', email: cliente.email_secundario_1.trim() });
    }
    if (cliente.email_secundario_2?.trim()) {
      list.push({ key: 'sec2', label: 'Email Secundario 2', email: cliente.email_secundario_2.trim() });
    }
    return list;
  }, [cliente]);

  const currentTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Previsualización procesada
  const parsedPreviewText = useMemo(() => {
    if (!currentTemplate) return '';
    return currentTemplate.cuerpo
      .replace(/{cliente}/gi, cliente?.razon_social || 'Cliente')
      .replace(/{remito}/gi, remitoRef || 'Sin Ref')
      .replace(/{chofer}/gi, choferNombre || 'Chofer Asignado')
      .replace(/{patente}/gi, camionPatente || 'No Asignada')
      .replace(/{deposito_descarga}/gi, depositoDescargaNombre || 'Depósito del Cliente')
      .replace(/{fecha_arribo}/gi, fechaProgramada ? new Date(fechaProgramada).toLocaleString('es-AR') : 'Próximamente');
  }, [currentTemplate, cliente, remitoRef, choferNombre, camionPatente, depositoDescargaNombre, fechaProgramada]);

  const toggleEmail = (email: string) => {
    setSelectedEmails(prev => 
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const addCustomEmail = () => {
    const email = customEmailInput.trim();
    if (!email || !email.includes('@')) {
      setFeedback({ type: 'error', message: 'Ingresa un email válido.' });
      return;
    }
    if (!selectedEmails.includes(email)) {
      setSelectedEmails(prev => [...prev, email]);
    }
    setCustomEmailInput('');
  };

  const removeCustomEmail = (email: string) => {
    setSelectedEmails(prev => prev.filter(e => e !== email));
  };

  const toggleCcPersonal = (id: number) => {
    setSelectedCcIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      setFeedback(null);

      const { error } = await supabase
        .from('remitos')
        .update({
          disclaimer_template_id: selectedTemplateId,
          disclaimer_emails_destino: selectedEmails,
          disclaimer_cc_personal_ids: selectedCcIds,
          disclaimer_fecha_programada: fechaProgramada,
          updated_at: new Date().toISOString()
        })
        .eq('id', remitoId);

      if (error) throw error;

      setFeedback({ type: 'success', message: 'Configuración de disclaimer guardada correctamente.' });
      if (onUpdateSuccess) onUpdateSuccess();
    } catch (err: any) {
      console.error('Error guardando configuración de disclaimer:', err);
      setFeedback({ type: 'error', message: err.message || 'Error al guardar configuración.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendDisclaimerNow = async () => {
    if (selectedEmails.length === 0) {
      setFeedback({ type: 'error', message: 'Debes seleccionar al menos una dirección de email destinataria.' });
      return;
    }
    if (!selectedTemplateId || !currentTemplate) {
      setFeedback({ type: 'error', message: 'Debes seleccionar una plantilla de disclaimer.' });
      return;
    }

    const ccPersons = personalAcList.filter(p => selectedCcIds.includes(p.id) && p.email);
    const ccEmails = ccPersons.map(p => p.email.trim());

    const confirmMessage = `¿Confirmas el envío inmediato del disclaimer de recepción?
    
Destinatarios (${selectedEmails.length}):
${selectedEmails.join('\n')}

En copia CC (${ccEmails.length}):
${ccEmails.length > 0 ? ccEmails.join('\n') : 'Ninguno'}`;

    if (!window.confirm(confirmMessage)) return;

    try {
      setIsSending(true);
      setFeedback(null);

      // Guardar configuración primero
      await handleSaveConfig();

      // Construcción del HTML corporativo para el correo
      const formattedHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #f8fafc; padding: 24px; border-radius: 12px;">
          <div style="background-color: #0f172a; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">Arquímedes Carrizo - Logística</h1>
            <p style="color: #94a3b8; margin: 6px 0 0 0; font-size: 13px;">Aviso de Despacho y Condiciones de Recepción</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
            <div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #334155;">
${parsedPreviewText}
            </div>

            <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #64748b; text-align: center;">
              <p style="margin: 0;">Este es un mensaje automático de control logístico emitido para el Remito <strong>#${remitoRef}</strong>.</p>
              <p style="margin: 4px 0 0 0;">Arquímedes Carrizo S.A. - Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      `;

      // Llamada al webhook de n8n
      const n8nWebhookUrl = "https://hzerdan.app.n8n.cloud/webhook/envia-email-desde-frontend";
      const allToEmailsString = selectedEmails.join(', ');
      const allCcEmailsString = ccEmails.join(', ');

      const payload = {
        inspectorEmail: allToEmailsString, // Compatible con toEmail del nodo n8n
        toEmail: allToEmailsString,
        ccEmail: allCcEmailsString,
        subject: `Aviso de Arribo y Disclaimer de Recepción - Remito #${remitoRef} (${cliente?.razon_social || 'Cliente'})`,
        htmlBody: formattedHtml,
        remitoId: remitoId,
        clienteNombre: cliente?.razon_social || 'Cliente'
      };

      const webhookRes = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer 753159*Arquimedes'
        },
        body: JSON.stringify(payload)
      });

      if (!webhookRes.ok) {
        const errorText = await webhookRes.text();
        throw new Error(`Error en el servicio de correo (${webhookRes.status}): ${errorText}`);
      }

      const nowIso = new Date().toISOString();
      const currentUserEmail = user?.email || 'admin';

      // Actualizar remito en base de datos
      const { error: dbUpdateError } = await supabase
        .from('remitos')
        .update({
          disclaimer_enviado_at: nowIso,
          disclaimer_enviado_por: currentUserEmail,
          updated_at: nowIso
        })
        .eq('id', remitoId);

      if (dbUpdateError) {
        console.error('Error actualizando fecha de envío en remitos:', dbUpdateError);
      }

      // Registro en historial_eventos para auditoría
      await supabase.from('historial_eventos').insert([
        {
          event_type: 'ENVIO_DISCLAIMER_CLIENTE',
          description: `Disclaimer enviado al cliente para Remito #${remitoRef}`,
          user_actor: currentUserEmail,
          details: {
            destinatarios: selectedEmails,
            cc_personal: ccEmails,
            template_id: selectedTemplateId,
            template_titulo: currentTemplate.titulo
          }
        }
      ]);

      setEnviadoAt(nowIso);
      setEnviadoPor(currentUserEmail);
      setFeedback({ 
        type: 'success', 
        message: `¡Correo enviado exitosamente a ${selectedEmails.length} dirección(es)${ccEmails.length > 0 ? ` y ${ccEmails.length} en copia` : ''}!` 
      });

      if (onUpdateSuccess) onUpdateSuccess();
    } catch (err: any) {
      console.error('Error enviando disclaimer:', err);
      setFeedback({ type: 'error', message: err.message || 'Error al enviar el correo.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header colapsable */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-5 flex items-center justify-between cursor-pointer bg-slate-50/70 hover:bg-slate-100/70 transition-colors border-b border-gray-100"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-sm md:text-base">
                Aviso y Disclaimer de Recepción al Cliente (24hs)
              </h3>
              {enviadoAt ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enviado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock className="w-3.5 h-3.5" />
                  Pendiente de Envío
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Notificación previa a la descarga con condiciones de recepción y plazo para reclamos.
            </p>
          </div>
        </div>

        <button type="button" className="text-gray-400 hover:text-gray-600 p-1">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* Contenido expandido */}
      {isExpanded && (
        <div className="p-6 space-y-6">
          {feedback && (
            <div className={`p-4 rounded-xl flex items-center gap-2 text-sm font-medium ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Estado de último envío si ya ocurrió */}
          {enviadoAt && (
            <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-900">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>
                  Último envío realizado el <strong>{new Date(enviadoAt).toLocaleString('es-AR')}</strong>
                  {enviadoPor && <> por <strong>{enviadoPor}</strong></>}.
                </span>
              </div>
              <span className="text-[11px] text-emerald-700 italic">
                (Puedes volver a enviarlo si necesitas notificar nuevamente)
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna Izquierda: Plantilla y Destinatarios */}
            <div className="space-y-5">
              {/* Selector de Plantilla */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Plantilla de Disclaimer</span>
                  {currentTemplate?.codigo && (
                    <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {currentTemplate.codigo}
                    </span>
                  )}
                </label>
                {loadingTemplates ? (
                  <div className="flex items-center gap-2 p-2.5 text-xs text-gray-400 border border-gray-200 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    Cargando plantillas...
                  </div>
                ) : (
                  <select
                    value={selectedTemplateId || ''}
                    onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                    className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.titulo}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Emails del Cliente (Hasta 3) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Direcciones de Email del Cliente (Destinatarios)
                </label>
                
                {clientEmailsAvailable.length > 0 ? (
                  <div className="space-y-2">
                    {clientEmailsAvailable.map((item) => {
                      const isChecked = selectedEmails.includes(item.email);
                      return (
                        <label 
                          key={item.key}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-sm cursor-pointer transition-all ${
                            isChecked 
                              ? 'bg-blue-50/60 border-blue-200 text-blue-900 font-medium' 
                              : 'bg-gray-50/60 border-gray-200 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input 
                              type="checkbox" 
                              checked={isChecked} 
                              onChange={() => toggleEmail(item.email)}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <div>
                              <div className="text-xs text-gray-400 font-semibold">{item.label}</div>
                              <div>{item.email}</div>
                            </div>
                          </div>
                          {isChecked && <Check className="w-4 h-4 text-blue-600" />}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                    El cliente no tiene emails cargados en su ficha. Puedes agregar uno manual abajo.
                  </div>
                )}

                {/* Emails adicionales manuales */}
                <div className="pt-2">
                  <div className="flex gap-2">
                    <input 
                      type="email"
                      placeholder="Agregar otro correo destinatario..."
                      value={customEmailInput}
                      onChange={(e) => setCustomEmailInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomEmail(); }}}
                      className="flex-1 p-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addCustomEmail}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>

                  {/* Badges de otros emails seleccionados */}
                  {selectedEmails.filter(e => !clientEmailsAvailable.some(c => c.email === e)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedEmails.filter(e => !clientEmailsAvailable.some(c => c.email === e)).map(e => (
                        <span key={e} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-full border border-slate-200">
                          {e}
                          <button type="button" onClick={() => removeCustomEmail(e)} className="text-gray-400 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Copia a Personal de AC (CC) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  En Copia (CC) - Personal de AC
                </label>
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2 divide-y divide-gray-100 bg-white">
                  {personalAcList && personalAcList.length > 0 ? (
                    personalAcList.map(p => {
                      const isCc = selectedCcIds.includes(p.id);
                      return (
                        <label 
                          key={p.id}
                          className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox"
                              checked={isCc}
                              onChange={() => toggleCcPersonal(p.id)}
                              className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <div>
                              <span className="font-medium text-gray-800">{p.nombre}</span>
                              {p.email && <span className="text-gray-400 ml-1.5">({p.email})</span>}
                            </div>
                          </div>
                          {p.rol && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                              {p.rol}
                            </span>
                          )}
                        </label>
                      );
                    })
                  ) : (
                    <p className="text-xs text-gray-400 p-2 text-center">No hay personal de AC disponible.</p>
                  )}
                </div>
              </div>

              {/* Fecha estimada de arribo / envío automático */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Fecha/Hora Prevista de Envío o Arribo
                </label>
                <DateTimePicker 
                  value={fechaProgramada}
                  onChange={(val) => setFechaProgramada(val)}
                />
              </div>
            </div>

            {/* Columna Derecha: Vista Previa y Botón de Disparo */}
            <div className="flex flex-col justify-between space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Previsualización del Disclaimer
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-500 font-mono">
                    Remito: #{remitoRef}
                  </span>
                </div>

                <div className="mt-3 p-4 bg-white rounded-lg border border-slate-200 text-xs text-gray-800 font-sans leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto shadow-2xs">
                  {parsedPreviewText || (
                    <span className="text-gray-400 italic">Selecciona una plantilla para ver la previsualización...</span>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-gray-500 space-y-1">
                  <div><strong>Destinatarios seleccionados:</strong> {selectedEmails.length > 0 ? selectedEmails.join(', ') : <span className="text-red-500 font-semibold">Ninguno</span>}</div>
                  <div><strong>En copia CC:</strong> {selectedCcIds.length > 0 ? personalAcList.filter(p => selectedCcIds.includes(p.id)).map(p => p.nombre).join(', ') : 'Ninguno'}</div>
                </div>
              </div>

              {/* Botonera de Acciones */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSaving || isSending}
                  className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Guardar Configuración</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendDisclaimerNow}
                  disabled={isSending || isSaving || selectedEmails.length === 0}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-50 cursor-pointer"
                  title={selectedEmails.length === 0 ? 'Selecciona al menos un destinatario' : 'Enviar disclaimer inmediatamente al cliente'}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando Correo...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{enviadoAt ? 'Reenviar Disclaimer al Cliente' : 'Enviar Disclaimer al Cliente Ahora'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
