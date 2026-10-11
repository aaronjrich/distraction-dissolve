(() => {
  // ─── State ────────────────────────────────────────────────────────────────
  let pickMode = false;
  let hoveredEl = null;   // element under cursor (red preview)
  let selectedEl = null;  // element locked in by first click (green outline)
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

  // ─── Picking ──────────────────────────────────────────────────────────────
  // Start from the innermost visible thing under the cursor, then keep its
  // ancestors as a chain the user can grow or shrink with [ and ].
  const POPUP_MAX_FRACTION = 0.8; // popups bigger than this share of the viewport are not auto-picked
  const REPLACED_TAGS = new Set(['img', 'video', 'canvas', 'svg', 'picture', 'iframe', 'input', 'select', 'textarea', 'button', 'embed', 'object']);
  const INLINE_TAGS = new Set(['span', 'b', 'i', 'em', 'strong', 'small', 'u', 'mark', 'code', 'abbr', 'sub', 'sup', 'font']);
  const POPUP_TOKENS = new Set([
    'modal', 'popup', 'popover', 'dialog', 'lightbox', 'cookie', 'cookies', 'consent',
    'newsletter', 'interstitial', 'toast', 'snackbar',
    'ad', 'ads', 'advert', 'advertisement', 'sponsor', 'sponsored',
  ]);

  let chain = [];          // candidate elements, innermost first
  let chainIdx = 0;        // which candidate is highlighted
  let chainStart = null;   // the innermost element the chain was built from
  let levelAdjusted = false;

  // Whole-token class matching, so "header" never matches "ad"
  function classTokens(el) {
    const raw = el.getAttribute('class') || '';
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  function isTransparent(color) {
    return color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);
  }

  // Skips invisible click-catching layers that sit on top of the real content
  function looksVisible(el) {
    if (REPLACED_TAGS.has(el.tagName.toLowerCase())) return true;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    if (cs.backgroundImage !== 'none' || !isTransparent(cs.backgroundColor)) return true;
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }

  function baseElementAt(x, y) {
    const stack = document.elementsFromPoint(x, y);
    if (!stack.length || stack[0].closest('#dissolve-ui')) return null;
    let found = null;
    for (const el of stack) {
      if (el === document.documentElement || el === document.body) break;
      if (looksVisible(el)) { found = el; break; }
    }
    // Pick the whole <svg>, not a path inside it
    while (found?.ownerSVGElement) found = found.ownerSVGElement;
    return found;
  }

  function sameBox(a, b) {
    return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 &&
           Math.abs(a.right - b.right) < 3 && Math.abs(a.bottom - b.bottom) < 3;
  }

  function buildChain(start) {
    const out = [];
    let lastRect = null;
    for (let cur = start; cur && cur !== document.body && cur !== document.documentElement; cur = cur.parentElement) {
      const rect = cur.getBoundingClientRect();
      // A wrapper with the same box as its child adds nothing; keep the outer one
      if (lastRect && sameBox(rect, lastRect)) out[out.length - 1] = cur;
      else out.push(cur);
      lastRect = rect;
    }
    return out;
  }

  // A box that floats over the page: dialog, cookie banner, corner widget, ad slot
  function isPopupLike(el) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 20) return false;
    if (rect.width > vw * POPUP_MAX_FRACTION || rect.height > vh * POPUP_MAX_FRACTION) return false;
    const role = el.getAttribute('role');
    if (el.tagName === 'DIALOG' || role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true') return true;
    if (getComputedStyle(el).position === 'fixed') return true;
    return classTokens(el).some(t => POPUP_TOKENS.has(t));
  }

  function defaultIndex(list) {
    let i = 0;
    // Text-level tags (span, b, em...) are never the item you mean, so go to their parent
    while (i < list.length - 1 && INLINE_TAGS.has(list[i].tagName.toLowerCase())) i++;
    // If the item sits inside a popup, prefer the whole popup (outermost one that fits)
    let popup = -1;
    for (let j = i; j < list.length; j++) if (isPopupLike(list[j])) popup = j;
    return popup >= 0 ? popup : i;
  }

  function refreshChain(x, y) {
    const start = baseElementAt(x, y);
    if (!start) { chain = []; chainStart = null; return false; }
    if (start !== chainStart) {
      chainStart = start;
      chain = buildChain(start);
      chainIdx = defaultIndex(chain);
    }
    return chain.length > 0;
  }

  function resetChain() { chain = []; chainStart = null; levelAdjusted = false; }

  function adjustLevel(delta) {
    if (!chain.length) return;
    const next = Math.max(0, Math.min(chain.length - 1, chainIdx + delta));
    if (next === chainIdx) return;
    chainIdx = next;
    if (selectedEl) { setSelected(chain[chainIdx]); levelAdjusted = true; }
    else setHovered(chain[chainIdx]);
  }

  function pointInside(el, x, y) {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  // ─── Size label ───────────────────────────────────────────────────────────
  function showLabel(el) {
    const label = document.getElementById('dissolve-label');
    if (!label || !el) return;
    const r = el.getBoundingClientRect();
    const cls = (el.getAttribute('class') || '').split(/\s+/).find(c => c && !c.startsWith('dissolve-'));
    let text = `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    if (text.length > 36) text = text.slice(0, 35) + '…';
    label.textContent = `${text}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    label.style.display = 'block';
    const top = r.top >= 28 ? r.top - 26 : Math.min(r.bottom + 4, window.innerHeight - 26);
    label.style.top = `${top}px`;
    label.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - label.offsetWidth - 4))}px`;
  }

  function hideLabel() {
    const label = document.getElementById('dissolve-label');
    if (label) label.style.display = 'none';
  }

  // ─── Hover preview ────────────────────────────────────────────────────────
  function setHovered(el) {
    if (hoveredEl === el) return;
    clearHovered();
    if (!el || el.closest('#dissolve-ui')) return;
    hoveredEl = el;
    el.classList.add('dissolve-hovered');
    showLabel(el);
  }

  function clearHovered() {
    hoveredEl?.classList.remove('dissolve-hovered');
    hoveredEl = null;
    if (!selectedEl) hideLabel();
  }

  // ─── Selection (first click locks in) ────────────────────────────────────
  function setSelected(el) {
    clearSelected();
    if (!el || el.closest('#dissolve-ui')) return;
    selectedEl = el;
    el.classList.remove('dissolve-hovered');
    el.classList.add('dissolve-selected');
    document.getElementById('dissolve-bar')?.classList.add('dissolve-bar-ready');
    showLabel(el);
  }

  function clearSelected() {
    selectedEl?.classList.remove('dissolve-selected');
    selectedEl = null;
    levelAdjusted = false;
    document.getElementById('dissolve-bar')?.classList.remove('dissolve-bar-ready');
    hideLabel();
  }

  // ─── Two-click interaction ────────────────────────────────────────────────
  function onMouseMove(e) {
    // Only show hover preview when nothing is selected yet
    if (selectedEl) return;
    if (!refreshChain(e.clientX, e.clientY)) { clearHovered(); return; }
    const target = chain[chainIdx];
    if (debugMode && target !== hoveredEl) {
      const r = target.getBoundingClientRect();
      console.log('Hovered target:', target.tagName, target.getAttribute('class'), target.id, 'size:', r.width + 'x' + r.height, 'level:', chainIdx + 1 + '/' + chain.length);
    }
    setHovered(target);
  }

  function onPickClick(e) {
    if (e.target?.closest?.('#dissolve-ui')) return;
    const found = refreshChain(e.clientX, e.clientY);

    // Second click on the selected item (or anywhere inside it after resizing): dissolve
    if (selectedEl && ((found && chain[chainIdx] === selectedEl) ||
        (levelAdjusted && pointInside(selectedEl, e.clientX, e.clientY)))) {
      const toDissolve = selectedEl;
      clearSelected();
      resetChain();
      dissolveElement(toDissolve);
      return;
    }

    if (!found) return;
    // First click, or clicked something else: (re)select
    clearHovered();
    setSelected(chain[chainIdx]);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (selectedEl) clearSelected();  // first Esc: deselect
      else exitPickMode();              // second Esc: exit
    } else if (e.key === '[') {
      e.preventDefault();
      adjustLevel(-1);
    } else if (e.key === ']') {
      e.preventDefault();
      adjustLevel(1);
    }
  }

  let lastWheel = 0;
  function onWheel(e) {
    if (!e.shiftKey) return; // plain scrolling still works in pick mode
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 120) return;
    lastWheel = now;
    adjustLevel((e.deltaY || e.deltaX) < 0 ? 1 : -1);
  }

  function onContextMenu(e) {
    e.preventDefault();
    clearSelected();
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
        <div class="d-help-row"><span class="d-key">1st tap</span><span>Select an item — it turns green</span></div>
        <div class="d-help-row"><span class="d-key">2nd tap</span><span>Dissolve it away ✦</span></div>
        <div class="d-help-row"><span class="d-key">Other tap</span><span>Change selection</span></div>
        <div class="d-help-row"><span class="d-key">[ &nbsp;]</span><span>Pick a smaller or larger piece (or Shift+scroll)</span></div>
        <div class="d-help-row"><span class="d-key">Right-click</span><span>Deselect current item</span></div>
        <div class="d-help-row"><span class="d-key">Esc</span><span>Deselect or exit mode</span></div>
        <button id="d-debug-toggle" style="width: 100%; padding: 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); cursor: pointer; font-size: 12px;">Debug Mode: OFF</button>
        <p class="d-note">Hidden items are remembered next time you visit this page.</p>
      </div>
    `;
    document.body.appendChild(ui);

    // Lives outside #dissolve-ui because that wrapper is transformed, which would
    // break position: fixed
    const label = document.createElement('div');
    label.id = 'dissolve-label';
    document.body.appendChild(label);

    document.getElementById('d-done').addEventListener('click', exitPickMode);
    document.getElementById('d-showall').addEventListener('click', showAll);
    document.getElementById('d-debug-toggle').addEventListener('click', () => {
      debugMode = !debugMode;
      localStorage.setItem('dissolve-debug', debugMode);
      const btn = document.getElementById('d-debug-toggle');
      btn.textContent = `Debug Mode: ${debugMode ? 'ON' : 'OFF'}`;
      btn.style.background = debugMode ? 'rgba(72, 187, 120, 0.2)' : 'rgba(255,255,255,0.08)';
      btn.style.color = debugMode ? '#9ae6b4' : 'rgba(255,255,255,0.7)';
      console.log('Dissolve debug mode:', debugMode ? 'ON' : 'OFF');
    });
    document.getElementById('d-help-btn').addEventListener('click', () => {
      const panel = document.getElementById('d-help');
      const btn = document.getElementById('d-help-btn');
      const isOpen = !panel.classList.contains('d-hidden');
      panel.classList.toggle('d-hidden', isOpen);
      btn.classList.toggle('d-help-active', !isOpen);
      // Update debug button state when help opens
      if (!isOpen) {
        const debugBtn = document.getElementById('d-debug-toggle');
        debugBtn.textContent = `Debug Mode: ${debugMode ? 'ON' : 'OFF'}`;
        debugBtn.style.background = debugMode ? 'rgba(72, 187, 120, 0.2)' : 'rgba(255,255,255,0.08)';
        debugBtn.style.color = debugMode ? '#9ae6b4' : 'rgba(255,255,255,0.7)';
      }
    });
  }

  function destroyUI() {
    document.getElementById('dissolve-ui')?.remove();
    document.getElementById('dissolve-label')?.remove();
  }

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
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
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
    document.removeEventListener('contextmenu', onContextMenu, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', onWheel, { capture: true });
    resetChain();
  }

  // ─── Message bridge ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'togglePickMode') pickMode ? exitPickMode() : enterPickMode();
    if (msg.action === 'showAll') showAll();
  });

  // ─── Auto-restore on page load ────────────────────────────────────────────
  restoreHidden();

})();
