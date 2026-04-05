(() => {
  // ─── State ────────────────────────────────────────────────────────────────
  let pickMode = false;
  let highlighted = null;
  let hiddenLog = []; // track hidden elements for undo
  const STORAGE_KEY = `dissolve-hidden::${location.hostname}${location.pathname}`;

  // ─── Overlay piercing ─────────────────────────────────────────────────────
  // Gets the "real" target even when a transparent overlay sits on top.
  // Strategy: temporarily pointer-events:none the top element and re-hit-test.
  function deepestTarget(x, y) {
    const MAX_DEPTH = 12;
    const disabled = [];
    let target = null;

    for (let i = 0; i < MAX_DEPTH; i++) {
      const el = document.elementFromPoint(x, y);
      if (!el || el === document.documentElement || el === document.body) break;

      // Skip our own UI
      if (el.closest('#dissolve-ui')) break;

      // If element has meaningful visible content, use it
      const style = getComputedStyle(el);
      const hasContent =
        el.textContent.trim().length > 0 ||
        el.querySelector('img, video, canvas, svg') ||
        style.backgroundImage !== 'none';

      // Accept if it has content OR we've dug deep enough
      if (hasContent || i >= 3) {
        target = el;
        break;
      }

      // Otherwise pierce through it
      el.style.setProperty('pointer-events', 'none', 'important');
      disabled.push(el);
    }

    // Restore pointer-events
    disabled.forEach(el => el.style.removeProperty('pointer-events'));

    return target || document.elementFromPoint(x, y);
  }

  // ─── Highlight ────────────────────────────────────────────────────────────
  function setHighlight(el) {
    if (highlighted === el) return;
    clearHighlight();
    if (!el || el.closest('#dissolve-ui')) return;
    highlighted = el;
    el.classList.add('dissolve-hover');
  }

  function clearHighlight() {
    if (highlighted) {
      highlighted.classList.remove('dissolve-hover');
      highlighted = null;
    }
  }

  // ─── Dissolve animation ───────────────────────────────────────────────────
  function dissolveElement(el) {
    if (!el || el.closest('#dissolve-ui')) return;

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Remove highlight class before animating
    el.classList.remove('dissolve-hover');

    // Create particle container fixed over the element
    const canvas = document.createElement('canvas');
    canvas.classList.add('dissolve-canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      pointer-events: none;
      z-index: 2147483647;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const PARTICLE_SIZE = 4;
    const cols = Math.ceil(rect.width / PARTICLE_SIZE);
    const rows = Math.ceil(rect.height / PARTICLE_SIZE);

    // Sample element color via a rendered snapshot approximation
    // We'll use a gradient of the element's background/brand color
    const elStyle = getComputedStyle(el);
    const baseColor = elStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ? elStyle.backgroundColor
      : elStyle.color !== 'rgba(0, 0, 0, 0)'
      ? elStyle.color
      : '#888';

    // Build particles
    const particles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        particles.push({
          x: c * PARTICLE_SIZE,
          y: r * PARTICLE_SIZE,
          originX: c * PARTICLE_SIZE,
          originY: r * PARTICLE_SIZE,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.8) * 8,
          gravity: 0.18 + Math.random() * 0.12,
          alpha: 1,
          size: PARTICLE_SIZE - 0.5,
          // Slight color variation per particle
          hueShift: Math.random() * 40 - 20,
          delay: Math.random() * 0.3, // stagger start
        });
      }
    }

    // Hide the actual element immediately (before animation finishes)
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');

    // Record for persistence + undo
    const record = persistHide(el);
    hiddenLog.push({ el, record });

    // Animate
    const DURATION = 900; // ms
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(elapsed / DURATION, 1);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const p of particles) {
        const pt = Math.max(0, t - p.delay);
        if (pt <= 0) {
          alive = true;
          // Draw at original position before delay kicks in
          ctx.globalAlpha = 1;
          drawParticle(ctx, p.originX, p.originY, p.size, baseColor, p.hueShift);
          continue;
        }

        p.x = p.originX + p.vx * pt * 60;
        p.y = p.originY + p.vy * pt * 60 + 0.5 * p.gravity * Math.pow(pt * 60, 2) * 0.1;
        p.alpha = Math.max(0, 1 - pt * 1.4);

        if (p.alpha > 0) {
          alive = true;
          ctx.globalAlpha = p.alpha;
          drawParticle(ctx, p.x, p.y, p.size * (1 - pt * 0.5), baseColor, p.hueShift);
        }
      }

      if (alive && t < 1) {
        requestAnimationFrame(frame);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(frame);
    updateCounter();
  }

  function drawParticle(ctx, x, y, size, baseColor, hueShift) {
    // Parse base color and apply hue shift
    ctx.fillStyle = shiftColor(baseColor, hueShift);
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 1);
    ctx.fill();
  }

  // Very lightweight color shifter
  function shiftColor(color, shift) {
    // Return a slightly varied version — we fake it with opacity variation
    // since full HSL parsing is heavy. This still gives nice variation.
    const el = document.createElement('div');
    el.style.color = color;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).color;
    el.remove();

    const m = computed.match(/[\d.]+/g);
    if (!m) return color;
    const r = Math.min(255, parseInt(m[0]) + shift * 2);
    const g = Math.min(255, parseInt(m[1]) + shift);
    const b = Math.min(255, parseInt(m[2]) + shift * 1.5);
    return `rgb(${r},${g},${b})`;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────
  // Store a CSS selector path so we can re-hide on page reload
  function selectorPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      const siblings = Array.from(current.parentNode?.children || [])
        .filter(s => s.tagName === current.tagName);
      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function persistHide(el) {
    const selector = selectorPath(el);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!stored.includes(selector)) {
      stored.push(selector);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
    return selector;
  }

  function persistShow(selector) {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = stored.filter(s => s !== selector);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }

  function restoreHidden() {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    stored.forEach(selector => {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.style.setProperty('visibility', 'hidden', 'important');
          el.style.setProperty('pointer-events', 'none', 'important');
        }
      } catch {}
    });
  }

  // ─── Undo ─────────────────────────────────────────────────────────────────
  function undoLast() {
    const last = hiddenLog.pop();
    if (!last) return;
    last.el.style.removeProperty('visibility');
    last.el.style.removeProperty('pointer-events');
    persistShow(last.record);
    updateCounter();
  }

  // ─── UI ───────────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('dissolve-ui')) return;

    const ui = document.createElement('div');
    ui.id = 'dissolve-ui';
    ui.innerHTML = `
      <div id="dissolve-bar">
        <span id="dissolve-icon">✦</span>
        <span id="dissolve-label">Click anything to dissolve it</span>
        <span id="dissolve-counter" class="dissolve-hidden">0 hidden</span>
        <button id="dissolve-undo" title="Undo last (Z)">↩ Undo</button>
        <button id="dissolve-done" title="Done (Esc)">Done</button>
      </div>
    `;
    document.body.appendChild(ui);

    document.getElementById('dissolve-done').addEventListener('click', exitPickMode);
    document.getElementById('dissolve-undo').addEventListener('click', undoLast);
  }

  function destroyUI() {
    document.getElementById('dissolve-ui')?.remove();
  }

  function updateCounter() {
    const counter = document.getElementById('dissolve-counter');
    if (!counter) return;
    const count = hiddenLog.length;
    counter.textContent = `${count} hidden`;
    counter.classList.toggle('dissolve-hidden', count === 0);
  }

  // ─── Pick mode ────────────────────────────────────────────────────────────
  function enterPickMode() {
    if (pickMode) return;
    pickMode = true;
    document.body.classList.add('dissolve-pick-mode');
    buildUI();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function exitPickMode() {
    if (!pickMode) return;
    pickMode = false;
    document.body.classList.remove('dissolve-pick-mode');
    clearHighlight();
    destroyUI();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onMouseMove(e) {
    const target = deepestTarget(e.clientX, e.clientY);
    setHighlight(target);
  }

  function onClick(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const target = deepestTarget(e.clientX, e.clientY);
    if (target && !target.closest('#dissolve-ui')) {
      dissolveElement(target);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') exitPickMode();
    if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey) undoLast();
  }

  // ─── Message bridge from popup/background ────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'togglePickMode') {
      pickMode ? exitPickMode() : enterPickMode();
    }
    if (msg.action === 'showAll') {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      stored.forEach(selector => {
        try {
          const el = document.querySelector(selector);
          if (el) {
            el.style.removeProperty('visibility');
            el.style.removeProperty('pointer-events');
          }
        } catch {}
      });
      localStorage.removeItem(STORAGE_KEY);
      hiddenLog = [];
    }
  });

  // ─── Auto-restore on load ─────────────────────────────────────────────────
  restoreHidden();

})();
