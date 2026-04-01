import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { processExamCanvasImage } from './imageProcessor';

// Set worker path (using local file via Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export const pdfToImages = async (file: File): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 3.5 }); // Optimized scale for Gemini (approx 2000x3000)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) continue;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    
    // Process the image using the new pipeline (Contrast + Adaptive Thresholding)
    const processedBlob = await processExamCanvasImage(canvas, { useAdaptiveThresholding: true });
    
    // Convert Blob back to base64 Data URL for the rest of the app
    const base64Url = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(processedBlob);
    });
    
    images.push(base64Url);
  }

  return images;
};
