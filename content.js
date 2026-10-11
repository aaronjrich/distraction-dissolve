(() => {
  // The manifest injects this file, and the toolbar button injects it again on tabs
  // that were open before an install or update; only the first copy may run
  if (window.__dissolveLoaded) return;
  window.__dissolveLoaded = true;

  // ─── State ────────────────────────────────────────────────────────────────
  let pickMode = false;
  let hoveredEl = null;   // element under cursor (red preview)
  let selectedEl = null;  // element locked in by first click (green outline)
  let hiddenLog = [];
  let lastMouse = null;   // last pointer position, to refresh the hover after a scroll
  let debugMode = false;  // loaded from chrome.storage.local at startup

  // ─── Block ALL interaction during pick mode ───────────────────────────────
  const BLOCKED_EVENTS = [
    'click', 'mousedown', 'mouseup',
    'pointerdown', 'pointerup',
    'touchstart', 'touchend',
    'contextmenu',
  ];

  // The bar, help panel and the − / + buttons: never picked, never blocked
  function isOwnUI(el) {
    return !!el?.closest?.('#dissolve-ui, #dissolve-size');
  }

  function blockEvent(e) {
    if (isOwnUI(e.target)) return; // allow our own UI
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

  // Everything under the point, topmost first, looking inside open shadow roots
  // (many modern sites, MSN included, build their pages from web components)
  function stackAt(x, y, root = document) {
    const out = [];
    for (const el of root.elementsFromPoint(x, y)) {
      // A shadow root's own list also repeats the outer page; keep only its own tree
      if (root !== document && el.getRootNode() !== root) continue;
      if (el.shadowRoot) out.push(...stackAt(x, y, el.shadowRoot));
      out.push(el);
    }
    return out;
  }

  function parentOf(el) {
    return el.parentElement || el.getRootNode().host || null;
  }

  function describe(el) {
    const cls = (el.getAttribute('class') || '').trim().replace(/\s+/g, '.');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''}`;
  }

  // The page's own container (html > body > app root...): never the item you mean.
  // Fixed overlays are exempt, since a full-screen popup is something to dissolve.
  function isPageSized(el) {
    const r = el.getBoundingClientRect();
    if (r.width * r.height < window.innerWidth * window.innerHeight * 0.7) return false;
    return getComputedStyle(el).position !== 'fixed';
  }

  function baseElementAt(x, y) {
    const stack = stackAt(x, y).filter(el => el.id !== 'dissolve-shield');
    if (debugMode && stack.length) console.log('Dissolve stack:', stack.slice(0, 12).map(describe));
    if (!stack.length || isOwnUI(stack[0])) return null;
    let found = null;
    for (const el of stack) {
      if (el === document.documentElement || el === document.body) break;
      if (isPageSized(el)) continue;
      if (looksVisible(el)) { found = el; break; }
    }
    // Pick the whole <svg>, not a path inside it
    while (found?.ownerSVGElement) found = found.ownerSVGElement;
    return found;
  }

  // ─── Highlight boxes ──────────────────────────────────────────────────────
  // Drawn as overlays instead of classes on the page's own elements, so they
  // also work inside shadow DOM and never touch the page
  function placeBox(id, el) {
    const box = document.getElementById(id);
    if (!box) return;
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  }

  let refreshQueued = false;
  function refreshBoxes() {
    if (refreshQueued || !pickMode) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      if (!pickMode) return;
      if (selectedEl) { placeBox('dissolve-sel', selectedEl); showLabel(selectedEl); showSizeControls(); }
      else if (hoveredEl) { placeBox('dissolve-hl', hoveredEl); showLabel(hoveredEl); }
      if (!selectedEl && lastMouse) onMouseMove(lastMouse);
    });
  }

  function sameBox(a, b) {
    return Math.abs(a.left - b.left) < 3 && Math.abs(a.top - b.top) < 3 &&
           Math.abs(a.right - b.right) < 3 && Math.abs(a.bottom - b.bottom) < 3;
  }

  function buildChain(start) {
    const out = [];
    let lastRect = null;
    for (let cur = start; cur && cur !== document.body && cur !== document.documentElement; cur = parentOf(cur)) {
      if (isPageSized(cur)) break; // growing stops short of the whole page
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

  // ─── Smaller / larger buttons ─────────────────────────────────────────────
  // Sit beside the selected item, so the choice is visible where you are looking
  function showSizeControls() {
    const box = document.getElementById('dissolve-size');
    if (!box) return;
    if (!selectedEl) { box.style.display = 'none'; return; }
    const r = selectedEl.getBoundingClientRect();
    box.style.display = 'flex';
    document.getElementById('d-smaller').disabled = chainIdx <= 0;
    document.getElementById('d-larger').disabled = chainIdx >= chain.length - 1;

    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + 8;                                   // below the item
    if (top + h > vh - 8) top = r.top - h - 8;                // else above it
    if (top < 8) top = Math.max(8, Math.min(r.top + 8, vh - h - 8)); // item fills the screen
    box.style.top = `${top}px`;
    box.style.left = `${Math.max(8, Math.min(r.right - w, vw - w - 8))}px`;
  }

  // ─── Hover preview ────────────────────────────────────────────────────────
  function setHovered(el) {
    if (hoveredEl === el) return;
    clearHovered();
    if (!el || isOwnUI(el)) return;
    hoveredEl = el;
    placeBox('dissolve-hl', el);
    showLabel(el);
  }

  function clearHovered() {
    hoveredEl = null;
    placeBox('dissolve-hl', null);
    if (!selectedEl) hideLabel();
  }

  // ─── Selection (first click locks in) ────────────────────────────────────
  function setSelected(el) {
    clearSelected();
    if (!el || isOwnUI(el)) return;
    selectedEl = el;
    clearHovered();
    placeBox('dissolve-sel', el);
    document.getElementById('dissolve-bar')?.classList.add('dissolve-bar-ready');
    showLabel(el);
    showSizeControls();
  }

  function clearSelected() {
    selectedEl = null;
    levelAdjusted = false;
    placeBox('dissolve-sel', null);
    document.getElementById('dissolve-bar')?.classList.remove('dissolve-bar-ready');
    hideLabel();
    showSizeControls();
  }

  // ─── Two-click interaction ────────────────────────────────────────────────
  function onMouseMove(e) {
    // Only show hover preview when nothing is selected yet
    lastMouse = { clientX: e.clientX, clientY: e.clientY };
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
    if (isOwnUI(e.target)) return;
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
  // The click-capture layer sits over the page, so scrolling an inner
  // scrollable area (a feed, a sidebar) has to be passed on by hand
  function scrollableAt(x, y, dx, dy) {
    const start = stackAt(x, y).find(el => el.id !== 'dissolve-shield');
    for (let cur = start; cur && cur !== document.body && cur !== document.documentElement; cur = parentOf(cur)) {
      const cs = getComputedStyle(cur);
      const canY = dy && /(auto|scroll)/.test(cs.overflowY) && cur.scrollHeight > cur.clientHeight &&
        (dy < 0 ? cur.scrollTop > 0 : cur.scrollTop + cur.clientHeight < cur.scrollHeight - 1);
      const canX = dx && /(auto|scroll)/.test(cs.overflowX) && cur.scrollWidth > cur.clientWidth &&
        (dx < 0 ? cur.scrollLeft > 0 : cur.scrollLeft + cur.clientWidth < cur.scrollWidth - 1);
      if (canY || canX) return cur;
    }
    return null;
  }

  function onWheel(e) {
    if (!e.shiftKey) {
      const inner = scrollableAt(e.clientX, e.clientY, e.deltaX, e.deltaY);
      if (inner) { e.preventDefault(); inner.scrollBy(e.deltaX, e.deltaY); }
      return; // otherwise the page itself scrolls as normal
    }
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
  // Two effects, chosen from the dropdown in the help panel:
  //   dust       real pixels of the item break away in a wave and drift off
  //   blackhole  real pixels spiral into the center and vanish
  // Both animate a screenshot of the item (the background script takes it). If
  // the screenshot fails, they run on a flat patch of the item's own color.
  const EFFECTS = ['dust', 'blackhole'];
  const MAX_PARTICLES = 32000;
  let effect = 'dust';

  try {
    chrome.storage?.local?.get({ dissolveEffect: 'dust' }, r => {
      if (EFFECTS.includes(r?.dissolveEffect)) { effect = r.dissolveEffect; syncEffectSelect(); }
    });
  } catch {}

  function setEffect(name) {
    if (!EFFECTS.includes(name)) return;
    effect = name;
    try { chrome.storage?.local?.set({ dissolveEffect: name }); } catch {}
  }

  function syncEffectSelect() {
    const sel = document.getElementById('d-fx');
    if (sel) sel.value = effect;
  }

  function dissolveElement(el) {
    if (!el || isOwnUI(el)) return;
    const rect = el.getBoundingClientRect();

    // Zero-size items and reduced-motion users just get a plain hide
    if (rect.width < 2 || rect.height < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hideEl(el);
      return;
    }

    captureElement(el).catch(() => null).then(snap => {
      snap = snap || flatSnapshot(el);
      hideEl(el);
      if (snap) (effect === 'blackhole' ? runBlackHole : runDust)(snap);
    });
  }

  // The part of the element that is on screen
  function visibleBox(el) {
    const r = el.getBoundingClientRect();
    const left = Math.max(0, r.left);
    const top = Math.max(0, r.top);
    const width = Math.min(window.innerWidth, r.right) - left;
    const height = Math.min(window.innerHeight, r.bottom) - top;
    return width < 4 || height < 4 ? null : { left, top, width, height };
  }

  // Stand-in when no screenshot is available: a flat patch of the item's color
  function flatSnapshot(el) {
    const box = visibleBox(el);
    if (!box) return null;
    const cs = getComputedStyle(el);
    const color =
      !/^rgba\(.*,\s*0\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'transparent' ? cs.backgroundColor :
      cs.color || '#999';
    const scale = window.devicePixelRatio || 1;
    const src = document.createElement('canvas');
    src.width = Math.max(1, Math.round(box.width * scale));
    src.height = Math.max(1, Math.round(box.height * scale));
    const ctx = src.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, src.width, src.height);
    return { src, scale, ...box };
  }

  const nextFrames = n => new Promise(resolve => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

  // Screenshot of the visible part of the element, cropped to its box
  async function captureElement(el) {
    const vw = window.innerWidth;
    const box = visibleBox(el);
    if (!box) return null;
    const { left, top, width, height } = box;

    // Keep our own bar and highlights out of the picture
    const own = ['dissolve-ui', 'dissolve-size', 'dissolve-label', 'dissolve-hl', 'dissolve-sel']
      .map(id => document.getElementById(id)).filter(Boolean);
    own.forEach(n => n.style.setProperty('visibility', 'hidden', 'important'));
    let url;
    try {
      await nextFrames(2);
      const res = await chrome.runtime.sendMessage({ action: 'captureTab' });
      url = res?.url;
    } finally {
      own.forEach(n => n.style.removeProperty('visibility'));
    }
    if (!url) return null;

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const scale = img.width / vw; // device pixels per CSS pixel
    const src = document.createElement('canvas');
    src.width = Math.max(1, Math.round(width * scale));
    src.height = Math.max(1, Math.round(height * scale));
    src.getContext('2d').drawImage(img, left * scale, top * scale, width * scale, height * scale, 0, 0, src.width, src.height);
    return { src, scale, left, top, width, height };
  }

  // A canvas over the element's spot, with room around it (in device pixels)
  function makeStage(snap, padX, padY) {
    const canvas = document.createElement('canvas');
    canvas.classList.add('dissolve-canvas');
    canvas.width = snap.src.width + padX * 2;
    canvas.height = snap.src.height + padY * 2;
    canvas.style.cssText = `
      position:fixed;left:${snap.left - padX / snap.scale}px;top:${snap.top - padY / snap.scale}px;
      width:${canvas.width / snap.scale}px;height:${canvas.height / snap.scale}px;
      pointer-events:none;z-index:2147483647;
    `;
    document.documentElement.appendChild(canvas);
    return { canvas, ctx: canvas.getContext('2d') };
  }

  // Cut the picture into small cells, each with a few random numbers of its own
  function makeGrid(w, h) {
    const cell = Math.max(2, Math.ceil(Math.sqrt((w * h) / MAX_PARTICLES)));
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const n = cols * rows;
    const g = {
      cell, n,
      gx: new Float32Array(n), gy: new Float32Array(n),
      r1: new Float32Array(n), r2: new Float32Array(n), r3: new Float32Array(n),
    };
    for (let i = 0, row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++, i++) {
        g.gx[i] = col * cell;
        g.gy[i] = row * cell;
        g.r1[i] = Math.random();
        g.r2[i] = Math.random();
        g.r3[i] = Math.random();
      }
    }
    return g;
  }

  // Dust: a wave sweeps left to right; each cell lifts off, drifts up and
  // to the right on a wobbling path, shrinks and fades
  function runDust(snap) {
    const S = snap.scale;
    const { src } = snap;
    const pad = Math.round(140 * S);
    const { canvas, ctx } = makeStage(snap, pad, pad);
    const g = makeGrid(src.width, src.height);
    const DURATION = 2000;
    const start = performance.now();

    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < g.n; i++) {
        const nx = g.gx[i] / src.width;
        const ny = g.gy[i] / src.height;
        const delay = (nx * 0.75 + (1 - ny) * 0.1) * 700 + g.r1[i] * 220;
        const life = 650 + g.r2[i] * 500;
        const p = (t - delay) / life;
        if (p >= 1) continue;

        if (p <= 0) {
          ctx.globalAlpha = 1;
          ctx.drawImage(src, g.gx[i], g.gy[i], g.cell, g.cell, pad + g.gx[i], pad + g.gy[i], g.cell, g.cell);
          continue;
        }

        const sec = (p * life) / 1000;
        const x = g.gx[i] + (70 + g.r3[i] * 180) * S * sec + Math.sin(p * 6 + g.r2[i] * 6.28) * 10 * S * p;
        const y = g.gy[i] - (25 + g.r1[i] * 110) * S * sec + Math.cos(p * 5 + g.r3[i] * 6.28) * 8 * S * p;
        const size = g.cell * (1 - 0.55 * p);
        ctx.globalAlpha = 1 - Math.pow(p, 1.6);
        ctx.drawImage(src, g.gx[i], g.gy[i], g.cell, g.cell, pad + x, pad + y, size, size);
      }

      t < DURATION ? requestAnimationFrame(frame) : canvas.remove();
    }

    frame(start); // paint the untouched picture in the same frame the element disappears
  }

  // Black hole: cells spiral in toward the center, inner ones twisting more,
  // while a dark core swells and closes
  function runBlackHole(snap) {
    const S = snap.scale;
    const { src } = snap;
    const w = src.width;
    const h = src.height;
    const R = Math.hypot(w, h) / 2;
    const padX = Math.ceil(R - w / 2);
    const padY = Math.ceil(R - h / 2);
    const { canvas, ctx } = makeStage(snap, padX, padY);
    const g = makeGrid(w, h);
    const cx = padX + w / 2;
    const cy = padY + h / 2;

    const r0 = new Float32Array(g.n);
    const a0 = new Float32Array(g.n);
    for (let i = 0; i < g.n; i++) {
      const dx = g.gx[i] + g.cell / 2 - w / 2;
      const dy = g.gy[i] + g.cell / 2 - h / 2;
      r0[i] = Math.hypot(dx, dy);
      a0[i] = Math.atan2(dy, dx);
    }

    const DURATION = 1700;
    const start = performance.now();

    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < g.n; i++) {
        const near = 1 - r0[i] / R; // 0 at the edge, 1 at the center
        const delay = near * 120 + g.r1[i] * 200;
        const life = 950 + g.r2[i] * 350;
        const p = (t - delay) / life;
        if (p >= 1) continue;

        if (p <= 0) {
          ctx.globalAlpha = 1;
          ctx.drawImage(src, g.gx[i], g.gy[i], g.cell, g.cell, padX + g.gx[i], padY + g.gy[i], g.cell, g.cell);
          continue;
        }

        const r = r0[i] * (1 - p * p);
        const a = a0[i] + (1.8 + near * 3.2 + g.r3[i] * 0.8) * Math.PI * Math.pow(p, 1.3);
        const size = g.cell * (1 - 0.7 * p);
        ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
        ctx.drawImage(src, g.gx[i], g.gy[i], g.cell, g.cell,
          cx + r * Math.cos(a) - size / 2, cy + r * Math.sin(a) - size / 2, size, size);
      }

      const pulse = Math.min(1, t / 350) * (t > DURATION - 400 ? Math.max(0, (DURATION - t) / 400) : 1);
      if (pulse > 0) {
        const rad = Math.min(w, h) * 0.22 * pulse + 6 * S;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        grad.addColorStop(0, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.6, 'rgba(10,0,30,0.55)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      t < DURATION ? requestAnimationFrame(frame) : canvas.remove();
    }

    frame(start);
  }

  // ─── Hide + remember ──────────────────────────────────────────────────────
  // Hidden items are saved per page in chrome.storage.local (not the site's own
  // localStorage). Each record holds a selector path plus a fingerprint (tag,
  // stable classes and id, size, text), so an item can still be found when the
  // site's layout shifts. Matching is retried for a while after load because
  // many sites draw their content late.
  const WATCH_MS = 12000;
  let pageKey = '';           // host + path the records belong to
  let records = [];           // { sel, fp } for this page
  const matched = new Map();  // record -> element currently hidden for it
  let observer = null;
  let watchTimer = null;
  let applyTimer = null;

  const pageId = () => `${location.hostname}${location.pathname}`;

  function applyHide(el) {
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function unapplyHide(el) {
    el.style.removeProperty('display');
    el.style.removeProperty('pointer-events');
  }

  function hideEl(el) {
    const record = persistHide(el); // fingerprint first, while it still has a size
    applyHide(el);
    hiddenLog.push({ el, record });
    updateBadge();
  }

  // ─── Fingerprint ──────────────────────────────────────────────────────────
  // Generated ids and class names (ad frames, CSS-in-JS hashes) change on every
  // load, so they are left out
  function stableId(el) {
    const id = el.id || '';
    if (!id || id.length > 60 || /\d{3,}/.test(id) || /^(:r|ember|react|google_ads|aswift|gpt)/i.test(id)) return '';
    return id;
  }

  function stableClasses(el) {
    return (el.getAttribute('class') || '').split(/\s+/).filter(c =>
      c && c.length <= 40 && !c.startsWith('dissolve-') && !/\d{3,}/.test(c) &&
      !/^(css|sc|jsx|svelte|emotion)-/i.test(c) && !/^(?=.*\d)(?=.*[a-z])[a-z0-9]{6,}$/i.test(c));
  }

  function textHint(el) {
    return (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  }

  function fingerprint(el) {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: stableId(el),
      cls: stableClasses(el).slice(0, 6),
      w: Math.round(r.width),
      h: Math.round(r.height),
      text: textHint(el),
    };
  }

  function score(el, fp) {
    let s = 0;
    if (fp.id && stableId(el) === fp.id) s += 0.5;
    const cls = stableClasses(el);
    if (fp.cls.length && cls.length) {
      const common = fp.cls.filter(c => cls.includes(c)).length;
      s += (0.3 * common) / (fp.cls.length + cls.length - common);
    }
    if (fp.text) {
      const t = textHint(el);
      if (t === fp.text) s += 0.3;
      else if (t && (t.startsWith(fp.text.slice(0, 30)) || fp.text.startsWith(t.slice(0, 30)))) s += 0.15;
    }
    const r = el.getBoundingClientRect();
    if (fp.w && Math.abs(r.width - fp.w) <= fp.w * 0.15 && Math.abs(r.height - fp.h) <= fp.h * 0.15) s += 0.2;
    return s;
  }

  // Cheap test run before the (slower) scoring
  function passesGate(el, fp) {
    if (!fp.id && !fp.cls.length) return true;
    if (fp.id && stableId(el) === fp.id) return true;
    const cls = stableClasses(el);
    return fp.cls.some(c => cls.includes(c));
  }

  function bestByFingerprint(fp, taken) {
    let best = null;
    let bestScore = 0;
    const pool = document.getElementsByTagName(fp.tag);
    const limit = Math.min(pool.length, 4000);
    for (let i = 0; i < limit; i++) {
      const el = pool[i];
      if (taken.has(el) || isOwnUI(el) || !passesGate(el, fp)) continue;
      const s = score(el, fp);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    return bestScore >= 0.5 ? best : null;
  }

  function findMatch(rec, taken) {
    const byPath = queryPath(rec.sel);
    const fp = rec.fp;
    if (byPath && !taken.has(byPath)) {
      if (!fp) return byPath; // migrated from 1.0.11: a path is all there is
      if (byPath.tagName.toLowerCase() === fp.tag &&
          ((!fp.id && !fp.cls.length && !fp.text) || score(byPath, fp) >= 0.2)) return byPath;
    }
    return fp ? bestByFingerprint(fp, taken) : null;
  }

  // ─── Selector path ────────────────────────────────────────────────────────
  // Path inside one tree (the document, or a single shadow root)
  function pathInTree(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      let sel = cur.tagName.toLowerCase();
      const id = stableId(cur);
      if (id) { sel += `#${CSS.escape(id)}`; parts.unshift(sel); break; }
      const sibs = Array.from(cur.parentNode?.children || []).filter(s => s.tagName === cur.tagName);
      if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  // Elements inside shadow DOM get one path per tree, joined with " >>> "
  function selectorPath(el) {
    const segs = [];
    for (let cur = el; cur; ) {
      segs.unshift(pathInTree(cur));
      const root = cur.getRootNode();
      cur = root instanceof ShadowRoot ? root.host : null;
    }
    return segs.join(' >>> ');
  }

  function queryPath(sel) {
    let root = document;
    let el = null;
    try {
      for (const seg of sel.split(' >>> ')) {
        if (!root) return null;
        el = root.querySelector(seg);
        if (!el) return null;
        root = el.shadowRoot;
      }
    } catch { return null; }
    return el;
  }

  // ─── Storage ──────────────────────────────────────────────────────────────
  const storageKey = id => `hidden::${id}`;

  function saveRecords() {
    const key = storageKey(pageKey || pageId());
    try {
      if (records.length) chrome.storage.local.set({ [key]: records });
      else chrome.storage.local.remove(key);
    } catch {}
  }

  function persistHide(el) {
    if (!pageKey) pageKey = pageId();
    const rec = { sel: selectorPath(el), fp: fingerprint(el) };
    const old = records.find(r => r.sel === rec.sel);
    if (old) { old.fp = rec.fp; matched.set(old, el); saveRecords(); return old; }
    records.push(rec);
    matched.set(rec, el);
    saveRecords();
    return rec;
  }

  async function loadRecords(id) {
    const key = storageKey(id);
    let list = [];
    try { list = (await chrome.storage.local.get(key))?.[key] || []; } catch {}

    // One-time move from the site's own localStorage (1.0.11 and earlier)
    const oldKey = `dissolve-hidden::${id}`;
    try {
      const old = JSON.parse(localStorage.getItem(oldKey) || 'null');
      if (Array.isArray(old)) {
        for (const sel of old) if (!list.some(r => r.sel === sel)) list.push({ sel });
        await chrome.storage.local.set({ [key]: list });
        localStorage.removeItem(oldKey);
      }
    } catch {}
    return list;
  }

  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get({ dissolveDebug: null });
      let dbg = res?.dissolveDebug;
      if (dbg === null || dbg === undefined) {
        const old = localStorage.getItem('dissolve-debug');
        dbg = old === 'true';
        if (old !== null) { chrome.storage.local.set({ dissolveDebug: dbg }); localStorage.removeItem('dissolve-debug'); }
      }
      debugMode = !!dbg;
    } catch {}
  }

  // ─── Re-applying ──────────────────────────────────────────────────────────
  function applyRecords() {
    for (const rec of records) {
      const cur = matched.get(rec);
      if (cur && cur.isConnected) {
        if (cur.style.display !== 'none') applyHide(cur); // the site cleared our style
        continue;
      }
      if (cur) {
        hiddenLog = hiddenLog.filter(h => h.el !== cur);
        matched.delete(rec);
      }
      const el = findMatch(rec, new Set(matched.values()));
      if (!el) continue;
      applyHide(el);
      matched.set(rec, el);
      hiddenLog.push({ el, record: rec });
    }
    updateBadge();
  }

  async function syncPage() {
    pageKey = pageId();
    const live = records;
    matched.clear();
    hiddenLog = [];
    records = await loadRecords(pageKey);
    for (const r of live) if (!records.some(x => x.sel === r.sel)) records.push(r);
    applyRecords();
  }

  function stopWatching() {
    observer?.disconnect();
    observer = null;
    clearTimeout(watchTimer);
    clearTimeout(applyTimer);
  }

  // Keep matching for a while: content that draws late, or is re-drawn, gets hidden too
  function startWatching() {
    stopWatching();
    observer = new MutationObserver(() => {
      clearTimeout(applyTimer);
      applyTimer = setTimeout(() => { if (records.length) applyRecords(); }, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    watchTimer = setTimeout(stopWatching, WATCH_MS);
  }

  function showAll() {
    hiddenLog.forEach(({ el }) => unapplyHide(el));
    hiddenLog = [];
    matched.clear();
    records = [];
    saveRecords();
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
        <div class="d-help-row"><span class="d-key">[ &nbsp;]</span><span>Smaller or larger piece: the shrink and expand buttons, these keys, or Shift+scroll</span></div>
        <div class="d-help-row"><span class="d-key">Right-click</span><span>Deselect current item</span></div>
        <div class="d-help-row"><span class="d-key">Esc</span><span>Deselect or exit mode</span></div>
        <div class="d-help-row"><span class="d-key">Dissolve</span>
          <select id="d-fx" aria-label="Dissolve effect">
            <option value="dust">Dust</option>
            <option value="blackhole">Black hole</option>
          </select>
        </div>
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

    // A transparent layer over the page: ads in iframes would otherwise swallow
    // the mouse events and set their own cursor
    for (const id of ['dissolve-shield', 'dissolve-hl', 'dissolve-sel']) {
      const el = document.createElement('div');
      el.id = id;
      document.documentElement.appendChild(el);
    }

    const size = document.createElement('div');
    size.id = 'dissolve-size';
    size.innerHTML = `
      <button id="d-smaller" title="Select a smaller piece ( [ )" aria-label="Select a smaller piece">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
      <button id="d-larger" title="Select a larger piece ( ] )" aria-label="Select a larger piece">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
      </button>
    `;
    document.documentElement.appendChild(size);
    document.getElementById('d-smaller').addEventListener('click', () => adjustLevel(-1));
    document.getElementById('d-larger').addEventListener('click', () => adjustLevel(1));

    syncEffectSelect();
    document.getElementById('d-fx').addEventListener('change', e => setEffect(e.target.value));
    document.getElementById('d-done').addEventListener('click', exitPickMode);
    document.getElementById('d-showall').addEventListener('click', showAll);
    document.getElementById('d-debug-toggle').addEventListener('click', () => {
      debugMode = !debugMode;
      try { chrome.storage.local.set({ dissolveDebug: debugMode }); } catch {}
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
    ['dissolve-shield', 'dissolve-hl', 'dissolve-sel', 'dissolve-size'].forEach(id => document.getElementById(id)?.remove());
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
    window.addEventListener('scroll', refreshBoxes, true);
    window.addEventListener('resize', refreshBoxes);
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
    window.removeEventListener('scroll', refreshBoxes, true);
    window.removeEventListener('resize', refreshBoxes);
    resetChain();
    lastMouse = null;
  }

  // ─── Message bridge ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'togglePickMode') pickMode ? exitPickMode() : enterPickMode();
    if (msg.action === 'showAll') showAll();
  });

  // ─── Auto-restore on page load ────────────────────────────────────────────
  (async () => {
    await loadSettings();
    await syncPage();
    startWatching();

    // Single-page sites change the URL without reloading: switch to that page's list
    setInterval(async () => {
      if (pageId() === pageKey) return;
      await syncPage();
      startWatching();
    }, 1000);
  })();

})();
