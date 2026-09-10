'use strict';
// Galaxy starfield — canvas backdrop shared by the browser chrome and the
// new-tab page. Draws twinkling stars, drifting nebulae and the occasional
// shooting star; renders one static frame when reduce-motion is on.
(function () {
  function initGalaxy(canvas, opts = {}) {
    if (!canvas) return () => {};
    const ctx = canvas.getContext('2d');
    let stars = [];
    let meteors = [];
    let raf = 0;
    let running = true;
    const reduce = opts.reduceMotion || document.body.classList.contains('reduce-motion');

    function resize() {
      const r = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.max(1, r.width);
      canvas.height = Math.max(1, r.height);
      seed();
      if (reduce) frame(0, true);
    }

    function seed() {
      const n = Math.round((canvas.width * canvas.height) / 5200);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.35,
        p: Math.random() * Math.PI * 2,
        s: 0.4 + Math.random() * 0.8, // twinkle speed
        hue: Math.random() < 0.18 ? 255 + Math.random() * 45 : (Math.random() < 0.5 ? 215 : 48),
      }));
    }

    function frame(t, once = false) {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // nebulae (drift very slowly)
      const neb = (x, y, R, color, a) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, `rgba(${color},${a})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - R, y - R, R * 2, R * 2);
      };
      const tt = reduce ? 0 : t / 1000;
      neb(W * 0.22 + Math.sin(tt / 26) * W * 0.05, H * 0.28 + Math.cos(tt / 31) * H * 0.05, Math.max(W, H) * 0.58, '67,56,158', 0.24);
      neb(W * 0.85 + Math.cos(tt / 22) * W * 0.04, H * 0.75 + Math.sin(tt / 28) * H * 0.06, Math.max(W, H) * 0.52, '124,58,237', 0.2);
      neb(W * 0.55, H * 0.08 + Math.sin(tt / 34) * H * 0.04, Math.max(W, H) * 0.42, '13,148,180', 0.14);

      for (const s of stars) {
        const tw = reduce ? 0.75 : 0.5 + 0.5 * Math.abs(Math.sin(t / 1000 * s.s + s.p));
        ctx.globalAlpha = Math.min(1, tw + 0.25);
        ctx.fillStyle = `hsl(${s.hue} 75% 88%)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reduce) {
        if (Math.random() < 0.004 && meteors.length < 2) {
          meteors.push({ x: Math.random() * W * 0.8 + W * 0.1, y: -20, vx: 2.4 + Math.random() * 2, vy: 3 + Math.random() * 2, life: 1 });
        }
        meteors = meteors.filter(m => m.life > 0);
        for (const m of meteors) {
          m.x += m.vx; m.y += m.vy; m.life -= 0.012;
          const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 16, m.y - m.vy * 16);
          g.addColorStop(0, `rgba(235,230,255,${0.85 * m.life})`);
          g.addColorStop(1, 'rgba(235,230,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(m.x, m.y);
          ctx.lineTo(m.x - m.vx * 16, m.y - m.vy * 16);
          ctx.stroke();
        }
        if (running) raf = requestAnimationFrame(frame);
      }
    }

    resize();
    if (!reduce) raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    if (opts.observeBody !== false) new MutationObserver(resize)
      .observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return function destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }

  window.NTGALAXY = { init: initGalaxy };
})();
