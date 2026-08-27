import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker path to local bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function convertPdfDataToImages(data: Uint8Array): Promise<string[]> {
  try {
    const pdf = await pdfjsLib.getDocument(data).promise;
    const numPages = pdf.numPages;
    const images: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // @ts-ignore
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      images.push(base64);
    }

    return images;
  } catch (error) {
    console.error("PDF to images conversion failed", error);
    throw error;
  }
}

export async function convertPdfToImages(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
        const images = await convertPdfDataToImages(typedarray);
        resolve(images);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function extractPdfText(file: File): Promise<{ text: string, originalFile: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        // Clone the array buffer because pdf.js might detach the original one during parsing
        const originalFile = new Uint8Array(arrayBuffer.slice(0));
        const typedarray = new Uint8Array(arrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const numPages = pdf.numPages;
        let fullText = "";

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += `--- الصفحة ${i} ---\n${pageText}\n\n`;
        }

        resolve({ text: fullText, originalFile: originalFile });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
