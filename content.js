(() => {
  // ─── State ────────────────────────────────────────────────────────────────
  let pickMode = false;
  let hoveredEl = null;   // element under cursor (grey preview)
  let selectedEl = null;  // element locked in by first click (blue outline)
  let hiddenLog = [];
  let debugMode = localStorage.getItem('dissolve-debug') === 'true';
  const STORAGE_KEY = `dissolve-hidden::${location.hostname}${location.pathname}`;

  // ─── Block ALL interaction during pick mode ───────────────────────────────
  const BLOCKED_EVENTS = [
    'click', 'mousedown', 'mouseup',
    'pointerdown', 'pointerup',
    'touchstart', 'touchend',
    'contextmenu',
  ];

  function blockEvent(e) {
    if (e.target?.closest('#dissolve-ui')) return; // allow our own UI
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function installBlockers() {
    BLOCKED_EVENTS.forEach(type =>
      document.addEventListener(type, blockEvent, { capture: true, passive: false })
    );
  }

  function removeBlockers() {
    BLOCKED_EVENTS.forEach(type =>
      document.removeEventListener(type, blockEvent, { capture: true })
    );
  }

  // ─── Overlay piercing ─────────────────────────────────────────────────────
  // Temporarily disables pointer-events on layers to find the real target
  function deepestTarget(x, y) {
    const MAX_DEPTH = 20;
    const disabled = [];
    let target = null;

    for (let i = 0; i < MAX_DEPTH; i++) {
      const el = document.elementFromPoint(x, y);
      if (!el || el === document.documentElement || el === document.body) break;
      if (el.closest('#dissolve-ui')) break;

      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const hasContent =
        el.textContent.trim().length > 0 ||
        el.querySelector('img, video, canvas, svg') ||
        style.backgroundImage !== 'none';

      // Check if element is interactive
      const isInteractive = el.tagName === 'BUTTON' || el.tagName === 'A' || 
                            el.tagName === 'INPUT' || el.tagName === 'SELECT' ||
                            el.getAttribute('role') === 'button' ||
                            el.getAttribute('role') === 'link' ||
                            style.cursor === 'pointer';

      // Detect structural/layout containers by class name patterns
      const classStr = (el.className || '').toLowerCase();
      const tagStr = (el.tagName || '').toLowerCase();
      const containerKeywords = ['page', 'feed', 'wrapper', 'container', 'structure', 'provider', 'root', 'grid', 'layout'];
      const isStructural = containerKeywords.some(kw => classStr.includes(kw) || tagStr.includes(kw));
      
      // Skip structural containers unless they're small or interactive
      const isLargeStructural = isStructural && rect.width > vpW * 0.3 && !isInteractive;

      // Accept if interactive, or has content and not structural, or we've dug deep enough
      if (isInteractive || (hasContent && !isLargeStructural) || i >= 15) {
        target = el;
        break;
      }

      el.style.setProperty('pointer-events', 'none', 'important');
      disabled.push(el);
    }

    disabled.forEach(el => el.style.removeProperty('pointer-events'));
    return target || document.elementFromPoint(x, y);
  }

  // ─── Hover grey preview ───────────────────────────────────────────────────
  function setHovered(el) {
    if (hoveredEl === el) return;
    clearHovered();
    if (!el || el.closest('#dissolve-ui')) return;
    hoveredEl = el;
    el.classList.add('dissolve-hovered');
  }

  function clearHovered() {
    hoveredEl?.classList.remove('dissolve-hovered');
    hoveredEl = null;
  }

  // ─── Selection (first click locks in) ────────────────────────────────────
  function setSelected(el) {
    clearSelected();
    if (!el || el.closest('#dissolve-ui')) return;
    selectedEl = el;
    el.classList.remove('dissolve-hovered');
    el.classList.add('dissolve-selected');
    document.getElementById('dissolve-bar')?.classList.add('dissolve-bar-ready');
  }

  function clearSelected() {
    selectedEl?.classList.remove('dissolve-selected');
    selectedEl = null;
    document.getElementById('dissolve-bar')?.classList.remove('dissolve-bar-ready');
  }

  // ─── iOS two-tap interaction ──────────────────────────────────────────────
  function onMouseMove(e) {
    // Only show hover preview when nothing is selected yet
    if (!selectedEl) {
      const target = deepestTarget(e.clientX, e.clientY);
      if (debugMode) {
        console.log('Hovered target:', target?.tagName, target?.className, target?.id, 'size:', target?.getBoundingClientRect().width + 'x' + target?.getBoundingClientRect().height);
      }
      setHovered(target);
    }
  }

  function onPickClick(e) {
    const target = deepestTarget(e.clientX, e.clientY, e.shiftKey);
    if (!target || target.closest('#dissolve-ui')) return;

    if (!selectedEl) {
      // First tap: select
      clearHovered();
      setSelected(target);
    } else if (selectedEl === target) {
      // Second tap on same element: dissolve
      const toDissolve = selectedEl;
      clearSelected();
      dissolveElement(toDissolve);
    } else {
      // Tapped something else: reselect
      clearSelected();
      setSelected(target);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (selectedEl) clearSelected();  // first Esc: deselect
      else exitPickMode();              // second Esc: exit
    }
    // Ctrl+Shift+D to toggle debug mode
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      debugMode = !debugMode;
      localStorage.setItem('dissolve-debug', debugMode);
      console.log('Dissolve debug mode:', debugMode ? 'ON' : 'OFF');
    }
  }

  // ─── Dissolve animation ───────────────────────────────────────────────────
  function dissolveElement(el) {
    if (!el || el.closest('#dissolve-ui')) return;
    el.classList.remove('dissolve-selected', 'dissolve-hovered');

    const rect = el.getBoundingClientRect();

    // Element may have zero size (e.g. hidden overlay) — just hide silently
    if (rect.width < 2 || rect.height < 2) { hideEl(el); return; }

    // Canvas — cap size to avoid massive memory use
    const MAX_DIM = 1200;
    const scale = Math.min(1, MAX_DIM / Math.max(rect.width, rect.height));
    const cw = Math.ceil(rect.width * scale);
    const ch = Math.ceil(rect.height * scale);

    const canvas = document.createElement('canvas');
    canvas.classList.add('dissolve-canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.cssText = `
      position:fixed;left:${rect.left}px;top:${rect.top}px;
      width:${rect.width}px;height:${rect.height}px;
      pointer-events:none;z-index:2147483647;
    `;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const PS = 5; // particle size
    const cols = Math.ceil(cw / PS);
    const rows = Math.ceil(ch / PS);

    // Sample element color
    const elStyle = getComputedStyle(el);
    const baseColor =
      elStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? elStyle.backgroundColor :
      elStyle.color !== 'rgba(0, 0, 0, 0)' ? elStyle.color : '#999';

    // Build particle grid
    const particles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        particles.push({
          ox: c * PS, oy: r * PS,
          x: c * PS,  y: r * PS,
          vx: (Math.random() - 0.5) * 8,
          vy: -(Math.random() * 6 + 2),
          gravity: 0.14 + Math.random() * 0.16,
          alpha: 1,
          size: PS - 0.5,
          hue: Math.random() * 60 - 30,
          delay: Math.random() * 0.28,
        });
      }
    }

    // Hide the real element right away
    hideEl(el);

    const DURATION = 820;
    const start = performance.now();

    function frame(now) {
      const t = Math.min((now - start) / DURATION, 1);
      ctx.clearRect(0, 0, cw, ch);
      let alive = false;

      for (const p of particles) {
        const pt = Math.max(0, t - p.delay);

        if (pt <= 0) {
          // Not started yet — draw at origin
          ctx.globalAlpha = 1;
          ctx.fillStyle = shiftColor(baseColor, p.hue);
          ctx.beginPath();
          ctx.roundRect(p.ox, p.oy, p.size, p.size, 1);
          ctx.fill();
          alive = true;
          continue;
        }

        const prog = pt * 55;
        p.x = p.ox + p.vx * prog;
        p.y = p.oy + p.vy * prog + 0.5 * p.gravity * prog * prog * 0.13;
        p.alpha = Math.max(0, 1 - pt * 1.5);

        if (p.alpha > 0.01) {
          alive = true;
          ctx.globalAlpha = p.alpha;
          const s = p.size * (1 - pt * 0.35);
          ctx.fillStyle = shiftColor(baseColor, p.hue);
          ctx.beginPath();
          ctx.roundRect(p.x, p.y, Math.max(0.5, s), Math.max(0.5, s), 1);
          ctx.fill();
        }
      }

      alive && t < 1 ? requestAnimationFrame(frame) : canvas.remove();
    }

    requestAnimationFrame(frame);
  }

  // Lightweight color variation — avoids full HSL parsing
  function shiftColor(color, shift) {
    const tmp = document.createElement('div');
    tmp.style.color = color;
    document.body.appendChild(tmp);
    const c = getComputedStyle(tmp).color;
    tmp.remove();
    const m = c.match(/[\d.]+/g);
    if (!m || m.length < 3) return color;
    return `rgb(${clamp(+m[0] + shift * 2)},${clamp(+m[1] + shift)},${clamp(+m[2] + shift * 1.5)})`;
  }
  function clamp(v) { return Math.min(255, Math.max(0, Math.round(v))); }

  // ─── Hide + persist ───────────────────────────────────────────────────────
  function hideEl(el) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    const record = persistHide(el);
    hiddenLog.push({ el, record });
    updateBadge();
  }

  function selectorPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      if (cur.id) { sel += `#${CSS.escape(cur.id)}`; parts.unshift(sel); break; }
      const sibs = Array.from(cur.parentNode?.children || []).filter(s => s.tagName === cur.tagName);
      if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function persistHide(el) {
    const sel = selectorPath(el);
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!stored.includes(sel)) { stored.push(sel); localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }
    } catch {}
    return sel;
  }

  function restoreHidden() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      stored.forEach(sel => {
        try {
          const el = document.querySelector(sel);
          if (el) { el.style.setProperty('visibility', 'hidden', 'important'); el.style.setProperty('pointer-events', 'none', 'important'); }
        } catch {}
      });
    } catch {}
  }

  function showAll() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      stored.forEach(sel => {
        try { const el = document.querySelector(sel); if (el) { el.style.removeProperty('display'); el.style.removeProperty('pointer-events'); } } catch {}
      });
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    hiddenLog.forEach(({ el }) => { el.style.removeProperty('display'); el.style.removeProperty('pointer-events'); });
    hiddenLog = [];
    updateBadge();
  }

  // ─── UI bar ───────────────────────────────────────────────────────────────
  function buildUI() {
    if (document.getElementById('dissolve-ui')) return;
    const ui = document.createElement('div');
    ui.id = 'dissolve-ui';
    ui.innerHTML = `
      <div id="dissolve-bar">
        <button id="d-help-btn" aria-label="Help" title="How to use">?</button>
        <div id="d-divider"></div>
        <span id="d-badge" class="d-hidden">0</span>
        <button id="d-showall">Unhide All</button>
        <button id="d-done">Done</button>
      </div>
      <div id="d-help" class="d-hidden">
        <div class="d-help-row"><span class="d-key">1st tap</span><span>Select an item — it turns blue</span></div>
        <div class="d-help-row"><span class="d-key">2nd tap</span><span>Dissolve it away ✦</span></div>
        <div class="d-help-row"><span class="d-key">Other tap</span><span>Change selection</span></div>
        <div class="d-help-row"><span class="d-key">Shift+click</span><span>Pierce deeper overlays</span></div>
        <div class="d-help-row"><span class="d-key">Esc</span><span>Deselect / Exit</span></div>
        <div class="d-help-row"><span class="d-key">Ctrl+Shift+D</span><span>Toggle debug logging</span></div>
        <p class="d-note">Hidden items are remembered next time you visit this page.</p>
      </div>
    `;
    document.body.appendChild(ui);

    document.getElementById('d-done').addEventListener('click', exitPickMode);
    document.getElementById('d-showall').addEventListener('click', showAll);
    document.getElementById('d-help-btn').addEventListener('click', () => {
      const panel = document.getElementById('d-help');
      const btn = document.getElementById('d-help-btn');
      const isOpen = !panel.classList.contains('d-hidden');
      panel.classList.toggle('d-hidden', isOpen);
      btn.classList.toggle('d-help-active', !isOpen);
    });
  }

  function destroyUI() { document.getElementById('dissolve-ui')?.remove(); }

  function updateBadge() {
    const badge = document.getElementById('d-badge');
    if (!badge) return;
    badge.textContent = hiddenLog.length;
    badge.classList.toggle('d-hidden', hiddenLog.length === 0);
  }

  // ─── Pick mode lifecycle ──────────────────────────────────────────────────
  function enterPickMode() {
    if (pickMode) return;
    pickMode = true;
    document.body.classList.add('dissolve-pick-mode');
    buildUI();
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    installBlockers();
  }

  function exitPickMode() {
    if (!pickMode) return;
    pickMode = false;
    document.body.classList.remove('dissolve-pick-mode');
    removeBlockers();
    clearHovered();
    clearSelected();
    destroyUI();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  // ─── Message bridge ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'togglePickMode') pickMode ? exitPickMode() : enterPickMode();
    if (msg.action === 'showAll') showAll();
  });

  // ─── Auto-restore on page load ────────────────────────────────────────────
  restoreHidden();

})();
