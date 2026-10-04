/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  User,
  CalendarClock,
  Package,
  FileCheck2,
  Upload,
  Loader2,
  FileText,
  ExternalLink,
  CheckCircle2,
  Download,
  Mail,
  Trash2,
  AlertTriangle,
  Save,
  MapPin,
  ArrowRight,
  Edit3,
  Check,
  Plus,
  MessageSquare,
  UserCheck,
  Send,
  Bell
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../../../lib/utils';
import { supabase } from '../../../lib/supabase';
import type { InspeccionKanban, StateDefinition, PlanillaRecibida, InspeccionTemplate } from '../types';

interface InspeccionDetailDrawerProps {
  isOpen: boolean;
  inspeccion: InspeccionKanban | null;
  stateDefs: StateDefinition[];
  onClose: () => void;
  onDataChanged: () => void;
  usuarioActor: string;
}

const STORAGE_BUCKET = 'inspecciones_adjuntos';

export function InspeccionDetailDrawer({
  isOpen,
  inspeccion,
  stateDefs,
  onClose,
  onDataChanged,
  usuarioActor,
}: InspeccionDetailDrawerProps) {
  // Navigation Tabs for Document Management
  const [activeDocTab, setActiveDocTab] = useState<'INSPECTOR' | 'SUPERVISOR'>('INSPECTOR');

  const [uploading, setUploading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supervisor specific file inputs and states
  const [selectedFileSupervisor, setSelectedFileSupervisor] = useState<File | null>(null);
  const [uploadingSupervisor, setUploadingSupervisor] = useState(false);
  const fileInputSupervisorRef = useRef<HTMLInputElement>(null);

  const [selectedFileSupervisorCompletada, setSelectedFileSupervisorCompletada] = useState<File | null>(null);
  const [uploadingSupervisorCompletada, setUploadingSupervisorCompletada] = useState(false);
  const fileInputSupervisorCompletadaRef = useRef<HTMLInputElement>(null);

  const [sendingEmailSupervisor, setSendingEmailSupervisor] = useState(false);
  const [testingAlertaSup48, setTestingAlertaSup48] = useState(false);

  const [dbData, setDbData] = useState<any>(null);
  const [loadingDbData, setLoadingDbData] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Lists for dropdowns
  const [inspectores, setInspectores] = useState<{ id: number; nombre: string }[]>([]);
  const [operadores, setOperadores] = useState<{ id: number; nombre: string }[]>([]);
  const [depositos, setDepositos] = useState<{ id: number; nombre: string }[]>([]);
  const [supervisorTemplates, setSupervisorTemplates] = useState<InspeccionTemplate[]>([]);
  
  // Edit State
  const [editForm, setEditForm] = useState<{
    inspector_id: number | '';
    operador_id: number | '';
    lugar_carga_id: number | '';
    fecha_hora_carga_pactada: string;
    template_supervisor_id: number | '';
  }>({
    inspector_id: '',
    operador_id: '',
    lugar_carga_id: '',
    fecha_hora_carga_pactada: '',
    template_supervisor_id: ''
  });
  const [isSavingData, setIsSavingData] = useState(false);
  const [validationNotes, setValidationNotes] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingAlertaT24, setTestingAlertaT24] = useState(false);
  const [testingAlertaPost24, setTestingAlertaPost24] = useState(false);

  // Multi-planilla states (Inspector)
  const [planillasList, setPlanillasList] = useState<PlanillaRecibida[]>([]);
  const [uploadEtiqueta, setUploadEtiqueta] = useState('');
  const [editingPlanillaId, setEditingPlanillaId] = useState<number | null>(null);
  const [editingLabelText, setEditingLabelText] = useState('');
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [isAdvancingException, setIsAdvancingException] = useState(false);

  // WhatsApp states
  const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState<'INSPECTOR' | 'SUPERVISOR'>('INSPECTOR');
  const [whatsappDraftText, setWhatsappDraftText] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  const fetchPlanillas = useCallback(async (insId?: number) => {
    const targetId = insId || inspeccion?.id;
    if (!targetId) return;
    const { data: pData } = await supabase
      .from('inspeccion_planillas_recibidas')
      .select('*')
      .eq('inspeccion_id', targetId)
      .order('id', { ascending: true });
    setPlanillasList((pData as PlanillaRecibida[]) || []);
  }, [inspeccion?.id]);

  useEffect(() => {
    if (isOpen && inspeccion) {
      setLoadingDbData(true);
      fetchPlanillas(inspeccion.id);
      const isEditablePhase = ['3.D0', '3.D1', '3.D2'].includes(inspeccion.state_code);
      
      const fetchAll = async () => {
        try {
          const { data } = await supabase
            .from('inspecciones')
            .select('*, inspector:personal_ac!inspecciones_inspector_id_fkey(id, nombre_completo, email, celular), operador:personal_ac!inspecciones_operador_id_fkey(id, nombre_completo, email, celular), lugar_carga:depositos(id, nombre)')
            .eq('id', inspeccion.id)
            .single();

          let template_url = null;
          let template_supervisor_url = null;

          if (data && data.template_id) {
            const { data: tData } = await supabase
              .from('inspeccion_templates')
              .select('archivo_url')
              .eq('id', data.template_id)
              .single();
            template_url = tData?.archivo_url;
          }

          if (data && data.template_supervisor_id) {
            const { data: stData } = await supabase
              .from('inspeccion_templates')
              .select('archivo_url, nombre, codigo')
              .eq('id', data.template_supervisor_id)
              .single();
            template_supervisor_url = stData?.archivo_url;
          }

          setDbData({ ...data, template_url, template_supervisor_url });
          
          if (data) {
            // format datetime-local input string: "YYYY-MM-DDTHH:mm"
            let formattedDate = '';
            if (data.fecha_hora_carga_pactada) {
               const d = new Date(data.fecha_hora_carga_pactada);
               const yr = d.getFullYear();
               const mo = String(d.getMonth() + 1).padStart(2, '0');
               const da = String(d.getDate()).padStart(2, '0');
               const hr = String(d.getHours()).padStart(2, '0');
               const mi = String(d.getMinutes()).padStart(2, '0');
               formattedDate = `${yr}-${mo}-${da}T${hr}:${mi}`;
            }
            
            setEditForm({
              inspector_id: data.inspector_id || '',
              operador_id: data.operador_id || '',
              lugar_carga_id: data.lugar_carga_id || '',
              fecha_hora_carga_pactada: formattedDate,
              template_supervisor_id: data.template_supervisor_id || ''
            });
          }

          // Fetch supervisor templates
          const { data: supTpls } = await supabase
            .from('inspeccion_templates')
            .select('id, codigo, nombre, archivo_url')
            .eq('rol_responsable', 'Supervisor')
            .eq('activo', true)
            .order('nombre');
          if (supTpls) {
            setSupervisorTemplates(supTpls as InspeccionTemplate[]);
          }

          if (isEditablePhase) {
            const [inspRes, opRes, depRes] = await Promise.all([
              supabase.from('personal_ac_roles').select('personal_ac_id, personal_ac!inner(id, nombre_completo)').eq('role_id', 6),
              supabase.from('personal_ac_roles').select('personal_ac_id, personal_ac!inner(id, nombre_completo)').in('role_id', [3, 5, 7, 8]),
              supabase.from('depositos').select('id, nombre').order('nombre')
            ]);
            
            if (inspRes.data) {
              const mapped = (inspRes.data as any[]).map(r => ({
                id: r.personal_ac.id,
                nombre: r.personal_ac.nombre_completo,
              }));
              const unique = Array.from(new Map(mapped.map(m => [m.id, m])).values());
              setInspectores(unique);
            }
            if (opRes.data) {
              const mappedOp = (opRes.data as any[]).map(r => ({
                id: r.personal_ac.id,
                nombre: r.personal_ac.nombre_completo,
              }));
              const uniqueOp = Array.from(new Map(mappedOp.map(m => [m.id, m])).values());
              setOperadores(uniqueOp);
            }
            if (depRes.data) {
              setDepositos(depRes.data);
            }
          }
        } catch (error) {
          console.error("Error fetching dependencies:", error);
        } finally {
          setLoadingDbData(false);
        }
      };
      
      fetchAll();
    } else {
      setDbData(null);
      setValidationNotes('');
      setActiveDocTab('INSPECTOR');
    }

  }, [isOpen, inspeccion, fetchPlanillas]);

  if (!inspeccion) return null;

  const currentState = stateDefs.find(s => s.state_code === inspeccion.state_code);
  const isEditablePhase = ['3.D0', '3.D1', '3.D2'].includes(inspeccion.state_code);
  const isTerminalState = ['3.D4', '3.D5'].includes(inspeccion.state_code);

  const fechaFormatted = (() => {
    try {
      return format(parseISO(inspeccion.fecha_pactada), "EEEE dd 'de' MMMM yyyy · HH:mm", { locale: es });
    } catch {
      return inspeccion.fecha_pactada || '—';
    }
  })();

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(e.target.files?.[0] ?? null);
  };

  const handleDownloadMaestra = async () => {
    if (!inspeccion || !dbData?.template_url) return;
    
    await supabase.rpc('registrar_descarga_planilla_inspeccion', {
      p_inspeccion_id: inspeccion.id,
      p_usuario_actor: usuarioActor || 'OPERADOR'
    });
    
    window.open(dbData.template_url, '_blank');
  };

  const handleDownloadMaestraSupervisor = async () => {
    if (!inspeccion || !dbData?.template_supervisor_url) return;
    
    await supabase.rpc('log_inspeccion_evento', {
      p_inspeccion_id: inspeccion.id,
      p_accion: 'DESCARGA_PLANTILLA_MAESTRA_SUPERVISOR',
      p_usuario_actor: usuarioActor || 'OPERADOR',
      p_detalles: { url: dbData.template_supervisor_url }
    });
    
    window.open(dbData.template_supervisor_url, '_blank');
  };

  const handleAsignarPlantillaSupervisor = async (newTemplateId: number | null) => {
    if (!inspeccion) return;
    try {
      const selectedTpl = supervisorTemplates.find(t => t.id === newTemplateId);
      const newUrl = selectedTpl?.archivo_url || null;

      const { error: updErr } = await supabase
        .from('inspecciones')
        .update({ template_supervisor_id: newTemplateId })
        .eq('id', inspeccion.id);

      if (updErr) throw updErr;

      setDbData((prev: any) => ({
        ...prev,
        template_supervisor_id: newTemplateId,
        template_supervisor_url: newUrl
      }));
      setEditForm((prev) => ({
        ...prev,
        template_supervisor_id: newTemplateId || ''
      }));

      showToast('success', newTemplateId ? 'Plantilla de supervisor asignada exitosamente.' : 'Plantilla de supervisor desvinculada.');
      onDataChanged();
    } catch (err: any) {
      console.error('Error al asignar plantilla de supervisor:', err);
      showToast('error', `Error al asignar plantilla: ${err.message || 'Error desconocido'}`);
    }
  };

  const handleEdgeFunctionEmail = async () => {
    if (!inspeccion) return;
    
    const inspectorEmail = dbData?.inspector?.email;
    if (!inspectorEmail) {
      showToast('error', 'El inspector no tiene un email configurado en el sistema.');
      return;
    }

    try {
      setSendingEmail(true);
      setShowEmailConfirm(false);
      
      const payload = { 
        inspeccionId: inspeccion.id,
        origin: window.location.origin
      };
      
      const { data, error } = await supabase.functions.invoke('send-inspection-email', {
        body: payload,
      });

      if (error) {
        let errorMsg = error.message;
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json();
            if (errBody?.error) errorMsg = errBody.error;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      console.log("Respuesta de send-inspection-email:", data);
      showToast('success', 'Correo enviado al inspector. Enlace mágico re-generado.');
      onDataChanged();
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      console.error("Excepción en handleEdgeFunctionEmail:", err);
      showToast('error', `Error al enviar correo: ${err.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleSendEmailSupervisor = async () => {
    if (!inspeccion) return;
    const opEmail = dbData?.operador?.email;
    if (!opEmail) {
      showToast('error', 'El supervisor no tiene un email configurado en el sistema.');
      return;
    }

    try {
      setSendingEmailSupervisor(true);
      const { data, error } = await supabase.rpc('enviar_alerta_supervisor', {
        p_inspeccion_id: inspeccion.id,
        p_tipo_alerta: 'ASIGNACION',
        p_usuario_actor: usuarioActor
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Error al enviar alerta a supervisor');
      }

      showToast('success', 'Correo de asignación enviado al supervisor.');
      onDataChanged();
    } catch (err: any) {
      console.error('Error enviando email a supervisor:', err);
      showToast('error', `Error al enviar correo: ${err.message || 'Error desconocido'}`);
    } finally {
      setSendingEmailSupervisor(false);
    }
  };

  const handleDelete = async () => {
    if (!inspeccion) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la inspección #INS-${inspeccion.id}? Esta acción no se puede deshacer.`)) return;
    
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('inspecciones').delete().eq('id', inspeccion.id);
      if (error) throw error;
      
      showToast('success', 'Inspección eliminada correctamente.');
      onDataChanged();
      onClose();
    } catch (err: any) {
      showToast('error', `Error al eliminar: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleSaveData = async () => {
    if (!inspeccion) return;
    if (!editForm.inspector_id || !editForm.lugar_carga_id || !editForm.fecha_hora_carga_pactada) {
       showToast('error', 'Todos los campos obligatorios deben estar completos.');
       return;
    }
    
    try {
      setIsSavingData(true);
      const { error } = await supabase.rpc('actualizar_datos_inspeccion', {
         p_id: inspeccion.id,
         p_fecha: new Date(editForm.fecha_hora_carga_pactada).toISOString(),
         p_lugar_id: editForm.lugar_carga_id,
         p_inspector_id: editForm.inspector_id,
         p_usuario_actor: usuarioActor,
         p_operador_id: editForm.operador_id ? Number(editForm.operador_id) : null
      });
      if (error) throw error;

      // Actualizar template_supervisor_id si cambió
      const newTemplateSupId = editForm.template_supervisor_id ? Number(editForm.template_supervisor_id) : null;
      const { error: updErr } = await supabase
        .from('inspecciones')
        .update({ template_supervisor_id: newTemplateSupId })
        .eq('id', inspeccion.id);
      if (updErr) console.error('Error actualizando template_supervisor_id:', updErr);
      
      showToast('success', 'Datos actualizados correctamente.');
      onDataChanged();
    } catch (err: any) {
      showToast('error', `Error al actualizar: ${err.message}`);
    } finally {
      setIsSavingData(false);
    }
  };
  
  const handleTransitionD2 = async () => {
     if (!inspeccion) return;
     try {
       setIsSavingData(true);
       const { error } = await supabase.rpc('inspeccion_intentar_transicion', {
          p_inspeccion_id: inspeccion.id,
          p_nuevo_estado_code: '3.D2',
          p_usuario_actor: usuarioActor
       });
       if (error) throw error;
       showToast('success', 'Confirmado. Estado movido a 3.D2.');
       onDataChanged();
       onClose();
     } catch (err: any) {
       showToast('error', `Error: ${err.message}`);
     } finally {
       setIsSavingData(false);
     }
  };

  const handleUploadPlanillaPersonalizada = async () => {
    if (!selectedFile || !inspeccion) return;

    try {
      setUploading(true);
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `personalizadas/planilla_ins_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('inspecciones')
        .update({ planilla_personalizada_url: publicUrl })
        .eq('id', inspeccion.id);

      if (updateError) throw updateError;

      setDbData((prev: any) => ({ ...prev, planilla_personalizada_url: publicUrl }));
      showToast('success', 'Planilla personalizada del inspector guardada.');

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onDataChanged();
    } catch (err: any) {
      console.error('Error uploading customized planilla:', err);
      showToast('error', `Error al subir la planilla personalizada: ${err.message || 'Error desconocido'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPlanillaSupervisorPersonalizada = async () => {
    if (!selectedFileSupervisor || !inspeccion) return;

    try {
      setUploadingSupervisor(true);
      const ext = selectedFileSupervisor.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `supervisor/personalizadas/planilla_sup_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFileSupervisor, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('inspecciones')
        .update({ planilla_supervisor_personalizada_url: publicUrl })
        .eq('id', inspeccion.id);

      if (updateError) throw updateError;

      setDbData((prev: any) => ({ ...prev, planilla_supervisor_personalizada_url: publicUrl }));
      showToast('success', 'Planilla personalizada del supervisor guardada.');

      setSelectedFileSupervisor(null);
      if (fileInputSupervisorRef.current) fileInputSupervisorRef.current.value = '';
      onDataChanged();
    } catch (err: any) {
      console.error('Error uploading customized supervisor planilla:', err);
      showToast('error', `Error al subir planilla del supervisor: ${err.message || 'Error desconocido'}`);
    } finally {
      setUploadingSupervisor(false);
    }
  };

  const handleUploadPlanillaSupervisorCompletada = async () => {
    if (!selectedFileSupervisorCompletada || !inspeccion) return;

    try {
      setUploadingSupervisorCompletada(true);
      const ext = selectedFileSupervisorCompletada.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `supervisor/completadas/planilla_sup_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFileSupervisorCompletada, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('inspecciones')
        .update({ planilla_supervisor_completada_url: publicUrl })
        .eq('id', inspeccion.id);

      if (updateError) throw updateError;

      await supabase.rpc('log_inspeccion_evento', {
        p_inspeccion_id: inspeccion.id,
        p_accion: 'PLANILLA_SUPERVISOR_SUBIDA_INTERNO',
        p_usuario_actor: usuarioActor,
        p_detalles: { archivo_url: publicUrl, nombre_archivo: selectedFileSupervisorCompletada.name }
      });

      setDbData((prev: any) => ({ ...prev, planilla_supervisor_completada_url: publicUrl }));
      showToast('success', 'Planilla completada del supervisor adjuntada con éxito.');

      setSelectedFileSupervisorCompletada(null);
      if (fileInputSupervisorCompletadaRef.current) fileInputSupervisorCompletadaRef.current.value = '';
      onDataChanged();
    } catch (err: any) {
      console.error('Error uploading completed supervisor planilla:', err);
      showToast('error', `Error al subir planilla completada: ${err.message || 'Error desconocido'}`);
    } finally {
      setUploadingSupervisorCompletada(false);
    }
  };

  const handleUploadPlanillaRecibida = async () => {
    if (!selectedFile || !inspeccion) return;

    try {
      setUploading(true);
      const ext = selectedFile.name.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const storagePath = `completadas/planilla_ins_${inspeccion.id}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, selectedFile, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;

      const defaultTag = `Planilla #${planillasList.length + 1}`;
      const tagToUse = uploadEtiqueta.trim() || defaultTag;

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('registrar_planilla_recibida', {
        p_inspeccion_id: inspeccion.id,
        p_archivo_url: publicUrl,
        p_nombre_archivo: selectedFile.name,
        p_etiqueta: tagToUse,
        p_usuario_actor: usuarioActor
      });

      if (rpcErr) throw rpcErr;

      if (rpcRes?.transicion_automatica) {
        showToast('success', `Planilla subida (${rpcRes.cant_recibidas}/${rpcRes.cant_requeridas}). Transición automática a 3.D3 (En Revisión).`);
      } else {
        showToast('success', `Planilla "${tagToUse}" recibida (${rpcRes?.cant_recibidas || planillasList.length + 1}/${rpcRes?.cant_requeridas || 1}).`);
      }

      setSelectedFile(null);
      setUploadEtiqueta('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      fetchPlanillas(inspeccion.id);
      onDataChanged();
    } catch (err: any) {
      console.error('Error uploading planilla:', err);
      showToast('error', `Error al subir la planilla: ${err.message || 'Error desconocido'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePlanillaRecibida = async (planillaId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta planilla recibida?')) return;
    try {
      const { error } = await supabase.rpc('eliminar_planilla_recibida', {
        p_planilla_id: planillaId,
        p_usuario_actor: usuarioActor
      });
      if (error) throw error;
      showToast('success', 'Planilla eliminada correctamente.');
      fetchPlanillas();
      onDataChanged();
    } catch (err: any) {
      showToast('error', `Error al eliminar la planilla: ${err.message}`);
    }
  };

  const handleSavePlanillaLabel = async (planillaId: number) => {
    if (!editingLabelText.trim()) return;
    try {
      const { error } = await supabase.rpc('actualizar_etiqueta_planilla', {
        p_planilla_id: planillaId,
        p_etiqueta: editingLabelText.trim()
      });
      if (error) throw error;
      showToast('success', 'Etiqueta actualizada.');
      setEditingPlanillaId(null);
      fetchPlanillas();
      onDataChanged();
    } catch (err: any) {
      showToast('error', `Error al actualizar etiqueta: ${err.message}`);
    }
  };

  const handleAvanzarPorExcepcion = async () => {
    if (!exceptionReason.trim()) {
      showToast('error', 'Debe indicar un motivo obligatorio para el avance por excepción.');
      return;
    }
    if (!inspeccion) return;

    try {
      setIsAdvancingException(true);
      await supabase.rpc('log_inspeccion_evento', {
        p_inspeccion_id: inspeccion.id,
        p_estado_anterior_id: null,
        p_nuevo_estado_id: null,
        p_evento_tipo: 'AVANCE_EXCEPCION_PLANILLAS',
        p_usuario_actor: usuarioActor,
        p_metadata: {
          motivo: exceptionReason.trim(),
          recibidas: planillasList.length,
          requeridas: inspeccion.cantidad_plantillas_requeridas
        }
      });

      const { error } = await supabase.rpc('inspeccion_intentar_transicion', {
        p_inspeccion_id: inspeccion.id,
        p_nuevo_estado_code: '3.D3',
        p_usuario_actor: usuarioActor
      });

      if (error) throw error;

      showToast('success', 'Avance por excepción grabado. Inspección en estado 3.D3.');
      setShowExceptionModal(false);
      setExceptionReason('');
      onDataChanged();
      onClose();
    } catch (err: any) {
      showToast('error', `Error al avanzar por excepción: ${err.message}`);
    } finally {
      setIsAdvancingException(false);
    }
  };

  const handleOpenWhatsAppInspectorModal = async () => {
    if (!inspeccion) return;
    const inspectorName = dbData?.inspector?.nombre_completo || inspeccion.inspector_nombre || 'Inspector';
    const lugarNombre = dbData?.lugar_carga?.nombre || 'Depósito asignado';

    let portalUrl = '';
    try {
      const { data: mlData, error: mlError } = await supabase.rpc('crear_o_renovar_magic_link_inspeccion', {
        p_inspeccion_id: inspeccion.id,
        p_usuario_actor: usuarioActor
      });
      if (mlError) throw mlError;
      portalUrl = `${window.location.origin}/inspect/${mlData?.token}`;
    } catch (e) {
      console.error('Error generando magic link para WhatsApp:', e);
      portalUrl = `${window.location.origin}/inspect/`;
    }

    const draft = `Hola *${inspectorName}*, te enviamos la información para la inspección documental:

📋 *Inspección:* #INS-${inspeccion.id}
🏢 *Servicio:* ${inspeccion.servicio_nombre || 'Servicio de Inspección'}
📍 *Lugar de Carga:* ${lugarNombre}
🗓️ *Fecha Pactada:* ${fechaFormatted}
📄 *Planillas Requeridas:* ${inspeccion.cantidad_plantillas_requeridas || 1} unidad(es)

🔗 *Acceso Seguro al Portal:*
${portalUrl}

Por favor, ingresa al enlace para descargar la plantilla de trabajo y subir las planillas completadas una vez finalizada la inspección.

⚠️ *IMPORTANTE:* Por favor, NO responder a este mensaje automático por WhatsApp.`;

    setWhatsappTarget('INSPECTOR');
    setWhatsappDraftText(draft);
    setShowWhatsAppConfirm(true);
  };

  const handleOpenWhatsAppSupervisorModal = async () => {
    if (!inspeccion) return;
    const supervisorName = dbData?.operador?.nombre_completo || 'Supervisor';
    const lugarNombre = dbData?.lugar_carga?.nombre || 'Depósito asignado';

    let portalUrl = '';
    try {
      const { data: mlData, error: mlError } = await supabase.rpc('crear_o_renovar_magic_link_supervisor', {
        p_inspeccion_id: inspeccion.id,
        p_usuario_actor: usuarioActor
      });
      if (mlError) throw mlError;
      portalUrl = `${window.location.origin}/inspect/${mlData?.token}`;
    } catch (e) {
      console.error('Error generando magic link supervisor para WhatsApp:', e);
      portalUrl = `${window.location.origin}/inspect/`;
    }

    const draft = `Hola *${supervisorName}*, te enviamos la información para la supervisión documental:

📋 *Inspección:* #INS-${inspeccion.id}
🏢 *Servicio:* ${inspeccion.servicio_nombre || 'Servicio de Inspección'}
📍 *Lugar de Carga:* ${lugarNombre}
🗓️ *Fecha Pactada:* ${fechaFormatted}
👤 *Inspector:* ${dbData?.inspector?.nombre_completo || inspeccion.inspector_nombre || 'Asignado'}

🔗 *Acceso Seguro al Portal de Supervisión:*
${portalUrl}

Por favor, ingresa al enlace para descargar tu planilla de supervisión y subirla completada una vez finalizada la operación.

⚠️ *IMPORTANTE:* Por favor, NO responder a este mensaje automático por WhatsApp.`;

    setWhatsappTarget('SUPERVISOR');
    setWhatsappDraftText(draft);
    setShowWhatsAppConfirm(true);
  };

  const handleTestTelegramAlert = async () => {
    if (!inspeccion) return;
    try {
      setTestingTelegram(true);
      const { error } = await supabase.rpc('probar_alerta_telegram_inspeccion', {
        p_inspeccion_id: inspeccion.id,
        p_usuario_actor: usuarioActor
      });
      if (error) throw error;
      showToast('success', 'Alerta de prueba enviada al grupo de Telegram.');
    } catch (err: any) {
      console.error('Error enviando alerta Telegram:', err);
      showToast('error', `Error al enviar alerta Telegram: ${err.message || 'Error desconocido'}`);
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleTriggerInspectorAlert = async (tipoAlerta: 'RECORDATORIO_PREVIO_24H' | 'RECORDATORIO_PLANILLAS_POST_24H') => {
    if (!inspeccion) return;
    const isPrevia = tipoAlerta === 'RECORDATORIO_PREVIO_24H';
    try {
      if (isPrevia) setTestingAlertaT24(true);
      else setTestingAlertaPost24(true);

      const { data, error } = await supabase.rpc('enviar_alerta_inspector', {
        p_inspeccion_id: inspeccion.id,
        p_tipo_alerta: tipoAlerta,
        p_usuario_actor: usuarioActor
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Error al procesar la alerta');
      }

      showToast('success', isPrevia ? 'Alerta T-24h enviada al inspector con éxito.' : 'Recordatorio T+24h de planillas enviado con éxito.');
      onDataChanged();
      
      const { data: refreshed } = await supabase
        .from('inspecciones')
        .select('*, inspector:personal_ac!inspecciones_inspector_id_fkey(id, nombre_completo, email, celular), operador:personal_ac!inspecciones_operador_id_fkey(id, nombre_completo, email, celular), lugar_carga:depositos(id, nombre)')
        .eq('id', inspeccion.id)
        .single();
      if (refreshed) {
        setDbData((prev: any) => ({ ...prev, ...refreshed }));
      }
    } catch (err: any) {
      console.error('Error enviando alerta a inspector:', err);
      showToast('error', `Error al enviar alerta: ${err.message || 'Error desconocido'}`);
    } finally {
      if (isPrevia) setTestingAlertaT24(false);
      else setTestingAlertaPost24(false);
    }
  };

  const handleTriggerSupervisorAlert48 = async () => {
    if (!inspeccion) return;
    try {
      setTestingAlertaSup48(true);
      const { data, error } = await supabase.rpc('enviar_alerta_supervisor', {
        p_inspeccion_id: inspeccion.id,
        p_tipo_alerta: 'RECORDATORIO_PLANILLAS_POST_48H',
        p_usuario_actor: usuarioActor
      });

      if (error) throw error;
      if (data && !(data as any).success) {
        throw new Error((data as any).error || 'Error al procesar alerta T+48h');
      }

      showToast('success', 'Alerta T+48h enviada al supervisor con éxito.');
      onDataChanged();

      const { data: refreshed } = await supabase
        .from('inspecciones')
        .select('*, inspector:personal_ac!inspecciones_inspector_id_fkey(id, nombre_completo, email, celular), operador:personal_ac!inspecciones_operador_id_fkey(id, nombre_completo, email, celular), lugar_carga:depositos(id, nombre)')
        .eq('id', inspeccion.id)
        .single();
      if (refreshed) {
        setDbData((prev: any) => ({ ...prev, ...refreshed }));
      }
    } catch (err: any) {
      console.error('Error enviando alerta T+48h al supervisor:', err);
      showToast('error', `Error al enviar alerta: ${err.message || 'Error desconocido'}`);
    } finally {
      setTestingAlertaSup48(false);
    }
  };

  const handleSendWhatsAppGeneral = async () => {
    if (!inspeccion) return;

    const isSupervisor = whatsappTarget === 'SUPERVISOR';
    const rawPhone = isSupervisor ? dbData?.operador?.celular : dbData?.inspector?.celular;
    const cleanPhone = (rawPhone || '').replace(/\D/g, '');

    if (!cleanPhone) {
      showToast('error', `El ${isSupervisor ? 'supervisor' : 'inspector'} no posee un número de celular configurado.`);
      return;
    }

    try {
      setSendingWhatsApp(true);

      const targetId = isSupervisor ? dbData?.operador?.id : dbData?.inspector?.id;
      const targetName = isSupervisor
        ? (dbData?.operador?.nombre_completo || 'Supervisor')
        : (dbData?.inspector?.nombre_completo || inspeccion.inspector_nombre || 'Inspector');

      let conversationId = null;
      if (!isSupervisor) {
        const { data: cId } = await supabase.rpc('get_or_create_conversation_for_inspector', {
          p_inspector_id: targetId,
          p_phone: cleanPhone,
          p_inspeccion_id: inspeccion.id
        });
        conversationId = cId;
      }

      const payload = {
        conversation_id: conversationId,
        conversation_key: cleanPhone,
        nombre_destinatario: targetName,
        sender_id: null,
        sender_email: usuarioActor,
        action: 'send_message',
        message: whatsappDraftText.trim(),
        metadata: {
          inspeccion_id: inspeccion.id,
          tipo_actor: isSupervisor ? 'SUPERVISOR' : 'INSPECTOR'
        }
      };

      const response = await fetch('https://hzerdan.app.n8n.cloud/webhook/whatsapp-salida-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Error al conectar con el servidor de envíos (n8n).');

      await supabase.rpc('log_inspeccion_evento', {
        p_inspeccion_id: inspeccion.id,
        p_accion: isSupervisor ? 'WHATSAPP_ENVIADO_SUPERVISOR' : 'WHATSAPP_ENVIADO_INSPECTOR',
        p_usuario_actor: usuarioActor,
        p_detalles: { celular: cleanPhone, mensaje: whatsappDraftText.trim(), target: whatsappTarget }
      });

      showToast('success', `Mensaje de WhatsApp enviado al ${isSupervisor ? 'supervisor' : 'inspector'}.`);
      setShowWhatsAppConfirm(false);

      if (!isSupervisor && inspeccion.state_code === '3.D0') {
        await supabase.rpc('inspeccion_intentar_transicion', {
          p_inspeccion_id: inspeccion.id,
          p_nuevo_estado_code: '3.D1',
          p_usuario_actor: usuarioActor
        });

        await supabase
          .from('inspecciones')
          .update({
            current_data: {
              ...(dbData?.current_data || {}),
              alerta_t_menos_24h_enviada: true,
              alerta_t_menos_24h_at: new Date().toISOString()
            }
          })
          .eq('id', inspeccion.id);
      }

      onDataChanged();
    } catch (err: any) {
      showToast('error', `Error al enviar WhatsApp: ${err.message}`);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const handleFinalize = async (resultado: 'OK' | 'NO_CONFORME') => {
    if (!inspeccion) return;
    if (resultado === 'NO_CONFORME' && !validationNotes.trim()) {
      showToast('error', 'Las notas de validación son obligatorias para marcar como No Conforme.');
      return;
    }

    try {
      setIsFinalizing(true);
      const { error } = await supabase.rpc('finalizar_inspeccion', {
        p_id: inspeccion.id,
        p_resultado: resultado,
        p_observaciones: validationNotes,
        p_usuario: usuarioActor
      });

      if (error) throw error;

      showToast('success', resultado === 'OK' ? 'Inspección aprobada con éxito' : 'Inspección marcada como No Conforme');
      onDataChanged();
      onClose();
    } catch (err: any) {
      showToast('error', `Error al finalizar la inspección: ${err.message}`);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 z-[110] px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full md:w-[500px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col border-l border-gray-200',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex-shrink-0">
          <div>
            <span className="text-xs font-bold text-gray-400 font-mono">#INS-{inspeccion.id}</span>
            <h2 className="text-lg font-bold text-gray-900">Detalle de Inspección</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 flex items-center gap-3">
            <FileCheck2 className="w-6 h-6 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-brand-600 font-semibold uppercase tracking-wider">Estado Documental</p>
              <p className="text-sm font-bold text-brand-900">
                {inspeccion.state_code}
                {currentState ? ` — ${currentState.name}` : ` — ${inspeccion.export_doc_status}`}
              </p>
            </div>
          </div>
          
          {isTerminalState && (
            <div className={cn(
              "rounded-xl p-5 border flex flex-col gap-3 shadow-md border-opacity-60",
              inspeccion.state_code === '3.D4' 
                ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                : "bg-orange-50 border-orange-200 text-orange-900"
            )}>
              <div className="flex items-center gap-2 font-black uppercase tracking-widest text-[10px]">
                {inspeccion.state_code === '3.D4' 
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : <AlertTriangle className="w-4 h-4 text-orange-600" />
                }
                Veredicto Final: {inspeccion.state_code === '3.D4' ? 'APROBADO' : 'NO CONFORME'}
              </div>
              {dbData?.current_data?.observaciones_finales ? (
                <div className="bg-white/50 p-3 rounded-lg border border-current border-opacity-10">
                  <p className="text-sm font-medium leading-relaxed">
                    {dbData.current_data.observaciones_finales}
                  </p>
                </div>
              ) : (
                <p className="text-sm italic opacity-60">Sin observaciones adicionales.</p>
              )}
            </div>
          )}

          {inspeccion.state_code === '3.D1' && (
             <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
                <p className="text-sm text-amber-800 font-medium">La inspección está actualmente coordinada. Una vez que inicie o finalice físicamente, confírmalo para moverla al estado de espera de resultados (3.D2).</p>
                <button
                   onClick={handleTransitionD2}
                   disabled={isSavingData}
                   className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 disabled:opacity-50 transition text-sm"
                >
                   {isSavingData ? <Loader2 className="animate-spin w-4 h-4"/> : <ArrowRight className="w-4 h-4" />}
                   Confirmar Carga Terminada Físicamente
                </button>
             </div>
          )}

          {/* MÓDULO DE VALIDACIÓN (3.D3) */}
          {inspeccion.state_code === '3.D3' && (
            <div className="bg-white border-2 border-brand-200 rounded-xl p-5 space-y-4 shadow-md bg-gradient-to-b from-brand-50/20 to-white">
              <div className="flex items-center gap-2 text-brand-700 mb-1">
                <FileCheck2 className="w-5 h-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Módulo de Validación</h3>
              </div>

              {/* Planilla Completada Inspector */}
              {dbData?.planilla_completada_url && (
                <div className="flex items-center justify-between p-3 bg-white border border-brand-100 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-500" />
                    <div>
                      <span className="text-sm font-semibold text-gray-700 block">Planilla del Inspector</span>
                      <span className="text-[10px] text-gray-400">Completada por el inspector</span>
                    </div>
                  </div>
                  <a 
                    href={dbData.planilla_completada_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-bold hover:bg-brand-700 transition flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver Reporte
                  </a>
                </div>
              )}

              {/* Planilla Completada Supervisor */}
              {dbData?.planilla_supervisor_completada_url && (
                <div className="flex items-center justify-between p-3 bg-white border border-purple-200 rounded-lg shadow-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-purple-600" />
                    <div>
                      <span className="text-sm font-semibold text-gray-700 block">Planilla del Supervisor</span>
                      <span className="text-[10px] text-gray-400">Completada por {dbData?.operador?.nombre_completo || 'Supervisor'}</span>
                    </div>
                  </div>
                  <a 
                    href={dbData.planilla_supervisor_completada_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-bold hover:bg-purple-700 transition flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver Reporte
                  </a>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Notas de Validación</label>
                <textarea
                  value={validationNotes}
                  onChange={(e) => setValidationNotes(e.target.value)}
                  placeholder="Escribe aquí los motivos de la decisión o comentarios adicionales..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none min-h-[100px] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleFinalize('NO_CONFORME')}
                  disabled={isFinalizing}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition disabled:opacity-50 text-sm"
                >
                  {isFinalizing ? <Loader2 className="animate-spin w-4 h-4"/> : <X className="w-4 h-4" />}
                  No Conforme
                </button>
                <button
                  onClick={() => handleFinalize('OK')}
                  disabled={isFinalizing}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition disabled:opacity-50 text-sm"
                >
                  {isFinalizing ? <Loader2 className="animate-spin w-4 h-4"/> : <CheckCircle2 className="w-4 h-4" />}
                  Aprobar
                </button>
              </div>
            </div>
          )}

          {/* EDITABLE FIELDS IN D0, D1, D2 */}
          {isEditablePhase ? (
             <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm relative">
                {loadingDbData && (
                   <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 rounded-xl">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                   </div>
                )}
                <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
                  Datos Operativos
                </h3>
                
                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><User className="w-4 h-4 text-gray-400" /> Inspector Asignado <span className="text-red-500">*</span></label>
                   <select
                     value={editForm.inspector_id}
                     onChange={(e) => setEditForm(prev => ({...prev, inspector_id: parseInt(e.target.value)}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                   >
                     <option value="">Seleccionar inspector...</option>
                     {inspectores.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><UserCheck className="w-4 h-4 text-gray-400" /> Operador Responsable AC (Supervisor) <span className="text-gray-400 font-normal">(Opcional)</span></label>
                   <select
                     value={editForm.operador_id}
                     onChange={(e) => setEditForm(prev => ({...prev, operador_id: e.target.value ? parseInt(e.target.value) : ''}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                   >
                     <option value="">Sin asignar (Opcional)...</option>
                     {operadores.map(op => <option key={op.id} value={op.id}>{op.nombre}</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><FileText className="w-4 h-4 text-gray-400" /> Plantilla Documental Supervisor <span className="text-gray-400 font-normal">(Opcional)</span></label>
                   <select
                     value={editForm.template_supervisor_id}
                     onChange={(e) => setEditForm(prev => ({...prev, template_supervisor_id: e.target.value ? parseInt(e.target.value) : ''}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                   >
                     <option value="">Sin plantilla de supervisor...</option>
                     {supervisorTemplates.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.codigo})</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><MapPin className="w-4 h-4 text-gray-400" /> Lugar de Carga <span className="text-red-500">*</span></label>
                   <select
                     value={editForm.lugar_carga_id}
                     onChange={(e) => setEditForm(prev => ({...prev, lugar_carga_id: parseInt(e.target.value)}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                   >
                     <option value="">Seleccionar depósito...</option>
                     {depositos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                   </select>
                </div>

                <div>
                   <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 mb-1.5"><CalendarClock className="w-4 h-4 text-gray-400" /> Fecha y Hora Pactada <span className="text-red-500">*</span></label>
                   <input
                     type="datetime-local"
                     value={editForm.fecha_hora_carga_pactada}
                     onChange={(e) => setEditForm(prev => ({...prev, fecha_hora_carga_pactada: e.target.value}))}
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                   />
                </div>

                <div className="pt-2">
                   <button
                     onClick={handleSaveData}
                     disabled={isSavingData}
                     className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition disabled:opacity-50 text-sm"
                   >
                     {isSavingData ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4" />}
                     Guardar Cambios
                   </button>
                </div>
             </div>
          ) : (
             <div className="space-y-4">
               <div className="flex items-start gap-3">
                 <User className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Inspector</p>
                   <p className="text-sm font-semibold text-gray-900">{inspeccion.inspector_nombre}</p>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <UserCheck className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Operador Responsable AC (Supervisor)</p>
                   <p className="text-sm font-semibold text-gray-900">{inspeccion.operador_nombre || dbData?.operador?.nombre_completo || 'Sin asignar'}</p>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <CalendarClock className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Fecha Pactada de Carga</p>
                   <p className="text-sm font-semibold text-gray-900 capitalize">{fechaFormatted}</p>
                 </div>
               </div>

               <div className="flex items-start gap-3">
                 <Package className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <p className="text-xs text-gray-500 font-medium">Tipo de Carga</p>
                   <p className="text-sm font-semibold text-gray-900">{inspeccion.tipo_carga}</p>
                 </div>
               </div>
             </div>
          )}

          {/* Pedidos vinculados */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
              {inspeccion.servicio_requiere_pedido ? 'Pedidos Vinculados' : 'Detalles del Servicio'}
            </h3>
            {inspeccion.pedidos && inspeccion.pedidos.length > 0 ? (
              <div className="space-y-2">
                {inspeccion.pedidos.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-3 rounded-lg"
                  >
                    <Package className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-indigo-800">
                      {p.identificador_compuesto}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-amber-50/80 border border-amber-200/70 p-3.5 rounded-lg space-y-1">
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Servicio de Inspección Externa (Sin Pedido AC)</p>
                <p className="text-sm text-amber-900 font-medium">{inspeccion.referencia_cliente || 'Verificación independiente coordinada según plantilla asignada.'}</p>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* SECCIÓN DOCUMENTAL CON PESTAÑAS (INSPECTOR vs SUPERVISOR)        */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/50 space-y-4">
            {/* Tab Headers */}
            <div className="flex border-b border-gray-200 bg-white rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setActiveDocTab('INSPECTOR')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all",
                  activeDocTab === 'INSPECTOR'
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                <User className="w-3.5 h-3.5" />
                <span>Inspector</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDocTab('SUPERVISOR')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all relative",
                  activeDocTab === 'SUPERVISOR'
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                )}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Supervisor / Operador</span>
                {dbData?.template_supervisor_id && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                )}
              </button>
            </div>

            {/* TAB CONTENIDO: INSPECTOR */}
            {activeDocTab === 'INSPECTOR' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {isEditablePhase && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                        Gestión de Documentos de Trabajo (Inspector)
                      </h3>
                      
                      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-800">Descargar Plantilla Maestra</h4>
                            <p className="text-xs text-gray-500">Descarga la plantilla para prepararle los datos al inspector.</p>
                          </div>
                          <button 
                            onClick={handleDownloadMaestra}
                            disabled={!dbData?.template_url}
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded shadow-sm text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" /> Bajar
                          </button>
                        </div>

                        <div className="border-t border-gray-100"></div>

                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-800">Subir Planilla Personalizada</h4>
                            <p className="text-xs text-gray-500">Adjunta el Excel editado listo para el inspector.</p>
                          </div>
                          
                          {dbData?.planilla_personalizada_url && (
                              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                <span className="text-xs text-emerald-800 font-bold uppercase tracking-wider flex-1 truncate">Planilla Lista</span>
                                <a href={dbData.planilla_personalizada_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800"><ExternalLink className="w-3 h-3" /></a>
                              </div>
                          )}

                          <div className="flex gap-2 items-center">
                              <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept=".pdf,.xlsx,.xls"
                                  className="hidden"
                                  onChange={handleFileChange}
                              />
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center justify-center px-4 py-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 transition disabled:opacity-50 flex-1"
                              >
                                {selectedFile ? selectedFile.name : 'Seleccionar Archivo...'}
                              </button>
                              {selectedFile && (
                                  <button
                                      onClick={handleUploadPlanillaPersonalizada}
                                      disabled={uploading}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                  >
                                      {uploading ? <Loader2 className="animate-spin w-4 h-4"/> : <Upload className="w-4 h-4" />}
                                  </button>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                        Comunicación con el Inspector
                      </h3>
                      
                      <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 shadow-xs">
                        <p className="text-xs text-gray-600">
                          Envía los datos de la inspección y el enlace a la planilla al inspector a través del canal de tu preferencia:
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setShowEmailConfirm(true)}
                            disabled={sendingEmail || !dbData?.inspector?.email}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 disabled:opacity-50 transition"
                          >
                            {sendingEmail ? <Loader2 className="animate-spin w-4 h-4"/> : <Mail className="w-4 h-4" />}
                            Enviar Email
                          </button>

                          <button
                            onClick={handleOpenWhatsAppInspectorModal}
                            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-xs"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Enviar WhatsApp
                          </button>
                        </div>

                        {!dbData?.inspector?.email ? (
                          <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 font-medium">
                            ⚠️ El inspector no posee un correo electrónico configurado en personal_ac.
                          </p>
                        ) : !dbData?.planilla_personalizada_url ? (
                          <p className="text-[11px] text-blue-700 bg-blue-50 p-2 rounded border border-blue-200 font-medium">
                            💡 Tip: Se generará un enlace seguro (Magic Link) de acceso a la inspección para el inspector.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {/* Recepción de Planillas Inspector */}
                {!isEditablePhase && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center justify-between">
                      <span>{isTerminalState ? "Documentación Final Inspector" : "Recepción de Planillas Inspector"}</span>
                      <span className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded-full border",
                        planillasList.length >= (inspeccion.cantidad_plantillas_requeridas || 1)
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-800 border-amber-200"
                      )}>
                        {planillasList.length} / {inspeccion.cantidad_plantillas_requeridas || 1} Recibidas
                      </span>
                    </h3>

                    {/* Barra de progreso de planillas */}
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          planillasList.length >= (inspeccion.cantidad_plantillas_requeridas || 1) ? "bg-emerald-500" : "bg-amber-500"
                        )}
                        style={{ width: `${Math.min(100, Math.round((planillasList.length / (inspeccion.cantidad_plantillas_requeridas || 1)) * 100))}%` }}
                      />
                    </div>

                    {loadingDbData && <div className="text-sm text-gray-400 mb-3">Cargando planillas...</div>}

                    {/* Lista de planillas recibidas */}
                    {planillasList.length === 0 ? (
                      <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <FileText className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <span className="text-xs text-amber-800 font-medium">
                          Aún no se han recibido planillas del inspector.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {planillasList.map((p, idx) => (
                          <div key={p.id || idx} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-2 shadow-xs hover:border-brand-300 transition">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                {editingPlanillaId === p.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={editingLabelText}
                                      onChange={e => setEditingLabelText(e.target.value)}
                                      className="text-xs font-bold text-gray-900 border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-brand-500 w-full bg-white"
                                      autoFocus
                                    />
                                    <button onClick={() => handleSavePlanillaLabel(p.id)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => setEditingPlanillaId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 group">
                                    <span className="text-xs font-bold text-gray-900 truncate">
                                      {p.etiqueta_identificador || `Planilla #${idx + 1}`}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingPlanillaId(p.id);
                                        setEditingLabelText(p.etiqueta_identificador || `Planilla #${idx + 1}`);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-brand-600 transition"
                                      title="Editar etiqueta"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                <p className="text-[11px] text-gray-500 truncate">{p.nombre_archivo}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={p.archivo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-gray-600 hover:text-brand-600 hover:bg-gray-100 rounded-lg transition"
                                title="Ver/Descargar"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                              {!isTerminalState && (
                                <button
                                  onClick={() => handleDeletePlanillaRecibida(p.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                  title="Eliminar planilla"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!isTerminalState && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Adjuntar Nueva Planilla de Inspector</p>
                        
                        <input
                          type="text"
                          value={uploadEtiqueta}
                          onChange={e => setUploadEtiqueta(e.target.value)}
                          placeholder={`Nombre / Etiqueta (ej. Contenedor PCIU-123. Por defecto: Planilla #${planillasList.length + 1})`}
                          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                        />

                        {selectedFile && (
                          <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs">
                            <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                            <span className="text-blue-700 truncate flex-1 font-medium">
                              {selectedFile.name} <span className="text-blue-500">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFile(null);
                                if (fileInputRef.current) fileInputRef.current.value = '';
                              }}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
                          className="hidden"
                          onChange={handleFileChange}
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="flex items-center gap-2 flex-1 justify-center px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/30 transition disabled:opacity-50 bg-white"
                          >
                            <Upload className="w-4 h-4" />
                            {selectedFile ? 'Cambiar archivo' : 'Seleccionar Archivo...'}
                          </button>

                          {selectedFile && (
                            <button
                              type="button"
                              onClick={handleUploadPlanillaRecibida}
                              disabled={uploading}
                              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition text-xs font-bold disabled:opacity-50"
                            >
                              {uploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Subiendo...
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4" />
                                  Guardar Planilla
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {inspeccion.state_code === '3.D2' && planillasList.length < (inspeccion.cantidad_plantillas_requeridas || 1) && (
                          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                            <div className="flex items-start gap-2 text-amber-900 text-xs font-medium">
                              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                              <span>Faltan recibirse {(inspeccion.cantidad_plantillas_requeridas || 1) - planillasList.length} planilla(s). Si no se recibirán más, puedes hacer un avance por excepción.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowExceptionModal(true)}
                              className="w-full px-3 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition text-xs flex items-center justify-center gap-1.5"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              Avanzar por Excepción (Motivo Obligatorio)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Alertas Automáticas al Inspector */}
                <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-indigo-600" />
                      Alertas Automáticas al Inspector
                    </h4>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      El sistema monitorea y notifica automáticamente por Email y WhatsApp según la fecha pactada.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {/* Alerta T-24h */}
                    <div className="bg-white rounded-lg p-3 border border-indigo-100 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-gray-800">Alerta Previa (T-24h)</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            dbData?.current_data?.alerta_t_menos_24h_enviada 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {dbData?.current_data?.alerta_t_menos_24h_enviada ? 'Enviada' : 'Pendiente'}
                          </span>
                        </div>
                        {dbData?.current_data?.alerta_t_menos_24h_at && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {new Date(dbData.current_data.alerta_t_menos_24h_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTriggerInspectorAlert('RECORDATORIO_PREVIO_24H')}
                        disabled={testingAlertaT24}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 text-white rounded-md text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs"
                      >
                        {testingAlertaT24 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Probar Alerta T-24h
                      </button>
                    </div>

                    {/* Alerta T+24h */}
                    <div className="bg-white rounded-lg p-3 border border-indigo-100 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-gray-800">Alerta Posterior (T+24h)</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            dbData?.current_data?.alerta_t_mas_24h_enviada 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {dbData?.current_data?.alerta_t_mas_24h_enviada ? 'Enviada' : 'Pendiente'}
                          </span>
                        </div>
                        {dbData?.current_data?.alerta_t_mas_24h_at && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {new Date(dbData.current_data.alerta_t_mas_24h_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTriggerInspectorAlert('RECORDATORIO_PLANILLAS_POST_24H')}
                        disabled={testingAlertaPost24}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-amber-600 text-white rounded-md text-[11px] font-bold hover:bg-amber-700 disabled:opacity-50 transition shadow-xs"
                      >
                        {testingAlertaPost24 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Probar Alerta T+24h
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENIDO: SUPERVISOR / OPERADOR */}
            {activeDocTab === 'SUPERVISOR' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Información del Supervisor */}
                <div className="bg-white border border-purple-100 rounded-xl p-4 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Supervisor Asignado</h4>
                        <p className="text-sm font-bold text-gray-900">{dbData?.operador?.nombre_completo || 'Sin operador asignado'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100 text-[11px]">
                    <div>
                      <span className="text-gray-400 block font-medium">Email:</span>
                      <span className="font-semibold text-gray-700 truncate block">{dbData?.operador?.email || 'No registrado'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block font-medium">Celular:</span>
                      <span className="font-semibold text-gray-700 block font-mono">{dbData?.operador?.celular || 'No registrado'}</span>
                    </div>
                  </div>

                  {!dbData?.operador_id && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      ⚠️ Esta inspección no tiene un operador responsable asignado. Puedes asignarlo en la sección de datos operativos.
                    </div>
                  )}
                </div>

                {/* Gestión de Documentos de Supervisión */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Gestión de Documentos de Supervisión
                  </h3>

                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 shadow-xs">
                    {/* Descargar Plantilla Maestra */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-800">Plantilla Maestra Asignada</h4>
                          <p className="text-xs text-gray-500">Selecciona y descarga la plantilla base para el supervisor.</p>
                        </div>
                        <button 
                          onClick={handleDownloadMaestraSupervisor}
                          disabled={!dbData?.template_supervisor_url}
                          className="px-3 py-1.5 bg-white border border-gray-300 rounded shadow-sm text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                          title={!dbData?.template_supervisor_url ? "Asigna una plantilla para poder descargarla" : "Descargar plantilla maestra"}
                        >
                          <Download className="w-4 h-4" /> Bajar
                        </button>
                      </div>

                      {/* Selector de plantilla de supervisor directo */}
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Plantilla de Supervisor:
                        </label>
                        <select
                          value={dbData?.template_supervisor_id || ''}
                          onChange={async (e) => {
                            const newId = e.target.value ? Number(e.target.value) : null;
                            await handleAsignarPlantillaSupervisor(newId);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none bg-white font-medium text-gray-800"
                        >
                          <option value="">Seleccionar plantilla para supervisor...</option>
                          {supervisorTemplates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.nombre} ({t.codigo})
                            </option>
                          ))}
                        </select>
                      </div>

                      {!dbData?.template_supervisor_id ? (
                        <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
                          ⚠️ No hay una plantilla asignada a esta inspección. Selecciona una en el desplegable superior para habilitar el botón de descarga.
                        </p>
                      ) : (
                        <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900">
                          <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                          <span className="font-medium truncate flex-1">
                            Plantilla activa: {supervisorTemplates.find(t => t.id === dbData.template_supervisor_id)?.nombre || `ID #${dbData.template_supervisor_id}`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-gray-100"></div>

                    {/* Subir Planilla Personalizada del Supervisor */}
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-800">Subir Planilla Personalizada</h4>
                        <p className="text-xs text-gray-500">Adjunta el archivo preparado específicamente para el supervisor.</p>
                      </div>
                      
                      {dbData?.planilla_supervisor_personalizada_url && (
                        <div className="flex items-center gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                          <span className="text-xs text-purple-900 font-bold uppercase tracking-wider flex-1 truncate">Planilla de Supervisión Lista</span>
                          <a href={dbData.planilla_supervisor_personalizada_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}

                      <div className="flex gap-2 items-center">
                        <input
                          ref={fileInputSupervisorRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls"
                          className="hidden"
                          onChange={e => setSelectedFileSupervisor(e.target.files?.[0] ?? null)}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputSupervisorRef.current?.click()}
                          disabled={uploadingSupervisor}
                          className="flex items-center justify-center px-4 py-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:border-purple-400 hover:text-purple-600 transition disabled:opacity-50 flex-1"
                        >
                          {selectedFileSupervisor ? selectedFileSupervisor.name : 'Seleccionar Archivo...'}
                        </button>
                        {selectedFileSupervisor && (
                          <button
                            onClick={handleUploadPlanillaSupervisorPersonalizada}
                            disabled={uploadingSupervisor}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                          >
                            {uploadingSupervisor ? <Loader2 className="animate-spin w-4 h-4"/> : <Upload className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comunicación con el Supervisor */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Comunicación con el Supervisor
                  </h3>
                  
                  <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3 shadow-xs">
                    <p className="text-xs text-gray-600">
                      Envía los datos y el enlace seguro al portal de supervisión por Email o WhatsApp:
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleSendEmailSupervisor}
                        disabled={sendingEmailSupervisor || !dbData?.operador?.email}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition"
                      >
                        {sendingEmailSupervisor ? <Loader2 className="animate-spin w-4 h-4"/> : <Mail className="w-4 h-4" />}
                        Enviar Email
                      </button>

                      <button
                        onClick={handleOpenWhatsAppSupervisorModal}
                        disabled={!dbData?.operador?.celular}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition shadow-xs disabled:opacity-50"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Enviar WhatsApp
                      </button>
                    </div>

                    {!dbData?.operador?.email && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 font-medium">
                        ⚠️ El supervisor no tiene email configurado en su ficha.
                      </p>
                    )}
                  </div>
                </div>

                {/* Planilla Completada por el Supervisor */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Planilla de Supervisión Completada
                  </h3>

                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-xs">
                    {dbData?.planilla_supervisor_completada_url ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-emerald-900 block">Planilla Recibida del Supervisor</span>
                            <span className="text-[10px] text-emerald-700">El supervisor ya cargó su documentación</span>
                          </div>
                        </div>
                        <a 
                          href={dbData.planilla_supervisor_completada_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-bold hover:bg-emerald-700 transition flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Ver Reporte
                        </a>
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span className="text-xs text-amber-800 font-medium">
                          Aún no se ha recibido la planilla completada del supervisor.
                        </span>
                      </div>
                    )}

                    {/* Subida manual / de contingencia */}
                    <div className="pt-2 border-t border-gray-100 space-y-2">
                      <span className="text-[11px] font-bold text-gray-600 block">Carga manual de contingencia</span>
                      
                      <input
                        ref={fileInputSupervisorCompletadaRef}
                        type="file"
                        accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
                        className="hidden"
                        onChange={e => setSelectedFileSupervisorCompletada(e.target.files?.[0] ?? null)}
                      />

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputSupervisorCompletadaRef.current?.click()}
                          disabled={uploadingSupervisorCompletada}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:border-purple-400 hover:text-purple-600 transition flex-1"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {selectedFileSupervisorCompletada ? selectedFileSupervisorCompletada.name : 'Adjuntar Planilla Completada...'}
                        </button>

                        {selectedFileSupervisorCompletada && (
                          <button
                            type="button"
                            onClick={handleUploadPlanillaSupervisorCompletada}
                            disabled={uploadingSupervisorCompletada}
                            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-xs font-bold"
                          >
                            {uploadingSupervisorCompletada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Subir'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alerta T+48h Supervisor */}
                <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4 space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-purple-600" />
                      Alerta Automática al Supervisor (+48h)
                    </h4>
                    <p className="text-[11px] text-purple-700 mt-0.5">
                      Si la planilla de supervisión no fue enviada tras 48 horas de la fecha pactada, el sistema emite una alerta automática.
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-purple-100 flex flex-col justify-between space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-800">Alerta Posterior (+48h)</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        dbData?.current_data?.alerta_supervisor_t_mas_48h_enviada 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {dbData?.current_data?.alerta_supervisor_t_mas_48h_enviada ? 'Enviada' : 'Pendiente'}
                      </span>
                    </div>

                    {dbData?.current_data?.alerta_supervisor_t_mas_48h_at && (
                      <p className="text-[10px] text-gray-400">
                        {new Date(dbData.current_data.alerta_supervisor_t_mas_48h_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={handleTriggerSupervisorAlert48}
                      disabled={testingAlertaSup48 || !dbData?.operador_id}
                      className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-purple-600 text-white rounded-md text-[11px] font-bold hover:bg-purple-700 disabled:opacity-50 transition shadow-xs"
                    >
                      {testingAlertaSup48 ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Probar Alerta T+48h Supervisor
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Alerta de Logística (Telegram Test) ────────────────────────── */}
          <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600" />
                  Notificaciones de Logística (Telegram)
                </h4>
                <p className="text-[11px] text-sky-700 mt-0.5">
                  Envía una alerta de prueba al grupo de Telegram con el estado actual, inspector y operador responsable.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleTestTelegramAlert}
              disabled={testingTelegram}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-sky-600 text-white rounded-lg text-xs font-bold hover:bg-sky-700 disabled:opacity-50 transition shadow-xs"
            >
              {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Probar Alerta Telegram
            </button>
          </div>

          {/* Danger Zone */}
          <div className="pt-8 mt-8 border-t-2 border-dashed border-gray-100">
            <h3 className="text-sm font-bold text-red-600 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Zona de Peligro
            </h3>
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs text-red-700 mb-3">
                Eliminar esta inspección destruirá el registro de forma permanente.
              </p>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Eliminando...' : 'Eliminar Inspección'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Email Confirmation Modal (Inspector) */}
      {showEmailConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-gray-100 scale-in-center">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Confirmar Envío</h3>
              <p className="text-sm text-gray-500 mb-6">
                Se enviará un correo con el acceso a la inspección <span className="font-bold">#INS-{inspeccion.id}</span> a:
              </p>
              
              <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left border border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Inspector</p>
                <p className="text-sm font-bold text-gray-900 mb-2">{dbData?.inspector?.nombre_completo || inspeccion.inspector_nombre}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Email Destino</p>
                <p className="text-sm font-medium text-brand-600 break-all">{dbData?.inspector?.email || 'No configurado'}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowEmailConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEdgeFunctionEmail}
                  disabled={!dbData?.inspector?.email}
                  className="flex-1 px-4 py-2.5 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 transition shadow-lg shadow-brand-200 disabled:opacity-50"
                >
                  Enviar Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exception Modal for Incomplete Planillas */}
      {showExceptionModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 scale-in-center">
            <div className="p-6">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Avance por Excepción</h3>
              <p className="text-xs text-gray-500 text-center mb-4">
                Se han recibido <span className="font-bold text-amber-700">{planillasList.length}</span> de <span className="font-bold text-gray-900">{inspeccion.cantidad_plantillas_requeridas || 1}</span> planillas requeridas. Indica el motivo obligatorio para autorizar el pase a revisión.
              </p>

              <div className="space-y-2 mb-5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                  Motivo de Excepción <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={exceptionReason}
                  onChange={e => setExceptionReason(e.target.value)}
                  placeholder="Ej. Se canceló la carga de 2 contenedores por problemas de stock en origen..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none min-h-[90px] resize-none bg-white"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExceptionModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition text-xs"
                  disabled={isAdvancingException}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAvanzarPorExcepcion}
                  disabled={isAdvancingException || !exceptionReason.trim()}
                  className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 transition shadow-lg shadow-amber-200 disabled:opacity-50 text-xs flex items-center justify-center gap-1.5"
                >
                  {isAdvancingException ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    'Confirmar Avance'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Confirmation Modal */}
      {showWhatsAppConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 scale-in-center">
            <div className={cn(
              "p-4 text-white flex justify-between items-center",
              whatsappTarget === 'SUPERVISOR' ? "bg-purple-600" : "bg-emerald-600"
            )}>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                <h3 className="font-bold text-base">
                  Enviar WhatsApp al {whatsappTarget === 'SUPERVISOR' ? 'Supervisor' : 'Inspector'}
                </h3>
              </div>
              <button onClick={() => setShowWhatsAppConfirm(false)} className="hover:bg-white/20 p-1 rounded-full transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className={cn(
                "rounded-xl p-3.5 border flex items-center justify-between",
                whatsappTarget === 'SUPERVISOR' ? "bg-purple-50 border-purple-100" : "bg-emerald-50 border-emerald-100"
              )}>
                <div>
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    whatsappTarget === 'SUPERVISOR' ? "text-purple-700" : "text-emerald-700"
                  )}>Destinatario</p>
                  <p className="text-sm font-bold text-gray-900">
                    {whatsappTarget === 'SUPERVISOR'
                      ? (dbData?.operador?.nombre_completo || 'Supervisor')
                      : (dbData?.inspector?.nombre_completo || inspeccion.inspector_nombre)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-[10px] font-bold uppercase tracking-wider",
                    whatsappTarget === 'SUPERVISOR' ? "text-purple-700" : "text-emerald-700"
                  )}>Celular</p>
                  <p className="text-xs font-bold text-gray-800 font-mono">
                    {(whatsappTarget === 'SUPERVISOR' ? dbData?.operador?.celular : dbData?.inspector?.celular) || 'Sin registrar'}
                  </p>
                </div>
              </div>

              {!((whatsappTarget === 'SUPERVISOR' ? dbData?.operador?.celular : dbData?.inspector?.celular)) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  ⚠️ El destinatario no posee un celular registrado en el catálogo de personal. Por favor actualiza su ficha de personal.
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                  Mensaje a Enviar (Editable)
                </label>
                <textarea
                  value={whatsappDraftText}
                  onChange={e => setWhatsappDraftText(e.target.value)}
                  rows={9}
                  className="w-full p-3 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 outline-none resize-y font-sans leading-relaxed bg-white shadow-inner"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWhatsAppConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 transition text-xs"
                  disabled={sendingWhatsApp}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsAppGeneral}
                  disabled={
                    sendingWhatsApp || 
                    !(whatsappTarget === 'SUPERVISOR' ? dbData?.operador?.celular : dbData?.inspector?.celular) || 
                    !whatsappDraftText.trim()
                  }
                  className={cn(
                    "flex-[2] px-4 py-2.5 text-white font-bold rounded-lg transition shadow-lg disabled:opacity-50 text-xs flex items-center justify-center gap-1.5",
                    whatsappTarget === 'SUPERVISOR'
                      ? "bg-purple-600 hover:bg-purple-700 shadow-purple-200"
                      : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                  )}
                >
                  {sendingWhatsApp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando WhatsApp...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4" />
                      Enviar Mensaje por WhatsApp
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
