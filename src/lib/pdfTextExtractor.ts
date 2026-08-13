/* eslint-disable @typescript-eslint/no-explicit-any */
import * as pdfjsLib from 'pdfjs-dist';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => {
          const str = (item as { str?: string }).str || '';
          return (item as { hasEOL?: boolean }).hasEOL ? str + '\n' : str + ' ';
        })
        .join('');
      fullText += `\n--- HOJA ${pageNum} ---\n` + pageText;
    }

    return fullText;
  } catch (err) {
    console.error('Error al extraer texto del PDF:', err);
    throw new Error('No se pudo extraer el texto del archivo PDF.');
  }
}
