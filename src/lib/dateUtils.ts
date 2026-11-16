/**
 * Utilidades de formateo de fechas con estándar DD/MM/YYYY para toda la aplicación.
 */

export function formatDateDDMMYYYY(dateStr?: string | null): string {
  if (!dateStr) return 'S/D';
  
  const cleanStr = String(dateStr).trim();
  if (!cleanStr) return 'S/D';

  // Si ya viene en formato DD/MM/YYYY (ej: 31/08/2026)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(cleanStr)) {
    return cleanStr.slice(0, 10);
  }

  // Si viene en formato YYYY-MM-DD (ej: 2026-06-10)
  const matchIso = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    const [, y, m, d] = matchIso;
    return `${d}/${m}/${y}`;
  }

  // Parse con Date para timestamps ISO
  const date = new Date(cleanStr);
  if (isNaN(date.getTime())) return cleanStr;
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}
