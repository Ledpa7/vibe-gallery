import type { PixelCrop, Crop } from 'react-image-crop';

/**
 * Generate a final 480x480 WebP blob from a cropped image region
 */
export const generateCroppedBlob = (
  imgElement: HTMLImageElement,
  activeCrop: PixelCrop | Crop
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (!imgElement || !activeCrop) return reject('No crop data');
    const canvas = document.createElement('canvas');
    const scaleX = imgElement.naturalWidth / imgElement.width;
    const scaleY = imgElement.naturalHeight / imgElement.height;
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, 480, 480);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      imgElement,
      activeCrop.x * scaleX,
      activeCrop.y * scaleY,
      activeCrop.width * scaleX,
      activeCrop.height * scaleY,
      0, 0, 480, 480
    );
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject('Canvas failed');
    }, 'image/webp', 0.82); // Balanced WebP
  });
};

/**
 * Automatically adapts to any aspect ratio while injecting 1.6x perfectly uniform padding.
 * Guarantees small thumbnails forcibly trigger the 340px UI ceiling, while panoramic images maintain
 * maximum possible horizontal footprint without being forcefully squashed into square canvas blocks.
 */
export const createProportionalPaddedCanvas = (src: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      
      // 1.6x size generates generous 30% symmetrical margins around the content bounds.
      let canvasW = w * 1.6;
      let canvasH = h * 1.6;

      // Automatically bypass tiny image float issues by enforcing a minimum native resolution 
      // that physically pushes against the CSS 'max-h' constraints to touch ceilings natively.
      if (Math.max(canvasW, canvasH) < 1000) {
          const scaleUp = 1000 / Math.max(canvasW, canvasH);
          canvasW *= scaleUp;
          canvasH *= scaleUp;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0a0a0c'; 
      ctx.fillRect(0, 0, canvasW, canvasH);
      
      const drawScale = (canvasW / 1.6) / w;
      const drawW = w * drawScale;
      const drawH = h * drawScale;
      const x = (canvasW - drawW) / 2;
      const y = (canvasH - drawH) / 2;
      
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x, y, drawW, drawH);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.src = src;
  });
};
