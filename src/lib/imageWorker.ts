// src/lib/imageWorker.ts

self.onmessage = (e: MessageEvent) => {
  const { imageData, useAdaptiveThresholding } = e.data;
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // 1. Contrast Stretching (Equalizzazione leggera)
  // Trova il min e max dei valori di grigio
  let minGray = 255;
  let maxGray = 0;

  // Converti in scala di grigi e trova min/max
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Formula standard luminosità (luminance)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    if (gray < minGray) minGray = gray;
    if (gray > maxGray) maxGray = gray;
    
    // Salva temporaneamente il grigio nei canali RGB
    data[i] = data[i + 1] = data[i + 2] = gray;
  }

  // Evita divisioni per zero se l'immagine è un colore solido
  if (maxGray > minGray) {
    // Applica il contrast stretching
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i];
      const stretched = ((gray - minGray) / (maxGray - minGray)) * 255;
      data[i] = data[i + 1] = data[i + 2] = stretched;
    }
  }

  // 2. Binarizzazione / Soglia Adattiva (Bradley Adaptive Thresholding)
  if (useAdaptiveThresholding) {
    // Il metodo di Bradley calcola la media locale usando un'immagine integrale
    const s = Math.floor(width / 16); // Finestra locale (1/16 della larghezza per catturare dettagli fini)
    const t = 0.15; // Sensibilità (15% più scuro della media locale)
    
    // Crea l'immagine integrale (Int32Array per performance e per evitare overflow)
    const intImg = new Int32Array(width * height);
    
    // Calcolo dell'immagine integrale
    for (let i = 0; i < width; i++) {
      let sum = 0;
      for (let j = 0; j < height; j++) {
        const index = j * width + i;
        const pixel = data[index * 4]; // Il valore di grigio
        sum += pixel;
        if (i === 0) {
          intImg[index] = sum;
        } else {
          intImg[index] = intImg[index - 1] + sum;
        }
      }
    }

    // Applica la soglia adattiva
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        // Definisci i limiti della finestra locale
        const x1 = Math.max(i - s, 0);
        const x2 = Math.min(i + s, width - 1);
        const y1 = Math.max(j - s, 0);
        const y2 = Math.min(j + s, height - 1);
        
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        
        // Somma dei pixel nella finestra usando l'immagine integrale
        let sum = intImg[y2 * width + x2];
        if (x1 > 0) sum -= intImg[y2 * width + (x1 - 1)];
        if (y1 > 0) sum -= intImg[(y1 - 1) * width + x2];
        if (x1 > 0 && y1 > 0) sum += intImg[(y1 - 1) * width + (x1 - 1)];
                  
        const index = j * width + i;
        
        // Se il pixel è più scuro della media locale * (1 - t), è nero (inchiostro/grafite)
        if ((data[index * 4] * count) < (sum * (1.0 - t))) {
          data[index * 4] = 0;     // R
          data[index * 4 + 1] = 0; // G
          data[index * 4 + 2] = 0; // B
        } else {
          // Altrimenti è bianco (sfondo)
          data[index * 4] = 255;     // R
          data[index * 4 + 1] = 255; // G
          data[index * 4 + 2] = 255; // B
        }
        // L'alpha (data[index * 4 + 3]) rimane invariato (255)
      }
    }
  }

  // Restituisci i dati elaborati al thread principale
  // Trasferiamo il buffer per evitare copie in memoria (Zero-copy)
  self.postMessage({ imageData }, [imageData.data.buffer]);
};
