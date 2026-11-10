// Ordered (Bayer 8×8) dithering in two inks, read from CSS (--ink, --paper).
// Every <figure class="dither" data-src="…"> gets a canvas; hovering reveals the original.
(() => {
  const B8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ].map(v => (v + 0.5) / 64);

  const proxied = (src) => `/img?u=${encodeURIComponent(src)}`;
  const rgb = (css) => {
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = css; c.fillRect(0, 0, 1, 1);
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const inks = () => {
    const s = getComputedStyle(document.documentElement);
    return { ink: rgb(s.getPropertyValue('--dither-ink').trim() || '#111'), paper: rgb(s.getPropertyValue('--dither-paper').trim() || '#fff') };
  };

  const cache = new Map(); // src → HTMLImageElement (loaded, same-origin via proxy)
  function load(src) {
    if (!cache.has(src)) cache.set(src, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = proxied(src); }));
    return cache.get(src);
  }

  // pixel: size of one dither dot in CSS px. Bigger = chunkier.
  function paint(canvas, img, { pixel = 2, contrast = 1.15, colors }) {
    const box = canvas.parentElement.getBoundingClientRect();
    const cw = Math.max(8, Math.round(box.width / pixel));
    const ch = Math.max(8, Math.round((box.height || box.width * img.naturalHeight / img.naturalWidth) / pixel));
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // cover-fit the source into the canvas
    const r = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * r, h = img.naturalHeight * r;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    const d = ctx.getImageData(0, 0, cw, ch);
    const px = d.data, { ink, paper } = colors;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        let l = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
        l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5));
        const c = l > B8[(y & 7) * 8 + (x & 7)] ? paper : ink;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      }
    }
    ctx.putImageData(d, 0, 0);
  }

  let colors = null;
  const queue = new Set();
  async function render(fig) {
    const src = fig.dataset.src;
    if (!src) return;
    let canvas = fig.querySelector('canvas');
    if (!canvas) { canvas = document.createElement('canvas'); fig.prepend(canvas); }
    try {
      const img = await load(src);
      colors = colors || inks();
      paint(canvas, img, { pixel: Number(fig.dataset.pixel) || 2, colors });
      fig.classList.add('ready');
    } catch { fig.classList.add('failed'); }
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); render(e.target); }
  }, { rootMargin: '600px 0px' });

  window.dither = {
    scan(root = document) { root.querySelectorAll('figure.dither:not(.ready):not([data-seen])').forEach(f => { f.dataset.seen = '1'; io.observe(f); }); },
    refresh() { colors = null; document.querySelectorAll('figure.dither.ready').forEach(render); },
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => window.dither.refresh());
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => window.dither.refresh(), 250); });
})();
