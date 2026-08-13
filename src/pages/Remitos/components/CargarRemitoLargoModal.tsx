/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, RefreshCw, Truck, ArrowRight, Package, Sparkles } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { cn } from '../../../lib/utils';
import { extractTextFromPdf } from '../../../lib/pdfTextExtractor';

interface LoteStock {
  id: number;
  deposito_id: number;
  remito_origen_id: number | null;
  remito_origen_ref: string;
  oc_ref: string;
  calidad_azucar: string;
  tipo_embalaje: string;
  toneladas_ingresadas: number;
  toneladas_disponibles: number;
  created_at: string;
}

interface CargarRemitoLargoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CargarRemitoLargoModal({ isOpen, onClose, onSuccess }: CargarRemitoLargoModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // Archivo / Texto
  const [rawText, setRawText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Formulario Extracción Remito Largo
  const [remitoRef, setRemitoRef] = useState('');
  const [cuitCliente, setCuitCliente] = useState('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [choferNombre, setChoferNombre] = useState('');
  const [choferDni, setChoferDni] = useState('');
  const [choferTelefono, setChoferTelefono] = useState('');
  const [choferId, setChoferId] = useState<number | null>(null);
  const [patenteChasis, setPatenteChasis] = useState('');
  const [patenteAcoplado, setPatenteAcoplado] = useState('');
  const [cantidadBolsas, setCantidadBolsas] = useState<string>('');
  const [pesoBolsaKg, setPesoBolsaKg] = useState<string>('1000'); // BigBag 1.000kg por defecto
  const [pesoTotalTn, setPesoTotalTn] = useState<number>(0);
  const [instruccionesTexto, setInstruccionesTexto] = useState('');

  // Estación Intermedia & Stock Lotes
  const [depositosIntermedios, setDepositosIntermedios] = useState<any[]>([]);
  const [depositoIntermedioId, setDepositoIntermedioId] = useState<number | null>(null);
  const [depositosDestino, setDepositosDestino] = useState<any[]>([]);
  const [depositoDestinoId, setDepositoDestinoId] = useState<number | null>(null);

  const [clientesList, setClientesList] = useState<any[]>([]);
  const [choferesList, setChoferesList] = useState<any[]>([]);
  const [articulosList, setArticulosList] = useState<any[]>([]);
  const [articuloId, setArticuloId] = useState<number | null>(null);
  const [lotes, setLotes] = useState<LoteStock[]>([]);
  const [lotesDeduccion, setLotesDeduccion] = useState<Record<number, number>>({});

  const [isLoadingLotes, setIsLoadingLotes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cargar datos maestros (Depósitos, Clientes, Choferes, Artículos)
  const fetchMasterData = useCallback(async () => {
    try {
      const [depRes, cliRes, chofRes, artRes] = await Promise.all([
        supabase.from('depositos').select('id, nombre, tipo, localidad, provincia').order('nombre'),
        supabase.from('clientes').select('id, razon_social, cuit').order('razon_social'),
        supabase.from('choferes').select('id, nombre_completo, dni, telefono').order('nombre_completo'),
        supabase.from('articulos').select('id, codigo_articulo, nombre, peso_standard_kg').eq('estado', 'ACTIVO').order('nombre')
      ]);

      const allDeps = depRes.data || [];
      const intermedios = allDeps.filter(d => 
        d.tipo === 'REEMBOLSE' || 
        d.nombre.toLowerCase().includes('reembolse') || 
        d.nombre.toLowerCase().includes('fraccionadora') || 
        d.nombre.toLowerCase().includes('tucuman') ||
        d.nombre.toLowerCase().includes('lapachita')
      );
      
      // Consultar qué depósitos tienen stock disponible activo
      const { data: stockDeps } = await supabase
        .from('stock_estacion_intermedia')
        .select('deposito_id')
        .gt('toneladas_disponibles', 0)
        .eq('status', 'DISPONIBLE');

      const activeDepIds = new Set((stockDeps || []).map((s: any) => s.deposito_id));

      setDepositosIntermedios(intermedios.length > 0 ? intermedios : allDeps);

      // Auto-seleccionar preferentemente el depósito que tiene stock activo
      const depWithStock = intermedios.find(d => activeDepIds.has(d.id));
      if (depWithStock) {
        setDepositoIntermedioId(depWithStock.id);
      } else if (intermedios.length > 0) {
        setDepositoIntermedioId(intermedios[0].id);
      }

      setDepositosDestino(allDeps);
      setClientesList(cliRes.data || []);
      setChoferesList(chofRes.data || []);
      setArticulosList(artRes.data || []);
    } catch (err: any) {
      console.error('Error fetching master data:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMasterData();
      setStep(1);
      setRawText('');
      setFileName(null);
      setSelectedFile(null);
      setRemitoRef('');
      setCuitCliente('');
      setChoferNombre('');
      setChoferDni('');
      setChoferTelefono('');
      setPatenteChasis('');
      setPatenteAcoplado('');
      setCantidadBolsas('');
      setPesoTotalTn(0);
      setArticuloId(null);
      setInstruccionesTexto('');
      setLotesDeduccion({});
      setErrorMessage(null);
    }
  }, [isOpen, fetchMasterData]);

  // Cargar lotes disponibles en la estación intermedia seleccionada
  const fetchLotesEstacion = useCallback(async (depId: number) => {
    try {
      setIsLoadingLotes(true);
      const { data, error } = await supabase.rpc('get_lotes_disponibles_estacion_intermedia', {
        p_deposito_id: depId
      });
      if (error) throw error;
      setLotes((data as LoteStock[]) || []);
      setLotesDeduccion({});
    } catch (err: any) {
      console.error('Error fetching lotes de estación intermedia:', err);
    } finally {
      setIsLoadingLotes(false);
    }
  }, []);

  useEffect(() => {
    if (depositoIntermedioId) {
      fetchLotesEstacion(depositoIntermedioId);
    }
  }, [depositoIntermedioId, fetchLotesEstacion]);

  // Recalcular Peso Total en TN
  useEffect(() => {
    const bolsas = parseFloat(cantidadBolsas) || 0;
    const kgBolsa = parseFloat(pesoBolsaKg) || 0;
    if (bolsas > 0 && kgBolsa > 0) {
      const totalTn = (bolsas * kgBolsa) / 1000;
      setPesoTotalTn(totalTn);
    }
  }, [cantidadBolsas, pesoBolsaKg]);


  // Manejador de carga de archivo (PDF/TXT)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setFileName(file.name);
    setIsExtracting(true);
    setErrorMessage(null);

    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await file.arrayBuffer();
        const pdfText = await extractTextFromPdf(buffer);
        setRawText(pdfText);
        processExtractionFromText(pdfText);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          setRawText(content || '');
          processExtractionFromText(content || '');
        };
        reader.readAsText(file);
      }
    } catch (err: any) {
      console.error('Error al leer el archivo:', err);
      setErrorMessage('Error al leer el archivo PDF: ' + (err.message || 'Formato no soportado.'));
    } finally {
      setIsExtracting(false);
    }
  };

  // Parser Inteligente Local (RegEx + Normalización de Remitos)
  const processExtractionFromText = (text: string) => {
    try {
      setIsExtracting(true);
      setErrorMessage(null);

      if (!text || !text.trim()) {
        setErrorMessage('No se encontró texto para extraer en el documento.');
        return;
      }

      // 1. Extraer Remito (ej: R00001-00005286 o 0000100005286)
      const remitoMatch = text.match(/Remito[\s.]*:\s*R?(\d{1,5})[-_\s]?(\d{6,8})/i) ||
                          text.match(/R?(\d{5})[-_\s]?(\d{8})/i) ||
                          text.match(/\b\d{13}\b/);
      if (remitoMatch) {
        if (remitoMatch[1] && remitoMatch[2]) {
          const p1 = remitoMatch[1].padStart(5, '0');
          const p2 = remitoMatch[2].padStart(8, '0');
          setRemitoRef(p1 + p2);
        } else {
          setRemitoRef(remitoMatch[0]);
        }
      }

      // 2. Extraer Razón Social / Cliente y CUIT
      const clienteMatch = text.match(/Razon\s*Social[\s.]*:\s*([A-ZÑ\s]{3,40}?)(?=\s*Remito|\s*CUIT|\s*Domicilio|\r|\n|$)/i) ||
                           text.match(/Cliente[\s.]*:\s*([A-ZÑ\s]{3,40}?)(?=\r|\n|$)/i);
      if (clienteMatch && clienteMatch[1]) {
        const extractedRazon = clienteMatch[1].trim();
        const foundCli = clientesList.find(c => 
          c.razon_social.toLowerCase().includes(extractedRazon.toLowerCase()) ||
          extractedRazon.toLowerCase().includes(c.razon_social.toLowerCase())
        );
        if (foundCli) {
          setClienteId(foundCli.id);
          if (foundCli.cuit) setCuitCliente(foundCli.cuit);
        }
      }

      const cuitMatch = text.match(/CUIT[\s.]*:\s*(\d{2}-?\d{8}-?\d)/i) || text.match(/\b(20|23|27|30|33|34)-?\d{8}-?\d\b/);
      if (cuitMatch && cuitMatch[1]) {
        const rawCuit = cuitMatch[1].trim();
        setCuitCliente(rawCuit);
        const foundCliByCuit = clientesList.find(c => c.cuit && c.cuit.replace(/\D/g, '') === rawCuit.replace(/\D/g, ''));
        if (foundCliByCuit) {
          setClienteId(foundCliByCuit.id);
        }
      }

      // 3. Extraer Chofer (Nombre y DNI)
      const choferDniMatch = text.match(/([A-ZÑ\s]{4,40})\s*\/\s*(\d{1,2}\.?\d{3}\.?\d{3})/);
      if (choferDniMatch) {
        const extractedNombre = choferDniMatch[1].trim();
        const extractedDni = choferDniMatch[2].replace(/\./g, '').trim();
        setChoferNombre(extractedNombre);
        setChoferDni(extractedDni);

        const foundChofer = choferesList.find(ch => 
          (ch.dni && ch.dni.replace(/\D/g, '') === extractedDni) ||
          ch.nombre_completo.toLowerCase().includes(extractedNombre.toLowerCase())
        );
        if (foundChofer) {
          setChoferId(foundChofer.id);
          if (foundChofer.telefono) setChoferTelefono(foundChofer.telefono);
        }
      }

      // 4. Extraer Patentes (Chasis / Acoplado)
      const patentesDoble = text.match(/\b([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}\s?\d{3})\s*\/\s*([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}\s?\d{3})\b/i);
      if (patentesDoble && patentesDoble[1] && patentesDoble[2]) {
        setPatenteChasis(patentesDoble[1].replace(/\s+/g, '').toUpperCase());
        setPatenteAcoplado(patentesDoble[2].replace(/\s+/g, '').toUpperCase());
      } else {
        const patentes = text.match(/\b([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/gi) || [];
        if (patentes.length > 0 && patentes[0]) setPatenteChasis(patentes[0].replace(/\s+/g, '').toUpperCase());
        if (patentes.length > 1 && patentes[1]) setPatenteAcoplado(patentes[1].replace(/\s+/g, '').toUpperCase());
      }

      // 5. Extraer Cantidad de Bolsas / Bultos y Descripción del Producto
      let extractedQty: number | null = null;
      let extractedDesc = text;

      // 5a. Coincidencia explícita en renglón de detalle (ej: 560.00 102 AZUCAR...)
      const itemRowMatch = text.match(/\b(\d{2,5}(?:\.\d{1,3})?)\s+(?:\d{1,5}\s+)?([A-Z0-9.\s-]+?(?:AZUCAR|BOL|BOLSA|BIGBAG|BULTOS)[^\r\n%]*)/i);
      if (itemRowMatch && itemRowMatch[1]) {
        extractedQty = parseFloat(itemRowMatch[1]);
        extractedDesc = itemRowMatch[2];
      } else {
        // 5b. Buscar número antes de BOLSAS / BIGBAGS / BULTOS / UNIDADES
        const bagsMatch = text.match(/\b(\d{1,5}(?:\.\d{1,3})?)\s*(?:BOLSAS|BAGS|BIGBAGS|BB|BULTOS|UNIDADES|UN)\b/i);
        if (bagsMatch && bagsMatch[1]) {
          extractedQty = parseFloat(bagsMatch[1]);
        } else {
          // 5c. Buscar en las líneas del texto ignorando porcentajes (ej. % / COMISION)
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.includes('%') || line.toUpperCase().includes('COMISION') || line.toUpperCase().includes('INTERES')) continue;
            const lineQtyMatch = line.match(/^\s*(\d{2,5}(?:\.\d{1,3})?)\s+/);
            if (lineQtyMatch && lineQtyMatch[1]) {
              extractedQty = parseFloat(lineQtyMatch[1]);
              extractedDesc = line;
              break;
            }
          }
        }
      }

      if (extractedQty && extractedQty > 0) {
        const cant = Math.round(extractedQty);
        setCantidadBolsas(cant.toString());

        if (extractedDesc.toLowerCase().includes('bol') || extractedDesc.toLowerCase().includes('50kg') || extractedDesc.toLowerCase().includes('azucar')) {
          setPesoBolsaKg('50');
        } else if (extractedDesc.toLowerCase().includes('bigbag') || extractedDesc.toLowerCase().includes('bb') || extractedDesc.toLowerCase().includes('1000kg')) {
          setPesoBolsaKg('1000');
        }
      }

      // 6. Extraer Pedido para las instrucciones
      const pedidoMatch = text.match(/Pedido[\s.]*:\s*(\d+)/i);
      let obs = 'Despacho de azúcar desde Estación Intermedia a Cliente Final.';
      if (pedidoMatch) obs += ` Pedido N°: ${pedidoMatch[1]}.`;
      setInstruccionesTexto(obs);

      setStep(2);
    } catch (err: any) {
      setErrorMessage('Error al procesar y extraer datos del remito: ' + err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const processExtraction = () => {
    processExtractionFromText(rawText);
  };

  // Auto-asignar lotes por FIFO (First-In, First-Out)
  const handleAutoFIFO = useCallback(() => {
    let remainingNeeded = pesoTotalTn;
    const newDeductions: Record<number, number> = {};

    for (const lote of lotes) {
      if (remainingNeeded <= 0) break;
      const take = Math.min(remainingNeeded, lote.toneladas_disponibles);
      newDeductions[lote.id] = parseFloat(take.toFixed(3));
      remainingNeeded -= take;
    }

    setLotesDeduccion(newDeductions);
  }, [pesoTotalTn, lotes]);

  // Auto-asignar por FIFO al ingresar al Paso 3 si los lotes están disponibles
  useEffect(() => {
    if (step === 3 && lotes.length > 0 && Object.keys(lotesDeduccion).length === 0) {
      handleAutoFIFO();
    }
  }, [step, lotes, handleAutoFIFO, lotesDeduccion]);

  // Suma de toneladas actualmente asignadas en lotes
  const totalAssignedTn = useMemo(() => {
    return Object.values(lotesDeduccion).reduce((acc, val) => acc + (val || 0), 0);
  }, [lotesDeduccion]);

  // Confirmar y Guardar Remito Largo
  const handleSubmitRemitoLargo = async () => {
    if (!remitoRef) {
      setErrorMessage('Debe especificar el Número de Remito Largo.');
      return;
    }
    if (!depositoIntermedioId) {
      setErrorMessage('Debe seleccionar la Estación Intermedia de origen.');
      return;
    }
    if (pesoTotalTn <= 0) {
      setErrorMessage('El peso total del remito debe ser mayor a 0 TN.');
      return;
    }

    // Validar Requerimiento 2: La cantidad asignada en los lotes debe ser EXACTAMENTE IGUAL al peso total exigido por el remito
    if (Math.abs(totalAssignedTn - pesoTotalTn) > 0.001) {
      setErrorMessage(
        `Inconsistencia en deducción de stock: El peso total exigido por el remito es ${pesoTotalTn.toFixed(3)} TN, pero la suma asignada en los lotes es ${totalAssignedTn.toFixed(3)} TN. Debes asignar exactamente las ${pesoTotalTn.toFixed(3)} TN del remito.`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Validar si el número de remito ya existe en la base de datos
      const { data: existingRemito } = await supabase
        .from('remitos')
        .select('id, remito_ref_externa')
        .eq('remito_ref_externa', remitoRef)
        .maybeSingle();

      if (existingRemito) {
        setErrorMessage(
          `El número de remito "${remitoRef}" ya existe en el sistema. Por favor ingrese un número de remito largo diferente u original.`
        );
        setIsSubmitting(false);
        return;
      }

      // Subir archivo a Supabase Storage (bucket Archivos_entrada) si existe
      let uploadedUrl: string | null = null;
      if (selectedFile) {
        try {
          const fileExt = selectedFile.name.split('.').pop() || 'pdf';
          const cleanRef = remitoRef.replace(/[^a-zA-Z0-9_-]/g, '');
          const fileNameInStorage = `remito_largo_${cleanRef}_${Date.now()}.${fileExt}`;

          const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('Archivos_entrada')
            .upload(fileNameInStorage, selectedFile, { upsert: true });

          if (!uploadErr && uploadData) {
            const { data: urlData } = supabase.storage
              .from('Archivos_entrada')
              .getPublicUrl(fileNameInStorage);
            uploadedUrl = urlData?.publicUrl || null;
          } else {
            console.warn('Advertencia al subir archivo a Storage:', uploadErr);
          }
        } catch (stErr) {
          console.warn('Error al subir archivo a Storage:', stErr);
        }
      }

      // Formatear array de deducciones para la RPC
      const lotesArray = Object.entries(lotesDeduccion)
        .filter(([, qty]) => qty > 0)
        .map(([loteId, qty]) => ({
          lote_id: parseInt(loteId),
          toneladas_deducir: qty
        }));

      const selectedArt = articulosList.find(a => a.id === articuloId);

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('descontar_stock_intermedio_y_crear_remito_largo', {
        p_remito_ref_externa: remitoRef,
        p_deposito_intermedio_id: depositoIntermedioId,
        p_deposito_destino_id: depositoDestinoId || depositoIntermedioId,
        p_chofer_id: choferId,
        p_camion_patente: patenteChasis + (patenteAcoplado ? ` / ${patenteAcoplado}` : ''),
        p_patente_chasis: patenteChasis,
        p_patente_acoplado: patenteAcoplado,
        p_cantidad_total_tn: pesoTotalTn,
        p_lotes_deduccion: lotesArray,
        p_destino_final_cliente_id: clienteId,
        p_instrucciones_texto: instruccionesTexto || `Despacho de azúcar desde Estación Intermedia a Cliente Final.`,
        p_archivo_url: uploadedUrl,
        p_articulo_id: articuloId,
        p_codigo_articulo: selectedArt?.codigo_articulo || null,
        p_descripcion_articulo: selectedArt?.nombre || null
      });

      if (rpcErr) throw rpcErr;

      console.log('Remito Largo creado exitosamente:', rpcRes);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error al emitir Remito Largo:', err);
      setErrorMessage(err.message || 'Error al procesar el Remito Largo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header del Wizard */}
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-brand-100 text-brand-700 rounded-lg">
                <Truck className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                Emisión de Remito Largo (Despacho desde Estación Intermedia)
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Carga web, lectura con IA y deducción automática de stock en planta de fraccionamiento.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Indicator */}
        <div className="px-6 py-3 bg-white border-b border-gray-100 grid grid-cols-3 gap-2 flex-shrink-0 text-xs font-semibold text-center">
          <div className={cn("py-1.5 rounded-lg border transition-all", step === 1 ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
            1. Documento & IA
          </div>
          <div className={cn("py-1.5 rounded-lg border transition-all", step === 2 ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
            2. Datos & Misión
          </div>
          <div className={cn("py-1.5 rounded-lg border transition-all", step === 3 ? "bg-brand-50 border-brand-200 text-brand-700" : "bg-gray-50 border-gray-100 text-gray-400")}>
            3. Lotes & Stock
          </div>
        </div>

        {/* Mensaje de Error */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5 flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Wizard Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* PASO 1: CARGA DE ARCHIVO / TEXTO Y EXTRACCIÓN */}
          {step === 1 && (
            <div className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 hover:border-brand-400 bg-gray-50/50 hover:bg-gray-50 rounded-2xl p-6 text-center transition-colors cursor-pointer group"
              >
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-brand-50 group-hover:bg-brand-100 text-brand-500 mb-2 transition-colors">
                  <Upload className="w-8 h-8 text-brand-500" />
                </div>
                <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">
                  Cargar Remito de Despacho (PDF, TXT o Foto)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Arrastrá el archivo o hacé clic aquí para seleccionar
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  onClick={(e) => e.stopPropagation()}
                  accept=".pdf,.txt,.png,.jpg,.jpeg"
                  className="mt-3 block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                />
                {fileName && (
                  <p className="mt-2 text-xs text-emerald-600 font-medium">
                    ✓ Archivo cargado: {fileName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  O pegar el texto del remito / email de despacho directamente:
                </label>
                <textarea
                  rows={5}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Ej: Remito N° R00001-00005278. Cliente: Rosental. Chofer: SERGIO CORREA DNI 27652030... Cantidad: 29 BigBags 1000kg..."
                  className="w-full p-3 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={processExtraction}
                  disabled={isExtracting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white font-semibold text-xs rounded-xl hover:bg-brand-700 shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Extraer Datos con Inteligencia</span>
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: DATOS DEL REMITO Y MISIÓN */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    N° Remito Largo *
                  </label>
                  <input
                    type="text"
                    value={remitoRef}
                    onChange={(e) => setRemitoRef(e.target.value)}
                    placeholder="Ej: 0000100005278"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Cliente Final (Destino)
                  </label>
                  <select
                    value={clienteId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setClienteId(id || null);
                      const cli = clientesList.find(c => c.id === id);
                      if (cli) setCuitCliente(cli.cuit || '');
                    }}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">-- Seleccionar Cliente --</option>
                    {clientesList.map(c => (
                      <option key={c.id} value={c.id}>{c.razon_social} ({c.cuit || 'Sin CUIT'})</option>
                    ))}
                  </select>
                  {cuitCliente && (
                    <span className="text-[10px] font-mono text-gray-500 mt-0.5 block">CUIT: {cuitCliente}</span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Chofer Asignado
                  </label>
                  <select
                    value={choferId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setChoferId(id || null);
                      const chof = choferesList.find(c => c.id === id);
                      if (chof) {
                        setChoferNombre(chof.nombre_completo);
                        setChoferDni(chof.dni || '');
                        setChoferTelefono(chof.telefono || '');
                      }
                    }}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">-- Seleccionar Chofer Registrado --</option>
                    {choferesList.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre_completo} (DNI: {c.dni || 'S/D'})</option>
                    ))}
                  </select>
                  {choferNombre && (
                    <span className="text-[10px] font-medium text-brand-700 mt-0.5 block">
                      Chofer: {choferNombre} {choferDni ? `• DNI: ${choferDni}` : ''}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Teléfono Chofer (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={choferTelefono}
                    onChange={(e) => setChoferTelefono(e.target.value)}
                    placeholder="Ej: 5493813395743"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Patente Chasis
                  </label>
                  <input
                    type="text"
                    value={patenteChasis}
                    onChange={(e) => setPatenteChasis(e.target.value.toUpperCase())}
                    placeholder="Ej: AB123CD"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Patente Acoplado
                  </label>
                  <input
                    type="text"
                    value={patenteAcoplado}
                    onChange={(e) => setPatenteAcoplado(e.target.value.toUpperCase())}
                    placeholder="Ej: EKK397"
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Artículo / Calidad de Salida del Remito Largo (Reembolsado)
                  </label>
                  <select
                    value={articuloId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setArticuloId(id || null);
                      const art = articulosList.find(a => a.id === id);
                      if (art && art.peso_standard_kg) {
                        setPesoBolsaKg(art.peso_standard_kg.toString());
                      }
                    }}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  >
                    <option value="">-- Seleccionar Calidad de Salida desde Tabla de Artículos --</option>
                    {articulosList.map(a => (
                      <option key={a.id} value={a.id}>
                        [{a.codigo_articulo}] {a.nombre} {a.peso_standard_kg ? `(${a.peso_standard_kg} kg)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cálculo de Peso */}
              <div className="p-4 bg-brand-50/60 border border-brand-200 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold text-brand-900 uppercase">Cantidad Bolsas / Bultos</label>
                  <input
                    type="number"
                    value={cantidadBolsas}
                    onChange={(e) => setCantidadBolsas(e.target.value)}
                    className="w-full p-2 bg-white border border-brand-300 rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-brand-900 uppercase">Empaque / Peso Bolsa</label>
                  <select
                    value={pesoBolsaKg}
                    onChange={(e) => setPesoBolsaKg(e.target.value)}
                    className="w-full p-2 bg-white border border-brand-300 rounded-lg text-xs font-bold text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="1000">BigBag (1.000 KG = 1 TN)</option>
                    <option value="50">Bolsa 50 KG</option>
                    <option value="25">Bolsa 25 KG</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-brand-900 uppercase">Peso Total Calculado</label>
                  <p className="text-lg font-black text-brand-700">{pesoTotalTn.toFixed(3)} TN</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Instrucciones Adicionales para Misión Chofer
                </label>
                <textarea
                  rows={2}
                  value={instruccionesTexto}
                  onChange={(e) => setInstruccionesTexto(e.target.value)}
                  placeholder="Ej: Retirar en Planta Reembolse Tucumán y entregar en depósito del cliente..."
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 font-semibold text-xs rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 text-white font-semibold text-xs rounded-xl hover:bg-brand-700 shadow-md transition-colors cursor-pointer"
                >
                  <span>Siguiente: Asignar Lotes</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: SELECCIÓN DE ESTACIÓN INTERMEDIA, CALIDAD DE SALIDA Y DEDUCCIÓN DE LOTES */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="flex flex-col justify-end">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 min-h-[28px] flex items-end">
                    Estación Intermedia (Origen) *
                  </label>
                  <select
                    value={depositoIntermedioId || ''}
                    onChange={(e) => setDepositoIntermedioId(parseInt(e.target.value) || null)}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    {depositosIntermedios.map(d => (
                      <option key={d.id} value={d.id}>📍 {d.nombre} ({d.localidad || 'Reembolse'})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5 min-h-[28px] flex items-end">
                    Depósito Destino Cliente
                  </label>
                  <select
                    value={depositoDestinoId || ''}
                    onChange={(e) => setDepositoDestinoId(parseInt(e.target.value) || null)}
                    className="w-full p-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">-- Mismo que cliente final --</option>
                    {depositosDestino.map(d => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="block text-xs font-bold text-brand-900 mb-1.5 min-h-[28px] flex items-end">
                    Artículo / Calidad de Salida *
                  </label>
                  <select
                    value={articuloId || ''}
                    onChange={(e) => {
                      const id = parseInt(e.target.value);
                      setArticuloId(id || null);
                      const art = articulosList.find(a => a.id === id);
                      if (art && art.peso_standard_kg) {
                        setPesoBolsaKg(art.peso_standard_kg.toString());
                      }
                    }}
                    className="w-full p-2.5 border border-brand-300 rounded-xl text-xs font-bold text-brand-900 focus:ring-2 focus:ring-brand-500 outline-none bg-brand-50/60"
                  >
                    <option value="">-- Seleccionar Calidad de Salida --</option>
                    {articulosList.map(a => (
                      <option key={a.id} value={a.id}>
                        [{a.codigo_articulo}] {a.nombre} {a.peso_standard_kg ? `(${a.peso_standard_kg} kg)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lotes de Stock Disponibles */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-brand-600" />
                      Lotes de Stock en Estación Intermedia
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Requerido: <strong>{pesoTotalTn.toFixed(3)} TN</strong> • Asignado: <strong className={cn(totalAssignedTn >= pesoTotalTn ? "text-emerald-600" : "text-amber-600")}>{totalAssignedTn.toFixed(3)} TN</strong>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoFIFO}
                    className="flex items-center gap-1 px-3 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto-asignar FIFO</span>
                  </button>
                </div>

                {isLoadingLotes ? (
                  <div className="py-8 text-center text-gray-400 text-xs flex justify-center items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-brand-500" />
                    <span>Cargando lotes disponibles...</span>
                  </div>
                ) : lotes.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-xs">
                    <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                    <span>No hay lotes con stock disponible en esta estación intermedia.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-100/70 text-gray-600 uppercase font-semibold text-[10px]">
                        <tr>
                          <th className="p-2.5">Lote / Remito Origen</th>
                          <th className="p-2.5">OC Ref</th>
                          <th className="p-2.5">Calidad Entrada (Origen)</th>
                          <th className="p-2.5 text-right">Disponible</th>
                          <th className="p-2.5 text-right">A Deducir (TN)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono">
                        {lotes.map(lote => {
                          const currentDed = lotesDeduccion[lote.id] || 0;
                          return (
                            <tr key={lote.id} className="hover:bg-gray-50/80">
                              <td className="p-2.5 font-bold text-gray-900">
                                {lote.remito_origen_ref}
                              </td>
                              <td className="p-2.5 text-gray-600">{lote.oc_ref}</td>
                              <td className="p-2.5 text-gray-700 font-sans">
                                {lote.calidad_azucar} ({lote.tipo_embalaje})
                              </td>
                              <td className="p-2.5 text-right font-bold text-emerald-700">
                                {lote.toneladas_disponibles.toFixed(3)} TN
                              </td>
                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.001"
                                  max={lote.toneladas_disponibles}
                                  value={currentDed || ''}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setLotesDeduccion(prev => ({
                                      ...prev,
                                      [lote.id]: Math.min(val, lote.toneladas_disponibles)
                                    }));
                                  }}
                                  placeholder="0.000"
                                  className="w-24 p-1.5 bg-white border border-gray-300 rounded text-right font-bold text-brand-700 focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Botones Finales */}
              <div className="flex justify-between pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 font-semibold text-xs rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={handleSubmitRemitoLargo}
                  disabled={isSubmitting || totalAssignedTn <= 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Emitir Remito Largo & Descontar Stock</span>
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
