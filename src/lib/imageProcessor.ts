// src/lib/imageProcessor.ts

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessImageOptions {
  boundingBoxes?: BoundingBox[];
  useAdaptiveThresholding?: boolean;
}

/**
 * Elabora un'immagine Canvas per ottimizzarla prima dell'invio all'IA.
 * Esegue:
 * 1. Smart Cropping (se vengono fornite bounding box)
 * 2. Contrast Stretching (in un Web Worker)
 * 3. Binarizzazione Adattiva (in un Web Worker)
 * 4. Esportazione in formato PNG Lossless
 */
export const processExamCanvasImage = async (
  sourceCanvas: HTMLCanvasElement,
  options: ProcessImageOptions = {}
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    // 1. Smart Cropping: Determina l'area da elaborare
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceCanvas.width;
    let cropHeight = sourceCanvas.height;

    if (options.boundingBoxes && options.boundingBoxes.length > 0) {
      // Calcola la bounding box che racchiude tutte le box fornite
      let minX = sourceCanvas.width;
      let minY = sourceCanvas.height;
      let maxX = 0;
      let maxY = 0;

      for (const box of options.boundingBoxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }

      // Aggiungi un piccolo margine (es. 20px) per sicurezza
      const margin = 20;
      cropX = Math.max(0, minX - margin);
      cropY = Math.max(0, minY - margin);
      cropWidth = Math.min(sourceCanvas.width - cropX, maxX - minX + margin * 2);
      cropHeight = Math.min(sourceCanvas.height - cropY, maxY - minY + margin * 2);
    }

    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return reject(new Error('Canvas 2D context not available'));

    // Estrai ImageData per l'area target
    const imageData = ctx.getImageData(cropX, cropY, cropWidth, cropHeight);

    // 2. Offload pixel processing a un Web Worker per non bloccare la UI
    // Utilizziamo l'URL di Vite per importare il worker
    const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const processedImageData = e.data.imageData;
      
      // Crea un nuovo canvas per l'output
      const outCanvas = document.createElement('canvas');
      outCanvas.width = cropWidth;
      outCanvas.height = cropHeight;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) {
        worker.terminate();
        return reject(new Error('Output Canvas 2D context not available'));
      }
      
      outCtx.putImageData(processedImageData, 0, 0);

      // 3. Esporta come PNG Lossless
      outCanvas.toBlob((blob) => {
        worker.terminate();
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create Blob'));
        }
      }, 'image/png');
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Invia i dati al worker. Trasferiamo il buffer per performance zero-copy.
    worker.postMessage({
      imageData,
      useAdaptiveThresholding: options.useAdaptiveThresholding !== false
    }, [imageData.data.buffer]);
  });
};

/*
 * 5. PREDISPOSIZIONE PER IL DESKEWING (ALLINEAMENTO) CON OPENCV.JS
 * 
 * Se le immagini provengono dalla fotocamera e risultano storte o distorte
 * dalla prospettiva, la rotazione in puro JS è estremamente lenta e complessa.
 * Si consiglia di integrare opencv.js in uno step separato (prima del processing dei pixel).
 * 
 * Esempio di flusso con OpenCV.js:
 * 
 * async function deskewImage(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
 *   // Assicurati che opencv.js sia caricato (es. tramite script tag e attesa di cv.onRuntimeInitialized)
 *   
 *   // 1. Carica l'immagine in un Mat di OpenCV
 *   let src = cv.imread(canvas);
 *   let dst = new cv.Mat();
 *   
 *   // 2. Converti in scala di grigi e applica Canny Edge Detection
 *   cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY, 0);
 *   cv.Canny(dst, dst, 50, 150, 3, false);
 *   
 *   // 3. Trova i contorni (findContours) per individuare il foglio
 *   let contours = new cv.MatVector();
 *   let hierarchy = new cv.Mat();
 *   cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
 *   
 *   // 4. Trova il contorno più grande (presumibilmente il foglio)
 *   // e calcola il rettangolo di area minima (minAreaRect) o approssima un poligono
 *   // per trovare i 4 angoli del foglio.
 *   
 *   // 5. Applica la trasformazione prospettica (Perspective Warp)
 *   // let dsize = new cv.Size(targetWidth, targetHeight);
 *   // let M = cv.getPerspectiveTransform(srcTri, dstTri);
 *   // cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
 *   
 *   // 6. Ritorna il nuovo canvas allineato
 *   cv.imshow(canvas, dst);
 *   
 *   // Pulizia memoria (fondamentale in WebAssembly)
 *   src.delete(); dst.delete(); contours.delete(); hierarchy.delete();
 *   
 *   return canvas;
 * }
 */
