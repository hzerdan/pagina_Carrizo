import { supabase } from '../lib/supabase';

export interface DocumentQueryParams {
  instanceId?: number;
  ref?: string;
}

/**
 * Obtiene la URL pública del documento original de un Pedido (DOCUMENTO_ORIGEN_PEDIDO).
 * Busca prioritariamente por ID de instancia (directo o raíz) y fallback por referencia externa.
 */
export async function getPedidoDocumentUrl(params: {
  instanceId?: number;
  pedidoRef?: string;
}): Promise<string | null> {
  const { instanceId, pedidoRef } = params;

  // 1. Búsqueda directa por instanceId si fue provisto
  if (instanceId) {
    const { data: directDoc } = await supabase
      .from('documentos')
      .select('storage_path')
      .eq('pedido_instance_id', instanceId)
      .eq('document_type', 'DOCUMENTO_ORIGEN_PEDIDO')
      .limit(1)
      .maybeSingle();

    if (directDoc?.storage_path) {
      return directDoc.storage_path;
    }

    // Si es una sub-instancia (split), buscar en la instancia raíz (parent_instance_id IS NULL)
    const { data: currentInst } = await supabase
      .from('pedido_instancias')
      .select('pedido_id')
      .eq('id', instanceId)
      .maybeSingle();

    if (currentInst?.pedido_id) {
      const { data: rootInst } = await supabase
        .from('pedido_instancias')
        .select('id')
        .eq('pedido_id', currentInst.pedido_id)
        .is('parent_instance_id', null)
        .maybeSingle();

      if (rootInst?.id) {
        const { data: rootDoc } = await supabase
          .from('documentos')
          .select('storage_path')
          .eq('pedido_instance_id', rootInst.id)
          .eq('document_type', 'DOCUMENTO_ORIGEN_PEDIDO')
          .limit(1)
          .maybeSingle();

        if (rootDoc?.storage_path) {
          return rootDoc.storage_path;
        }
      }
    }
  }

  // 2. Búsqueda por referencia externa del pedido (ej: "0000300000048")
  if (pedidoRef) {
    const cleanRef = pedidoRef.trim();
    const { data: pedidoData } = await supabase
      .from('pedidos')
      .select('id')
      .eq('pedido_ref_externa', cleanRef)
      .limit(1)
      .maybeSingle();

    if (pedidoData?.id) {
      const { data: instanceData } = await supabase
        .from('pedido_instancias')
        .select('id')
        .eq('pedido_id', pedidoData.id)
        .is('parent_instance_id', null)
        .limit(1)
        .maybeSingle();

      if (instanceData?.id) {
        const { data: docData } = await supabase
          .from('documentos')
          .select('storage_path')
          .eq('pedido_instance_id', instanceData.id)
          .eq('document_type', 'DOCUMENTO_ORIGEN_PEDIDO')
          .limit(1)
          .maybeSingle();

        if (docData?.storage_path) {
          return docData.storage_path;
        }
      }
    }
  }

  return null;
}

/**
 * Obtiene la URL pública del documento original de una Orden de Compra (DOCUMENTO_ORIGEN_OC).
 * Busca prioritariamente por ID de instancia (directo o raíz) y fallback por referencia externa.
 */
export async function getOcDocumentUrl(params: {
  instanceId?: number;
  ocRef?: string;
}): Promise<string | null> {
  const { instanceId, ocRef } = params;

  // 1. Búsqueda directa por instanceId si fue provisto
  if (instanceId) {
    const { data: directDoc } = await supabase
      .from('documentos')
      .select('storage_path')
      .eq('oc_instance_id', instanceId)
      .eq('document_type', 'DOCUMENTO_ORIGEN_OC')
      .limit(1)
      .maybeSingle();

    if (directDoc?.storage_path) {
      return directDoc.storage_path;
    }

    // Si es una sub-instancia (split), buscar en la instancia raíz (parent_instance_id IS NULL)
    const { data: currentInst } = await supabase
      .from('oc_instancias')
      .select('oc_id')
      .eq('id', instanceId)
      .maybeSingle();

    if (currentInst?.oc_id) {
      const { data: rootInst } = await supabase
        .from('oc_instancias')
        .select('id')
        .eq('oc_id', currentInst.oc_id)
        .is('parent_instance_id', null)
        .maybeSingle();

      if (rootInst?.id) {
        const { data: rootDoc } = await supabase
          .from('documentos')
          .select('storage_path')
          .eq('oc_instance_id', rootInst.id)
          .eq('document_type', 'DOCUMENTO_ORIGEN_OC')
          .limit(1)
          .maybeSingle();

        if (rootDoc?.storage_path) {
          return rootDoc.storage_path;
        }
      }
    }
  }

  // 2. Búsqueda por referencia externa de la OC (ej: "00003-00000043")
  if (ocRef) {
    const cleanRef = ocRef.trim();
    const { data: ocData } = await supabase
      .from('ordenes_compra')
      .select('id')
      .eq('oc_ref_externa', cleanRef)
      .limit(1)
      .maybeSingle();

    if (ocData?.id) {
      const { data: instanceData } = await supabase
        .from('oc_instancias')
        .select('id')
        .eq('oc_id', ocData.id)
        .is('parent_instance_id', null)
        .limit(1)
        .maybeSingle();

      if (instanceData?.id) {
        const { data: docData } = await supabase
          .from('documentos')
          .select('storage_path')
          .eq('oc_instance_id', instanceData.id)
          .eq('document_type', 'DOCUMENTO_ORIGEN_OC')
          .limit(1)
          .maybeSingle();

        if (docData?.storage_path) {
          return docData.storage_path;
        }
      }
    }
  }

  return null;
}

/**
 * Abre el documento en una nueva pestaña y dispara callback de toast en caso de error o ausencia.
 */
export async function openOriginalDocument(
  type: 'PEDIDO' | 'OC',
  params: { instanceId?: number; ref?: string },
  showToast?: (type: 'info' | 'error', message: string) => void
): Promise<boolean> {
  try {
    const url =
      type === 'PEDIDO'
        ? await getPedidoDocumentUrl({ instanceId: params.instanceId, pedidoRef: params.ref })
        : await getOcDocumentUrl({ instanceId: params.instanceId, ocRef: params.ref });

    if (!url) {
      showToast?.('info', `Documento original de ${type === 'PEDIDO' ? 'Pedido' : 'OC'} no disponible`);
      return false;
    }

    window.open(url, '_blank');
    return true;
  } catch (err) {
    console.error(`Error al recuperar documento de ${type}:`, err);
    showToast?.('error', 'Error al intentar recuperar el documento original');
    return false;
  }
}
