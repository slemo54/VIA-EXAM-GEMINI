import * as pdfjsLib from 'pdfjs-dist';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const pdfToImages = async (file: File): Promise<string[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); // High scale for better OCR
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport, canvas }).promise;

      // Apply high-contrast filter for better OCR
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let j = 0; j < data.length; j += 4) {
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];

        // Calculate luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Apply threshold
        const threshold = 150; // slightly higher threshold to make more things black
        const color = luminance > threshold ? 255 : 0;

        data[j] = color;     // red
        data[j + 1] = color; // green
        data[j + 2] = color; // blue
        // Alpha is left unchanged
      }

      context.putImageData(imageData, 0, 0);

      images.push(canvas.toDataURL('image/png'));
    }

    return images;
  } catch (error) {
    console.error("PDF conversion error:", error);
    throw new Error("Failed to convert PDF. Try uploading an image instead.");
  }
};
