/* Judy's Picks: interaction and motion.

   Progressive by design. With no script, a missing library, or a reduced-motion
   preference, the page settles into a plain, fully readable layout (see the
   "static" mode below). Nothing here is required to read the page or follow a link.

   Sections
     1. Setup                  6. Directory filters
     2. Stage (pinned scene)   7. Pointer-following tile
     3. Scroll reveals         8. Odometer, footer wordmark, manifesto fill
     4. Navigation and menu    9. Boot
     5. In-page links
*/
(function () {
  'use strict';

  /* ---------- 1. Setup ---------- */

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || doc).querySelectorAll(sel));

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const scrubOK = !!(gsap && ScrollTrigger) && !reduce;

  if (gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    // Phone toolbars showing and hiding should not rebuild the scene.
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  const debounce = (fn, ms) => {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Measures the small viewport height (browser toolbars showing).
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  doc.body.appendChild(probe);
  const smallVH = () => probe.offsetHeight || window.innerHeight;

  /* Layout mode for the opening scene:
       static  - no pinning; hero, photo and feature stack (reduced motion, very short screens)
       overlay - wide screens; the photo fills a framed stage and the copy sits on it
       card    - tall or narrow screens; the photo becomes a card with copy underneath */
  function pickMode() {
    if (!scrubOK) return 'static';
    const w = window.innerWidth;
    const h = smallVH();
    if (h < 540) return 'static';
    return w >= 900 && w / h >= 1.05 ? 'overlay' : 'card';
  }

  let mode = null;
  let stage = null;
  let introDone = false;

  function setMode(force) {
    const next = pickMode();
    if (next === mode && !force) return false;
    if (stage) { stage.kill(); stage = null; }
    mode = next;
    root.classList.toggle('pin', mode !== 'static');
    root.classList.toggle('pin-overlay', mode === 'overlay');
    root.classList.toggle('pin-card', mode === 'card');
    if (mode !== 'static') stage = buildStage(mode);
    return true;
  }

  /* ---------- 2. Stage (pinned scene) ----------
     The photo lives on a full-scene layer. A clip-path window travels from the
     pill in the headline (S) to the feature frame (T) while the image inside
     scales from "cover the pill" to "cover the frame". Only clip-path, transform
     and opacity change, all scrubbed by scroll position. */

  function buildStage(stageMode) {
    const stageEl = $('.stage');
    const pin = $('.stage__pin');
    const scene = $('.stage__scene');
    const inner = $('.hero__inner');
    const shift = $('.wall__shift');
    const slot = $('.pill-slot');
    const link = $('.pill-link');
    const media = $('.media');
    const box = $('.media__box');
    const caption = $('.media__caption');
    const frame = $('.feature__frame');
    const scrim = $('.feature__scrim');
    const copy = $('.feature__copy');
    const dim = $('.stage__dim');
    const heroBits = [$('.hero__top')].concat($$('.hero__row'), [$('.hero__foot')]);
    const copyBits = [$('.feature__eyebrow'), $('.feature__text'), $('.feature__actions')];
    const lines = $$('.feature__title .mask__in');

    const img = $('.media__img');
    const st = { e: 0, intro: introDone ? 1 : 0, hover: 0 };
    let S = { x: 0, y: 0, w: 0, h: 0 };
    let T = { x: 0, y: 0, w: 1, h: 1 };
    let radius = 0, sceneW = 0, sceneH = 0, s0 = 1, tx0 = 0, ty0 = 0;

    // Layout rect relative to the scene; ignores transforms on purpose.
    function rectIn(node) {
      let x = 0, y = 0, n = node;
      while (n && n !== scene) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: x, y: y, w: node.offsetWidth, h: node.offsetHeight };
    }

    function render() {
      const e = st.e;
      const s = s0 + (1 - s0) * e;
      box.style.transform = 'translate3d(' + (tx0 * (1 - e)).toFixed(2) + 'px,' + (ty0 * (1 - e)).toFixed(2) + 'px,0) scale(' + s.toFixed(5) + ')';

      const sW = S.w * st.intro;
      // The pill swells a few pixels under the pointer: a hint that it opens.
      const grow = st.hover * (1 - e) * 5;
      const x = S.x + (T.x - S.x) * e - grow;
      const y = S.y + (T.y - S.y) * e - grow * 0.6;
      const w = sW + (T.w - sW) * e + grow * 2;
      const h = S.h + (T.h - S.h) * e + grow * 1.2;
      const r = S.h / 2 + (radius - S.h / 2) * e + grow * 0.6;
      media.style.clipPath = 'inset(' + y.toFixed(2) + 'px ' + (sceneW - x - w).toFixed(2) + 'px ' +
        (sceneH - y - h).toFixed(2) + 'px ' + x.toFixed(2) + 'px round ' + r.toFixed(2) + 'px)';
    }

    function measure() {
      sceneW = scene.offsetWidth;
      sceneH = scene.offsetHeight;
      S = rectIn(slot);
      T = rectIn(frame);
      radius = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 0;

      box.style.left = T.x + 'px';
      box.style.top = T.y + 'px';
      box.style.width = T.w + 'px';
      box.style.height = T.h + 'px';

      // Scale and offset that make the frame-sized image cover the pill.
      s0 = Math.max(S.w / T.w, S.h / T.h);
      const bw = T.w * s0;
      const bh = T.h * s0;
      const focusY = stageMode === 'overlay' ? 0.46 : 0.5;
      const left0 = clamp(S.x + S.w / 2 - bw / 2, S.x + S.w - bw, S.x);
      const top0 = clamp(S.y + S.h / 2 - focusY * bh, S.y + S.h - bh, S.y);
      tx0 = left0 - T.x;
      ty0 = top0 - T.y;

      link.style.left = S.x + 'px';
      link.style.top = S.y + 'px';
      link.style.width = S.w + 'px';
      link.style.height = S.h + 'px';
      render();
    }

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: stageEl,
        start: 'top top',
        end: () => '+=' + Math.max(200, stageEl.offsetHeight - 2 * pin.offsetHeight),
        // A touch of smoothing for wheels; fingers get a direct 1:1 link.
        scrub: fine ? 0.45 : true,
        onRefresh: measure,
        onUpdate: sync
      }
    });

    // One unit of timeline time is roughly one screen of scrolling.
    tl.to(st, { e: 1, duration: 1, ease: 'power2.inOut', onUpdate: render }, 0)
      .to(shift, { autoAlpha: 0, duration: 0.45 }, 0.05)
      .fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.7)
      .fromTo(caption, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.9)
      // The photo eases back a touch as it opens, so it settles rather than stops.
      // This tween also sets the timeline's full length: the last stretch is a
      // hold on the finished feature before the next section slides over.
      .fromTo(img, { scale: 1.07 }, { scale: 1, duration: 1.7 }, 0);
    heroBits.forEach((el, i) => {
      tl.to(el, { opacity: 0, y: -22, duration: 0.3 }, i * 0.03);
    });
    lines.forEach((el, i) => {
      tl.fromTo(el, { yPercent: 142 }, { yPercent: 0, duration: 0.42, ease: 'power3.out' }, 0.8 + i * 0.07);
    });
    copyBits.forEach((el, i) => {
      tl.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.34, ease: 'power2.out' }, 0.86 + i * 0.06);
    });

    // The next section slides over the scene; push the scene back as it does.
    const cover = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: '.sheet', start: 'top bottom', end: 'top top', scrub: true }
    });
    cover.fromTo(scene, { scale: 1, clipPath: 'inset(0px round 0px)' }, { scale: 0.94, clipPath: 'inset(0px round 26px)' }, 0)
      .fromTo(dim, { opacity: 0 }, { opacity: 0.42 }, 0);

    function sync() {
      const t = tl.time();
      root.classList.toggle('is-featuring', t > 0.3);
      root.classList.toggle('is-featured', t >= 1.02);
    }

    function featureY() {
      const trig = tl.scrollTrigger;
      return trig.start + (trig.end - trig.start) * (1.36 / tl.duration());
    }

    // Keyboard and screen-reader users can land on either half of the scene
    // without scrolling: bring the half they focused into view.
    const listeners = new AbortController();
    copy.addEventListener('focusin', () => {
      if (tl.time() < 1.02) window.scrollTo({ top: featureY(), behavior: 'auto' });
    }, { signal: listeners.signal });
    inner.addEventListener('focusin', () => {
      if (tl.time() > 0.2) window.scrollTo({ top: tl.scrollTrigger.start, behavior: 'auto' });
    }, { signal: listeners.signal });

    if (fine) {
      const swell = (to) => gsap.to(st, { hover: to, duration: 0.45, ease: 'power3.out', overwrite: 'auto', onUpdate: render });
      link.addEventListener('pointerenter', () => swell(1), { signal: listeners.signal });
      link.addEventListener('pointerleave', () => swell(0), { signal: listeners.signal });
    }

    let introTween = null;
    function playIntro() {
      if (st.intro === 1) return;
      if (window.scrollY > 4) { st.intro = 1; render(); return; }
      introTween = gsap.to(st, { intro: 1, duration: 1.25, delay: 0.3, ease: 'expo.out', onUpdate: render });
    }

    function kill() {
      listeners.abort();
      if (introTween) introTween.kill();
      gsap.killTweensOf(st);
      cover.scrollTrigger.kill();
      cover.kill();
      tl.scrollTrigger.kill();
      tl.kill();
      gsap.set(heroBits.concat(copyBits, lines, [shift, scrim, caption, scene, dim, img]), { clearProps: 'all' });
      media.style.clipPath = '';
      box.removeAttribute('style');
      link.removeAttribute('style');
      root.classList.remove('is-featuring', 'is-featured');
    }

    measure();
    sync();
    return { kill: kill, featureY: featureY, playIntro: playIntro, measure: measure };
  }

  /* ---------- 3. Scroll reveals ----------
     One IntersectionObserver adds .is-in; CSS does the rest. Blocks that arrive
     in the same frame are staggered. */

  function initReveals() {
    const items = $$('[data-reveal]').concat($$('.footer__mark'));
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      let n = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.style.setProperty('--i', n++);
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- 4. Navigation and menu ---------- */

  const menu = (function () {
    const el = $('#menu');
    const btn = $('.nav__toggle');
    const nav = $('.nav');
    const label = $('.nav__toggle-label');
    const main = $('#main');
    const footer = $('.footer');
    let open = false;

    function set(next, keepFocus) {
      if (next === open) return;
      open = next;
      el.classList.toggle('is-open', open);
      el.inert = !open;
      btn.setAttribute('aria-expanded', String(open));
      label.textContent = open ? 'Close' : 'Menu';
      nav.classList.toggle('is-menu', open);
      nav.classList.remove('is-hidden');
      root.classList.toggle('is-locked', open);
      main.inert = open;
      footer.inert = open;
      if (!open && !keepFocus) btn.focus({ preventScroll: true });
    }

    btn.addEventListener('click', () => set(!open));
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) set(false, true);
    });
    doc.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); set(false); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the header button and the sheet.
      const stops = [btn].concat($$('a, button', el));
      const last = stops[stops.length - 1];
      if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); btn.focus(); }
      else if (e.shiftKey && doc.activeElement === btn) { e.preventDefault(); last.focus(); }
    });
    window.matchMedia('(min-width: 860px)').addEventListener('change', (e) => {
      if (e.matches) set(false, true);
    });

    return { close: () => set(false, true), isOpen: () => open };
  })();

  function initNav() {
    const nav = $('.nav');
    let last = window.scrollY;
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      nav.classList.toggle('is-scrolled', y > 8);
      if (Math.abs(y - last) < 6) return;
      // Out of the way going down, back the moment you scroll up.
      nav.classList.toggle('is-hidden', y > last && y > 160 && !menu.isOpen());
      last = y;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---------- 5. In-page links ---------- */

  function goTo(id, instant) {
    const target = id && id !== 'top' ? doc.getElementById(id) : null;
    if (id && id !== 'top' && !target) return false;
    let y = 0;
    if (id === 'pink-drink' && stage) y = stage.featureY();
    else if (target) {
      const rect = target.getBoundingClientRect();
      // Small targets (the social links) land mid-screen so their surroundings show too.
      y = target.dataset.scroll === 'center'
        ? rect.top + window.scrollY - (window.innerHeight - rect.height) / 2
        : rect.top + window.scrollY - (id === 'about' ? 28 : 0);
    }
    window.scrollTo({ top: Math.max(0, y), behavior: instant || reduce ? 'auto' : 'smooth' });
    if (target) target.focus({ preventScroll: true });
    return true;
  }

  doc.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (id && id !== 'top' && !doc.getElementById(id)) return;
    e.preventDefault();
    menu.close();
    goTo(id || 'top');
    try { history.replaceState(null, '', id && id !== 'top' ? '#' + id : location.pathname + location.search); } catch (err) { /* file:// */ }
  });

  /* ---------- 6. Directory filters ---------- */

  const filter = (function () {
    const chips = $$('.chip');
    const rows = $$('.pick');
    const count = $('#picks-count');
    const labels = {
      all: 'Showing all 7 brands and programs',
      wellness: 'Showing 4 wellness picks',
      income: 'Showing 3 side-income ideas',
      everyday: 'Showing 1 everyday find'
    };

    function apply(name) {
      if (!labels[name]) name = 'all';
      chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filter === name)));
      rows.forEach((row) => {
        const on = name === 'all' || row.dataset.cat.split(' ').indexOf(name) !== -1;
        row.classList.toggle('is-out', !on);
        row.inert = !on;
      });
      if (count) count.textContent = labels[name];
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const name = chip.dataset.filter;
        apply(name);
        try { history.replaceState(null, '', name === 'all' ? '#picks' : '#' + name); } catch (err) { /* file:// */ }
      });
    });

    return { apply: apply, has: (name) => name !== 'all' && !!labels[name], rows: rows };
  })();

  // Supports links like /#wellness that open the directory already filtered.
  function handleHash(instant) {
    const id = location.hash.slice(1);
    if (!id) return;
    if (filter.has(id)) { filter.apply(id); goTo('picks', instant); return; }
    goTo(id, instant);
  }

  /* ---------- 7. Pointer-following tile ----------
     Decorative, desktop only. Rides a lane between the brand name and its
     description so it never covers what you are reading. */

  function initTile() {
    const tile = $('.tile');
    const list = $('#list');
    if (!tile || !list || !fine || !gsap || reduce) return;
    const reel = $('.tile__reel', tile);
    const wide = window.matchMedia('(min-width: 1200px)');
    // The logos are marked lazy so phones (where the tile never shows) skip them.
    // Here the tile is in use, so fetch them now and have them ready before a hover.
    $$('.tile__logo', tile).forEach((img) => { img.loading = 'eager'; });
    const xTo = gsap.quickTo(tile, 'x', { duration: 0.7, ease: 'power3.out' });
    const yTo = gsap.quickTo(tile, 'y', { duration: 0.45, ease: 'power3.out' });
    let on = false;
    let targetY = 0;

    function laneCenter(row) {
      const inner = $('.pick__in', row);
      const cs = getComputedStyle(inner);
      const cols = cs.gridTemplateColumns.split(' ').map(parseFloat);
      const gap = parseFloat(cs.columnGap) || 0;
      if (cols.length < 3 || cols.some(isNaN)) return window.innerWidth / 2;
      return inner.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + cols[0] + gap + cols[1] + gap + cols[2] / 2;
    }

    // Lean into the direction of travel, settle upright when it catches up.
    function tilt() {
      const lag = targetY - gsap.getProperty(tile, 'y');
      gsap.set(tile, { rotation: clamp(lag * 0.06, -7, 7) });
    }

    function hide() {
      if (!on) return;
      on = false;
      tile.classList.remove('is-on');
      gsap.ticker.remove(tilt);
    }

    function track(e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      const row = e.target.closest('.pick');
      if (!wide.matches || !row || row.classList.contains('is-out')) { hide(); return; }
      // One panel per brand, stacked in a reel; slide the reel to the hovered one.
      const slide = 'translate3d(0,' + (-filter.rows.indexOf(row) * 100 / filter.rows.length).toFixed(4) + '%,0)';
      const x = laneCenter(row) + (e.clientX - window.innerWidth / 2) * 0.035;
      targetY = e.clientY;
      if (!on) {
        on = true;
        // First appearance: arrive in place, already on the right panel.
        reel.style.transition = 'none';
        reel.style.transform = slide;
        void reel.offsetHeight;
        reel.style.transition = '';
        xTo(x, x);
        yTo(targetY, targetY);
        tile.classList.add('is-on');
        gsap.ticker.add(tilt);
      } else {
        reel.style.transform = slide;
        xTo(x);
        yTo(targetY);
      }
    }

    list.addEventListener('pointermove', track, { passive: true });
    list.addEventListener('pointerover', track, { passive: true });
    list.addEventListener('pointerleave', hide, { passive: true });
  }

  /* ---------- 8. Odometer, footer wordmark, manifesto fill ---------- */

  // "Today's commute": the trip meter rolls round to zero when it comes into view.
  function initOdo() {
    const odo = $('.odo');
    if (!odo) return;
    const from = odo.dataset.odo || '000.0';
    const strips = [];
    odo.textContent = '';
    from.split('').forEach((ch) => {
      if (ch === '.') {
        const dot = doc.createElement('span');
        dot.className = 'odo__dot';
        dot.textContent = '.';
        odo.appendChild(dot);
        return;
      }
      const col = doc.createElement('span');
      col.className = 'odo__col';
      const strip = doc.createElement('span');
      strip.className = 'odo__strip';
      for (let n = 0; n <= 10; n++) {
        const digit = doc.createElement('span');
        digit.textContent = String(n % 10);
        strip.appendChild(digit);
      }
      strip.style.setProperty('--i', strips.length);
      strip.dataset.start = reduce ? '10' : String(parseInt(ch, 10) || 0);
      strip.style.transform = 'translate3d(0,' + (-(+strip.dataset.start) * 100 / 11) + '%,0)';
      col.appendChild(strip);
      odo.appendChild(col);
      strips.push(strip);
    });

    const roll = () => strips.forEach((strip) => {
      strip.style.transform = 'translate3d(0,' + (-10 * 100 / 11) + '%,0)';
    });
    if (reduce || !('IntersectionObserver' in window)) { roll(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      setTimeout(roll, 350);
    }, { threshold: 0.6 });
    io.observe(odo);
  }

  // Footer wordmark: split into letters (for the rise) and sized to span the page.
  let fitMark = () => {};
  function initMark() {
    const fit = $('.footer__mark-fit');
    if (!fit) return;
    let i = 0;
    const split = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) { split(child); return; }
        if (child.nodeType !== 3) return;
        const frag = doc.createDocumentFragment();
        child.textContent.split('').forEach((ch) => {
          if (ch === ' ') { frag.appendChild(doc.createTextNode(' ')); return; }
          const span = doc.createElement('span');
          span.className = 'c';
          span.textContent = ch;
          span.style.setProperty('--i', i++);
          frag.appendChild(span);
        });
        child.replaceWith(frag);
      });
    };
    split(fit);

    fitMark = () => {
      fit.style.fontSize = '';
      const base = parseFloat(getComputedStyle(fit).fontSize);
      const width = fit.getBoundingClientRect().width;
      const room = fit.parentElement.clientWidth;
      if (width > 0 && room > 0) fit.style.fontSize = (base * room / width * 0.992).toFixed(2) + 'px';
    };
    fitMark();
  }

  // Manifesto: words fill in as the paragraph moves up the screen.
  function initFill() {
    const el = $('[data-fill]');
    if (!el || !scrubOK) return;
    const words = [];
    const split = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) { split(child); return; }
        if (child.nodeType !== 3) return;
        const frag = doc.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
          const span = doc.createElement('span');
          span.className = 'w';
          span.textContent = part;
          words.push(span);
          frag.appendChild(span);
        });
        child.replaceWith(frag);
      });
    };
    split(el);
    gsap.fromTo(words, { opacity: 0.16 }, {
      opacity: 1, ease: 'none', duration: 0.6, stagger: 0.12,
      scrollTrigger: { trigger: el, start: 'top 84%', end: 'bottom 56%', scrub: fine ? 0.4 : true }
    });
  }

  // The sunlight drifts a few pixels against the pointer. Decorative.
  function initWall() {
    const shift = $('.wall__shift');
    const hero = $('.hero');
    if (!shift || !hero || !fine || !gsap || reduce) return;
    const xTo = gsap.quickTo(shift, 'x', { duration: 1.4, ease: 'power3.out' });
    const yTo = gsap.quickTo(shift, 'y', { duration: 1.4, ease: 'power3.out' });
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      xTo(((e.clientX - r.left) / r.width - 0.5) * -24);
      yTo(((e.clientY - r.top) / r.height - 0.5) * -14);
    }, { passive: true });
  }

  /* ---------- 9. Boot ---------- */

  let lastW = window.innerWidth;
  function onResize() {
    const w = window.innerWidth;
    const widthChanged = w !== lastW;
    lastW = w;
    // On phones the height changes whenever the toolbar shows or hides: ignore it.
    if (!fine && !widthChanged) return;
    if (setMode() && ScrollTrigger) ScrollTrigger.refresh();
    fitMark();
  }

  function settle() {
    if (ScrollTrigger) ScrollTrigger.refresh();
    else if (stage) stage.measure();
    fitMark();
  }

  function boot() {
    setMode(true);
    initReveals();
    initNav();
    initTile();
    initOdo();
    initMark();
    initFill();
    initWall();
    $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
    window.__judyReady = true;

    const fontsReady = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    const patience = new Promise((resolve) => setTimeout(resolve, 1200));

    // Start the intro once the type is in (or after a short wait, whichever is first).
    Promise.race([fontsReady, patience]).then(() => {
      settle();
      handleHash(true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        root.classList.remove('boot');
        introDone = true;
        if (stage) stage.playIntro();
      }));
    });
    fontsReady.then(settle);
    window.addEventListener('load', settle);
    window.addEventListener('resize', debounce(onResize, 200));
    window.addEventListener('hashchange', () => handleHash(false));
  }

  boot();
})();
