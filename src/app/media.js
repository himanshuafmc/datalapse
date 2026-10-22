// Reading images people add (logos, entity pictures) into small data URLs.

/** Read an image file, scale it to fit max x max pixels, return a PNG data URL. */
export async function imageFileToDataURL(file, max = 256) {
  if (!/^image\//.test(file.type)) throw new Error('Choose an image file (PNG, JPG, SVG or WebP).');
  if (file.size > 8e6) throw new Error('That image is over 8 MB. Use a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth || 512;
    const h0 = img.naturalHeight || 512;
    const k = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k));
    const h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ask for one file with a hidden input; resolves to the File or null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.className = 'visually-hidden';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    }, { once: true });
    document.body.append(input);
    input.click();
  });
}
