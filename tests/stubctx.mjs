// A canvas 2D context that accepts every call and draws nothing, so scenes
// can be exercised in Node with the real Fig/Axes code.
export function stubContext() {
  const metrics = { width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, fontBoundingBoxAscent: 9, fontBoundingBoxDescent: 3 };
  const fns = {
    measureText: (s) => ({ ...metrics, width: String(s).length * 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  };
  const calls = { n: 0 };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === '__calls') return calls;
      if (prop in fns) return (...a) => (calls.n++, fns[prop](...a));
      if (prop in target) return target[prop];
      return () => {
        calls.n++;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}
