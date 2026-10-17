/*
 * MacReader — CLI 모드에서 글을 클래식 Macintosh(System 7) 창으로 보여주는 뷰어.
 * 창 크롬: system.css (MIT, © Sakun Acharige)
 * 목차 진행 마커: Hakim El Hattab 의 "Progress Nav" 아이디어를 응용.
 * 수식은 빌드 때 KaTeX HTML 로 렌더링되어 오므로 여기서는 CSS 만 불러옵니다.
 */
window.MacReader = (function () {
  'use strict';

  var KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';
  var state = null;   // { overlay, contents, paper, toc, path, term, onClose, cleanup[], redraw }
  var fontScale = 1;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SMOOTH = reduceMotion ? 'auto' : 'smooth';

  /* ---------------- utils ---------------- */
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  // 새로 붙인 경우 그 <link> 를 돌려줌 (불러오기가 끝나면 수식 높이가 바뀌므로 위치를 다시 맞추는 데 씀)
  function ensureKatexCss(node) {
    if (!node.querySelector('.katex') || document.querySelector('link[data-katex]')) return null;
    return document.head.appendChild(el('link', { rel: 'stylesheet', href: KATEX_CSS, 'data-katex': '' }));
  }

  function legacyCopy(txt) {
    var ta = el('textarea', { style: 'position:fixed;opacity:0;top:0;left:0', readonly: '' });
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return Promise.resolve();
  }
  function copyText(txt) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(txt).catch(function () { return legacyCopy(txt); });
    }
    return legacyCopy(txt);
  }

  function clock() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  /* ---------------- 목차 ---------------- */
  // 제목 글자: 수식이 든 제목은 빌드 때 달아 둔 평문 라벨(data-label, 예: '복잡도 O(n²) 분석')을 그대로 씁니다.
  // 라벨이 없으면 — KaTeX 는 MathML·TeX 주석·HTML 세 벌이 들어 있어 textContent 가 세 번 겹치므로 TeX 원문 하나로 바꿉니다
  function headingText(h) {
    if (h.getAttribute('data-label')) return h.getAttribute('data-label');
    var c = h.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.heading-anchor'), function (n) { n.remove(); });
    [].forEach.call(c.querySelectorAll('.katex'), function (k) {
      var a = k.querySelector('annotation');
      k.replaceWith(a ? a.textContent : k.textContent);
    });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  function buildToc(paper) {
    // 접힌 영역(영어 번역본 등)의 제목은 목차에서 뺍니다
    var heads = [].slice.call(paper.querySelectorAll('h2, h3')).filter(function (h) { return !h.closest('details'); });
    var root = el('ul');
    var currentSub = null;
    var items = [];
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'mac-h-' + i;
      var a = el('a', { href: '#' + h.id, text: headingText(h) || 'Untitled' });
      var li = el('li', null, [a]);
      var item = { heading: h, li: li, a: a, level: h.tagName === 'H2' ? 2 : 3 };
      if (item.level === 2 || !currentSub) {
        root.appendChild(li);
        if (item.level === 2) {
          currentSub = el('ul');
          li.appendChild(currentSub);
          item.subList = currentSub;
        }
      } else {
        currentSub.appendChild(li);
      }
      items.push(item);
    });
    items.forEach(function (it) { if (it.subList && !it.subList.children.length) it.subList.remove(); });
    return { list: root, items: items };
  }

  function TocSync(toc, contents, items) {
    var svg = toc.querySelector('.toc-marker');
    var path = svg.querySelector('path');
    var pathLength = 0, lastKey = '';
    var raf = 0;

    function draw() {
      var tocRect = toc.getBoundingClientRect();
      var d = [], indent = null;
      svg.setAttribute('height', toc.scrollHeight);
      items.forEach(function (it, i) {
        // x 는 transform 영향을 받지 않는 li 기준 (활성 항목이 5px 밀려도 선이 흔들리지 않게)
        var lr = it.li.getBoundingClientRect();
        var r = it.a.getBoundingClientRect();
        var x = lr.left - tocRect.left - 6;
        var y = r.top - tocRect.top + toc.scrollTop;
        var h = r.height;
        if (i === 0) { d.push('M', x, y, 'L', x, y + h); it.pathStart = 0; }
        else {
          if (indent !== x) d.push('L', indent, y);
          d.push('L', x, y);
          path.setAttribute('d', d.join(' '));
          it.pathStart = path.getTotalLength();
          d.push('L', x, y + h);
        }
        indent = x;
        path.setAttribute('d', d.join(' '));
        it.pathEnd = path.getTotalLength();
      });
      pathLength = path.getTotalLength();
      lastKey = '';
      sync();
    }

    // 섹션 = [제목, 다음 제목) 구간. 화면에 걸친 섹션 전부를 강조합니다.
    function sync() {
      raf = 0;
      if (!items.length) return;
      var cTop = contents.getBoundingClientRect().top;
      var viewTop = contents.clientHeight * 0.08;
      var viewBottom = contents.clientHeight * 0.85;
      var tops = items.map(function (it) { return it.heading.getBoundingClientRect().top - cTop; });
      var end = contents.scrollHeight - contents.scrollTop;
      var start = Infinity, stop = 0, active = -1;
      items.forEach(function (it, i) {
        var top = tops[i];
        var bottom = i + 1 < items.length ? tops[i + 1] : end;
        var visible = bottom > viewTop && top < viewBottom;
        it.li.classList.toggle('visible', visible);
        if (visible) {
          start = Math.min(start, it.pathStart);
          stop = Math.max(stop, it.pathEnd);
        }
        if (top <= viewBottom * 0.4 + viewTop) active = i;
      });
      items.forEach(function (it, i) { it.li.classList.toggle('active', i === active); });
      var key = start + ':' + stop;
      if (stop > start) {
        if (key !== lastKey) {
          path.setAttribute('stroke-dashoffset', '1');
          path.setAttribute('stroke-dasharray', '1, ' + start + ', ' + (stop - start) + ', ' + pathLength);
          path.setAttribute('opacity', 1);
        }
      } else {
        path.setAttribute('opacity', 0);
      }
      lastKey = key;
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(sync); }
    function redraw() { requestAnimationFrame(draw); }

    contents.addEventListener('scroll', schedule, { passive: true });
    toc.addEventListener('scroll', schedule, { passive: true });
    var ro = window.ResizeObserver ? new ResizeObserver(redraw) : null;
    if (ro) { ro.observe(toc); ro.observe(contents); }
    else window.addEventListener('resize', redraw);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
    draw();

    return {
      redraw: redraw,
      destroy: function () {
        contents.removeEventListener('scroll', schedule);
        toc.removeEventListener('scroll', schedule);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', redraw);
        if (raf) cancelAnimationFrame(raf);
      }
    };
  }

  /* ---------------- 열기 / 닫기 ---------------- */
  // 글 본문은 CLI 페이지(/) 안으로 옮겨지므로, 상대 주소(raw <img>, figure 링크, ?쿼리 등)를
  // 옮기기 전에 글 자신의 주소 기준 절대 주소로 바꿔 둡니다. (#앵커는 창 안 스크롤용으로 그대로 둠)
  function absolutize(body, base) {
    function abs(u) { try { return new URL(u, base).href; } catch (e) { return u; } }
    [].forEach.call(body.querySelectorAll('[src]'), function (n) { n.setAttribute('src', abs(n.getAttribute('src'))); });
    [].forEach.call(body.querySelectorAll('video[poster]'), function (n) { n.setAttribute('poster', abs(n.getAttribute('poster'))); });
    [].forEach.call(body.querySelectorAll('[srcset]'), function (n) {
      n.setAttribute('srcset', n.getAttribute('srcset').split(',').map(function (part) {
        var bits = part.trim().split(/\s+/);
        if (bits[0]) bits[0] = abs(bits[0]);
        return bits.join(' ');
      }).join(', '));
    });
    [].forEach.call(body.querySelectorAll('a[href], area[href]'), function (n) {
      var h = n.getAttribute('href');
      if (h.charAt(0) !== '#') n.setAttribute('href', abs(h));
    });
  }

  // 반복 영상(GRID서당 시범 애니메이션 — common/video-loops.html 이 감싼 [data-vloop]): GUI 와 같은 규칙.
  // 창 안에서 4분의 1 이상 보일 때만 재생(그때 처음 받음), 움직임 줄이기 설정이면 포스터 + 버튼만, 직접 멈춘 영상은 멈춘 채로.
  // 돌려줌: 창을 닫을 때 부를 정리 함수
  function loopVideos(root) {
    var boxes = [].slice.call(root.querySelectorAll('[data-vloop]'));
    if (!boxes.length) return function () {};
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function label(it) { if (it.btn) it.btn.setAttribute('aria-label', it.held ? '영상 재생' : '영상 일시정지'); }
    function sync(it) {
      it.box.classList.toggle('is-held', it.held);
      if (it.seen && !it.held && !document.hidden) {
        var pr = it.v.play();
        if (pr && pr.catch) pr.catch(function () { if (!it.v.paused) return; it.held = true; it.box.classList.add('is-held'); label(it); });
      } else if (!it.v.paused) it.v.pause();
      label(it);
    }
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var it = en.target._vloop;
        if (!it) return;
        it.seen = en.isIntersecting && en.intersectionRatio >= 0.25;
        sync(it);
      });
    }, { threshold: [0, 0.25, 0.6] }) : null;
    var items = boxes.map(function (box) {
      var v = box.querySelector('video');
      if (!v) return null;
      var it = { box: box, v: v, btn: box.querySelector('[data-vloop-btn]'), held: !!reduce, seen: !io };
      v.muted = true;
      v.playsInline = true;
      v.addEventListener('playing', function () { box.classList.add('is-playing'); });
      v.addEventListener('pause', function () { box.classList.remove('is-playing'); });
      if (it.btn) {
        // 스크립트가 없는 GUI 를 위해 붙여 둔 기본 컨트롤은 지우고 System 7 식 버튼으로
        v.controls = false;
        v.removeAttribute('controls');
        it.btn.hidden = false;
        it.btn.addEventListener('click', function () { it.held = !it.held; sync(it); });
      }
      // 영상 자체를 눌러도 재생 · 일시정지 (멈춰 있으면 가운데에 재생 표시, mac-reader.css)
      v.addEventListener('click', function () { it.held = !it.held; sync(it); });
      box._vloop = it;
      if (io) io.observe(box); else sync(it);
      return it;
    }).filter(Boolean);
    function onVis() { items.forEach(sync); }
    document.addEventListener('visibilitychange', onVis);
    return function () {
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      items.forEach(function (it) { it.v.pause(); });
    };
  }

  function extract(html, url) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var body = doc.querySelector('[data-post-body]') || doc.querySelector('article') || doc.querySelector('main') || doc.body;
    var post = doc.querySelector('[data-post]');
    var titleEl = doc.querySelector('[data-post-title]') || doc.querySelector('h1');
    [].forEach.call(body.querySelectorAll('script, style, .heading-anchor'), function (n) { n.remove(); });
    if (url) absolutize(body, new URL(url, location.href).href);
    return {
      body: body,
      title: titleEl ? titleEl.textContent.trim() : '',
      date: post ? post.getAttribute('data-date') : '',
      tags: post && post.getAttribute('data-tags') ? post.getAttribute('data-tags').split(',').filter(Boolean) : [],
      words: post ? post.getAttribute('data-words') : '',
      minutes: post ? post.getAttribute('data-reading-time') : ''
    };
  }

  // 메뉴: 버튼 + 펼침 목록 (system.css 의 [data-role=menu-*] 스타일 사용)
  // 열림 상태는 클릭(탭)으로 직접 관리합니다. Safari·macOS Firefox 는 버튼을 눌러도 포커스를 주지 않아
  // system.css 의 :focus-within 펼침에 기대면 메뉴가 아예 열리지 않습니다.
  var menuSeq = 0;
  function menu(label, entries, menubar, refocus) {
    var listId = 'mac-menu-' + (++menuSeq);
    var list = el('ul', { 'data-role': 'menu', id: listId });
    var btn = el('button', { type: 'button', class: 'mac-menu__btn', 'aria-expanded': 'false', 'aria-controls': listId }, [label]);
    entries.forEach(function (e) {
      if (e === '-') { list.appendChild(el('li', { 'data-role': 'menu-item', class: 'divider', 'aria-hidden': 'true' })); return; }
      var ctl = e.href
        ? el('a', { href: e.href }, [e.label])
        : el('button', { type: 'button' }, [e.label]);
      if (e.key) ctl.appendChild(el('span', { class: 'mac-menu-key', 'aria-hidden': 'true', text: e.key }));
      ctl.addEventListener('click', function (ev) {
        closeMenus(menubar);
        if (!e.action) return;   // 링크(Open in GUI)는 브라우저 기본 동작
        ev.preventDefault();
        e.action();
        refocus();
      });
      list.appendChild(el('li', { 'data-role': 'menu-item' }, [ctl]));
    });
    var item = el('li', { 'data-role': 'menu-item', class: 'mac-menu' }, [btn, list]);
    function entriesOf() { return [].slice.call(list.querySelectorAll('a, button')); }

    btn.addEventListener('click', function (ev) {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      closeMenus(menubar);
      if (open) setMenu(item, true);
      // 마우스·탭으로 제목을 다시 눌러 닫았으면 본문으로 포커스를 돌려 j/k 가 바로 동작하게 합니다
      // (Enter·Space 로 닫았을 때는 detail 이 0 이므로 키보드 사용자는 제목에 그대로 머뭅니다)
      else if (ev.detail > 0) refocus();
    });
    // 메뉴가 하나 열려 있으면 다른 메뉴 제목 위로 옮겨 가기만 해도 바뀝니다 (클래식 Mac 메뉴 추적)
    item.addEventListener('pointerenter', function (ev) {
      if (ev.pointerType !== 'mouse' || item.classList.contains('is-open') || !menubar.querySelector('.mac-menu.is-open')) return;
      closeMenus(menubar);
      setMenu(item, true);
    });
    // 항목을 누르는 순간 포커스가 빠져 목록이 닫히지 않도록
    list.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    // 키보드: ↓ 로 열고 첫 항목, 목록 안에서 ↑/↓ 이동
    btn.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown') return;
      ev.preventDefault();
      closeMenus(menubar);
      setMenu(item, true);
      entriesOf()[0].focus();
    });
    list.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      ev.preventDefault();
      var all = entriesOf(), i = all.indexOf(document.activeElement);
      var next = all[(i + (ev.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length];
      if (next) next.focus();
    });
    // Tab 으로 메뉴 밖으로 나가면 닫기
    item.addEventListener('focusout', function (ev) {
      if (ev.relatedTarget && !item.contains(ev.relatedTarget)) setMenu(item, false);
    });
    return item;
  }

  function setMenu(item, open) {
    item.classList.toggle('is-open', open);
    item.querySelector('.mac-menu__btn').setAttribute('aria-expanded', String(open));
  }
  function closeMenus(menubar) {
    [].forEach.call(menubar.querySelectorAll('.mac-menu.is-open'), function (m) { setMenu(m, false); });
  }

  // 애니메이션 없이 바로 이동 (.contents 의 CSS scroll-behavior:smooth 를 잠깐 끔.
  // behavior:'instant' 는 오래된 Safari 에서 예외가 나므로 쓰지 않습니다)
  function scrollInstant(contents, top) {
    var prev = contents.style.scrollBehavior;
    contents.style.scrollBehavior = 'auto';
    contents.scrollTop = top;
    contents.style.scrollBehavior = prev;
  }

  // id 는 날것('서브-섹션')일 수도, 퍼센트 인코딩('%ec%84%9c…', 본문 링크의 href)일 수도 있습니다
  function scrollToTarget(contents, paper, id, instant) {
    if (!id) return false;
    var dec = id;
    try { dec = decodeURIComponent(id); } catch (e) {}
    var target = paper.querySelector('#' + CSS.escape(dec)) || paper.querySelector('#' + CSS.escape(id));
    if (!target) return false;
    // 접힌 영역(English version 등) 안의 제목이면 펼친 뒤 이동 (브라우저의 #앵커 이동과 같게)
    for (var d = target.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    var top = target.getBoundingClientRect().top - contents.getBoundingClientRect().top + contents.scrollTop - 12;
    if (instant) scrollInstant(contents, top);
    else contents.scrollTo({ top: top, behavior: SMOOTH });
    return true;
  }

  function open(opts) {
    close({ silent: true });
    var data = extract(opts.html, opts.url);
    var term = opts.term || null;
    var cleanup = [];
    var words = opts.words || data.words;

    var paper = el('div', { class: 'paper' });
    var header = el('header', { class: 'paper-head' }, [
      el('h1', { class: 'paper-title', text: data.title || opts.path })
    ]);
    var metaBits = [];
    if (data.date) metaBits.push(data.date);
    if (data.minutes) metaBits.push(data.minutes + ' min read');
    if (metaBits.length) header.appendChild(el('p', { class: 'paper-meta', text: metaBits.join('  ·  ') }));
    if (data.tags.length) {
      header.appendChild(el('p', { class: 'paper-tags' }, data.tags.map(function (t) { return el('span', { text: '#' + t }); })));
    }
    paper.appendChild(header);
    paper.appendChild(el('hr'));
    while (data.body.firstChild) paper.appendChild(document.adoptNode(data.body.firstChild));

    var tocData = buildToc(paper);
    var toc = el('nav', { class: 'toc', 'aria-label': '목차' });
    if (tocData.items.length) {
      toc.appendChild(el('p', { class: 'toc-title', text: 'Contents' }));
      toc.appendChild(tocData.list);
    } else {
      toc.appendChild(el('p', { class: 'toc-empty', text: '(목차 없음)' }));
    }
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'toc-marker');
    svg.setAttribute('aria-hidden', 'true');
    var pth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pth.setAttribute('fill', 'transparent');
    pth.setAttribute('stroke-linecap', 'square');
    pth.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(pth);
    toc.appendChild(svg);

    var contents = el('article', { class: 'contents', tabindex: '-1', 'aria-label': data.title || opts.path }, [paper]);
    function refocus() { if (state) contents.focus({ preventScroll: true }); }

    var closeBtn = el('button', { type: 'button', class: 'close', 'aria-label': '창 닫기 (Esc)' });
    var zoomBtn = el('button', { type: 'button', class: 'resize', 'aria-label': '창 크기 전환' });
    var title = el('div', { class: 'title', text: opts.path + '.md (Read Only)' });
    var win = el('div', { class: 'window mac-window' }, [
      el('div', { class: 'title-bar' }, [closeBtn, title, zoomBtn]),
      el('div', { class: 'details-bar' }, [
        el('span', { text: words ? words + ' words' : ' ' }),
        el('span', { text: 'Esc · q · :q 닫기   j/k 스크롤' })
      ]),
      el('div', { class: 'mac-body' }, [toc, contents])
    ]);

    var guiHref = opts.url;
    var menubar = el('ul', { 'data-role': 'menu-bar', class: 'mac-menubar', 'aria-label': '메뉴' });
    [
      el('li', { 'data-role': 'menu-item', class: 'mac-logo', 'aria-hidden': 'true' }, ['']),
      menu('File', [
        { label: 'Open in GUI', key: '↗', href: guiHref },
        { label: 'Copy Link', action: function () { copyText(new URL(guiHref, location.href).href); } },
        '-',
        { label: 'Close', key: 'Esc', action: function () { close(); } }
      ], menubar, refocus),
      menu('View', [
        { label: 'Contents', key: 'T', action: function () { toggleToc(); } },
        { label: 'Larger Text', key: '+', action: function () { zoomText(1); } },
        { label: 'Smaller Text', key: '−', action: function () { zoomText(-1); } },
        '-',
        { label: 'Zoom Window', action: function () { toggleZoom(); } }
      ], menubar, refocus),
      el('li', { 'data-role': 'menu-item', class: 'mac-clock', 'aria-hidden': 'true', text: clock() })
    ].forEach(function (n) { menubar.appendChild(n); });

    // 창(window)을 먼저, 메뉴 막대를 나중에 둬서 Tab 순서가 본문부터 시작하도록 (화면에는 CSS order 로 맨 위에 그림)
    var overlay = el('div', { class: 'mac-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': data.title || opts.path }, [win, menubar]);
    if (window.innerWidth < 900) overlay.classList.add('is-zoomed');
    if (window.innerWidth < 760 || !tocData.items.length) overlay.classList.add('toc-hidden');
    overlay.style.setProperty('--paper-scale', fontScale);

    // 터미널(body)로 이벤트가 올라가 포커스를 빼앗지 않도록 차단
    ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keypress', 'keyup', 'paste', 'wheel'].forEach(function (t) {
      overlay.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: t === 'wheel' || t.indexOf('touch') === 0 });
    });
    // 창 크롬(제목 막대, 상태 막대 등)을 눌러도 키보드 단축키가 계속 동작하도록 본문으로 포커스 유지
    overlay.addEventListener('mousedown', function (e) {
      if (!e.target.closest('a, button, input, textarea, select, [tabindex], .contents')) {
        e.preventDefault();
        refocus();
      }
    });

    // 배경(터미널, GUI 버튼)은 창이 열린 동안 inert — 포커스·스크린리더가 창 밖으로 나가지 않음
    [].forEach.call(document.body.children, function (n) {
      if (n === overlay || n.inert) return;
      n.inert = true;
      cleanup.push(function () { n.inert = false; });
    });

    document.body.appendChild(overlay);
    if (term) { try { term.disable(); } catch (e) {} }

    // 메뉴 밖을 누르면 열린 메뉴 닫기
    function onOutside(e) { if (!e.target.closest || !e.target.closest('.mac-menu')) closeMenus(menubar); }
    document.addEventListener('pointerdown', onOutside, true);
    cleanup.push(function () { document.removeEventListener('pointerdown', onOutside, true); });

    var clockTimer = setInterval(function () {
      var c = menubar.querySelector('.mac-clock');
      if (c) c.textContent = clock();
    }, 15000);
    cleanup.push(function () { clearInterval(clockTimer); });

    var sync = TocSync(toc, contents, tocData.items);
    cleanup.push(sync.destroy);
    cleanup.push(loopVideos(paper));

    // 탭·방문 기록·북마크 제목을 글 제목으로 (cli.js 가 pushState 한 뒤에 여기로 오므로 새 항목에 붙습니다)
    var prevTitle = document.title;
    document.title = (data.title || opts.path) + ' — ' + prevTitle.replace(/\s+—\s+terminal$/, '');

    state = {
      overlay: overlay, contents: contents, paper: paper, toc: toc, path: opts.path,
      term: term, onClose: opts.onClose, cleanup: cleanup, redraw: sync.redraw, colon: false,
      prevTitle: prevTitle, scrollTarget: null, nudgeAt: 0
    };

    function toggleToc() { overlay.classList.toggle('toc-hidden'); sync.redraw(); }
    function toggleZoom() { overlay.classList.toggle('is-zoomed'); sync.redraw(); }
    // 글자 크기를 바꿔도 읽던 자리(화면 맨 위 문단)가 그대로 남도록
    function zoomText(dir) {
      var next = Math.max(0.8, Math.min(1.6, Math.round((fontScale + dir * 0.1) * 10) / 10));
      if (next === fontScale) return;
      var cTop = contents.getBoundingClientRect().top;
      var anchor = null;
      for (var n = paper.firstElementChild; n; n = n.nextElementSibling) {
        if (n.getBoundingClientRect().bottom > cTop + 1) { anchor = n; break; }
      }
      var before = anchor ? anchor.getBoundingClientRect() : null;
      // 문단 안에서 얼마나 내려와 있었는지(비율)도 지켜서, 긴 문단·코드 블록 중간에서도 자리가 유지되게
      var ratio = before && before.height ? Math.max(0, Math.min(1, (cTop - before.top) / before.height)) : 0;
      fontScale = next;
      overlay.style.setProperty('--paper-scale', fontScale);
      state.scrollTarget = null;
      if (anchor) {
        var after = anchor.getBoundingClientRect();
        var keep = before.top < cTop ? cTop - ratio * after.height : before.top;
        scrollInstant(contents, contents.scrollTop + after.top - keep);
      }
      sync.redraw();
    }
    // j/k: 부드러운 스크롤이 끝나기 전에 다시 눌러도(꾹 누르기 포함) 한 번에 72px 씩 정확히 쌓이도록
    function nudge(dy) {
      var now = Date.now();
      var max = contents.scrollHeight - contents.clientHeight;
      var base = state.scrollTarget != null && now - state.nudgeAt < 450 ? state.scrollTarget : contents.scrollTop;
      state.scrollTarget = Math.max(0, Math.min(max, base + dy));
      state.nudgeAt = now;
      contents.scrollTo({ top: state.scrollTarget, behavior: SMOOTH });
    }
    function jump(top) {
      state.scrollTarget = null;
      contents.scrollTo({ top: top, behavior: SMOOTH });
    }

    closeBtn.addEventListener('click', function () { close(); });
    zoomBtn.addEventListener('click', function () { toggleZoom(); refocus(); });

    // 목차 클릭: 해시를 바꾸지 않고 창 안에서만 스크롤
    toc.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      scrollToTarget(contents, paper, a.getAttribute('href').slice(1));
      if (window.innerWidth < 760) overlay.classList.add('toc-hidden');
      refocus();
    });
    // 모바일: 목차 서랍 밖(본문)을 누르면 닫기
    contents.addEventListener('click', function () {
      if (window.innerWidth < 760 && !overlay.classList.contains('toc-hidden')) overlay.classList.add('toc-hidden');
    });

    // 본문 링크: 같은 글 안 앵커 / 다른 글(→ 이 창에서 열기) / 외부(새 탭)
    paper.addEventListener('click', function (e) {
      var copy = e.target.closest('.codeblock__copy');
      if (copy) {
        var block = copy.closest('.codeblock');
        var code = block.querySelector('pre code') || block.querySelector('pre');
        var clone = code.cloneNode(true);
        [].forEach.call(clone.querySelectorAll('.ln'), function (n) { n.remove(); });
        copyText(clone.textContent.replace(/\n$/, '')).then(function () {
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy'; }, 1400);
        });
        return;
      }
      var a = e.target.closest('a[href]');
      if (!a) return;
      var href = a.getAttribute('href');
      if (href.charAt(0) === '#') {
        e.preventDefault();
        scrollToTarget(contents, paper, href.slice(1));
        return;
      }
      // Ctrl/Cmd/Shift/Alt·가운데 클릭은 브라우저 기본 동작(새 탭·새 창)에 맡깁니다
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var url = new URL(href, location.href);
      if (url.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener'; return; }
      var m = url.pathname.match(/^\/posts\/(.+?)\/?$/);
      if (!m || !window.MacReader.onNavigate) return;
      var path = m[1];
      try { path = decodeURIComponent(path); } catch (err) {}
      if (window.MacReader.onNavigate(path, url.hash.slice(1))) e.preventDefault();
    });

    // 키보드: 창이 열려 있는 동안 문서 전체에서 받기 (포커스가 어디에 있든 Esc 로 닫힘)
    function onKey(e) {
      if (!state) return;
      var inMenu = e.target.closest && e.target.closest('[data-role=menu-bar]');
      if (inMenu && e.key !== 'Escape') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var key = e.key;
      // 한글·러시아어 등 라틴 문자가 아닌 자판에서도 j/k/q/t/g 가 동작하도록 물리 키(e.code)로 읽습니다
      if (/^Key[A-Z]$/.test(e.code || '') && !/^[\x20-\x7e]$/.test(key)) {
        key = e.shiftKey ? e.code.slice(3) : e.code.slice(3).toLowerCase();
      }
      var handled = true;
      if (key === 'Escape' && (inMenu || menubar.querySelector('.mac-menu.is-open'))) {
        // 메뉴가 열려 있으면 Esc 는 메뉴만 닫음
        closeMenus(menubar);
        refocus();
      } else if (key === 'Escape' || key === 'q') {
        close();
      } else if (key === ':') {
        state.colon = true;
        setTimeout(function () { if (state) state.colon = false; }, 1500);
      } else if (key === 'j') nudge(72);
      else if (key === 'k') nudge(-72);
      else if (key === 'g') jump(0);
      else if (key === 'G') jump(contents.scrollHeight);
      else if (key === 't' || key === 'T') toggleToc();
      else if (key === '+' || key === '=') zoomText(1);
      else if (key === '-' || key === '_') zoomText(-1);
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener('keydown', onKey, true);
    cleanup.push(function () { document.removeEventListener('keydown', onKey, true); });

    // 다른 글의 #앵커로 들어온 경우 그 제목에서 시작합니다. 수식 CSS·폰트·그림이 늦게 도착해 높이가 바뀌어도
    // 사용자가 직접 스크롤하기 전까지는 제목 위치를 다시 맞춥니다.
    var pin = null, pinUntil = 0;
    function repin() {
      if (pin && Date.now() < pinUntil && state && state.contents === contents) scrollToTarget(contents, paper, pin, true);
    }
    function unpin() { pin = null; }
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (t) {
      overlay.addEventListener(t, unpin, { capture: true, passive: true });
    });

    [].forEach.call(paper.querySelectorAll('img'), function (img) {
      if (!img.complete) img.addEventListener('load', function () { if (state) state.redraw(); repin(); }, { once: true });
    });

    var katexLink = ensureKatexCss(paper);
    if (katexLink) katexLink.addEventListener('load', repin, { once: true });
    // 웹폰트(Galmuri 등)는 창이 그려진 뒤에야 받기 시작하므로 fonts.ready 대신 loadingdone 으로 다시 맞춤
    if (document.fonts && document.fonts.addEventListener) {
      var onFonts = function () { if (state && state.contents === contents) { sync.redraw(); repin(); } };
      document.fonts.addEventListener('loadingdone', onFonts);
      cleanup.push(function () { document.fonts.removeEventListener('loadingdone', onFonts); });
    }
    refocus();
    if (opts.hash && scrollToTarget(contents, paper, opts.hash, true)) { pin = opts.hash; pinUntil = Date.now() + 10000; }
  }

  function close(opts) {
    if (!state) return;
    var s = state;
    state = null;
    s.cleanup.forEach(function (fn) { try { fn(); } catch (e) {} });
    s.overlay.remove();
    if (s.prevTitle) document.title = s.prevTitle;
    if (s.term) {
      try { s.term.enable(); s.term.focus(); } catch (e) {}
    }
    if (!(opts && opts.silent) && typeof s.onClose === 'function') s.onClose();
  }

  return {
    open: open,
    close: close,
    isOpen: function () { return !!state; },
    currentPath: function () { return state ? state.path : null; },
    // 열린 글 안에서 앵커로 스크롤 (같은 글로 가는 링크는 다시 불러오지 않고 이것만)
    scrollTo: function (id) { return state ? scrollToTarget(state.contents, state.paper, id) : false; },
    onNavigate: null
  };
})();
