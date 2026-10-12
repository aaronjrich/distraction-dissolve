// Practice page: three short levels that use the real picker.
// content.js (loaded just before this file) exposes window.__dissolve on extension pages.
(() => {
  const api = window.__dissolve;
  const $ = id => document.getElementById(id);
  const stage = $('stage');

  let level = 0;
  let ctx = null;          // what the current level built, e.g. { target }
  let solved = false;
  let finished = false;
  let picking = false;
  let restarting = false;  // true while a level reset toggles pick mode off and on
  let done = 0;            // levels completed
  let countdown = null;
  let popupTimer = null;
  let resetTimer = null;

  const say = (text, kind = '') => {
    const s = $('coach-status');
    s.textContent = text;
    s.className = kind;
  };

  const FILLER = `
    <p>Pages are easier to read when the noise is gone. A good reading space has the text, a few pictures, and nothing that moves, blinks or asks for your email.</p>
    <p>The trick is to remove only what you mean to remove. Take the headline and the story stays. Take the whole column and the page looks broken.</p>`;

  // Each level builds a small scene and then judges whatever you dissolved.
  // judge() returns { win: true, msg } or { msg } for a miss.
  const LEVELS = [
    {
      title: 'Dissolve just one link',
      text: 'Remove the loud sponsored link in the sidebar. Only that link, not the whole sidebar.',
      hint: 'Hover it to see the red box, click once to select it (it turns green), then click it again.',
      build() {
        stage.innerHTML = `
          <div class="page">
            <aside class="side">
              <h3>Trending</h3>
              <a href="#">Ten tips for staying focused</a>
              <a href="#" id="t1">SpOnSoReD LiNk: WiN a FrEe CrUiSe!!!</a>
              <a href="#">Why mornings matter</a>
              <a href="#">A quiet guide to tea</a>
            </aside>
            <article><h2>The calm page</h2>${FILLER}</article>
          </div>`;
        return { target: $('t1') };
      },
      onSelect(el, c) {
        if (el === c.target) return 'That is the link. Click it again, or press Enter, to dissolve it.';
        if (el.contains(c.target)) return 'That is bigger than the link. Press the shrink button beside the green box, or [.';
        return 'That is not the sponsored link. Look for the loud, flashing one.';
      },
      judge(el, c) {
        if (el === c.target) return { win: true, msg: 'Clean. Just that link.' };
        if (el.contains(c.target)) return { msg: 'That took more than the link. Picking the smallest piece is the trick.' };
        return { msg: 'That was not the sponsored link.' };
      },
    },
    {
      title: 'Take the whole card',
      text: 'Dissolve the entire flashing sponsored card: the picture, the headline and the SPONSORED tag, all together.',
      hint: 'Click the headline once. Then press the expand button beside the green box until the whole card is green, and click the card again.',
      build() {
        stage.innerHTML = `
          <div class="page">
            <h2>Today's reading</h2>
            <div class="cards">
              <div class="card"><div class="pic p1"></div><div class="cbody"><a href="#">Five quiet places to read</a></div></div>
              <div class="card shout-card" id="t2">
                <div class="pic p2"><span class="burst">50% OFF!!!</span></div>
                <div class="cbody"><a href="#">ThIs ONE WeIrD TrIcK For YoUr InBoX!!!</a><span class="hurry">Only 3 left! Act NOW!</span><small>SPONSORED</small></div>
              </div>
              <div class="card"><div class="pic p3"></div><div class="cbody"><a href="#">How to cook rice</a></div></div>
            </div>
          </div>`;
        return { target: $('t2') };
      },
      onSelect(el, c) {
        if (el === c.target) return 'That is the whole card. Click it again, or press Enter, to dissolve it.';
        if (c.target.contains(el)) return 'Only part of the card. Press the expand button beside the green box (or ]) to include more.';
        if (el.contains(c.target)) return 'Too big, that includes the other cards. Press the shrink button, or [.';
        return 'That is a different card. Look for the flashing one.';
      },
      judge(el, c) {
        if (el === c.target) return { win: true, msg: 'The whole card, gone.' };
        if (c.target.contains(el)) return { msg: 'That was only part of the card. Select it, then use the expand button.' };
        if (el.contains(c.target)) return { msg: 'That took all the cards. Use the shrink button to step back down.' };
        return { msg: 'That was a different card.' };
      },
    },
    {
      title: 'Beat the popup',
      text: 'A popup is about to cover the page. Dissolve the whole popup within 10 seconds.',
      hint: 'Hover anywhere on the popup. The picker usually grabs the whole box for you. Click, then click again.',
      build() {
        stage.innerHTML = `<div class="page"><article><h2>An article you want to read</h2>${FILLER}${FILLER}</article></div>`;
        const c = { target: null };
        say('Get ready...', 'tip');
        popupTimer = setTimeout(() => {
          const popup = document.createElement('div');
          popup.className = 'popup';
          popup.setAttribute('role', 'dialog');
          popup.innerHTML = `
            <button class="x" aria-label="Close">&times;</button>
            <h3>Join our newsletter!</h3>
            <p>Get 47 emails a week about things you never asked for.</p>
            <input placeholder="you@example.com" aria-label="Email">
            <button class="sub">Subscribe</button>`;
          document.body.appendChild(popup);
          c.target = popup;
          let left = 10;
          say(`${left}s left`, 'tip');
          countdown = setInterval(() => {
            left -= 1;
            if (solved) return;
            if (left > 0) { say(`${left}s left`, 'tip'); return; }
            clearInterval(countdown);
            say('Too slow. It happens to everyone. Resetting...', 'miss');
            resetTimer = setTimeout(() => start(level), 2200);
          }, 1000);
        }, 900);
        return c;
      },
      onSelect(el, c) {
        if (!c.target) return '';
        if (el === c.target) return 'That is the whole popup. Click it again, or press Enter.';
        if (c.target.contains(el)) return 'Only part of the popup. Press the expand button, or ], to take the whole box.';
        return 'That is not the popup.';
      },
      judge(el, c) {
        if (!c.target) return { msg: 'Wait for the popup to appear first.' };
        if (el === c.target) return { win: true, msg: 'Popup dissolved. Back to reading.' };
        if (c.target.contains(el)) return { msg: 'That was only a piece of it, the box is still there.' };
        return { msg: 'That was not the popup.' };
      },
    },
  ];

  function clearTimers() {
    clearInterval(countdown);
    clearTimeout(popupTimer);
    clearTimeout(resetTimer);
    document.querySelectorAll('.popup').forEach(n => n.remove());
  }

  function renderDots() {
    $('coach-dots').innerHTML = LEVELS.map((_, i) =>
      `<span class="dot${i < done ? ' done' : ''}${i === level && !finished ? ' now' : ''}"></span>`).join('');
  }

  function start(n) {
    clearTimers();
    level = n;
    solved = false;
    finished = false;
    const L = LEVELS[n];
    $('coach-step').textContent = `Level ${n + 1} of ${LEVELS.length}`;
    $('coach-title').textContent = L.title;
    $('coach-text').textContent = L.text;
    $('coach-hint').textContent = L.hint;
    $('coach-next').hidden = true;
    $('coach-reset').hidden = false;
    say('');
    renderDots();

    // A clean start: drops any selection that pointed at the old scene
    restarting = true;
    if (picking) api.exit();
    ctx = L.build();
    api.enter();
    restarting = false;
  }

  // Three things to dissolve on the finish page, so the new effect can be tried right away
  function buildPlayground() {
    $('playground').innerHTML = `
      <div class="toy t-a">Free gift!</div>
      <div class="toy t-b">Act now</div>
      <div class="toy t-c">Subscribe</div>`;
  }

  function finish() {
    clearTimers();
    finished = true;
    restarting = true;
    if (picking) api.exit();
    try { chrome.storage.local.set({ practiceDone: true }); } catch {}
    api.unlockBlackHole();
    $('coach-step').textContent = 'All done';
    $('coach-title').textContent = 'New dissolve unlocked';
    $('coach-text').textContent = 'Finishing the practice unlocked the Black hole dissolve. The steps on the right show how to pick it.';
    $('coach-hint').textContent = '';
    $('coach-next').hidden = true;
    $('coach-reset').hidden = true;
    $('coach-start').textContent = 'Practice again';
    $('coach-start').hidden = false;
    say('Nice work.', 'win');
    renderDots();
    stage.innerHTML = `
      <div class="page done-page">
        <div class="unlock">
          <div class="unlock-title">You unlocked the Black hole dissolve!</div>
          <div class="unlock-sub">Everything spirals into the center and vanishes.</div>
        </div>

        <h2>How to pick it</h2>
        <ol class="steps">
          <li>
            <div class="step-text"><b>Open the help panel.</b> Click the <b>?</b> in the bar at the top of the page while you are picking.</div>
            <div class="mock mock-bar"><span class="mock-q">?</span><span class="mock-sep"></span><span>Unhide All</span><span class="mock-done">Done</span></div>
          </li>
          <li>
            <div class="step-text"><b>Set Dissolve to Black hole.</b> It is the second choice in the list.</div>
            <div class="mock mock-row"><span class="mock-key">Dissolve</span><span class="mock-select">Black hole <i>&#9662;</i></span></div>
          </li>
          <li>
            <div class="step-text"><b>Dissolve something.</b> The choice is remembered on every site.</div>
          </li>
        </ol>
        <p><button id="use-bh" class="try-btn" data-dissolve-ui>Switch to Black hole for me</button></p>

        <h2>Try it right here</h2>
        <p>Pick mode is still on. Click one of these once, then again.</p>
        <div id="playground" class="playground"></div>
        <p><button id="toys-back" class="try-btn quiet" data-dissolve-ui>Bring them back</button></p>

        <h2>The short version</h2>
        <ul class="cheats">
          <li><b>Hover</b> to see what you would pick (red box).</li>
          <li><b>Click once</b> to select it (green). <b>Click again</b>, or press <kbd>Enter</kbd>, to dissolve it.</li>
          <li><b>Not the right piece?</b> Use the shrink and expand buttons beside it, or <kbd>[</kbd> and <kbd>]</kbd>.</li>
          <li><b>Changed your mind?</b> <kbd>Esc</kbd> or right-click to deselect. <kbd>Esc</kbd> again to leave pick mode.</li>
          <li><b>Want it back?</b> Unhide All in the bar. Hidden items are remembered next time you visit the page.</li>
        </ul>
        <p class="you-can-close">You can close this tab when you are done.</p>
      </div>`;
    buildPlayground();
    $('use-bh').addEventListener('click', () => {
      api.setEffect('blackhole');
      $('use-bh').textContent = 'Black hole is on. Dissolve one of the boxes below.';
      $('use-bh').disabled = true;
    });
    $('toys-back').addEventListener('click', () => { api.exit(); buildPlayground(); api.enter(); });

    // Keep pick mode on so the effect can be tried on this page
    api.enter();
    restarting = false;
  }

  function onEvent(type, detail) {
    if (type === 'pickmode') {
      picking = detail.on;
      if (picking) {
        $('coach-start').hidden = true;
      } else if (!finished && !solved && !restarting) {
        $('coach-start').textContent = 'Start picking';
        $('coach-start').hidden = false;
        say('Pick mode is off. Press Start picking to continue.', 'tip');
      }
      return;
    }
    if (finished || solved) return;
    const L = LEVELS[level];

    if (type === 'select') {
      const msg = L.onSelect(detail.el, ctx);
      if (msg) say(msg, 'tip');
    }

    if (type === 'dissolve') {
      const res = L.judge(detail.el, ctx);
      if (res.win) {
        solved = true;
        clearInterval(countdown);
        done = Math.max(done, level + 1);
        renderDots();
        say(res.msg, 'win');
        $('coach-next').textContent = level === LEVELS.length - 1 ? 'Finish' : 'Next level';
        $('coach-next').hidden = false;
      } else {
        say(`${res.msg} Resetting...`, 'miss');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => start(level), 2600);
      }
    }
  }

  $('coach-reset').addEventListener('click', () => start(level));
  $('coach-next').addEventListener('click', () => (level === LEVELS.length - 1 ? finish() : start(level + 1)));
  $('coach-start').addEventListener('click', () => {
    if (finished) { done = 0; start(0); } else api.enter();
  });

  if (!api) {
    say('The practice page needs the extension to be running. Reload the extension and open this page again.', 'miss');
    return;
  }
  api.on(onEvent);
  start(0);
})();
