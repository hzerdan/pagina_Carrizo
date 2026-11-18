import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, 
  Download, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Camera, 
  Video, 
  FileText, 
  Loader2, 
  RefreshCw, 
  ExternalLink,
  Maximize2,
  Calendar,
  Filter
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export interface MediaItem {
  id: string;
  messageId: number;
  url: string;
  type: 'image' | 'video' | 'document';
  createdAt: string;
  senderRole: string;
  bodyText: string | null;
}

interface ModalGaleriaDocumentacionProps {
  isOpen: boolean;
  onClose: () => void;
  remitoId: number;
  remitoRef?: string;
  choferNombre?: string;
  onCountChange?: (count: number) => void;
}

function detectMediaType(url: string, messageType?: string | null): 'image' | 'video' | 'document' {
  const cleanUrl = url.toLowerCase().split('?')[0];
  if (cleanUrl.match(/\.(mp4|webm|ogg|mov)$/) || messageType === 'video') {
    return 'video';
  }
  if (cleanUrl.match(/\.(jpeg|jpg|png|webp|gif|svg)$/) || messageType === 'image') {
    return 'image';
  }
  return 'document';
}

export function ModalGaleriaDocumentacion({
  isOpen,
  onClose,
  remitoId,
  remitoRef = '',
  choferNombre = '',
  onCountChange
}: ModalGaleriaDocumentacionProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [onlyChofer, setOnlyChofer] = useState(false);

  // Lightbox
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const fetchMedia = useCallback(async () => {
    if (!remitoId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('id, sender_role, direction, message_type, media_urls, created_at, body_text')
        .eq('remito_id', remitoId)
        .not('media_urls', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const flattened: MediaItem[] = [];

      (data || []).forEach((msg: any) => {
        const urls: string[] = Array.isArray(msg.media_urls) ? msg.media_urls : [];
        urls.forEach((url, idx) => {
          if (url && typeof url === 'string' && url.trim().length > 0) {
            flattened.push({
              id: `${msg.id}_${idx}`,
              messageId: msg.id,
              url: url.trim(),
              type: detectMediaType(url, msg.message_type),
              createdAt: msg.created_at,
              senderRole: msg.sender_role || (msg.direction === 'in' ? 'chofer' : 'sistema'),
              bodyText: msg.body_text || null
            });
          }
        });
      });

      setItems(flattened);
      if (onCountChange) {
        onCountChange(flattened.length);
      }
    } catch (err: any) {
      console.error('Error fetching remito media:', err);
      setErrorMsg(err.message || 'Error al cargar la documentación gráfica');
    } finally {
      setLoading(false);
    }
  }, [remitoId, onCountChange]);

  useEffect(() => {
    if (isOpen) {
      fetchMedia();
      setSelectedIndex(null);
      setRotation(0);
    }
  }, [isOpen, fetchMedia]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      if (onlyChofer && item.senderRole !== 'chofer') {
        return false;
      }
      return true;
    });
  }, [items, filterType, onlyChofer]);

  // Counts for filters
  const counts = useMemo(() => {
    const total = items.length;
    const images = items.filter(i => i.type === 'image').length;
    const videos = items.filter(i => i.type === 'video').length;
    const choferOnly = items.filter(i => i.senderRole === 'chofer').length;
    return { total, images, videos, choferOnly };
  }, [items]);

  // Lightbox navigation
  const handlePrev = useCallback(() => {
    if (selectedIndex === null) return;
    setRotation(0);
    setSelectedIndex(prev => (prev !== null && prev > 0 ? prev - 1 : filteredItems.length - 1));
  }, [selectedIndex, filteredItems.length]);

  const handleNext = useCallback(() => {
    if (selectedIndex === null) return;
    setRotation(0);
    setSelectedIndex(prev => (prev !== null && prev < filteredItems.length - 1 ? prev + 1 : 0));
  }, [selectedIndex, filteredItems.length]);

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex !== null) {
        if (e.key === 'Escape') {
          setSelectedIndex(null);
          setRotation(0);
        } else if (e.key === 'ArrowLeft') {
          handlePrev();
        } else if (e.key === 'ArrowRight') {
          handleNext();
        } else if (e.key === 'r' || e.key === 'R') {
          handleRotate();
        }
      } else {
        if (e.key === 'Escape') {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, handlePrev, handleNext, onClose]);

  // Safe file downloader (supports cross-origin Supabase Storage)
  const handleDownload = async (item: MediaItem) => {
    try {
      setDownloading(true);
      const extMatch = item.url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/);
      const ext = extMatch ? extMatch[1] : (item.type === 'video' ? 'mp4' : 'jpg');
      const dateFormatted = item.createdAt 
        ? format(new Date(item.createdAt), 'yyyyMMdd_HHmm') 
        : 'archivo';
      const cleanFilename = `Remito_${remitoRef || remitoId}_${item.type}_${dateFormatted}.${ext}`;

      const response = await fetch(item.url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = cleanFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Fallback opening in new tab:', err);
      window.open(item.url, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen) return null;

  const currentMedia = selectedIndex !== null ? filteredItems[selectedIndex] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Modal Container */}
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col w-full max-w-5xl h-[90vh] max-h-[850px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">Documentación Gráfica y Evidencias</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-800">
                  {counts.total} {counts.total === 1 ? 'archivo' : 'archivos'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Remito <strong className="text-gray-700">#{remitoRef || remitoId}</strong>
                {choferNombre && (
                  <> • Chofer: <strong className="text-gray-700">{choferNombre}</strong></>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchMedia}
              disabled={loading}
              title="Recargar evidencias"
              className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-brand-600")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Toolbar: Filtros y Opciones */}
        <div className="px-6 py-3 bg-gray-50/80 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 font-medium mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filtrar:
            </span>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer",
                filterType === 'all' 
                  ? "bg-white text-gray-900 shadow-2xs border border-gray-200" 
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              Todos ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('image')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1",
                filterType === 'image' 
                  ? "bg-white text-brand-700 shadow-2xs border border-gray-200" 
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              <Camera className="w-3 h-3" />
              Fotos ({counts.images})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('video')}
              className={cn(
                "px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1",
                filterType === 'video' 
                  ? "bg-white text-brand-700 shadow-2xs border border-gray-200" 
                  : "text-gray-500 hover:text-gray-800"
              )}
            >
              <Video className="w-3 h-3" />
              Videos ({counts.videos})
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 font-medium cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyChofer}
              onChange={e => setOnlyChofer(e.target.checked)}
              className="rounded text-brand-600 focus:ring-brand-500" 
            />
            Solo enviados por el chofer ({counts.choferOnly})
          </label>
        </div>

        {/* Body / Grid */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
              <p className="text-sm font-medium text-gray-600">Buscando documentación gráfica...</p>
              <p className="text-xs text-gray-400 mt-1">Consultando los comprobantes enviados por el chofer</p>
            </div>
          ) : errorMsg ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <X className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-800">Ocurrió un error al cargar las fotos</p>
              <p className="text-xs text-red-600 mt-1 max-w-md">{errorMsg}</p>
              <button
                type="button"
                onClick={fetchMedia}
                className="mt-4 px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50 transition"
              >
                Reintentar
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mb-4">
                <Camera className="w-8 h-8 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-gray-800">Sin documentación gráfica</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                {items.length > 0 
                  ? 'No hay archivos que coincidan con los filtros seleccionados.' 
                  : 'Aún no se han recibido fotos ni videos enviados por el chofer para este viaje.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredItems.map((item, index) => {
                const dateLabel = item.createdAt 
                  ? format(new Date(item.createdAt), "dd/MM/yyyy • HH:mm 'hs'", { locale: es }) 
                  : '';

                return (
                  <div
                    key={item.id}
                    className="group relative bg-white rounded-xl border border-gray-200 overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer"
                    onClick={() => {
                      setSelectedIndex(index);
                      setRotation(0);
                    }}
                  >
                    {/* Media Container */}
                    <div className="relative aspect-4/3 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
                      {item.type === 'image' ? (
                        <img 
                          src={item.url} 
                          alt="Evidencia remito" 
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : item.type === 'video' ? (
                        <div className="relative w-full h-full bg-black flex items-center justify-center">
                          <video 
                            src={item.url} 
                            preload="metadata"
                            className="w-full h-full object-cover opacity-80"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                            <div className="w-10 h-10 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                              <Video className="w-5 h-5 ml-0.5 text-brand-600" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-400 p-4">
                          <FileText className="w-10 h-10 mb-1" />
                          <span className="text-[10px] font-bold uppercase">Documento</span>
                        </div>
                      )}

                      {/* Tipo badge overlay */}
                      <span className={cn(
                        "absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-md uppercase tracking-wider",
                        item.type === 'image' 
                          ? "bg-black/60 text-white" 
                          : item.type === 'video'
                            ? "bg-amber-600/80 text-white"
                            : "bg-blue-600/80 text-white"
                      )}>
                        {item.type === 'image' ? 'Foto' : item.type === 'video' ? 'Video' : 'Doc'}
                      </span>

                      {/* Botón flotante para expandir */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          className="p-2 bg-white/90 hover:bg-white text-gray-900 rounded-full shadow-lg transition-transform hover:scale-110"
                          title="Ver en pantalla completa"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIndex(index);
                            setRotation(0);
                          }}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          className="p-2 bg-white/90 hover:bg-white text-gray-900 rounded-full shadow-lg transition-transform hover:scale-110"
                          title="Descargar comprobante"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item);
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata Card Footer */}
                    <div className="p-3 bg-white flex flex-col justify-between flex-1 gap-1">
                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span className="flex items-center gap-1 truncate" title={dateLabel}>
                          <Calendar className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{dateLabel}</span>
                        </span>
                        <span className={cn(
                          "px-1.5 py-0.2 text-[9px] font-bold rounded-full uppercase shrink-0",
                          item.senderRole === 'chofer'
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        )}>
                          {item.senderRole === 'chofer' ? 'Chofer' : 'Sistema'}
                        </span>
                      </div>

                      {item.bodyText && (
                        <p className="text-xs text-gray-700 line-clamp-2 italic bg-gray-50 p-1.5 rounded border border-gray-100 mt-1" title={item.bodyText}>
                          &ldquo;{item.bodyText}&rdquo;
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-3 border-t border-gray-100 bg-white flex items-center justify-between text-xs text-gray-500 shrink-0">
          <span>
            Mostrando <strong>{filteredItems.length}</strong> de <strong>{items.length}</strong> comprobantes disponibles
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cerrar Galería
          </button>
        </footer>
      </div>

      {/* Lightbox / Visor Pantalla Completa */}
      {currentMedia && selectedIndex !== null && (
        <div 
          className="fixed inset-0 z-60 bg-black/95 flex flex-col animate-in fade-in duration-150"
          onClick={() => {
            setSelectedIndex(null);
            setRotation(0);
          }}
        >
          {/* Lightbox Topbar */}
          <div 
            className="px-6 py-4 flex items-center justify-between text-white border-b border-white/10 bg-black/40 backdrop-blur-md shrink-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-200">
                {selectedIndex + 1} / {filteredItems.length}
              </span>
              <span className="text-xs text-gray-400">
                {currentMedia.createdAt && format(new Date(currentMedia.createdAt), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}
              </span>
              <span className={cn(
                "px-2 py-0.5 text-[10px] font-bold rounded-full uppercase",
                currentMedia.senderRole === 'chofer' 
                  ? "bg-emerald-500/30 text-emerald-300 border border-emerald-500/40" 
                  : "bg-blue-500/30 text-blue-300 border border-blue-500/40"
              )}>
                {currentMedia.senderRole === 'chofer' ? 'Enviada por Chofer' : 'Sistema'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {currentMedia.type === 'image' && (
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition cursor-pointer text-white"
                  title="Rotar imagen 90° (R)"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Rotar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleDownload(currentMedia)}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 rounded-lg text-xs font-semibold transition cursor-pointer text-white disabled:opacity-50"
                title="Descargar comprobante"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Descargar</span>
              </button>

              <a
                href={currentMedia.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition cursor-pointer text-white"
                title="Abrir en pestaña nueva"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={() => {
                  setSelectedIndex(null);
                  setRotation(0);
                }}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition cursor-pointer text-white ml-2"
                title="Cerrar visor (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Content */}
          <div 
            className="flex-1 relative flex items-center justify-center p-4 overflow-hidden select-none"
            onClick={e => e.stopPropagation()}
          >
            {/* Navegación Izquierda */}
            {filteredItems.length > 1 && (
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full transition-all cursor-pointer backdrop-blur-md z-10"
                title="Anterior (Flecha izquierda)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media Content */}
            <div className="max-w-full max-h-full flex items-center justify-center overflow-auto p-2">
              {currentMedia.type === 'image' ? (
                <img
                  src={currentMedia.url}
                  alt="Comprobante ampliado"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                  }}
                  className="max-h-[78vh] max-w-[85vw] object-contain rounded-lg shadow-2xl"
                />
              ) : currentMedia.type === 'video' ? (
                <video
                  src={currentMedia.url}
                  controls
                  autoPlay
                  className="max-h-[78vh] max-w-[85vw] rounded-lg shadow-2xl"
                />
              ) : (
                <div className="bg-white/10 p-8 rounded-2xl text-center text-white max-w-md">
                  <FileText className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                  <p className="font-bold text-sm">Documento adjunto</p>
                  <p className="text-xs text-gray-400 mt-1">Este archivo no tiene vista previa interactiva.</p>
                  <a
                    href={currentMedia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-brand-600 rounded-lg text-xs font-bold"
                  >
                    Abrir documento
                  </a>
                </div>
              )}
            </div>

            {/* Navegación Derecha */}
            {filteredItems.length > 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/25 text-white rounded-full transition-all cursor-pointer backdrop-blur-md z-10"
                title="Siguiente (Flecha derecha)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Caption */}
          {currentMedia.bodyText && (
            <div 
              className="px-6 py-3 border-t border-white/10 bg-black/60 backdrop-blur-md text-center shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs text-gray-300 italic max-w-2xl mx-auto">
                &ldquo;{currentMedia.bodyText}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
