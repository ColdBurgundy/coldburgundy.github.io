/* Draktharr Lab — GUI mode */
(function () {
  'use strict';

  var d = document;
  var w = window;
  var CFG = w.DL_GUI || {};
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || d).querySelectorAll(s)); }
  function store(kind, key, val) {
    try {
      if (val === undefined) return w[kind].getItem(key);
      w[kind].setItem(key, val);
    } catch (e) { return null; }
  }
  function legacyCopy(text) {
    var ta = d.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    d.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = d.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }
  function copyText(text) {
    if (navigator.clipboard && w.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  // 모달이 열린 동안 배경(헤더/본문/푸터)을 inert 로 — 포커스가 모달 밖으로 나가지 않음
  function setBackgroundInert(on, except) {
    // 앞서 다른 모달이 inert 로 만든 노드가 이번 모달이면 먼저 풀어 줍니다 (안 그러면 열린 모달이 먹통)
    if (on && except && except.hasAttribute('data-inerted')) { except.inert = false; except.removeAttribute('data-inerted'); }
    [].forEach.call(d.body.children, function (n) {
      if (n === except || n.tagName === 'SCRIPT') return;
      if (on) { if (!n.inert) { n.inert = true; n.setAttribute('data-inerted', ''); } }
      else if (n.hasAttribute('data-inerted')) { n.inert = false; n.removeAttribute('data-inerted'); }
    });
  }
  // 화면 낭독기 알림 (scripts.html 의 aria-live 영역). 같은 문장도 다시 읽히게 한 번 비웠다가 채웁니다.
  var announcer = $('[data-announce]');
  function announce(msg) {
    if (!announcer) return;
    announcer.textContent = '';
    setTimeout(function () { announcer.textContent = msg; }, 40);
  }
  // 버튼 글자만 잠깐 바꿉니다: 아이콘은 그대로, 너비는 고정(옆 버튼이 밀리지 않게), 결과는 낭독기로도 알림
  function flash(btn, label, cls, said) {
    var slot = $('span:not([aria-hidden])', btn) || btn;
    if (!btn.hasAttribute('data-label')) {
      btn.setAttribute('data-label', slot.textContent);
      btn.style.minWidth = btn.getBoundingClientRect().width + 'px';
    }
    var old = btn.getAttribute('data-label');
    btn.classList.remove('is-copied', 'is-done', 'is-error');
    slot.textContent = label;
    btn.classList.add(cls);
    announce(said || label);
    clearTimeout(btn._t);
    btn._t = setTimeout(function () {
      slot.textContent = old;
      btn.classList.remove(cls);
      btn.removeAttribute('data-label');
      btn.style.minWidth = '';
    }, 1600);
  }

  /* ---------- 모드 전환 기억 ---------- */
  d.addEventListener('click', function (e) {
    var a = e.target.closest('[data-mode-switch]');
    if (a) store('localStorage', 'dl-mode', a.getAttribute('data-mode-switch'));
  });

  /* ---------- nav ---------- */
  var nav = $('[data-nav]');
  var toTop = $('[data-to-top]');
  var lastY = -1, compact = false;
  // 아래 scroll loop 의 rAF 한 번 안에서 호출됩니다 (스크롤 리스너는 하나뿐)
  function onScrollBase() {
    var y = w.scrollY || d.documentElement.scrollTop;
    if (y === lastY) return;
    lastY = y;
    if (nav) nav.classList.toggle('is-scrolled', y > 20);
    if (toTop) toTop.classList.toggle('is-visible', y > 600);
    /* ---------- 휠 컴팩트 모드: 스크롤하면 상단바가 살짝 올라가며 얇아집니다 ----------
       내려갈 때는 72px 를 넘어야 켜지고, 올라올 때는 24px 위로 와야 꺼집니다(히스테리시스 → 경계에서 깜빡임 없음).
       움직임은 CSS(.wheel.is-compact)가 담당 — 고정 헤더 안에서만 바뀌어 본문은 밀리지 않고,
       prefers-reduced-motion 이면 전환 시간이 사실상 0 입니다. 시프트 라이트는 두 상태 모두 그대로 동작. */
    var next = compact ? y > 24 : y > 72;
    if (nav && next !== compact) { compact = next; nav.classList.toggle('is-compact', compact); }
  }
  if (toTop) toTop.addEventListener('click', function () { w.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  $$('[data-drop]').forEach(function (item) {
    var btn = $('[data-drop-toggle]', item);
    var hoverable = w.matchMedia('(hover: hover)').matches;
    var timer;
    var pinned = false;
    function set(open) {
      if (item.classList.contains('is-open') === open) { if (!open) pinned = false; return; }
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) { pinned = false; restIndicator(); }
    }
    btn.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      if (hoverable && isOpen && !pinned) { pinned = true; return; }   // hover 로 열린 상태에서 클릭 = 열어 둔 채 고정
      pinned = !isOpen;
      set(!isOpen);
    });
    if (hoverable) {
      item.addEventListener('mouseenter', function () { clearTimeout(timer); set(true); });
      item.addEventListener('mouseleave', function () { if (!pinned) timer = setTimeout(function () { set(false); }, 220); });
    }
    d.addEventListener('click', function (e) { if (!item.contains(e.target)) set(false); });
    item.addEventListener('focusout', function (e) { if (!item.contains(e.relatedTarget)) set(false); });
    item.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
  });

  /* ---------- mobile drawer ---------- */
  var drawer = $('#drawer');
  var drawerBtn = $('[data-drawer-open]');
  function setDrawer(open) {
    if (!drawer) return;
    drawer.hidden = !open;
    d.body.classList.toggle('is-locked', open);
    setBackgroundInert(open, drawer);
    if (drawerBtn) drawerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { var f = $('a, button', drawer); if (f) f.focus(); }
    else if (drawerBtn) drawerBtn.focus();
  }
  if (drawer) {
    drawerBtn.addEventListener('click', function () { setDrawer(true); });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer || e.target.closest('[data-drawer-close]') || e.target.closest('a')) setDrawer(false);
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !drawer.hidden) setDrawer(false); });
  }

  /* ---------- hero: 출발 신호 + 타이핑 ---------- */
  var hero = $('[data-hero]');
  function startTyping() {
    var el = $('.hero__typed', hero);
    if (!el) return;
    var words;
    try { words = JSON.parse(el.getAttribute('data-typed')); } catch (e) { words = []; }
    if (!words || words.length < 2 || reduce) return;
    // 타이핑으로 바뀌는 글자는 낭독기에서 숨기고, h1 의 이름은 단어 목록 하나로 고정합니다
    el.setAttribute('aria-hidden', 'true');
    var said = d.createElement('span');
    said.className = 'sr-only';
    said.textContent = words.join(', ');
    el.parentNode.insertBefore(said, el);
    var wi = 0, ci = words[0].length, deleting = true;
    (function tick() {
      var word = words[wi];
      if (deleting) {
        ci--;
        el.textContent = word.slice(0, ci);
        if (ci <= 0) { deleting = false; wi = (wi + 1) % words.length; }
        return setTimeout(tick, ci <= 0 ? 260 : 38);
      }
      word = words[wi];
      ci++;
      el.textContent = word.slice(0, ci);
      if (ci >= word.length) { deleting = true; return setTimeout(tick, 1900); }
      setTimeout(tick, 75);
    })();
  }
  function runLights(units, onOut) {
    var i = 0, done = false;
    function out() {
      if (done) return;
      done = true;
      units.forEach(function (u) { u.classList.remove('is-on'); });
      onOut && onOut();
    }
    (function on() {
      if (done) return;
      if (i < units.length) { units[i++].classList.add('is-on'); return setTimeout(on, 420); }
      setTimeout(out, 450 + Math.random() * 500); // 실제 F1처럼 소등 타이밍은 랜덤
    })();
    return out;
  }
  if (hero) {
    var lightsBtn = $('[data-start-lights]', hero);
    var units = $$('.start-lights__unit', hero);
    var seen = store('sessionStorage', 'dl-lights') === '1';
    var lightsBusy = false;
    if (reduce || seen || !units.length) {
      hero.classList.add('is-go');
      d.documentElement.classList.remove('dl-intro');
      setTimeout(startTyping, 1600);
    } else {
      hero.classList.add('is-intro');
      lightsBusy = true;
      var skipIntro = runLights(units, function () {
        hero.classList.add('is-go');
        hero.classList.remove('is-intro');
        d.documentElement.classList.remove('dl-intro');
        store('sessionStorage', 'dl-lights', '1');
        lightsBusy = false;
        setTimeout(startTyping, 1800);
      });
      ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(function (t) {
        w.addEventListener(t, function (e) { if (!(e.target && e.target.closest && e.target.closest('[data-start-lights]'))) skipIntro(); }, { once: true, passive: true });
      });
    }
    // 신호등을 누르면 출발 신호를 다시 봅니다 (움직임 줄이기 설정이면 장식으로만 두고 버튼은 끕니다)
    if (lightsBtn && reduce) lightsBtn.disabled = true;
    if (lightsBtn) lightsBtn.addEventListener('click', function () {
      if (lightsBusy || reduce) return;
      lightsBusy = true;
      runLights(units, function () { lightsBusy = false; });
    });
  }

  if (hero && 'IntersectionObserver' in w) {
    new IntersectionObserver(function (en) { hero.classList.toggle('is-offscreen', !en[0].isIntersecting); }).observe(hero);
  }

  /* ---------- 카운터 / reveal ---------- */
  function countUp(el, dur) {
    dur = dur || 1300;
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var since = el.getAttribute('data-since');
    if (since) {
      var diff = Math.floor((Date.now() - new Date(since + 'T00:00:00+09:00').getTime()) / 86400000);
      if (diff >= 0) target = diff;
    }
    if (reduce || target === 0) { el.textContent = target; return; }
    var start = performance.now();
    (function step() {
      var p = Math.min(1, (performance.now() - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })();
  }
  var counters = $$('[data-count]');
  var revealEls = reduce ? [] : $$('.stat, .team, .card, .lap, .flag, .race-plan, .radio');
  if ('IntersectionObserver' in w) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var t = en.target;
        if (t.hasAttribute('data-count')) countUp(t);
        t.classList.add('is-in');
        io.unobserve(t);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    counters.forEach(function (c) { io.observe(c); });
    revealEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < w.innerHeight) return; // 이미 화면에 있는 것은 그대로
      el.classList.add('reveal');
      io.observe(el);
    });
  } else {
    counters.forEach(function (c) { countUp(c); });
  }
  // 통계 카드에 마우스를 올리면 숫자가 다시 올라갑니다 (rev)
  $$('.stat').forEach(function (st) {
    st.addEventListener('mouseenter', function () {
      var v = $('[data-count]', st);
      if (!v || v._busy || reduce) return;
      v._busy = true;
      countUp(v, 650);
      setTimeout(function () { v._busy = false; }, 900);
    });
  });

  /* ---------- 검색 ---------- */
  var search = $('[data-search]');
  var input = search && $('[data-search-input]', search);
  var list = search && $('[data-search-results]', search);
  var INDEX = null, loading = null, active = -1, lastFocus = null;

  function loadIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    if (!loading) {
      loading = fetch(CFG.indexURL || '/index.json').then(function (r) { return r.json(); }).then(function (data) {
        INDEX = (data.posts || []).map(function (p) {
          // path 는 퍼센트 인코딩(%EC%95…)이라 그대로 넣으면 'eb' 같은 두 글자 검색이 한글 경로 글을 전부 잡습니다
          var path = p.path || '';
          try { path = decodeURIComponent(path); } catch (e) {}
          p.hay = [p.title, p.summary, (p.tags || []).join(' '), path, p.category].join(' ').toLowerCase();
          return p;
        });
        return INDEX;
      }).catch(function () { INDEX = []; return INDEX; });
    }
    return loading;
  }
  function markText(text, terms) {
    var frag = d.createDocumentFragment();
    text = String(text || '');
    if (!terms.length) { frag.appendChild(d.createTextNode(text)); return frag; }
    var re = new RegExp('(' + terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(d.createTextNode(text.slice(last, m.index)));
      var mk = d.createElement('mark');
      mk.textContent = m[0];
      frag.appendChild(mk);
      last = m.index + m[0].length;
      if (!m[0].length) re.lastIndex++;
    }
    if (last < text.length) frag.appendChild(d.createTextNode(text.slice(last)));
    return frag;
  }
  function render(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    var hits = INDEX.filter(function (p) { return terms.every(function (t) { return p.hay.indexOf(t) !== -1; }); });
    if (terms.length) {
      hits.sort(function (a, b) {
        var sa = terms.some(function (t) { return a.title.toLowerCase().indexOf(t) !== -1; }) ? 1 : 0;
        var sb = terms.some(function (t) { return b.title.toLowerCase().indexOf(t) !== -1; }) ? 1 : 0;
        return sb - sa;
      });
    }
    hits = hits.slice(0, 20);
    var status = $('[data-search-status]', search);
    if (status) status.textContent = terms.length ? hits.length + '개의 결과' : '';
    list.innerHTML = '';
    active = hits.length ? 0 : -1;
    if (!hits.length) {
      var li = d.createElement('li');
      li.className = 'search__empty';
      li.setAttribute('role', 'presentation');
      li.textContent = terms.length ? '"' + q + '" 에 해당하는 글이 없습니다.' : '아직 게시물이 없습니다.';
      list.appendChild(li);
      setActive();
      return;
    }
    hits.forEach(function (p, i) {
      var li = d.createElement('li');
      li.className = 'search__item';
      li.id = 'search-opt-' + i;
      li.setAttribute('role', 'option');
      var a = d.createElement('a');
      a.href = p.url;
      a.tabIndex = -1;   // 포커스는 입력창에 두고 ↑↓ 로 고릅니다 (aria-activedescendant)
      var t = d.createElement('span'); t.className = 'search__title'; t.appendChild(markText(p.title, terms));
      var m = d.createElement('span'); m.className = 'search__meta';
      m.textContent = (p.date || '').replace(/-/g, '.') + ' · ' + (p.category || '') + ((p.tags && p.tags.length) ? ' · #' + p.tags.join(' #') : '');
      var s = d.createElement('span'); s.className = 'search__snippet'; s.appendChild(markText(p.summary, terms));
      a.appendChild(t); a.appendChild(m); a.appendChild(s);
      li.appendChild(a);
      list.appendChild(li);
    });
    setActive();
  }
  // 고른 항목을 화면(.is-active)과 보조기기(aria-selected / aria-activedescendant)에 함께 알립니다
  function setActive() {
    var items = $$('.search__item', list);
    items.forEach(function (it, i) {
      it.classList.toggle('is-active', i === active);
      it.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
    input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    if (active >= 0 && items[active]) input.setAttribute('aria-activedescendant', items[active].id);
    else input.removeAttribute('aria-activedescendant');
  }
  function move(delta) {
    var items = $$('.search__item', list);
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    setActive();
    items[active].scrollIntoView({ block: 'nearest' });
  }
  function openSearch() {
    if (!search) return;
    var lb = $('.lightbox');
    if (lb) lb.click();
    // 모바일 메뉴나 목차 서랍이 열려 있으면 먼저 닫습니다 (겹친 모달끼리 inert 가 꼬이지 않게)
    if (drawer && !drawer.hidden) setDrawer(false);
    if (aside && aside.classList.contains('is-open')) setAside(false);
    lastFocus = d.activeElement;
    search.hidden = false;
    d.body.classList.add('is-locked');
    setBackgroundInert(true, search);
    input.value = '';
    input.focus();
    list.innerHTML = '<li class="search__empty" role="presentation">불러오는 중…</li>';
    loadIndex().then(function () { render(input.value); });
  }
  function closeSearch() {
    if (!search || search.hidden) return;
    search.hidden = true;
    d.body.classList.remove('is-locked');
    setBackgroundInert(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (search) {
    d.addEventListener('click', function (e) {
      if (e.target.closest('[data-search-open]')) { e.preventDefault(); openSearch(); }
      else if (e.target.closest('[data-search-close]')) closeSearch();
    });
    input.addEventListener('input', function () { if (INDEX) render(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중의 Enter/화살표는 IME 몫
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        var a = $('.search__item.is-active a', list);
        if (a) { e.preventDefault(); location.href = a.href; }
      }
    });
    d.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); search.hidden ? openSearch() : closeSearch(); }
      else if (e.key === '/' && !typing && search.hidden) { e.preventDefault(); openSearch(); }
      else if (e.key === 'Escape') closeSearch();
    });
  }

  /* ---------- 글 페이지 ---------- */
  var post = $('[data-post]');
  var body = post && $('[data-post-body]', post);
  var root = d.documentElement;

  // 최상위가 비어 있는 목차(h3만 있는 글)를 한 단계 평탄화 (한국어 · 영어 목차 모두)
  $$('.race-plan nav, .telemetry nav').forEach(function (navEl) {
    var ul = $(':scope > ul', navEl);
    while (ul && ul.children.length === 1 && !$(':scope > li > a', ul) && $(':scope > li > ul', ul)) {
      var inner = $(':scope > li > ul', ul);
      ul.replaceWith(inner);
      ul = inner;
    }
  });

  /* ---------- 읽는 언어 (KO / EN) ----------
     영어 번역({{< en >}} → details[data-lang-block="en"])이 있는 글에만 스위치가 있습니다(왼쪽 도구 막대, 좁은 화면은 제목 아래 · 목차 서랍 머리).
     EN 이면 한국어 본문 대신 영어 영역이 펼쳐진 본문(html.read-en — CSS)이고, 소제목을 읽는 것은 모두 영어 소제목으로 바뀝니다:
     목차 · 구간 시간 · 휠 LCD 의 섹터 · 텔레메트리 SECTOR · 트랙 맵 경계 · 시프트 라이트 진행률.
     바꿀 때마다 타이밍은 새로 시작하고(startSession), 읽던 섹터(같은 번호)의 같은 비율 자리에 머뭅니다(setLang).
     고른 언어는 이 브라우저에 기억(dl-lang) — head.html 이 첫 그림 전에 html.read-en 을, single.html 이 영어 영역을 펼쳐 둡니다. */
  var enBlock = body && $('[data-lang-block="en"]', body);
  var lang = enBlock && root.classList.contains('read-en') ? 'en' : 'ko';
  if (!enBlock) root.classList.remove('read-en');
  else if (lang === 'en') enBlock.open = true;
  // 지금 언어의 소제목. 접힌 영역(다른 접이식 · 한국어일 때의 영어 번역)의 제목은 섹터 계산에서 뺍니다
  function headsOf(l) {
    if (!body) return [];
    var home = l === 'en' ? enBlock : null;
    return $$('h2[id], h3[id], h4[id]', home || body).filter(function (h) { return h.closest('details') === home; });
  }
  function navsOf(l) {
    return $$('.telemetry nav, .race-plan nav').filter(function (n) { return (n.getAttribute('data-toc-lang') || 'ko') === l; });
  }
  var allTocLinks = $$('.telemetry a[href^="#"], .race-plan a[href^="#"]');
  // 아래 값들은 언어를 고를 때마다 startSession() 이 다시 채웁니다
  var tocLinks = [], telLinks = [], telNav = null;
  var heads = [], headIds = [], secOf = [], secTotal = 1, headTexts = [];
  var pctText = $('[data-progress-text]');
  var pctBar = $('[data-progress-bar]');
  var currentId = null;

  /* ---------- 스티어링 휠 대시: 시프트 라이트 · 기어 · 속도 · 디스플레이 ---------- */
  var ledBox = $('[data-shift-lights]');
  var leds = ledBox ? $$('i', ledBox) : [];
  leds.forEach(function (l, i) { l.style.setProperty('--i', i); });
  var gearEl = $('[data-gear]');
  var speedEl = $('[data-speed]');
  var dispText = $('[data-disp-text]');
  var dispLabel = $('[data-disp-label]');
  var baseLabel = dispLabel ? dispLabel.textContent : '';
  var baseText = dispText ? dispText.textContent : '';
  var paddles = { up: $('[data-paddle="up"]'), down: $('[data-paddle="down"]') };
  var gear = 'N', finished = false;

  // 수식이 든 소제목은 빌드 때 달아 둔 평문 라벨(data-label, 예: '복잡도 O(n²) 분석')을 씁니다 — 목차 · Mac 창과 같은 글자.
  // 라벨이 없으면: KaTeX 는 MathML + TeX 주석 + HTML 세 벌을 담고 있어 textContent 가 'O(n2)O(n^2)O(n2)' 처럼 세 번 나옵니다 → TeX 원문 한 벌만
  function headingText(h) {
    if (h.getAttribute('data-label')) return h.getAttribute('data-label');
    var c = h.cloneNode(true);
    $$('.heading-anchor', c).forEach(function (n) { n.remove(); });
    $$('.katex', c).forEach(function (k) {
      var tex = $('annotation', k);
      k.replaceWith(tex ? tex.textContent : k.textContent);
    });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  // Hugo 의 목차(.TableOfContents)는 제목 속 수식을 빼먹습니다 → 수식이 든 제목만 본문 제목의 내용을 그대로 옮겨 옵니다
  (body ? $$('h2[id], h3[id], h4[id]', body) : []).forEach(function (h) {
    if (!$('.katex', h)) return;
    allTocLinks.forEach(function (a) {
      if (decodeURIComponent(a.getAttribute('href').slice(1)) !== h.id) return;
      var label = d.createElement('span');   // 한 덩어리로 (링크가 flex 라서 글자·수식이 따로 놀지 않게)
      [].forEach.call(h.childNodes, function (n) {
        if (n.nodeType === 1 && n.classList.contains('heading-anchor')) return;
        label.appendChild(n.cloneNode(true));
      });
      // 제목 안의 링크는 글자만 남깁니다 (목차 링크 안에 링크가 겹치지 않게)
      $$('a', label).forEach(function (x) { while (x.firstChild) x.parentNode.insertBefore(x.firstChild, x); x.remove(); });
      a.textContent = '';
      a.appendChild(label);
    });
  });
  function setDisplay(label, text) {
    if (dispLabel && dispLabel.textContent !== label) dispLabel.textContent = label;
    if (dispText && dispText.textContent !== text) dispText.textContent = text;
  }
  function restartAnim(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove(cls); }, ms);
  }
  function setGear(g) {
    if (g === gear || !gearEl) return;
    var up = gear === 'N' ? true : (g === 'N' ? false : +g > +gear);
    gear = g;
    gearEl.textContent = g;
    gearEl.classList.toggle('is-n', g === 'N');   // 7-세그먼트 폰트에는 N 글리프가 없음
    restartAnim(gearEl, 'is-shift', 350);
    if (!reduce) restartAnim(up ? paddles.up : paddles.down, 'is-flick', 200);
  }
  function readProgress() {
    var y = w.scrollY;
    if (body) {
      var top = body.getBoundingClientRect().top + y;
      return Math.max(0, Math.min(1, (y + w.innerHeight * 0.35 - top) / Math.max(1, body.offsetHeight)));
    }
    var max = d.documentElement.scrollHeight - w.innerHeight;
    return max > 0 ? Math.max(0, Math.min(1, y / max)) : 0;
  }

  // 스크롤 속도 → km/h
  var speed = 0, lastSY = w.scrollY, lastST = performance.now(), speedRaf = 0;
  function renderSpeed() {
    if (!speedEl) return;
    var v = Math.round(speed);
    speedEl.textContent = (v < 10 ? '00' : v < 100 ? '0' : '') + v;
    speedEl.classList.toggle('is-fast', v >= 300);
  }
  function trackSpeed() {
    var now = performance.now(), y = w.scrollY;
    var v = Math.abs(y - lastSY) / Math.max(8, now - lastST) * 1000;
    lastSY = y;
    lastST = now;
    speed = Math.min(372, Math.max(speed * 0.6, v * 0.11));
    renderSpeed();
    if (!speedRaf) speedRaf = requestAnimationFrame(decaySpeed);
  }
  function decaySpeed() {
    speedRaf = 0;
    if (performance.now() - lastST > 90) speed *= 0.9;
    if (speed < 1) speed = 0;
    renderSpeed();
    if (speed > 0) speedRaf = requestAnimationFrame(decaySpeed);
  }
  // 시프트 라이트에 마우스를 올리면 한 번 회전수를 올려 봅니다
  if (ledBox && !reduce) ledBox.addEventListener('mouseenter', function () {
    if (!ledBox.classList.contains('is-max')) restartAnim(ledBox, 'is-rev', 1300);
  });

  /* ---------- 랩 · 섹터 타이밍 ----------
     이 페이지를 읽는 동안만 메모리에 둡니다(어디에도 저장하지 않음). F1 타이밍 규칙 그대로:
     구간을 '앞으로' 빠져나갈 때마다 그 구간을 지나는 데 걸린 시간을 재서 색을 매깁니다.
       보라 = 목표 시간 이하 (목표 = 그 구간 글 분량을 빠른 걸음으로 읽는 시간 — 한글은 글자, 영문 · 숫자 · 코드는 낱말로 셈)
       초록 = 목표보다 느리지만 이번 방문의 개인 최고 (첫 완주는 언제나 개인 최고)
       노랑 = 개인 최고보다 느림 (예: 다시 올라가 더 천천히 읽음)
     한 번 칠한 구간은 위로 올라가도 지우지 않습니다. 지금 구간은 마지막 색을 지닌 채 '라이브'(숨 쉬는 테두리)로.
     · 구간 = 섹터(트랙 맵 · 목차의 h2 줄 · LCD 의 Sector N)와 미니 섹터(목차의 h3/h4 줄). 둘 다 같은 규칙으로 따로 잽니다.
     · 글 첫머리(첫 소제목 앞)는 1구간에 포함 — 트랙 맵이 출발선부터 1섹터인 것과 같게.
     · 뒤로 빠져나간 구간의 런은 멈춰 두었다가 다시 앞으로 들어오면 이어서 잽니다.
     · 아래에서(뒤로) 다시 들어온 구간은 그 첫머리 근처(앞 1/4)까지 올라가야 한 바퀴로 칩니다 —
       경계에서 잠깐 위를 확인하고 내려온 것이 '보라'로 찍히지 않게.
     · 읽었다고 보기 어려운 속도로 스쳐 지나간 런(목표의 1/10 미만)과, 목차 · 앵커 링크로 건너뛰는 동안 지나친 구간은
       기록하지 않습니다(트랙 리밋 위반처럼 랩 삭제) — 처음에 글 끝까지 훑어본 뒤 제대로 읽어도 첫 기록이 '노랑'이 되지 않게. */
  var lapEl = $('[data-lap]'), sectorEl = $('[data-sector]'), sectorMini = $('[data-sector-mini]');
  function zeros(n) { for (var a = [], i = 0; i < n; i++) a.push(0); return a; }
  function board(n) { return { n: n, cur: -1, run: zeros(n), ok: [], tgt: zeros(n), pb: [], last: [], col: [] }; }
  // 섹터 수 · 미니 섹터 수 · 두 보드 · 랩은 startSession() 이 언어마다 새로
  var nSec = 1, nMini = 1, secB = board(1), miniB = board(1);
  var lap = { ms: 0, tgt: 0, pb: null, col: null };
  var bounds = null;   // 진행률 경계 { sec: [0, …, 1], mini: [0, …, 1] } — 창 크기 · 본문 높이가 바뀌면 다시 잼
  var COLS = ['purple', 'green', 'yellow'];
  function grade(t, tgt, pb) { return t <= tgt ? 'purple' : (pb == null || t < pb) ? 'green' : 'yellow'; }
  function setT(el, col) { COLS.forEach(function (c) { el.classList.toggle('t-' + c, c === col); }); }
  var FLYBY_MS = 600;
  function counts(t, tgt) { return t >= Math.max(FLYBY_MS, tgt / 10); }
  function finishRun(b, j) {
    var t = b.run[j];
    b.run[j] = 0;
    if (!counts(t, b.tgt[j])) return;   // 스쳐 지나감: 색 · 개인 최고 그대로
    b.col[j] = grade(t, b.tgt[j], b.pb[j]);
    if (b.pb[j] == null || t < b.pb[j]) b.pb[j] = t;
    b.last[j] = t;
  }
  // 지금 구간을 k 로 (-1 = 아직 없음, n = 결승선 너머). 앞으로 빠져나간 구간은 완주로 기록합니다
  function moveTo(b, k) {
    var prev = b.cur;
    if (k === prev) return;
    b.cur = k;
    if (prev >= 0 && prev < b.n && k > prev) {
      if (b.ok[prev]) finishRun(b, prev);
      else b.run[prev] = 0;   // 끝에서 들어와 첫머리까지 가지 않은 런은 기록 없이 버림
    }
    if (k >= 0 && k < b.n) {
      if (prev > k) { if (!b.run[k]) b.ok[k] = false; }   // 아래에서 들어온 새 런: 첫머리 근처까지 올라가야 인정
      else b.ok[k] = true;                                  // 앞에서(첫머리부터) 들어옴
    }
  }
  // 건너뛴 경우(목차 · 앵커): 떠난 구간은 멈춰 두고(기록 없음), 도착한 구간은 그 자리부터 — 첫머리에 내렸으면 cover() 가 곧바로 인정
  function teleport(b, k) {
    if (k === b.cur) return;
    b.cur = k;
    if (k >= 0 && k < b.n && !b.run[k]) b.ok[k] = false;
  }
  // 목차 · 앵커 링크를 누르면 스크롤이 멈출 때까지 '점프 중' (scroll loop 가 멈춤을 감지)
  var jumping = false, landed = false, jumpT = 0;
  function endJump() { jumping = false; landed = true; onScroll(); }
  function armJump(ms) { clearTimeout(jumpT); jumpT = setTimeout(endJump, ms); }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2 || !body) return;
    jumping = true;
    armJump(900);   // 스크롤이 일어나지 않아도 곧 끝
  });
  function cover(b, edge, p) {
    var k = b.cur;
    if (k < 0 || k >= b.n || b.ok[k]) return;
    if (p <= edge[k] + (edge[k + 1] - edge[k]) * 0.25) b.ok[k] = true;
  }

  // 목표 시간: 구간마다 보이는 글의 분량 (닫힌 접이식 영역 · 수식의 MathML 사본 · 줄 번호 · 버튼 글자는 뺌).
  // 지금 언어의 본문만 셉니다 — 한국어면 영어 영역을 통째로, 영어면 영어 영역 안만(숨은 'English version' 머리 빼고)
  var RATE_CJK = 14, RATE_WORD = 4.5, IMG_MS = 1200, MIN_MS = 2500;   // 글자/초 · 낱말/초 · 그림 한 장 · 구간 최소
  var RE_CJK = /[\u1100-\u11ff\u2e80-\u2fff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;
  var RE_WORD = /[A-Za-z0-9]+(?:['’._-][A-Za-z0-9]+)*/g;
  var SKIP_TXT = '.katex-mathml, .heading-anchor, button, .ln, script, style, .sr-only';
  function closedDetails(el) { return el && el.tagName === 'DETAILS' && !el.open; }
  function measureTargets() {
    var ms = zeros(nMini), cur = 0, hi = 0, en = lang === 'en';
    var walker = d.createTreeWalker(en ? enBlock : body, 5, { acceptNode: function (n) {   // 5 = 요소 + 글자
      if (n.nodeType !== 1) return closedDetails(n.parentElement) ? 2 : 1;
      if (n === enBlock || (en && n.tagName === 'SUMMARY' && n.parentElement === enBlock)) return 2;
      if (n.matches(SKIP_TXT) || (closedDetails(n.parentElement) && n.tagName !== 'SUMMARY')) return 2;   // 2 = 하위까지 건너뜀
      return 1;
    } });
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 1) {
        if (n === heads[hi]) cur = hi++;
        else if (n.tagName === 'IMG') ms[cur] += IMG_MS;
        continue;
      }
      var t = n.nodeValue;
      if (!t || !/\S/.test(t)) continue;
      var c = (t.match(RE_CJK) || []).length;
      var wd = (t.replace(RE_CJK, ' ').match(RE_WORD) || []).length;
      ms[cur] += c / RATE_CJK * 1000 + wd / RATE_WORD * 1000;
    }
    secB.tgt = zeros(nSec);
    for (var i = 0; i < nMini; i++) {
      miniB.tgt[i] = Math.max(MIN_MS, ms[i]);
      secB.tgt[heads.length ? secOf[i] - 1 : 0] += miniB.tgt[i];
    }
    lap.tgt = secB.tgt.reduce(function (a, v) { return a + v; }, 0);
  }

  // 구간 경계 = 그 소제목이 '지금 구간'이 되는 진행률 (readProgress 와 같은 기준 → 목차 · LCD · 맵이 같은 순간에 넘어감)
  function measureBounds() {
    if (!navLine) measureNav();
    var y = w.scrollY, top = body.getBoundingClientRect().top + y, H = Math.max(1, body.offsetHeight);
    var off = w.innerHeight * 0.35 - navLine;
    var mini = [0], sec = [0];
    for (var i = 1; i < heads.length; i++) {
      var v = Math.max(mini[i - 1], Math.min(1, (heads[i].getBoundingClientRect().top + y - top + off) / H));
      mini.push(v);
      if (secOf[i] !== secOf[i - 1]) sec.push(v);
    }
    mini.push(1);
    sec.push(1);
    bounds = { sec: sec, mini: mini };
  }

  // F1 식 시간 — 랩: M:SS.mmm (0:58.312 · 1:23.456), 구간: SS.mmm (1분이 넘으면 M:SS.mmm), 기록 전: --.---
  function pad(v, k) { v = String(v); while (v.length < k) v = '0' + v; return v; }
  function lapFmt(ms) {
    var t = Math.max(0, Math.min(Math.floor(ms), 5999999));   // 99:59.999 에서 멈춤 (LCD 자리 수)
    return Math.floor(t / 60000) + ':' + pad(Math.floor(t / 1000) % 60, 2) + '.' + pad(t % 1000, 3);
  }
  function secFmt(ms) {
    var t = Math.max(0, Math.floor(ms));
    return t >= 60000 ? lapFmt(t) : pad(Math.floor(t / 1000), 2) + '.' + pad(t % 1000, 3);
  }
  var NO_TIME = '--.---';

  // 텔레메트리 목차 줄: h2(섹터 첫 줄)는 섹터를, h3/h4 는 미니 섹터를 보여 줍니다 (언어마다 그 언어의 목차로)
  var rows = [];
  function buildRows() {
    rows = [];
    telLinks.forEach(function (a) {
      var k = headIds.indexOf(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (k === -1) return;
      var t = $('.toc-time', a);
      if (!t) {
        t = d.createElement('span');
        t.className = 'toc-time';
        t.setAttribute('aria-hidden', 'true');
        a.appendChild(t);
      }
      var isSec = k === 0 || secOf[k] !== secOf[k - 1];
      rows.push({ a: a, time: t, b: isSec ? secB : miniB, j: isSec ? secOf[k] - 1 : k, key: null, txt: null });
    });
  }

  /* ---------- 텔레메트리 접기 ----------
     랩 타이머 + 트랙 맵을 접으면 머리에 '진행률 · 섹터' 한 줄만 남고 움직이는 것이 없습니다
     (지금 줄의 째깍이는 시간도 숨기고 마지막 기록만). 목차는 그대로. 고른 상태는 이 브라우저에 기억합니다(head.html 이 첫 그림 전에 적용). */
  var telFold = $('[data-tel-fold]');
  var folded = d.documentElement.classList.contains('tel-folded');
  if (telFold) telFold.setAttribute('aria-expanded', folded ? 'false' : 'true');

  function paintRows() {
    var extra = sinceTick();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], b = r.b, j = r.j, live = b.cur === j, col = b.col[j] || '';
      var run = live && !folded;
      // 달리는 줄은 지금까지의 시간(마지막 박자 뒤의 몫까지), 지난 줄은 마지막 기록. 접혀 있으면 마지막 기록만
      var txt = run ? secFmt(b.run[j] + extra) : (b.last[j] != null ? secFmt(b.last[j]) : NO_TIME);
      var key = col + (live ? '|live' : '') + (run ? '|run' : '');
      if (key !== r.key) {
        r.key = key;
        setT(r.a, col);
        r.a.classList.toggle('is-live', live);
        r.time.classList.toggle('is-run', run);
      }
      if (txt !== r.txt) { r.txt = txt; r.time.textContent = txt; }
    }
  }
  // 랩 숫자는 분 · 초 · 1/1000초 세 칸 (single.html). 구분점(: .)은 칸 사이 제자리라 매 프레임 바뀌는 건 끝 칸의 글자뿐.
  // 아직 달리지 않은 랩(체커기 너머에서 언어를 바꿔 새 판이 됨)은 0:00.000 에 멈춰 있지 않고 '-:--.---'
  var lapParts = lapEl ? $$('[data-lap-part]', lapEl) : [];
  function showLap(ms) {
    var t = lap.blank ? '-:--.---' : lapFmt(ms);
    if (lapParts.length !== 3) { if (lapEl.textContent !== t) lapEl.textContent = t; return; }
    t = t.split(/[:.]/);
    for (var i = 0; i < 3; i++) if (lapParts[i].textContent !== t[i]) lapParts[i].textContent = t[i];
  }
  function paintLapTime() {
    if (lapEl && !folded) showLap(lap.ms + sinceTick());
  }
  function paintLap() {
    if (!lapEl) return;
    setT(lapEl, lap.col);
    showLap(lap.ms + sinceTick());
  }

  /* ---------- 시계 ----------
     시간은 0.1초 박자(advance)로 쌓고, 숨은 탭 · 체커기 뒤에는 흐르지 않습니다. 화면에 그리는 건 따로:
     랩 타이머가 실제로 보이는 동안(펼쳐짐 · 탭이 보임 · 화면 안 · 체커기 전)만 rAF 로 매 프레임 1/1000초까지,
     그 밖에는 박자마다(움직임 줄이기 설정이면 늘 박자마다). 구간을 넘는 순간에도 먼저 쌓아 두어 기록이 ms 단위로 맞습니다. */
  var lastTick = performance.now(), clockRuns = !d.hidden;
  function advance() {
    var now = performance.now(), dt = now - lastTick;
    lastTick = now;
    if (!clockRuns || finished) return;
    lap.ms += dt;
    if (secB.cur >= 0 && secB.cur < secB.n) secB.run[secB.cur] += dt;   // 시간이 흐르는 건 지금 구간 하나뿐
    if (miniB.cur >= 0 && miniB.cur < miniB.n) miniB.run[miniB.cur] += dt;
  }
  function sinceTick() { return clockRuns && !finished ? Math.max(0, performance.now() - lastTick) : 0; }
  var clockRaf = 0, lapSeen = false;
  function clockOn() {
    return !!lapEl && !reduce && !folded && clockRuns && !finished && lapSeen && !(aside && aside.classList.contains('is-away'));
  }
  function clockFrame() {
    clockRaf = 0;
    if (!clockOn()) return;
    paintLapTime();
    paintRows();
    clockRaf = requestAnimationFrame(clockFrame);
  }
  function wakeClock() { if (!clockRaf && clockOn()) clockRaf = requestAnimationFrame(clockFrame); }
  if (body) {
    // 접이식 영역(영어 번역본 등)을 열고 닫으면 그 구간의 분량이 바뀝니다
    body.addEventListener('toggle', function (e) { if (e.target.tagName === 'DETAILS') measureTargets(); }, true);
    setInterval(function () {
      advance();
      // 매 프레임 그리는 중이거나, 랩 타이머가 보이지 않으면(접힘 · 닫힌 서랍 · 화면 밖) 쌓기만 — 줄 색 · 기록은 스크롤(updateDash)이 그림
      if (clockRaf || !lapSeen) return;
      paintLapTime();
      paintRows();
    }, 100);
    // 탭을 떠나는 순간까지는 쌓고, 숨어 있던 동안은 버립니다
    d.addEventListener('visibilitychange', function () { advance(); clockRuns = !d.hidden; wakeClock(); });
    if (lapEl && 'IntersectionObserver' in w) {
      new IntersectionObserver(function (en) { lapSeen = en[en.length - 1].isIntersecting; wakeClock(); }).observe(lapEl);
    } else lapSeen = true;
  }

  var navLine = 0;   // 이 선을 지난 소제목이 '현재 섹터' (헤더 높이 + 여유). 창 크기가 바뀔 때만 다시 잽니다.
  function measureNav() { navLine = (parseInt(getComputedStyle(d.documentElement).getPropertyValue('--nav-h'), 10) || 84) + 90; }

  /* 타이밍 한 판: 지금 언어의 소제목 · 목차로 섹터를 다시 세고, 시간 · 색 · 개인 최고를 모두 처음부터 */
  function startSession() {
    heads = headsOf(lang);
    headIds = heads.map(function (h) { return h.id; });
    // 섹터 번호는 본문의 'SECTOR 0N' 라벨(CSS 카운터, h2 만 셉니다)과 같게: h3/h4 는 자기가 속한 h2 의 섹터.
    // h2 가 하나도 없는 글이면 소제목 순서 그대로.
    var h2Count = heads.filter(function (h) { return h.tagName === 'H2'; }).length;
    secOf = [];
    heads.reduce(function (n, h, i) { if (h.tagName === 'H2') n++; secOf[i] = h2Count ? Math.max(1, n) : i + 1; return n; }, 0);
    secTotal = h2Count || heads.length;
    nSec = Math.max(1, secTotal);
    nMini = Math.max(1, heads.length);
    secB = board(nSec);
    miniB = board(nMini);
    // 체커기 너머에서 시작한 판은 시계가 멈춰 있으니 랩을 비워 둡니다(blank) — 다시 올라와 체커기를 벗어나면 0 부터
    lap = { ms: 0, tgt: 0, pb: null, col: null, blank: finished };
    lastTick = performance.now();
    bounds = null;
    currentId = null;
    headTexts = [];
    var navs = navsOf(lang);
    tocLinks = [];
    navs.forEach(function (n) { tocLinks = tocLinks.concat($$('a[href^="#"]', n)); });
    telNav = navs.filter(function (n) { return !!n.closest('.telemetry'); })[0] || null;
    telLinks = telNav ? $$('a[href^="#"]', telNav) : [];
    // 다른 언어 목차에 남은 표시(지금 줄 · 지난 줄 · 타이밍 색)는 지웁니다
    allTocLinks.forEach(function (a) { a.classList.remove('is-active', 'is-passed', 'is-live'); setT(a, null); });
    buildRows();
    if (body) measureTargets();
    paintLap();
    paintRows();
  }
  if (body) startSession();

  /* ---------- 미니 트랙 맵: 섹터 = 소제목, 읽은 만큼 차가 한 바퀴 돕니다 ----------
     섹터 n 은 그 섹터 첫 소제목부터 다음 섹터 첫 소제목까지의 본문 구간(첫 섹터는 글 첫머리부터). 경계는 경로 길이의 비율.
     색은 위 타이밍 규칙(보라 · 초록 · 노랑, 한 번 칠하면 유지), 지금 섹터는 마지막 색 + 숨 쉬는 테두리.
     차는 같은 스크롤 rAF 에서 목표를 받고 부드럽게 따라가며(트랙 위로만), 움직임 줄이기 설정이면 곧바로 그 자리에 섭니다.
     서킷: data-circuits(assets/data/circuits.json, 지문 붙은 주소)를 맵이 실제로 보일 때 한 번 불러와 무작위로 하나.
     실패하거나 서킷이 없으면 템플릿에 그려 둔 기본 서킷. 선 굵기 · 차 · 눈금은 화면 px 기준(--u = 사용자 단위/px)이라 서킷 크기와 무관. */
  var tmap = body && $('[data-trackmap]');
  var SVGNS = 'http://www.w3.org/2000/svg';
  var tm = null;
  if (tmap) {
    tm = { svg: $('[data-track-svg]', tmap), bed: $('[data-track-bed]', tmap), line: $('[data-track-line]', tmap), halo: $('[data-track-halo]', tmap),
      car: $('[data-track-car]', tmap), sf: $('[data-track-sf]', tmap), secG: $('[data-track-sectors]', tmap), tickG: $('[data-track-ticks]', tmap),
      nameEl: $('[data-track-name]', tmap), locEl: $('[data-track-loc]', tmap), ctyEl: $('[data-track-country]', tmap),
      L: 0, u: 0, bounds: null, secs: [], at: 0, to: 0, raf: 0, asked: false };
    tm.def = { viewBox: tm.svg.getAttribute('viewBox'), d: tm.line.getAttribute('d'), name: tm.nameEl.textContent, location: tm.locEl.textContent, country: tm.ctyEl.textContent.replace(/^[\s·]+/, '') };
    try { tm.L = tm.line.getTotalLength(); } catch (e) { tm.L = 0; }
    if (!tm.L) { tmap.classList.remove('is-loading'); tm = null; }
  }
  // 섹터 경계를 버립니다(창 크기 · 본문 높이 · 서킷이 바뀜). 아직 남은 차 한 걸음(rAF)도 함께 취소 —
  // 그 프레임이 다시 재기 전에 돌면 빈 경계를 읽기 때문. 다음 scroll loop 의 updateMap 이 다시 재고 차를 다시 출발시킵니다.
  function dropMap() {
    if (!tm) return;
    tm.bounds = null;
    if (tm.raf) { cancelAnimationFrame(tm.raf); tm.raf = 0; }
  }
  function seg(el, a, b) {   // 경로의 [a, b] 구간만 보이게 (사용자 단위)
    el.setAttribute('stroke-dasharray', Math.max(0, b - a).toFixed(2) + ' ' + (tm.L * 2).toFixed(0));
    el.setAttribute('stroke-dashoffset', (-a).toFixed(2));
  }
  function fitMap() {
    var r = tm.svg.getBoundingClientRect(), vb = tm.svg.viewBox.baseVal;
    if (!r.width || !r.height || !vb || !vb.width || !vb.height) { tm.u = -1; return; }
    var u = 1 / Math.min(r.width / vb.width, r.height / vb.height);
    tm.u = u;
    tm.svg.style.setProperty('--u', u.toFixed(4));
    tm.car.setAttribute('r', (3.4 * u).toFixed(3));
    // 출발선: 경로 첫머리(S/F)에서 트랙에 수직인 짧은 선
    var a = tm.line.getPointAtLength(0), c = tm.line.getPointAtLength(Math.min(tm.L, 2 * u));
    var tx = c.x - a.x, ty = c.y - a.y, len = Math.sqrt(tx * tx + ty * ty) || 1, h = 6.5 * u;
    var nx = -ty / len * h, ny = tx / len * h;
    tm.sf.setAttribute('x1', (a.x - nx).toFixed(2)); tm.sf.setAttribute('y1', (a.y - ny).toFixed(2));
    tm.sf.setAttribute('x2', (a.x + nx).toFixed(2)); tm.sf.setAttribute('y2', (a.y + ny).toFixed(2));
    dropMap();   // 섹터 눈금 길이도 새 배율로
  }
  function measureMap() {
    var b = bounds.sec, n = b.length - 1, L = tm.L, u = tm.u > 0 ? tm.u : 1;
    tm.bounds = b;
    if (tm.secs.length !== n) {
      tm.secG.textContent = '';
      tm.secs = [];
      for (var i = 0; i < n; i++) {
        var p = d.createElementNS(SVGNS, 'path');
        p.setAttribute('d', tm.line.getAttribute('d'));
        p.setAttribute('class', 'trackmap__sec');
        tm.secG.appendChild(p);
        tm.secs.push(p);
      }
    }
    // 섹터 경계 눈금: 트랙에 수직인 짧은 선
    tm.tickG.textContent = '';
    for (var j = 1; j < n; j++) {
      var s = b[j] * L;
      var p1 = tm.line.getPointAtLength(Math.max(0, s - u)), p2 = tm.line.getPointAtLength(Math.min(L, s + u)), pt = tm.line.getPointAtLength(s);
      var tx = p2.x - p1.x, ty = p2.y - p1.y, len = Math.sqrt(tx * tx + ty * ty) || 1;
      var nx = -ty / len * 4.5 * u, ny = tx / len * 4.5 * u;
      var ln = d.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', (pt.x - nx).toFixed(2)); ln.setAttribute('y1', (pt.y - ny).toFixed(2));
      ln.setAttribute('x2', (pt.x + nx).toFixed(2)); ln.setAttribute('y2', (pt.y + ny).toFixed(2));
      tm.tickG.appendChild(ln);
    }
    for (var q = 0; q < n; q++) seg(tm.secs[q], b[q] * L, b[q + 1] * L);
  }
  function drawMap() {
    var L = tm.L, b = tm.bounds, n = tm.secs.length, live = secB.cur;
    if (!b) return;
    for (var k = 0; k < n; k++) {
      var cls = 'trackmap__sec' + (secB.col[k] ? ' t-' + secB.col[k] : '') + (k === live ? ' is-live' : '');
      if (tm.secs[k].getAttribute('class') !== cls) tm.secs[k].setAttribute('class', cls);
    }
    var on = live >= 0 && live < n;
    if (on) seg(tm.halo, b[live] * L, b[live + 1] * L);
    var hcls = 'trackmap__halo' + (on ? ' is-on' : '') + (on && secB.col[live] ? ' t-' + secB.col[live] : '');
    if (tm.halo.getAttribute('class') !== hcls) tm.halo.setAttribute('class', hcls);
    var pt = tm.line.getPointAtLength(Math.min(L, Math.max(0, tm.at * L)));
    tm.car.setAttribute('cx', pt.x.toFixed(2));
    tm.car.setAttribute('cy', pt.y.toFixed(2));
    tmap.classList.toggle('is-finish', finished);
    setT(tm.sf, finished ? lap.col : null);   // 체커기: 출발선이 이번 랩의 색으로
  }
  function carStep() {
    tm.raf = 0;
    if (!tm.bounds || !bounds) { onScroll(); return; }   // 경계를 다시 재는 중: scroll loop 가 재고 나서 다시 출발
    var gap = tm.to - tm.at;
    if (reduce || Math.abs(gap) < 0.0004) tm.at = tm.to; else tm.at += gap * 0.18;
    drawMap();
    if (tm.at !== tm.to) tm.raf = requestAnimationFrame(carStep);
  }
  function updateMap(p) {
    if (!tm || folded || tmap.classList.contains('is-loading')) return;   // 접혀 있거나 서킷을 고르는 중이면 그리지 않음
    if (!tm.u) fitMap();
    if (!tm.bounds) measureMap();
    tm.to = finished ? 1 : p;
    if (reduce) { tm.at = tm.to; drawMap(); return; }
    if (!tm.raf) carStep();   // 이번 프레임에 한 걸음, 남은 거리는 다음 프레임들에서
  }
  function circuitOK(c) {
    if (!c || typeof c.d !== 'string' || !/^\s*[Mm]/.test(c.d) || typeof c.viewBox !== 'string') return false;
    var v = c.viewBox.trim().split(/[\s,]+/).map(Number);
    return v.length === 4 && v.every(isFinite) && v[2] > 0 && v[3] > 0;
  }
  // 이름 · 도시 · 나라 (나라는 도시와 같으면 생략, 좁은 레일에선 CSS 가 숨김)
  function label(c) {
    var a = String(c.location || '').trim(), b = String(c.country || '').trim(), nm = String(c.name || '').trim();
    tm.nameEl.textContent = nm;
    tm.locEl.textContent = a || b;
    tm.ctyEl.textContent = a && b && a !== b ? ' · ' + b : '';
    // 긴 이름은 둘째 줄로 내려가고(CSS), 그래도 잘리면 마우스를 올려 전체 이름을 봅니다
    tm.nameEl.parentNode.title = [nm, a, a !== b ? b : ''].filter(Boolean).join(' · ');
  }
  function useCircuit(c) {
    var L = 0;
    if (c) {
      tm.svg.setAttribute('viewBox', c.viewBox.trim());
      [tm.bed, tm.line, tm.halo].forEach(function (p) { p.setAttribute('d', c.d); });
      try { L = tm.line.getTotalLength(); } catch (e) { L = 0; }
      if (!(L > 0)) return useCircuit(null);
      label(c);
    } else {
      tm.svg.setAttribute('viewBox', tm.def.viewBox);
      [tm.bed, tm.line, tm.halo].forEach(function (p) { p.setAttribute('d', tm.def.d); });
      label(tm.def);
      L = tm.line.getTotalLength();
    }
    tm.L = L;
    tm.secs = [];
    tm.secG.textContent = '';
    dropMap();
    tm.u = 0;
    tm.at = tm.to = finished ? 1 : readProgress();   // 새 서킷에선 차가 지금 자리에서 시작 (출발선부터 달려오지 않게)
    tmap.classList.remove('is-loading');
    onScroll();
  }
  function loadCircuit() {
    tm.asked = true;
    var src = tmap.getAttribute('data-circuits');
    if (!src || !w.fetch) { useCircuit(null); return; }
    var settled = false;
    function settle(c) { if (settled) return; settled = true; clearTimeout(timer); useCircuit(c); }
    var timer = setTimeout(function () { settle(null); }, 4000);   // 느린 망: 기본 서킷으로 (늦게 온 응답으로 바꿔 끼우지 않음)
    fetch(src).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
      var list = data && Array.isArray(data.circuits) ? data.circuits.filter(circuitOK) : [];
      settle(list.length ? list[Math.floor(Math.random() * list.length)] : null);
    }).catch(function () { settle(null); });
  }
  // 맵이 실제로 보일 때만 서킷을 고릅니다: 펼쳐져 있고, 레일 화면이거나 목차 서랍이 열려 있을 때
  function ensureMap() {
    if (!tm || tm.asked || folded) return;
    if (!tm.svg.getClientRects().length) return;
    if (drawerMQ.matches && !(aside && aside.classList.contains('is-open'))) return;
    loadCircuit();
  }
  function setFold(on) {
    folded = on;
    d.documentElement.classList.toggle('tel-folded', on);
    if (telFold) telFold.setAttribute('aria-expanded', on ? 'false' : 'true');
    store('localStorage', 'dl-telemetry', on ? 'folded' : 'open');
    if (!on) {
      if (tm) { tm.u = 0; tm.at = tm.to = finished ? 1 : readProgress(); }
      paintLap();
      ensureMap();
      wakeClock();
    }
    paintRows();
    fitRail();   // 접히는 칸의 최종 높이로 타워 자리를 다시 고릅니다
    onScroll();
  }
  if (telFold) telFold.addEventListener('click', function () { setFold(!folded); });

  function updateDash() {
    // 레이아웃 값을 먼저 다 읽고 나서 클래스/글자를 씁니다 (스크롤 한 프레임에 강제 리플로가 끼지 않게)
    var p = readProgress();
    var id = null;
    var idx = -1;
    var railOn = false, oRail = 1, oDock = 1;
    if (body) {
      if (!navLine) measureNav();
      if (!bounds) measureBounds();
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top - navLine <= 0) { id = heads[i].id; idx = i; } else break;
      }
      railOn = !!aside && !drawerMQ.matches;
      if (railOn) {
        if (!railTopPx) railTopPx = parseFloat(getComputedStyle(aside).top) || 0;
        // 키보드 포커스가 안에 있는 동안은 흐리거나 가리지 않습니다 (가려지면 포커스가 사라짐)
        oRail = aside.matches(':focus-within') ? 1 : railOpacity(true, aside.getBoundingClientRect().top);
        oDock = !dock ? 1 : dock.matches(':focus-within') ? 1 : railOpacity(true, dock.getBoundingClientRect().top);
      }
    }

    var n = Math.round(p * leds.length);
    leds.forEach(function (l, i) { l.classList.toggle('on', i < n); });
    if (ledBox) ledBox.classList.toggle('is-max', p >= 0.985 && w.scrollY > 40);
    setGear(p < 0.02 ? 'N' : String(Math.min(8, 1 + Math.floor(p * 8))));
    if (pctText) pctText.textContent = Math.round(p * 100) + '%';
    if (pctBar) pctBar.style.width = (p * 100).toFixed(1) + '%';
    if (!body) return;
    if (aside) {
      fadeEl(aside, railOn ? oRail : 1);
      fadeEl(dock, railOn ? oDock : 1);
      d.body.classList.toggle('dock-away', railOn && oDock < 0.5);
    }

    advance();   // 구간을 넘기 전에 지금까지의 시간을 쌓아 둠 (기록이 박자가 아니라 이 순간 기준)
    var fin = p >= 0.985;
    if (fin !== finished) {
      finished = fin;
      if (nav) nav.classList.toggle('is-finish', fin);
      // 체커기 = 한 바퀴 완주. 랩 시간은 이어서 흐르므로(다시 올라가 읽으면) 다음 완주는 개인 최고와 비교됩니다
      if (fin && counts(lap.ms, lap.tgt)) { lap.col = grade(lap.ms, lap.tgt, lap.pb); if (lap.pb == null || lap.ms < lap.pb) lap.pb = lap.ms; }
      else lap.col = null;
      if (!fin) lap.blank = false;   // 체커기를 벗어남: 비워 둔 랩도 이제 흐름
      else if (lap.ms < FLYBY_MS) lap.blank = true;   // 달리기도 전에 체커기(글 끝에서 새로 고침 등): 0:00.0xx 에 멈춰 두지 않음
      paintLap();
    }
    // 지금 구간: 결승선 너머 = n, 첫 소제목 앞(글 첫머리) = 1구간
    var uSec = finished ? nSec : (idx === -1 ? 0 : secOf[idx] - 1);
    var uMini = finished ? nMini : Math.max(0, idx);
    if (jumping) { /* 건너뛰는 중: 지나치는 구간은 기록하지 않음 */ }
    else if (landed) { landed = false; teleport(secB, uSec); teleport(miniB, uMini); }
    else { moveTo(secB, uSec); moveTo(miniB, uMini); }
    if (!jumping) { cover(secB, bounds.sec, p); cover(miniB, bounds.mini, p); }
    paintRows();
    var secTxt = Math.min(uSec + 1, nSec) + '/' + nSec;
    if (sectorEl && sectorEl.textContent !== secTxt) sectorEl.textContent = secTxt;
    if (sectorMini && sectorMini.textContent !== secTxt) sectorMini.textContent = secTxt;
    updateMap(p);

    if (finished) setDisplay('Finish', 'Chequered flag');
    else if (idx !== -1) setDisplay('Sector ' + secOf[idx], headTexts[idx] || (headTexts[idx] = headingText(heads[idx])));
    else setDisplay(baseLabel, baseText);

    if (id !== currentId) {
      currentId = id;
      tocLinks.forEach(function (a) {
        var hid = decodeURIComponent(a.getAttribute('href').slice(1));
        var k = headIds.indexOf(hid);
        a.classList.toggle('is-active', hid === id);
        a.classList.toggle('is-passed', k !== -1 && k < idx);
      });
      // 목록만 스크롤합니다 — 위의 랩 타이머 · % · 진행 막대는 늘 보이게 (CSS: .telemetry > nav 가 스크롤 영역, 지금 언어의 것)
      var tel = telNav;
      var act = tel && $('a.is-active', tel);
      if (act && tel && tel.scrollHeight > tel.clientHeight) {
        var r = act.getBoundingClientRect(), tr = tel.getBoundingClientRect();
        if (r.top < tr.top + 24 || r.bottom > tr.bottom - 24) {
          tel.scrollTo({ top: tel.scrollTop + r.top - tr.top - tr.height / 3, behavior: reduce ? 'auto' : 'smooth' });
        }
      }
    }
    wakeClock();   // 체커기에서 돌아왔거나 레일이 다시 보이면 랩 타이머를 다시 그림
  }

  /* ---------- 휠 버튼 인디케이터 ---------- */
  var btnWrap = $('[data-nav-btns]');
  var indicator = btnWrap && $('.wheel__indicator', btnWrap);
  var activeBtn = btnWrap && $('.wbtn.is-active', btnWrap);
  function moveIndicator(btn) {
    if (!indicator) return;
    if (!btn) { indicator.classList.remove('is-on'); return; }
    var wr = btnWrap.getBoundingClientRect(), r = btn.getBoundingClientRect();
    indicator.style.setProperty('--ix', (r.left - wr.left) + 'px');
    indicator.style.setProperty('--iw', r.width + 'px');
    indicator.style.setProperty('--ind', getComputedStyle(btn).getPropertyValue('--led').trim() || '#db0a40');
    indicator.classList.add('is-on');
  }
  // 쉬는 자리: 카테고리 패널이 열려 있으면 그 버튼 아래, 아니면 지금 페이지의 버튼 아래.
  // (버튼에서 패널로 내려가는 사이 휠 몸체를 지나도 표시줄이 홈으로 튀었다 돌아오지 않게)
  function restIndicator() {
    if (!btnWrap || btnWrap.matches(':hover')) return;
    moveIndicator($('.nav__item.is-open [data-drop-toggle]', btnWrap) || activeBtn);
  }
  if (btnWrap) {
    btnWrap.addEventListener('mouseover', function (e) { var b = e.target.closest('.wbtn'); if (b) moveIndicator(b); });
    btnWrap.addEventListener('focusin', function (e) { var b = e.target.closest('.wbtn'); if (b) moveIndicator(b); });
    btnWrap.addEventListener('mouseleave', restIndicator);
    btnWrap.addEventListener('focusout', function (e) { if (!btnWrap.contains(e.relatedTarget)) restIndicator(); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(function () { moveIndicator(activeBtn); });
    else moveIndicator(activeBtn);
  }

  // 목차 서랍 (레일이 들어가지 않는 <1280px — CSS 의 같은 경계). 열려 있는 동안 FAB 은 CSS 가 숨기므로, 서랍 머리에 닫기 버튼을 하나 둡니다.
  var aside = $('.post-aside');
  var fab = $('[data-toc-toggle]');
  var drawerMQ = w.matchMedia('(max-width: 1279.98px)');
  function setAside(open) {
    if (!aside) return;
    var was = aside.classList.contains('is-open');
    aside.classList.toggle('is-open', open);
    if (fab) {
      fab.setAttribute('aria-expanded', open ? 'true' : 'false');
      fab.setAttribute('aria-label', open ? '목차 닫기' : '목차 열기');
    }
    if (open && !was) {
      var first = (telNav && $('a', telNav)) || $('a, button', aside);
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 60);
      // 서랍 속 트랙 맵: 이제 보이니 서킷을 고르고 배율을 다시 잽니다
      if (tm) tm.u = 0;
      ensureMap();
      onScroll();
    }
    if (!open && was && aside.contains(d.activeElement) && fab) {
      // FAB 은 서랍이 닫히는 순간 다시 보이기 시작하므로(visibility 전환) 바로 안 되면 두 프레임 뒤에 한 번 더
      var toFab = function () { fab.focus({ preventScroll: true }); };
      toFab();
      if (d.activeElement !== fab) requestAnimationFrame(function () { requestAnimationFrame(toFab); });
    }
  }
  if (fab) fab.addEventListener('click', function (e) { e.stopPropagation(); setAside(!aside.classList.contains('is-open')); });
  if (aside && fab) {
    var asideClose = d.createElement('button');
    asideClose.type = 'button';
    asideClose.className = 'rotary telemetry__close';
    asideClose.setAttribute('aria-label', '목차 닫기');
    asideClose.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    ($('.telemetry__head', aside) || aside).appendChild(asideClose);
    asideClose.addEventListener('click', function () { setAside(false); });
  }
  if (aside) {
    aside.addEventListener('click', function (e) { if (e.target.closest('a')) setAside(false); });
    // 열린 서랍 바깥(어두운 막)을 누르면 닫기만 합니다 — 막 아래의 링크·버튼이 함께 눌리지 않게 캡처 단계에서 막습니다
    d.addEventListener('click', function (e) {
      if (!aside.classList.contains('is-open') || aside.contains(e.target) || (fab && fab.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      setAside(false);
    }, true);
    // Tab 으로 서랍 밖에 나가면(가려진 요소에 포커스가 숨지 않게) 서랍을 닫습니다.
    // 포인터로 바깥을 누를 때의 포커스 이동은 위의 클릭 처리에 맡깁니다 (여기서 먼저 닫으면 막 아래 버튼이 눌림)
    var tabbing = false;
    d.addEventListener('keydown', function (e) { if (e.key === 'Tab') tabbing = true; }, true);
    d.addEventListener('pointerdown', function () { tabbing = false; }, true);
    aside.addEventListener('focusout', function (e) {
      if (!tabbing || !aside.classList.contains('is-open')) return;
      if (e.relatedTarget && !aside.contains(e.relatedTarget) && e.relatedTarget !== fab) setAside(false);
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setAside(false); });
    // 창이 넓어져 서랍이 사이드 패널로 돌아가면 열림 상태를 풉니다
    if (drawerMQ.addEventListener) drawerMQ.addEventListener('change', function () { if (!drawerMQ.matches) { setAside(false); ensureMap(); } fitRail(); });
  }

  /* ---------- 레일 높이 맞추기 ----------
     레일은 화면 높이를 넘지 않고, 넘치면 목차 목록만 줄어들어 안에서 스크롤합니다. 목차가 주인공이라
     목차는 전부 보이거나, 적어도 5줄 이상이면서 타워보다 좁지 않아야 합니다. 그렇게 될 때까지 타워를 덜어 냅니다:
     7줄 → 가운데 5줄(.rail-short) → 앞 글 · 이 글 · 뒤 글 3줄(.rail-min) → 레일에서 빼고 글 끝 사본으로(.rail-tight).
     각 단계를 그 자리에서 재 보고 고르므로(한 작업 안, 그리기 전) 깜빡이지 않습니다.
     랩 타이머를 접고 펴는 동안에도 끝 상태로 판단합니다(접히는 칸의 최종 높이로 계산). */
  var layoutEl = aside && aside.parentNode;
  var railTower = aside && $('.tower--rail', aside);
  var collapseEl = aside && $('.telemetry__collapse', aside), collapseIn = aside && $('.telemetry__collapse-in', aside);
  var NAV_MIN = 176;   // 목차 5줄 + 위아래 여백
  var RAIL_STAGES = [['', null], ['rail-short', '.is-extra'], ['rail-min', '.is-far'], ['rail-tight', null]];
  function railFits() {
    var maxH = parseFloat(getComputedStyle(aside).maxHeight) || Infinity;
    var railH = aside.getBoundingClientRect().height;
    var dash = collapseEl && collapseIn ? (folded ? 0 : collapseIn.scrollHeight) - collapseEl.getBoundingClientRect().height : 0;
    var railNav = telNav;   // 지금 언어의 목차
    var navH = railNav ? railNav.clientHeight : 0, navFull = railNav ? railNav.scrollHeight : 0;
    var natural = railH - navH + navFull + dash;   // 아무것도 줄이지 않았을 때의 레일 높이
    if (!railNav) return natural <= maxH + 1;
    var towerH = railTower.getClientRects().length ? railTower.getBoundingClientRect().height : 0;
    var navFinal = navFull - Math.max(0, natural - maxH);
    var need = Math.min(navFull, Math.max(NAV_MIN, towerH));
    if (navFull - need < 24) need = navFull;   // 몇 px 만 가려지는 목록(스크롤할 거리도 안 되는)은 만들지 않음 — 전부 보이게
    return navFinal >= need;
  }
  function fitRail() {
    if (!layoutEl || !railTower) return;
    var cl = layoutEl.classList;
    RAIL_STAGES.forEach(function (s) { if (s[0]) cl.remove(s[0]); });
    if (drawerMQ.matches) return;
    for (var i = 0; i < RAIL_STAGES.length; i++) {
      var s = RAIL_STAGES[i];
      if (s[1] && !$(s[1], railTower)) continue;   // 이 단계에서 숨길 줄이 없으면(글이 적은 카테고리) 건너뜀
      if (s[0]) cl.add(s[0]);
      if (i === RAIL_STAGES.length - 1 || railFits()) return;
      if (s[0]) cl.remove(s[0]);
    }
  }

  /* ---------- 레일이 놓여나는 순간 ----------
     글 끝(레이아웃 끝)에서 레일 · 도구 막대가 붙어 있던 자리를 떠나 위로 올라가기 시작하면, 휠 옆으로 삐져나오지 않게
     올라간 거리만큼 흐려집니다(스크롤에 묶인 값이라 따로 움직이는 애니메이션 없음). 도구 막대가 사라지면 떠 있는 '맨 위로' 를 다시 띄웁니다. */
  var dock = $('.post-dock');
  var railTopPx = 0, RAIL_FADE = 36;
  function railOpacity(on, top) {
    if (!on) return 1;
    var r = railTopPx - top;
    return r > 0.5 ? Math.max(0, 1 - r / RAIL_FADE) : 1;
  }
  function fadeEl(el, o) {
    if (!el) return;
    var v = o < 1 ? o.toFixed(3) : '';
    if (el.style.opacity !== v) el.style.opacity = v;
    el.classList.toggle('is-away', o === 0);
  }
  // 포커스가 레일 · 막대를 떠나면 그 자리에 맞는 흐림으로 (스크롤이 없어도)
  [aside, dock].forEach(function (el) { if (el) el.addEventListener('focusout', function () { setTimeout(onScroll, 0); }); });

  // 코드 복사
  d.addEventListener('click', function (e) {
    var btn = e.target.closest('.codeblock__copy');
    if (!btn) return;
    var code = btn.closest('.codeblock').querySelector('pre code') || btn.closest('.codeblock').querySelector('pre');
    var clone = code.cloneNode(true);
    $$('.ln', clone).forEach(function (n) { n.remove(); });
    copyText(clone.textContent.replace(/\n$/, '')).then(
      function () { flash(btn, 'Copied', 'is-copied', '코드를 복사했습니다'); },
      function () { flash(btn, 'Failed', 'is-error', '코드를 복사하지 못했습니다'); });
  });

  // 링크 복사 (버튼 글자는 짧게 — 길면 옆의 '터미널에서 읽기' 가 밀립니다. 긴 문장은 낭독기로만)
  $$('[data-copy-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      copyText(location.href.split('#')[0]).then(
        function () { flash(btn, '복사됨', 'is-done', '링크를 복사했습니다'); },
        function () { flash(btn, '실패', 'is-error', '링크를 복사하지 못했습니다'); });
    });
  });

  // 왼쪽 도구 막대: 아이콘 버튼이라 글자 대신 말풍선이 결과를 잠깐 보여 주고, 낭독기에도 알립니다
  $$('[data-dock-copy]').forEach(function (btn) {
    var tip = $('.dock__tip', btn), base = tip ? tip.textContent : '';
    function told(label, cls, said) {
      btn.classList.remove('is-done', 'is-error');
      btn.classList.add(cls, 'is-told');
      if (tip) tip.textContent = label;
      announce(said);
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.classList.remove(cls, 'is-told'); if (tip) tip.textContent = base; }, 1600);
    }
    btn.addEventListener('click', function () {
      copyText(location.href.split('#')[0]).then(
        function () { told('복사됨', 'is-done', '링크를 복사했습니다'); },
        function () { told('복사하지 못했습니다', 'is-error', '링크를 복사하지 못했습니다'); });
    });
  });
  $$('[data-scroll-top]').forEach(function (btn) {
    btn.addEventListener('click', function () { w.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });
  });

  // 팀 라디오
  var radio = $('[data-radio]');
  if (radio) {
    var quotes = [];
    try { quotes = JSON.parse($('[data-radio-data]', radio).textContent) || []; } catch (e) {}
    var qText = $('[data-radio-text]', radio), qBy = $('[data-radio-by]', radio);
    var qi = 0;
    var pick = function () {
      if (quotes.length < 2) return;
      var n;
      do { n = Math.floor(Math.random() * quotes.length); } while (n === qi);
      qi = n;
      radio.classList.add('is-switching');
      setTimeout(function () {
        qText.textContent = quotes[qi].text;
        qBy.textContent = '— ' + quotes[qi].by;
        radio.classList.remove('is-switching');
      }, reduce ? 0 : 220);
    };
    if (quotes.length > 1) { qi = -1; pick(); }
    var nextBtn = $('[data-radio-next]', radio);
    if (nextBtn) nextBtn.addEventListener('click', pick);
  }

  // 이미지 확대
  if (body) {
    body.addEventListener('click', function (e) {
      var img = e.target.closest('img');
      if (!img || img.closest('a')) return;
      // 모달: 포커스를 안으로 옮기고 배경은 inert, 닫으면 원래 자리로 돌려놓습니다
      var prev = d.activeElement;
      var box = d.createElement('div');
      box.className = 'lightbox';
      box.tabIndex = -1;
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', (img.alt || '이미지') + ' (클릭하거나 Esc 로 닫기)');
      var big = d.createElement('img');
      big.src = img.currentSrc || img.src;
      big.alt = img.alt || '';
      box.appendChild(big);
      var close = function () {
        if (!box.parentNode) return;
        box.remove();
        d.removeEventListener('keydown', onKey);
        setBackgroundInert(false);
        if (prev && prev.focus) prev.focus({ preventScroll: true });
      };
      var onKey = function (ev) { if (ev.key === 'Escape' || ((ev.key === 'Enter' || ev.key === ' ') && ev.target === box)) { ev.preventDefault(); close(); } };
      box.addEventListener('click', close);
      d.addEventListener('keydown', onKey);
      d.body.appendChild(box);
      setBackgroundInert(true, box);
      box.focus({ preventScroll: true });
    });
  }


  /* ---------- 표 크로스헤어 (열 하이라이트) ---------- */
  var colCells = [];
  function clearCol() { colCells.forEach(function (c) { c.classList.remove('is-col'); }); colCells = []; }
  if (body) {
    body.addEventListener('mouseover', function (e) {
      var cell = e.target.closest('td, th');
      if (!cell || !body.contains(cell)) { clearCol(); return; }
      if (cell.classList.contains('is-col')) return;
      clearCol();
      var idx = cell.cellIndex, table = cell.closest('table');
      $$('tr', table).forEach(function (tr) { var c = tr.children[idx]; if (c) { c.classList.add('is-col'); colCells.push(c); } });
    });
    body.addEventListener('mouseleave', clearCol);
  }

  /* ---------- 마우스 FX: 스포트라이트 · 틸트 · 자석 · 패럴랙스 · 트레이스 ---------- */
  var finePointer = w.matchMedia && w.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var fxRefresh = null;   // 스크롤로 포인터 아래 요소가 바뀌면 scroll loop 가 다시 불러 줍니다
  if (finePointer && !reduce) {
    $$('.card:not(.card--placeholder), .team, .stat, .lap, .radio, .race-plan, .telemetry, .codeblock, .callout, .subcat, .driver-card, .flag, .empty, .search__panel').forEach(function (el) {
      el.classList.add('fx');
      ['fx__glow', 'fx__edge'].forEach(function (cls) {
        var sp = d.createElement('span');
        sp.className = cls;
        sp.setAttribute('aria-hidden', 'true');
        el.appendChild(sp);
      });
    });
    $$('.card--feature, .card--grid, .team, .stat, .driver-card').forEach(function (el) { el.classList.add('fx-tilt'); el.setAttribute('data-tilt', '4'); });
    $$('.card--row').forEach(function (el) { el.classList.add('fx-tilt'); el.setAttribute('data-tilt', '1.5'); });
    // 자석은 따로 떠 있는 버튼에만, 아주 살짝. 휠에 달린 하드웨어(.drs · .rotary)와 코드 복사 버튼은 제자리에 둡니다
    $$('.btn, .hero__scroll, .to-top, .toc-fab, .radio__next, .pager__btn').forEach(function (el) { el.classList.add('fx-mag'); });

    /* 히어로: 패럴랙스 · 스포트라이트는 히어로 위에서만, 속도 트레이스의 커서/읽음표는 트레이스 띠 위에서만.
       판정은 포인터 아래 '맨 위' 요소로 합니다 → 히어로를 덮는 고정 헤더(휠)·드롭다운·서랍·검색창 위에서는
       아무것도 반응하지 않습니다. 화면을 가로질러 커서를 따라다니는 것은 없습니다. */
    var HOSTS = '.hero, .page-hero, .post-hero, .dnf';
    var traceHosts = $$(HOSTS).map(function (host) {
      var tr = $('[data-trace]', host);
      return tr ? { host: host, trace: tr, samples: null } : null;
    }).filter(Boolean);
    var liveHost = null;
    function sampleTrace(item) {
      var path = $('.trace__line', item.trace);
      var L = path.getTotalLength(), xs = [], ys = [];
      for (var i = 0; i <= 240; i++) { var pt = path.getPointAtLength(L * i / 240); xs.push(pt.x); ys.push(pt.y); }
      item.samples = { xs: xs, ys: ys };
    }
    function traceY(item, X) {
      var xs = item.samples.xs, ys = item.samples.ys;
      for (var i = 1; i < xs.length; i++) {
        if (xs[i] >= X) { var t = (X - xs[i - 1]) / Math.max(0.001, xs[i] - xs[i - 1]); return ys[i - 1] + (ys[i] - ys[i - 1]) * t; }
      }
      return ys[ys.length - 1];
    }
    function hostLeave() {
      if (!liveHost) return;
      var h = liveHost.host;
      h.classList.remove('is-hover');
      h.style.setProperty('--px', 0);
      h.style.setProperty('--py', 0);
      liveHost.trace.classList.remove('is-live');
      liveHost = null;
    }
    function hostMove(e, t) {
      var hostEl = t && t.closest(HOSTS), item = null;
      for (var i = 0; i < traceHosts.length; i++) if (traceHosts[i].host === hostEl) { item = traceHosts[i]; break; }
      if (liveHost && liveHost !== item) hostLeave();
      liveHost = item;
      if (!item) return;
      var host = item.host, hr = host.getBoundingClientRect();
      if (host.classList.contains('hero')) {
        host.classList.add('is-hover');
        host.style.setProperty('--px', ((e.clientX - hr.left) / hr.width * 2 - 1).toFixed(3));
        host.style.setProperty('--py', ((e.clientY - hr.top) / hr.height * 2 - 1).toFixed(3));
        host.style.setProperty('--gx', (e.clientX - hr.left).toFixed(0) + 'px');
        host.style.setProperty('--gy', (e.clientY - hr.top).toFixed(0) + 'px');
      }
      var trr = item.trace.getBoundingClientRect();
      var f = (e.clientX - trr.left) / trr.width;
      // 트레이스 띠(히어로 맨 아래) 밖이면 읽음표를 끕니다
      if (e.clientY < trr.top || e.clientY > trr.bottom || f < 0.02 || f > 0.98) { item.trace.classList.remove('is-live'); return; }
      if (!item.samples) sampleTrace(item);
      var svgH = $('.trace__svg', item.trace).getBoundingClientRect().height;
      var Y = traceY(item, f * 1200);
      item.trace.style.setProperty('--tx', (f * trr.width).toFixed(1) + 'px');
      item.trace.style.setProperty('--ty', (Y / 60 * svgH).toFixed(1) + 'px');
      var kmh = Math.round(345 - (Y - 10) / 42 * 263);
      $('.trace__read', item.trace).textContent = 'S' + (f < 1 / 3 ? 1 : f < 2 / 3 ? 2 : 3) + ' · ' + kmh + ' KM/H';
      item.trace.classList.toggle('is-flip', f > 0.8);
      item.trace.classList.add('is-live');
    }

    var hot = null, mag = null, lastE = null, frameRaf = 0;
    function cool(el) {
      el.classList.remove('is-hot');
      if (el.hasAttribute('data-tilt')) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); }
    }
    function release(m) {
      m.classList.remove('is-hot');
      m.style.setProperty('--tx', '0px');
      m.style.setProperty('--ty', '0px');
    }
    function frame() {
      frameRaf = 0;
      var e = lastE;
      if (!e) return;
      // 지금 포인터 아래에 실제로 있는 요소 — 휠·키보드로 스크롤한 뒤에는 마지막 이벤트의 target 이 낡았기 때문
      var t = d.elementFromPoint(e.clientX, e.clientY);

      var el = t && t.closest('.fx');
      if (el !== hot) { if (hot) cool(hot); hot = el; if (el) el.classList.add('is-hot'); }
      if (el) {
        var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty('--mx', x.toFixed(0) + 'px');
        el.style.setProperty('--my', y.toFixed(0) + 'px');
        var k = parseFloat(el.getAttribute('data-tilt'));
        if (k) {
          el.style.setProperty('--ry', ((x / r.width - 0.5) * k).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((0.5 - y / r.height) * k).toFixed(2) + 'deg');
        }
      }

      var m = t && t.closest('.fx-mag');
      if (m !== mag) { if (mag) release(mag); mag = m; if (m) m.classList.add('is-hot'); }
      if (m) {
        var mr = m.getBoundingClientRect();
        var dx = e.clientX - (mr.left + mr.width / 2), dy = e.clientY - (mr.top + mr.height / 2);
        m.style.setProperty('--tx', Math.max(-6, Math.min(6, dx * 0.2)).toFixed(1) + 'px');
        m.style.setProperty('--ty', Math.max(-4, Math.min(4, dy * 0.25)).toFixed(1) + 'px');
      }

      hostMove(e, t);
    }
    fxRefresh = function () { if (lastE && !frameRaf) frame(); };
    d.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      lastE = { clientX: e.clientX, clientY: e.clientY };
      if (!frameRaf) frameRaf = requestAnimationFrame(frame);
    }, { passive: true });
    d.addEventListener('pointerout', function (e) {
      if (e.relatedTarget) return;   // 창 밖으로 나갔을 때만
      lastE = null;                  // 이후 키보드 스크롤이 엉뚱한 카드를 다시 데우지 않게
      if (hot) { cool(hot); hot = null; }
      if (mag) { release(mag); mag = null; }
      hostLeave();
    });
  }

  /* ---------- 읽는 언어 바꾸기 ----------
     스위치(켜짐 = EN): 누르기 · Space · Enter 로 바꾸고, ↑/← = KO · ↓/→ = EN. 바꾼 뒤에도 읽던 자리 그대로 —
     지금 섹터 번호와 그 섹터 안에서의 비율을 재 두었다가 새 언어의 같은 섹터 같은 비율로(그 번호가 없으면 본문 첫머리로).
     본문 앞(제목 · 라디오 · 목차)을 보고 있었다면 스크롤은 그대로. 옮기는 건 한 번에(부드러운 스크롤 없이). */
  var langSwitches = $$('[data-lang-switch]');
  function syncSwitches() {
    langSwitches.forEach(function (sw) { sw.setAttribute('aria-checked', lang === 'en' ? 'true' : 'false'); });
  }
  // 섹터 s(0부터, -1 = 첫 소제목 앞의 글 첫머리)의 문서 좌표 [시작, 끝] — 지금 언어 기준
  function secSpan(s, y, top, bottom) {
    var a = s < 0 ? top : null;
    for (var i = 0; i < heads.length; i++) {
      var k = secOf[i] - 1, t = heads[i].getBoundingClientRect().top + y;
      if (a === null && k === s) a = t;
      else if (a !== null && k > s) return [a, t];
    }
    return a === null ? null : [a, bottom];
  }
  function bodyBox(y) {
    var top = body.getBoundingClientRect().top + y;
    return { top: top, bottom: top + body.offsetHeight };
  }
  function readSpot() {
    if (!navLine) measureNav();
    var y = w.scrollY, line = y + navLine, bb = bodyBox(y);
    if (line < bb.top) return null;
    var s = -1;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top + y - line <= 0) s = secOf[i] - 1; else break;
    }
    var r = secSpan(s, y, bb.top, bb.bottom);
    return { s: s, f: r ? Math.max(0, Math.min(1, (line - r[0]) / Math.max(1, r[1] - r[0]))) : 0 };
  }
  // 스크롤만 한 번에 (html 의 부드러운 스크롤 없이)
  function jumpTo(fn) {
    var st = root.style, sb = st.scrollBehavior;
    st.scrollBehavior = 'auto';
    fn();
    st.scrollBehavior = sb;
  }
  // 마지막으로 바꾼 순간: { lang: 바꾼 언어, y: 옮겨 간 자리, back: 떠나온 자리, vw: 창 너비 }.
  // 그 뒤 스크롤하지 않고 되돌리면 떠나온 자리 그대로 — 비율로 다시 재면 반올림만큼씩 밀려 번역을 오가며 비교할 때 자리가 샙니다
  var swap = null;
  // opt.target: 이 소제목으로 (주소의 #앵커) · opt.y: 이 자리로 (뒤로 가기) · opt.keep: 고른 언어로 기억하지 않음 (링크 · 기록을 따라온 경우)
  function setLang(l, opt) {
    if (!enBlock || l === lang) return;
    opt = opt || {};
    var y0 = w.scrollY;
    var to = opt.y != null ? opt.y
      : !opt.target && swap && swap.lang === lang && swap.y === y0 && swap.vw === w.innerWidth ? swap.back : null;
    var spot = opt.target || to != null ? null : readSpot();
    advance();
    lang = l;
    root.classList.toggle('read-en', l === 'en');
    if (l === 'en') enBlock.open = true;
    if (!opt.keep) store('localStorage', 'dl-lang', l);
    syncSwitches();
    startSession();   // 새 언어의 섹터로 새 타이밍 (시간 · 색 초기화)
    if (opt.target) {
      jumpTo(function () { opt.target.scrollIntoView({ block: 'start' }); });   // scroll-padding 이 휠 아래로 맞춤
    } else if (spot) {
      if (!navLine) measureNav();
      var y = w.scrollY, bb = bodyBox(y), r = secSpan(spot.s, y, bb.top, bb.bottom);
      // 섹터 첫머리(비율 0)면 소제목이 기준선을 1px 넘게 — 반올림으로 앞 섹터에 남지 않게. 그 밖에는 비율 그대로
      to = r ? r[0] + Math.max(1, spot.f * (r[1] - r[0])) - navLine : bb.top - (navLine - 70);
    }
    if (!opt.target && to != null) jumpTo(function () { w.scrollTo(0, Math.max(0, Math.round(to))); });
    swap = opt.target ? null : { lang: l, y: w.scrollY, back: y0, vw: w.innerWidth };
    if (!reduce && !opt.target) [body].concat(navsOf(l)).forEach(function (el) { restartAnim(el, 'is-swapped', 420); });
    // 건너뛴 것으로 칩니다: 도착한 구간은 그 자리부터 (첫머리 근처면 곧바로 인정 — cover)
    jumping = false;
    landed = true;
    dropMap();
    if (tm) tm.at = tm.to = finished ? 1 : readProgress();   // 트랙 맵의 차는 새 자리에서 (출발선부터 달려오지 않게)
    fitRail();
    onScroll();
  }
  langSwitches.forEach(function (sw) {
    sw.addEventListener('click', function () { setLang(lang === 'en' ? 'ko' : 'en'); });
    sw.addEventListener('keydown', function (e) {
      var to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 'en' : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? 'ko' : null;
      if (!to) return;
      e.preventDefault();   // 화면 대신 스위치가 움직임
      setLang(to);
    });
  });
  // 숨은 언어의 소제목을 가리키는 주소(#en-sol 을 한국어로, #sol 을 영어로 읽는 중)로 오면 그 언어로 보여 주고 그 자리로.
  // 링크를 따라온 것이라 고른 언어(dl-lang)는 바꾸지 않습니다
  function followHash() {
    if (!enBlock || location.hash.length < 2) return;
    var id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
    var t = d.getElementById(id);
    if (!t || t === enBlock || !body.contains(t)) return;
    var want = enBlock.contains(t) ? 'en' : 'ko';
    if (want !== lang) setLang(want, { target: t, keep: true });
  }
  followHash();
  w.addEventListener('hashchange', followHash);
  // 뒤로 · 앞으로: 앵커 링크를 누르는 순간 떠나는 기록에 그때의 언어 · 자리를 적어 두고(history.state — 아래 클릭 처리),
  // 그 기록으로 돌아오면 그 언어 그 자리로. 한국어 본문에서 영어 앵커로 건너갔다가 뒤로 가기를 누르면 한국어의 그 링크 자리로 돌아옵니다
  // (popstate 는 브라우저가 스크롤을 되돌리기 전에 오므로 레이아웃을 먼저 바꿔 두고, 같은 자리를 직접 한 번 더 맞춤)
  w.addEventListener('popstate', function (e) {
    var s = e.state;
    if (enBlock && s && (s.dlLang === 'ko' || s.dlLang === 'en') && s.dlLang !== lang) setLang(s.dlLang, { keep: true, y: +s.dlY || 0 });
  });
  if (enBlock) d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    try {
      var st = history.state && typeof history.state === 'object' ? history.state : {};
      history.replaceState(Object.assign({}, st, { dlLang: lang, dlY: w.scrollY }), '');
    } catch (err) {}
  });
  syncSwitches();

  /* ---------- scroll loop ----------
     스크롤 리스너는 이것 하나(passive). 속도계만 이벤트마다 재고, 나머지(시프트 라이트 · 기어 · 섹터 ·
     컴팩트 휠 · 호버 FX 갱신)는 rAF 한 번에 몰아서 합니다 — 여러 리스너가 한 프레임에 레이아웃을 번갈아 읽고 쓰지 않게. */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      updateDash();
      onScrollBase();
      if (fxRefresh) fxRefresh();
    });
  }
  w.addEventListener('scroll', function () { trackSpeed(); if (jumping) armJump(180); onScroll(); }, { passive: true });
  var refitT = 0;
  w.addEventListener('resize', function () {
    navLine = 0; bounds = null; railTopPx = 0;
    if (tm) { dropMap(); tm.u = 0; ensureMap(); }
    onScroll();
    moveIndicator(activeBtn);
    if (!refitT) refitT = requestAnimationFrame(function () { refitT = 0; fitRail(); });
  }, { passive: true });
  // 본문 높이가 바뀌면(이미지 · 글꼴 · 수식 로딩, 접이식 영역 열기) 구간 경계(섹터 · 트랙 맵)를 다시 잽니다
  if (body) {
    var remap = function () { bounds = null; dropMap(); onScroll(); };
    if ('ResizeObserver' in w) new ResizeObserver(remap).observe(body);
    w.addEventListener('load', function () { remap(); fitRail(); });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(fitRail);
  }
  fitRail();
  onScrollBase();
  updateDash();
  // 트랙 맵의 서킷은 첫 그림이 끝난 뒤 한가할 때 고릅니다 (맵이 보일 때만 — ensureMap)
  if (tm) (w.requestIdleCallback || function (f) { return setTimeout(f, 120); })(ensureMap, { timeout: 600 });
})();
