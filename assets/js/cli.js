/*
 * Draktharr Lab — CLI mode
 * jQuery Terminal 위에서 /index.json 으로 만든 가상 파일시스템을 탐색하고,
 * cat 으로 글을 열면 MacReader(클래식 Mac 창)로 보여줍니다.
 * 원본: hugo-theme-terminalcv (MIT) 의 index.html 을 기반으로 재작성.
 */
(function ($) {
  'use strict';

  var CFG = window.DL_CLI || {};
  var POSTS_URL = CFG.postsURL || '/posts/';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  /* ------------------------------------------------------------------ *
   * helpers
   * ------------------------------------------------------------------ */
  function text(s) { return String(s == null ? '' : s).replace(/\r/g, ''); }
  // 터미널 포맷 문법([[...]])에서 안전하도록 대괄호를 이스케이프
  function esc(s) { return $.terminal.escape_brackets(text(s)); }
  function fmt(style, color, s) { return '[[' + (style || '') + ';' + (color || '') + ';]' + esc(s) + ']'; }
  function dim(s) { return fmt('', '#888', s); }
  var DIR = '#6ea8ff';   // 디렉터리 색 (순수 blue 는 검정 배경에서 대비 2.4:1)
  // 화면상 폭(한글 = 2칸). wcwidth 가 있으면 jQuery Terminal 내부 렌더링과 같은 계산을 씁니다.
  function strlen(s) { return typeof window.wcwidth === 'function' ? window.wcwidth(text(s)) : $.terminal.length(text(s)); }
  function pad(s, n) { var l = strlen(s); return l >= n ? s : s + new Array(n - l + 1).join(' '); }
  function storage(kind) { try { return window[kind]; } catch (e) { return null; } }
  // mode 가 없으면(null) 기록을 지웁니다 — 설치를 되돌릴 때 원래 값(없음 포함)으로 돌려놓기 위해
  function getMode() { var ls = storage('localStorage'); try { return ls ? ls.getItem('dl-mode') : null; } catch (e) { return null; } }
  function setMode(mode) {
    var ls = storage('localStorage');
    try { if (ls) { if (mode) ls.setItem('dl-mode', mode); else ls.removeItem('dl-mode'); } } catch (e) {}
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function lsDate(iso) {
    if (!iso) return '            ';
    var p = iso.split('-');
    return MONTHS[(+p[1] || 1) - 1] + ' ' + p[2] + '  ' + p[0];
  }

  /* ------------------------------------------------------------------ *
   * 가상 파일시스템
   * ------------------------------------------------------------------ */
  var FS = null;          // root node
  var POSTS = [];         // 최신순
  var TAGS = [];
  var AUTHOR = CFG.author || {};
  var fsReady = null;     // Promise

  function mkDir(name, path) {
    return { type: 'dir', name: name, path: path, title: name, description: '', count: 0, weight: 0, children: {} };
  }

  function ensureDir(path) {
    var node = FS, segs = path ? path.split('/') : [], acc = [];
    for (var i = 0; i < segs.length; i++) {
      acc.push(segs[i]);
      var child = node.children[segs[i]];
      if (!child || child.type !== 'dir') {
        child = node.children[segs[i]] = mkDir(segs[i], acc.join('/'));
      }
      node = child;
    }
    return node;
  }

  function buildFS(data) {
    FS = mkDir('~', '');
    (data.dirs || []).forEach(function (d) {
      var path = decodeURIComponent(d.path);
      var n = ensureDir(path);
      n.title = d.title || n.name;
      n.description = d.description || '';
      n.count = d.count || 0;
      n.weight = d.weight || 0;
      n.url = d.url;
    });
    POSTS = (data.posts || []).map(function (p) {
      var path = decodeURIComponent(p.path);
      var segs = path.split('/');
      var name = segs.pop();
      var post = {
        type: 'post', name: name, path: path, title: p.title, url: p.url, date: p.date,
        tags: p.tags || [], summary: p.summary || '', words: p.words || 0, readingTime: p.readingTime || 1
      };
      ensureDir(segs.join('/')).children[name] = post;
      return post;
    });
    TAGS = data.tags || [];
    if (data.author) AUTHOR = data.author;
    FS.children.about = { type: 'file', name: 'about', path: 'about' };
  }

  function loadFS() {
    if (!fsReady) {
      fsReady = $.getJSON(CFG.indexURL || '/index.json').then(function (data) {
        buildFS(data);
        return FS;
      }, function () {
        FS = mkDir('~', '');
        FS.children.about = { type: 'file', name: 'about', path: 'about' };
        return FS;
      });
    }
    return fsReady;
  }

  function sortedChildren(dir) {
    var list = Object.keys(dir.children).map(function (k) { return dir.children[k]; });
    var rank = { dir: 0, file: 1, post: 2 };
    return list.sort(function (a, b) {
      if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type];
      if (a.type === 'dir') return (a.weight - b.weight) || a.name.localeCompare(b.name);
      if (a.type === 'post') return (b.date || '').localeCompare(a.date || '');
      return a.name.localeCompare(b.name);
    });
  }

  /* ------------------------------------------------------------------ *
   * 경로
   * ------------------------------------------------------------------ */
  var cwd = [];        // ['untitled_cs', 'boj']
  var prevCwd = [];

  function cwdString(segs) {
    segs = segs || cwd;
    return '~' + (segs.length ? '/' + segs.join('/') : '');
  }

  // 인자 문자열 → 세그먼트 배열 (존재 여부는 확인하지 않음)
  function normalize(arg, base) {
    var segs;
    arg = text(arg).trim();
    if (arg === '' || arg === '~') return [];
    if (arg === '-') return prevCwd.slice();
    if (arg.charAt(0) === '~') { segs = []; arg = arg.replace(/^~\/?/, ''); }
    else if (arg.charAt(0) === '/') { segs = []; }
    else { segs = (base || cwd).slice(); }
    arg.split('/').forEach(function (part) {
      if (!part || part === '.') return;
      if (part === '..') { segs.pop(); return; }
      segs.push(part);
    });
    return segs;
  }

  function lookup(segs) {
    var node = FS;
    for (var i = 0; i < segs.length; i++) {
      if (!node || node.type !== 'dir') return null;
      node = node.children[segs[i]];
    }
    return node || null;
  }

  // 인자가 없으면 현재 디렉터리 (cd 만 예외적으로 홈으로 감)
  function resolve(arg) {
    var segs = (arg == null || text(arg).trim() === '') ? cwd.slice() : normalize(arg);
    return { segs: segs, node: lookup(segs) };
  }

  /* ------------------------------------------------------------------ *
   * 출력
   * ------------------------------------------------------------------ */
  var term = null;
  var useLessOnce = false;

  function out(lines) {
    if (!Array.isArray(lines)) lines = [lines];
    if (useLessOnce && term.less) {
      term.less(lines.join('\n'), {
        onExit: function () { term.set_command(''); term.scroll_to_bottom(); }
      });
    } else {
      lines.forEach(function (l) { term.echo(l); });
    }
  }

  function err(cmd, msg) { term.echo(fmt('', 'red', cmd + ': ' + msg)); }

  function dirLine(n) {
    var gap = new Array(Math.max(2, 18 - strlen(n.name + '/'))).join(' ');
    var count = '(' + n.count + ')';
    return fmt('b', DIR, n.name + '/') + gap + dim(pad(count, 6)) + ' ' + (n.description ? dim(n.description) : '');
  }

  function postLine(p) {
    var gap = new Array(Math.max(2, 18 - strlen(p.name))).join(' ');
    return fmt('b', 'white', p.name) + gap + dim(p.date) + '  ' + esc(p.title);
  }

  function longLine(n) {
    var isDir = n.type === 'dir';
    var perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
    var size = isDir ? 4096 : (n.type === 'post' ? n.words : 512);
    var name = isDir ? fmt('b', DIR, n.name + '/') : fmt('b', 'white', n.name);
    var extra = n.type === 'post' ? '  ' + dim(n.title) : (isDir && n.title !== n.name ? '  ' + dim(n.title) : '');
    return perms + '  1 user  user  ' + pad(String(size), 6) + ' ' + lsDate(n.date) + '  ' + name + extra;
  }

  /* ------------------------------------------------------------------ *
   * 명령어
   * ------------------------------------------------------------------ */
  var HELP = [
    ['help', '도움말 (이 목록)'],
    ['ls [-l] [path]', '카테고리/글 목록 — 예) ls untitled_cs/boj'],
    ['cd <path>', '디렉터리 이동 — cd .. / cd ~ / cd -'],
    ['cat <post>', '글을 Mac 창으로 열기 — 예) cat {post}'],
    ['tree [path]', '전체 구조를 트리로 보기'],
    ['recent [n]', '최신 글 n개 (기본 5)'],
    ['search <word>', '제목·태그·요약에서 검색 (grep, find)'],
    ['tags [tag]', '태그 목록 / 태그별 글'],
    ['pwd', '현재 위치'],
    ['history', '입력한 명령 기록'],
    ['about', '블로그 주인 소개 (whoami)'],
    ['gui [path]', '그래픽 블로그로 전환'],
    ['less <cmd>', '출력을 less 로 보기'],
    ['clear', '화면 지우기'],
    ['exit', '세션 종료']
  ];

  // 도움말·사용법 예시에 쓸 실제 글 경로 (가장 최근 글)
  function examplePost() { return POSTS.length ? POSTS[0].path : 'untitled_cs/boj/31095'; }

  function cmdHelp() {
    var w = 0;
    HELP.forEach(function (h) { w = Math.max(w, h[0].length); });
    var lines = ['', fmt('b', 'white', 'usage:'), ''];
    HELP.forEach(function (h) { lines.push('  ' + fmt('', 'orange', pad(h[0], w)) + '   ' + esc(h[1].replace('{post}', examplePost()))); });
    lines.push('', dim('  Tab: 자동완성 · ↑/↓: 히스토리 · 글 창: Esc / q / :q 로 닫기, j/k 스크롤'), '');
    out(lines);
  }

  function cmdAbout() {
    var a = AUTHOR || {};
    var lines = ['', fmt('b', 'white', 'About Me'), ''];
    lines.push('  ' + fmt('b', 'pink', a.name || CFG.title || ''));
    if (a.bio) lines.push('  ' + esc(a.bio));
    lines.push('');
    if (a.email) lines.push('  ' + pad('email', 8) + esc(a.email));
    if (a.github) lines.push('  ' + pad('github', 8) + esc(a.github));
    if (a.cv) lines.push('  ' + pad('cv', 8) + esc(new URL(a.cv, location.href).href));
    lines.push('  ' + pad('blog', 8) + esc(new URL(POSTS_URL, location.href).href), '');
    out(lines);
  }

  function parseFlags(args) {
    var flags = {}, rest = [];
    args.forEach(function (a) {
      if (/^-[a-zA-Z]+$/.test(a)) a.slice(1).split('').forEach(function (c) { flags[c] = true; });
      else rest.push(a);
    });
    return { flags: flags, rest: rest };
  }

  function cmdLs(args) {
    var p = parseFlags(args);
    var target = p.rest[0];
    var r = resolve(target);
    if (!r.node) return err('ls', '\'' + target + '\' 에 접근할 수 없습니다: 그런 파일이나 디렉터리가 없습니다');
    var long = p.flags.l, all = p.flags.a;

    if (r.node.type !== 'dir') {
      out(long ? longLine(r.node) : (r.node.type === 'post' ? postLine(r.node) : fmt('b', 'white', r.node.name)));
      return;
    }
    var items = sortedChildren(r.node);
    var lines = [];
    if (long) {
      lines.push('total ' + (items.length + (all ? 2 : 0)));
      if (all) {
        lines.push(longLine({ type: 'dir', name: '.', title: '.' }));
        lines.push(longLine({ type: 'dir', name: '..', title: '..' }));
      }
      items.forEach(function (n) { lines.push(longLine(n)); });
    } else {
      if (all) lines.push(fmt('b', DIR, './') + '  ' + fmt('b', DIR, '../'));
      items.forEach(function (n) {
        if (n.type === 'dir') lines.push(dirLine(n));
        else if (n.type === 'post') lines.push(postLine(n));
        else lines.push(fmt('b', 'white', n.name));
      });
    }
    if (!items.length) lines.push(dim('(비어 있음 — 아직 게시물이 없습니다)'));
    else if (items.some(function (n) { return n.type === 'post'; })) {
      lines.push(dim('→ cat <이름> 으로 글을 엽니다'));
    }
    out(lines);
  }

  function cmdCd(args) {
    var target = args[0];
    var segs = normalize(target);
    var node = lookup(segs);
    if (!node) return err('cd', '그런 디렉터리가 없습니다: ' + target);
    if (node.type !== 'dir') return err('cd', '디렉터리가 아닙니다: ' + target);
    prevCwd = cwd;
    cwd = segs;
  }

  function cmdTree(args) {
    var target = args[0];
    var r = resolve(target);
    if (!r.node) return err('tree', '그런 디렉터리가 없습니다: ' + target);
    if (r.node.type !== 'dir') return out(postLine(r.node));
    var lines = [fmt('b', DIR, target ? target.replace(/\/+$/, '') : cwdString())];
    var dirs = 0, files = 0;
    (function walk(dir, prefix) {
      var items = sortedChildren(dir);
      items.forEach(function (n, i) {
        var last = i === items.length - 1;
        var branch = prefix + (last ? '└── ' : '├── ');
        if (n.type === 'dir') {
          dirs++;
          lines.push(esc(branch) + fmt('b', DIR, n.name + '/') + (n.count ? ' ' + dim('(' + n.count + ')') : ''));
          walk(n, prefix + (last ? '    ' : '│   '));
        } else {
          files++;
          lines.push(esc(branch) + fmt('', 'white', n.name) + (n.type === 'post' ? '  ' + dim(n.title) : ''));
        }
      });
    })(r.node, '');
    lines.push('', dim(dirs + ' directories, ' + files + ' files'));
    out(lines);
  }

  function findPostByName(name) {
    return POSTS.filter(function (p) { return p.name === name || p.path === name; });
  }

  function cmdCat(cmd, args) {
    if (!args.length) return err(cmd, '사용법: ' + cmd + ' <글 경로>   예) ' + cmd + ' ' + examplePost());
    var target = args.join(' ');
    var r = resolve(target);
    if (!r.node) {
      var guess = findPostByName(target.replace(/^.*\//, ''));
      err(cmd, target + ': 그런 파일이 없습니다');
      if (guess.length) term.echo(dim('혹시 이 글인가요? ') + guess.map(function (p) { return fmt('', 'orange', '~/' + p.path); }).join(dim(', ')));
      return;
    }
    if (r.node.type === 'dir') return err(cmd, target + ': 디렉터리입니다  (ls ' + target + ' 로 목록을 보세요)');
    if (r.node.type === 'file') return cmdAbout();
    openPost(r.node.path, true);
  }

  function cmdRecent(args) {
    var n = Math.max(1, Math.min(50, parseInt(args[0], 10) || 5));
    var list = POSTS.slice(0, n);
    if (!list.length) return out(dim('아직 게시물이 없습니다.'));
    var lines = ['', fmt('b', 'white', 'Recent posts'), ''];
    list.forEach(function (p) {
      lines.push('  ' + dim(p.date) + '  ' + esc(p.title));
      lines.push('              ' + fmt('', 'orange', 'cat ~/' + p.path));
    });
    lines.push('');
    out(lines);
  }

  function cmdSearch(cmd, args) {
    var q = args.join(' ').trim().toLowerCase();
    if (!q) return err(cmd, '검색어를 입력하세요   예) ' + cmd + ' dp');
    var hits = POSTS.filter(function (p) {
      return [p.title, p.path, p.summary, p.tags.join(' ')].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    if (!hits.length) return out(dim('"' + q + '" 에 대한 결과가 없습니다.'));
    var lines = [''];
    hits.forEach(function (p) {
      lines.push('  ' + fmt('b', 'white', p.title) + '  ' + dim(p.date));
      lines.push('    ' + fmt('', 'orange', 'cat ~/' + p.path) + (p.tags.length ? '  ' + dim('#' + p.tags.join(' #')) : ''));
    });
    lines.push('', dim(hits.length + '개의 글'));
    out(lines);
  }

  function cmdTags(args) {
    if (!args.length) {
      if (!TAGS.length) return out(dim('태그가 없습니다.'));
      var w = 0;
      TAGS.forEach(function (t) { w = Math.max(w, strlen(t.name)); });
      var lines = [''];
      TAGS.forEach(function (t) { lines.push('  ' + fmt('', 'orange', '#' + pad(t.name, w)) + '  ' + dim(t.count + '')); });
      lines.push('', dim('→ tags <태그> 로 해당 글 보기'));
      return out(lines);
    }
    var tag = args.join(' ').replace(/^#/, '').toLowerCase();
    var hits = POSTS.filter(function (p) { return p.tags.some(function (t) { return t.toLowerCase() === tag; }); });
    if (!hits.length) return out(dim('#' + tag + ' 태그가 붙은 글이 없습니다.'));
    out(hits.map(function (p) { return '  ' + dim(p.date) + '  ' + esc(p.title) + '  ' + fmt('', 'orange', '~/' + p.path); }));
  }

  function goGUI(name, args) {
    var segs = args && args.length ? normalize(args[0]) : cwd;
    var node = lookup(segs);
    if (args && args.length && !node) return err(name, '그런 경로가 없습니다: ' + args[0]);
    var url = POSTS_URL;
    if (node && node.type === 'file') url = CFG.aboutURL || '/about/';
    else if (node && node.type === 'post') url = node.url;
    else if (node && node.type === 'dir' && segs.length) url = node.url || POSTS_URL + segs.join('/') + '/';
    // (글 창의 File › Open in GUI 는 창을 닫고 'gui <그 글>' 을 쳐서 여기로 옵니다 — 아래 readerToGUI)
    // 약속(Promise)을 돌려주면 jQuery Terminal 이 그동안 입력을 멈추고, 풀리면(Ctrl+C) 프롬프트를 다시 띄웁니다
    return pipInstall(url);
  }

  /* ------------------------------------------------------------------ *
   * gui — pip install 처럼 GUI 를 받아 두고 넘어가기
   * 막대가 차는 동안 갈 페이지의 HTML 과 그 페이지가 쓰는 CSS·JS·데이터를 실제로 받아 브라우저 캐시에 넣고
   * (크기 · 속도 · eta 는 받은 바이트로 잰 실제 값), 설치(Installing) 단계에서 그 페이지 글자에 필요한 글꼴을 데워 둡니다.
   * 아무 키나 누르거나 누르면(클릭·탭) 바로 넘어가고, Ctrl+C 는 pip 처럼 취소하고 터미널에 남습니다.
   * ------------------------------------------------------------------ */
  var PIP = CFG.pip || {};
  var PIP_SIZES = {};   // 빌드 때 아는 자산 크기 (layouts/index.html): 경로 → 바이트
  (PIP.assets || []).forEach(function (a) { if (a && a.url) PIP_SIZES[a.url] = +a.bytes || 0; });
  var PKG = String(CFG.title || 'blog').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-gui';
  var PKG_VER = PIP.version || '0.1';
  var WHEEL = PKG.replace(/-/g, '_') + '-' + PKG_VER + '-py3-none-any.whl';
  // pip(rich) 의 색 배치를 사이트 색으로: 막대 = 레드불 빨강 → 끝나면 초록, 크기 초록, 속도 빨강, eta 파랑
  var PC = { bar: '#db0a40', done: '#2bd67b', back: '#3a3a3a', size: '#2bd67b', speed: '#ff4062', eta: DIR, warn: '#ffd12e', error: 'red' };
  var PIP_MIN_FILL = reduceMotion ? 0 : 1000;     // 빠른 연결에서도 막대가 차는 모습이 보이는 최소 시간
  var PIP_TIMEOUT = 15000;                        // pip 의 기본 --timeout: 15초 동안 한 바이트도 오지 않으면 기다리지 않고 이동
  var install = null;

  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function later(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rep(c, n) { return n > 0 ? new Array(n + 1).join(c) : ''; }
  function padStart(s, n) { s = String(s); return s.length >= n ? s : rep(' ', n - s.length) + s; }

  // 단위 · 자릿수는 rich(pip 의 진행 막대)와 같게: 1000 단위, 소수 한 자리
  var UNITS = ['bytes', 'kB', 'MB', 'GB'];
  function unitOf(n) { var i = 0; while (i < UNITS.length - 1 && n >= Math.pow(1000, i + 1)) i++; return i; }
  function inUnit(n, i) { return i ? (n / Math.pow(1000, i)).toFixed(1) : String(Math.round(n)); }
  function sizeText(n) { var i = unitOf(n); return inUnit(n, i) + ' ' + UNITS[i]; }
  // " 12.0/314.0 kB" — 받은 양을 전체 크기와 같은 폭으로 맞춰 숫자가 흔들리지 않게
  function dlText(got, total) {
    var i = unitOf(total), t = inUnit(total, i);
    return padStart(inUnit(Math.min(got, total), i), t.length) + '/' + t + ' ' + UNITS[i];
  }
  function speedText(bps) {
    if (!(bps > 0)) return '?';
    var i = Math.max(1, unitOf(bps));
    return (bps / Math.pow(1000, i)).toFixed(1) + ' ' + UNITS[i] + '/s';
  }
  function etaText(sec) {
    if (sec == null || !isFinite(sec)) return '-:--:--';
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60) % 60, s = sec % 60;
    return Math.floor(sec / 3600) + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // rich 의 막대: 반 칸 단위로 차고, 끝은 ╸, 채워지지 않은 쪽은 ╺ 로 시작
  function barText(w, frac, finished) {
    var halves = Math.floor(w * 2 * Math.max(0, Math.min(1, frac)));
    var full = halves >> 1, half = halves & 1, rest = w - full - half;
    var col = finished ? PC.done : PC.bar, s = '';
    if (full) s += fmt('b', col, rep('━', full));
    if (half) s += fmt('b', col, '╸');
    if (rest) s += fmt('b', PC.back, !half && full ? '╺' + rep('━', rest - 1) : rep('━', rest));
    return s;
  }

  // 진행 줄. 화면 폭(칸)에 맞춰 막대 길이를 정하고(최대 40칸, pip 과 같음), 좁으면 eta → 속도 순으로 뺍니다.
  // 막대 길이는 속도 칸을 가장 넓은 경우(10칸)로 잡아 계산하므로 숫자가 바뀌어도 줄이 흔들리지 않습니다.
  function progressLine(st) {
    var cols = term ? term.cols() : 80;
    var dl = dlText(st.shown, st.total);
    var sp = speedText(st.speed);
    // 속도 칸은 흔한 'xx.x MB/s'(9칸) 폭에서 시작해 넓어지기만 합니다 (늘거나 줄며 eta 가 밀리지 않게)
    st.spW = Math.max(st.spW || 9, sp.length);
    var eta = etaText(st.eta);
    var ind = 5, fixed = ind + 1 + dl.length;
    var w = Math.min(40, cols - 1 - (fixed + 1 + 10 + 5 + eta.length)), parts = 3;
    if (w < 20) { parts = 2; w = Math.min(40, cols - 1 - (fixed + 1 + 10)); }
    if (w < 16) { parts = 1; w = Math.max(8, Math.min(40, cols - 1 - fixed)); }
    var s = rep(' ', ind) + barText(w, st.total ? st.shown / st.total : 1, st.finished) + ' ' + fmt('', PC.size, dl);
    if (parts > 1) s += ' ' + fmt('', PC.speed, padStart(sp, st.spW));
    if (parts > 2) s += ' eta ' + fmt('', PC.eta, eta);
    return s;
  }

  // 두 칸 들여 쓴 한 줄. 화면이 좁으면(휴대폰) 낱말 사이에서 끊고 이어지는 줄은 네 칸 들여 씁니다 —
  // 크기 '(320.1 kB)' 만 맨 앞 칸에 홀로 떨어지지 않게. 함수 줄로 찍으므로 화면 폭이 바뀌면 다시 맞춰집니다.
  function hangingLine(words, cols) {
    var lines = [], cur = '  ' + words[0];
    for (var i = 1; i < words.length; i++) {
      if (strlen(cur) + 1 + strlen(words[i]) <= cols) cur += ' ' + words[i];
      else { lines.push(cur); cur = '    ' + words[i]; }
    }
    lines.push(cur);
    return lines.map(esc).join('\n');
  }

  // 응답을 조각마다 세어 st.got 에 더합니다 (막대의 실제 진행). 내용이 필요하면(text) 글자로 모아 둡니다.
  // onHead: 응답 머리가 오면 크기를 알려 줌 — 압축하지 않은 응답(이미지 등)만 Content-Length 가 실제 크기라서 그때만, 아니면 null
  function grab(st, url, wantText, onHead) {
    return fetch(url, { credentials: 'same-origin', signal: st.ctl ? st.ctl.signal : undefined }).then(function (res) {
      if (!res.ok) { var e = new Error('HTTP error ' + res.status); e.status = res.status; e.url = url; throw e; }
      if (onHead) onHead(res.headers.get('content-encoding') ? null : +res.headers.get('content-length') || null);
      var n = 0, text = '', dec = wantText && window.TextDecoder ? new TextDecoder() : null;
      function seen(chunk) {
        n += chunk.byteLength;
        st.got += chunk.byteLength;
        st.lastByte = now();
        if (dec) text += dec.decode(chunk, { stream: true });
      }
      function done() { if (dec) text += dec.decode(); return { url: res.url || url, bytes: n, text: text }; }
      if (!res.body || !res.body.getReader) {
        return res.arrayBuffer().then(function (buf) { seen(new Uint8Array(buf)); return done(); });
      }
      var reader = res.body.getReader();
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) return done();
          seen(r.value);
          return pump();
        });
      })();
    });
  }

  // 갈 페이지가 첫 그림에 쓰는 같은 사이트 자산: 스타일시트 · 스크립트 · 미리 받기, 그리고 페이지가 먼저 받으라고
  // 표시해 둔 이미지(fetchpriority=high — 글의 대표 이미지). 아이콘 · 나중에 받는(lazy) 이미지는 빼고.
  function pageAssets(doc, base) {
    var seen = {}, list = [];
    $(doc).find('link[href], script[src], img[fetchpriority="high"][src]').each(function () {
      var el = this, rel = ' ' + (el.getAttribute('rel') || '').toLowerCase() + ' ';
      var as = (el.getAttribute('as') || '').toLowerCase();
      var isCSS = rel.indexOf(' stylesheet ') !== -1;
      var ok = el.tagName === 'SCRIPT' || el.tagName === 'IMG' || isCSS || rel.indexOf(' modulepreload ') !== -1 ||
        (rel.indexOf(' preload ') !== -1 && /^(fetch|script|style|image)$/.test(as) && !el.hasAttribute('imagesrcset'));
      if (!ok) return;
      var u;
      try { u = new URL(el.getAttribute(el.tagName === 'LINK' ? 'href' : 'src'), base); } catch (e) { return; }
      var key = u.href.replace(/#.*$/, '');
      if (seen[key]) return;
      seen[key] = true;
      list.push({ url: key, path: u.pathname, same: u.origin === location.origin, css: isCSS || as === 'style' });
    });
    return list;
  }

  // ---- 글꼴 데우기 ----------------------------------------------------
  // 갈 페이지의 글자(코드 포인트)를 모아, 그 글자를 그리는 데 쓰일 @font-face 만 골라 미리 받습니다.
  function pageChars(doc) {
    var body = doc.body;
    if (!body) return [];
    $(body).find('script, style, template, noscript').remove();
    var s = (doc.title || '') + (body.textContent || ''), set = {}, list = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) c = (c - 0xd800) * 0x400 + s.charCodeAt(++i) - 0xdc00 + 0x10000;
      if (c > 32 && !set[c]) { set[c] = true; list.push(c); }
    }
    return list.sort(function (a, b) { return a - b; });
  }

  function rangeHits(range, chars) {
    if (!range) return chars.length > 0;
    return range.split(',').some(function (part) {
      var m = /u\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part);
      if (!m) return false;
      var lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'f'), 16);
      // chars 는 정렬돼 있으므로 lo 이상인 첫 글자만 보면 됩니다
      var a = 0, b = chars.length;
      while (a < b) { var mid = (a + b) >> 1; if (chars[mid] < lo) a = mid + 1; else b = mid; }
      return a < chars.length && chars[a] <= hi;
    });
  }

  function fontFaces(css, base) {
    var faces = [], re = /@font-face\s*\{([^}]*)\}/g, m;
    while ((m = re.exec(css))) {
      var d = {}, dm, dre = /([a-z-]+)\s*:\s*([^;]+)/gi;
      while ((dm = dre.exec(m[1]))) d[dm[1].toLowerCase()] = dm[2].trim();
      var src = /url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(format\([^)]*\))?/i.exec(d.src || '');
      if (!d['font-family'] || !src) continue;
      try { faces.push({ family: d['font-family'].replace(/^['"]|['"]$/g, ''), url: new URL(src[2], base).href, format: src[3] || '', d: d }); } catch (e) {}
    }
    return faces;
  }

  function warmFonts(st) {
    var fonts = st.fonts;
    if (fonts.started) return fonts.started;
    if (!window.FontFace) return (fonts.started = Promise.resolve());
    fonts.started = Promise.all(fonts.sheets).then(function () {
      var used = st.css.map(function (c) { return c.text; }).join('\n'), loads = [], urls = {};
      var faces = fonts.faces;
      st.css.forEach(function (c) { faces = faces.concat(fontFaces(c.text, c.url)); });
      faces.forEach(function (f) {
        // 그 페이지의 스타일시트가 실제로 부르는 글꼴 이름만 (KaTeX 처럼 글자만으로는 필요를 알 수 없는 글꼴은 빼고)
        if (urls[f.url] || st.over || used.indexOf(f.family) === -1 || !rangeHits(f.d['unicode-range'], fonts.chars)) return;
        urls[f.url] = true;
        try {
          var face = new FontFace(f.family, 'url("' + f.url + '") ' + f.format, {
            style: f.d['font-style'] || 'normal',
            weight: f.d['font-weight'] || 'normal',
            stretch: f.d['font-stretch'] || 'normal',
            unicodeRange: f.d['unicode-range'] || 'U+0-10FFFF'
          });
          loads.push(face.load().catch(function () {}));
        } catch (e) {}
      });
      fonts.count = loads.length;
      return Promise.all(loads);
    });
    return fonts.started;
  }

  // 다른 출처의 스타일시트(Google Fonts · Pretendard): 갈 페이지와 똑같은 요청(<link>)으로 받아 캐시에 넣고
  // (media=print 라 이 화면에는 아무 영향 없음 — Google 은 요청 종류에 따라 응답을 달리 캐시하므로 fetch 로는 안 됨),
  // 그 안의 글꼴 목록은 CORS 로 한 번 더 읽어서 고릅니다. 이 두 번째 요청은 캐시에 쓰지 않아야(no-store)
  // <link> 로 받아 둔 캐시 항목을 덮어쓰지 않습니다.
  function fontSheets(st, assets) {
    assets.forEach(function (a) {
      if (a.same || !a.css) return;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.media = 'print';
      link.href = a.url;
      document.head.appendChild(link);
      st.links.push(link);
      st.fonts.sheets.push(fetch(a.url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: st.ctl ? st.ctl.signal : undefined })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (css) { st.fonts.faces = st.fonts.faces.concat(fontFaces(css, a.url)); }, function () {}));
    });
  }

  // ---- 설치 흐름 -------------------------------------------------------
  // 단계: Collecting(HTML 받고 필요한 자산 고르기) → Downloading(막대) → Installing(글꼴) → Launching(이동)
  function pipInstall(url) {
    autoTyping = false;
    if (install) return;
    var st = install = {
      url: url, got: 0, total: 0, shown: 0, speed: 0, eta: null, spW: 0,
      t0: now(), lastByte: 0, complete: false, finished: false,
      over: false,        // 더 진행하지 않음 (취소 · 실패 · 건너뛰기 · 이동 중)
      launching: false,   // Launching GUI ... 를 찍음
      left: false,        // 이동을 시작함
      css: [], links: [], fonts: { sheets: [], faces: [], chars: [] },
      ctl: window.AbortController ? new AbortController() : null
    };
    var release;
    var held = new Promise(function (r) { release = r; });
    st.release = function () { if (release) { release(); release = null; } };

    function echo(s) { term.echo(s, { keepWords: true }); }
    var nav = window.navigation && window.navigation.addEventListener ? window.navigation : null;
    function bind(on) {
      var m = on ? 'addEventListener' : 'removeEventListener';
      window[m]('keydown', onKey, true);
      window[m]('click', onClick, true);
      if (!on && nav) nav.removeEventListener('navigateerror', onNavError);
    }
    st.unbind = function () { bind(false); };
    st.cancel = function () { cancel(); };

    // 막 시작한 직후(Enter 를 두 번 누르는 버릇, 버튼 두 번 누르기)의 입력은 건너뛰기로 치지 않고 흘려보냅니다
    var GRACE = reduceMotion ? 0 : 300;
    function early() { return now() - st.t0 < GRACE; }

    // 터미널보다 먼저(window 캡처 단계에서) 받아, 누른 키가 명령줄로 가지 않게 합니다
    function onKey(e) {
      var k = e.key || '';
      var ctrlC = e.ctrlKey && !e.altKey && !e.metaKey && (k === 'c' || k === 'C' || e.keyCode === 67);
      // 단축키(새로고침 · 복사 · 탭 전환 …)와 보조 키 · 기능 키 · 길게 누르기는 그대로 둡니다
      if (!ctrlC && (e.ctrlKey || e.metaKey || e.altKey || e.repeat ||
        /^(Shift|Control|Alt|AltGraph|Meta|OS|CapsLock|NumLock|ScrollLock|Fn|FnLock|Hyper|Super|Dead)$/.test(k) || /^F\d+$/.test(k))) return;
      // 이동을 시작한 뒤의 Esc 는 브라우저에 맡깁니다 (불러오기 멈춤 → navigateerror 로 터미널에 돌아옴)
      if (st.left && k === 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (ctrlC) {
        // 이동을 시작한 뒤라도 아직 이 페이지에 있으면(느린 연결) 이동을 멈추고 터미널로 돌아옵니다
        if (st.left) { try { window.stop(); } catch (x) {} }
        cancel();
      } else if (!early()) skip();
    }
    function onClick(e) {
      if (e.button) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!early()) skip();
    }
    // 이동이 멈춘 경우(브라우저의 정지 버튼 · Esc · 다른 이동이 끼어듦): 이 페이지가 그대로 남으므로 터미널을 되살립니다
    function onNavError() { cancel(); }
    function stop() {
      st.over = true;
      clearInterval(st.watch);
      if (st.raf) cancelAnimationFrame(st.raf);
    }
    // 화면 폭이 바뀌면 jQuery Terminal 이 함수 줄을 다시 부르므로, 끝난 막대도 새 폭에 맞춰집니다
    function barRow() { return progressLine(st); }
    function render() {
      var line = progressLine(st);
      if (line !== st.drawn) { st.drawn = line; term.update(st.line, barRow); }
    }

    function launch() {
      if (st.launching) return;
      stop();
      st.launching = true;
      echo('Launching GUI ...');
    }
    function goLater(ms) { clearTimeout(st.goTimer); st.goTimer = setTimeout(go, ms); }
    function go() {
      if (st.left || install !== st) return;
      st.left = true;
      st.prevMode = getMode();
      setMode('gui');
      // 이동이 중간에 멈추면(navigateerror) 알 수 있게 — 이동이 끝나 이 페이지를 떠나면 불리지 않습니다
      if (nav) nav.addEventListener('navigateerror', onNavError);
      location.href = st.url;
    }
    function skip() {
      if (st.left) return;
      launch();
      go();
    }
    // 취소: 받던 것을 멈추고 터미널에 남습니다. 이동을 시작한 뒤에 불리면(이동이 멈춘 경우) 고른 모드도 되돌립니다.
    function cancel() {
      if (install !== st) return;
      if (st.left) { st.left = false; setMode(st.prevMode); }
      st.launching = false;
      clearTimeout(st.goTimer);
      stop();
      bind(false);
      if (st.ctl) { try { st.ctl.abort(); } catch (e) {} }
      st.links.forEach(function (l) { if (l.parentNode) l.parentNode.removeChild(l); });
      echo(fmt('', PC.error, 'ERROR: Operation cancelled by user'));
      install = null;
      st.release();   // 약속이 풀리면 jQuery Terminal 이 입력을 되살리고 프롬프트를 다시 띄움
    }
    function fail(e) {
      if (st.over) return;
      stop();
      if (st.ctl) { try { st.ctl.abort(); } catch (x) {} }
      var why;
      // pip 의 문구를 짧게: 무엇이 실패했는지 한 줄, 그래도 GUI 로는 넘어감
      if (e && e.timeout) why = 'Read timed out. (read timeout=' + PIP_TIMEOUT / 1000 + ')';
      else if (e && e.status) why = 'HTTP error ' + e.status + ' while getting ' + (e.url ? new URL(e.url, location.href).pathname : st.url) + '.';
      else why = 'Connection failed' + (navigator.onLine === false ? ' (offline)' : '') + '.';
      echo(fmt('', PC.warn, 'WARNING: ' + why + ' Skipping download.'));
      launch();
      goLater(reduceMotion ? 0 : 450);
    }

    bind(true);
    echo('Collecting ' + PKG);
    // 오래 아무것도 오지 않으면(pip 의 read timeout) 기다리지 않고 그냥 넘어갑니다
    st.watch = setInterval(function () {
      if (!st.complete && now() - (st.lastByte || st.t0) > PIP_TIMEOUT) fail({ timeout: true });
    }, 500);

    grab(st, url, true).then(function (page) {
      if (st.over) return;
      var doc = new DOMParser().parseFromString(page.text, 'text/html');
      var assets = pageAssets(doc, page.url);
      st.fonts.chars = pageChars(doc);
      st.total = page.bytes;
      var jobs = [], sizes = [];
      assets.forEach(function (a) {
        if (!a.same) return;
        var size = PIP_SIZES[a.path], sized;
        // 빌드 때 크기를 모르는 자산(대표 이미지, 개발 서버의 livereload 등)은 응답 머리의 크기로, 그것도 없으면 다 받은 뒤의 크기로
        if (size == null) sizes.push(new Promise(function (r) { sized = r; }));
        else st.total += size;
        var job = grab(st, a.url, a.css, function (len) { if (sized && len != null) sized(len); }).then(function (r) {
          if (a.css) st.css.push({ url: r.url, text: r.text });
          if (sized) sized(r.bytes);
          return r;
        });
        // 막대가 뜨기 전에 취소돼도 처리되지 않은 거부가 콘솔에 남지 않게 (실패 자체는 아래 Promise.all 이 받음)
        job.catch(function () { if (sized) sized(0); });
        jobs.push(job);
      });
      fontSheets(st, assets);
      // 전체 크기를 알 때까지가 Collecting
      return Promise.all([Promise.all(sizes), later(reduceMotion ? 0 : 200)]).then(function (res) {
        if (st.over) return;
        res[0].forEach(function (n) { st.total += n; });
        download(Promise.all(jobs));
      });
    }).catch(fail);

    function download(rest) {
      var size = '(' + sizeText(st.total) + ')';
      term.echo(function () { return hangingLine(['Downloading', WHEEL, size], term.cols()); }, { keepWords: true });
      // 출력 영역은 role=log 라서, 막대 줄은 화면 낭독기가 바뀔 때마다 읽지 않게 숨깁니다 (앞뒤 줄로 진행을 알 수 있음)
      term.echo(barRow, { finalize: function (div) { div.attr('aria-hidden', 'true'); } });
      st.line = term.last_index();
      st.tBar = now();
      rest.then(function () {
        if (st.over) return;
        st.complete = true;
        st.tDone = st.lastByte || now();
        st.total = st.got;   // 빌드 때 크기와 실제 응답이 다르면(드묾) 실제로 받은 양이 기준
        warmFonts(st);       // 글꼴은 HTML · CSS · JS 를 다 받은 뒤에 (막대 쪽이 대역폭을 먼저 쓰도록), 막대가 마저 차는 동안 받습니다
      }, fail);
      var last = 0;
      (function frame() {
        if (st.over) return;
        var t = now();
        var timeFrac = PIP_MIN_FILL ? Math.min(1, (t - st.tBar) / PIP_MIN_FILL) : 1;
        // 시간 곡선: 출발은 살짝 느리게, 이후 고르게 — 실제 내려받기처럼
        var eased = timeFrac * (0.45 + 0.55 * timeFrac);
        var real = st.total ? Math.min(1, st.got / st.total) : 1;
        st.finished = st.complete && timeFrac >= 1;
        var frac = st.finished ? 1 : Math.min(real, eased);
        st.shown = Math.round(frac * st.total);
        // 속도 = 받은 양 ÷ 실제로 받는 데 걸린 시간. 마지막 바이트 이후 기다린 시간(Collecting 의 짧은 대기,
        // 다 받았는데 아직 완료 처리 전인 첫 프레임)은 빼되, 1초 넘게 끊기면 그만큼 속도가 서서히 떨어집니다
        var tEnd = st.complete ? st.tDone : Math.max(st.lastByte || t, t - 1000);
        var dt = (tEnd - st.t0) / 1000;
        st.speed = st.got && dt > 0.001 ? st.got / dt : 0;
        // 남은 시간 = 막대가 다 차기까지 (rich 처럼 올림 — 조금이라도 남으면 0:00:01)
        var left = Math.max(0, PIP_MIN_FILL - (t - st.tBar)) / 1000;
        if (!st.complete) left = st.speed ? Math.max(left, (st.total - st.got) / st.speed) : null;
        st.eta = st.finished ? 0 : left == null ? null : Math.ceil(left);
        // 터미널처럼 초당 30번 정도만 다시 그립니다
        if (st.finished || t - last >= 32) { last = t; render(); }
        if (st.finished) installStep();
        else st.raf = requestAnimationFrame(frame);
      })();
    }

    function installStep() {
      clearInterval(st.watch);
      echo('Installing collected packages: ' + PKG);
      // 글꼴은 너무 오래 기다리지 않습니다 (못 받은 글꼴은 GUI 페이지가 이어서 받음)
      Promise.all([
        Promise.race([warmFonts(st), later(reduceMotion ? 150 : 1500)]),
        later(reduceMotion ? 40 : 240)
      ]).then(function () {
        if (st.over) return;
        echo('Successfully installed ' + PKG + '-' + PKG_VER);
        return later(reduceMotion ? 0 : 140);
      }).then(function () {
        if (st.over) return;
        launch();
        goLater(reduceMotion ? 0 : 180);
      });
    }

    return held;
  }

  // 설치 도중에 다른 페이지로 떠나면(뒤로 가기 등) 터미널을 닫은 것처럼 취소해 둡니다 — 돌아왔을 때 이어서 넘어가지 않게
  window.addEventListener('pagehide', function () {
    if (install && !install.left) install.cancel();
  });

  // 뒤로 · 앞으로 가기로 돌아왔을 때(bfcache): GUI 로 넘어가며 멈춰 둔 터미널을 풀고,
  // 페이지를 떠나며 꺼진 명령줄을 다시 켭니다 (그대로 두면 클릭하기 전까지 입력이 되지 않음)
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    var st = install;
    if (st && st.left) {
      install = null;
      st.unbind();
      st.links.forEach(function (l) { if (l.parentNode) l.parentNode.removeChild(l); });
      st.release();
    }
    // 모바일은 키보드가 튀어나오지 않게 그대로, 글 창이 떠 있으면 창이 키를 받으므로 그대로
    if (!term || isTouch || (window.MacReader && window.MacReader.isOpen())) return;
    setTimeout(function () { if (!install) { term.enable(); term.focus(); } }, 0);
  });

  function cmdHistory() {
    var data = term.history().data() || [];
    out(data.slice(-30).map(function (c, i) { return dim(pad(String(data.length - Math.min(30, data.length) + i + 1), 5)) + esc(c); }));
  }

  var exitTimer = null;
  function cmdExit() {
    var size = 30, i = 0;
    var prompt = term.get_prompt();
    term.echo(CFG.exitLocation ? 'terminating ...' : 'Terminating session, thanks for visiting');
    term.pause();
    (function loop() {
      var n = Math.round(size * i / 100);
      var bar = '[' + new Array(n + 1).join('=').replace(/=$/, '>') + new Array(size - n + 1).join(' ') + '] ' + i + '%';
      term.set_prompt(bar);
      if (i++ < 100) { exitTimer = setTimeout(loop, reduceMotion ? 0 : 10); return; }
      term.echo(bar + ' ' + fmt('b', 'green', 'OK')).set_prompt(prompt);
      setTimeout(function () {
        if (CFG.exitLocation) { location.href = CFG.exitLocation; return; }
        term.clear();
        term.echo(esc(CFG.exitMessage || '[Session completed]'));
      }, 400);
    })();
  }

  function interpreter(command) {
    var parts = $.terminal.split_command(command);
    var name = parts.name;
    var args = parts.args.map(String);
    useLessOnce = !!CFG.useLess;
    if (name === 'less') {
      if (!args.length) return err('less', '사용법: less <명령어>');
      useLessOnce = true;
      name = args.shift();
    }
    switch (name) {
      case '': return;
      case 'help': case '?': return cmdHelp();
      case 'ls': case 'll': case 'dir':
        return cmdLs(name === 'll' ? ['-l'].concat(args) : args);
      case 'cd': return cmdCd(args);
      case 'pwd': return out(esc(cwdString()));
      case 'tree': return cmdTree(args);
      case 'cat': case 'open': case 'vi': case 'vim': return cmdCat(name, args);
      case 'recent': case 'posts': return cmdRecent(args);
      case 'search': case 'grep': case 'find': return cmdSearch(name, args);
      case 'tags': case 'tag': return cmdTags(args);
      case 'about': case 'whoami': return cmdAbout();
      case 'gui': case 'startx': return goGUI(name, args);
      case 'history': return cmdHistory();
      // term.clear() 는 터미널 객체를 돌려주는데, 인터프리터가 값을 돌려주면 jQuery Terminal 이 그것을 출력하려다 깨집니다
      case 'clear': term.clear(); return;
      case 'exit': case 'logout': return cmdExit();
      case 'sudo': return err('sudo', 'user is not in the sudoers file. This incident will be reported.');
      default:
        var maybe = lookup(normalize(name));
        if (maybe && maybe.type === 'post') {
          term.echo(dim('글을 열려면: ') + fmt('', 'orange', 'cat ' + name));
          return;
        }
        term.echo(fmt('', 'red', 'command not found: ' + name) + dim('   (help 로 명령어 목록 보기)'));
    }
  }

  /* ------------------------------------------------------------------ *
   * 자동완성
   * ------------------------------------------------------------------ */
  var COMMANDS = ['help', 'ls', 'cd', 'cat', 'open', 'tree', 'recent', 'search', 'tags', 'pwd', 'about', 'whoami', 'gui', 'less', 'clear', 'history', 'exit'];
  var PATH_CMDS = { ls: 'any', ll: 'any', cd: 'dir', cat: 'any', open: 'any', tree: 'dir', gui: 'any', vi: 'any', vim: 'any' };

  function completion(word, callback) {
    var line = this.before_cursor ? this.before_cursor() : this.get_command();
    var parts = line.replace(/^\s+/, '').split(/\s+/);
    if (parts.length <= 1) return callback(COMMANDS);
    var cmd = parts[0] === 'less' ? parts[1] : parts[0];
    if (parts[0] === 'less' && parts.length === 2) return callback(COMMANDS);
    if (cmd === 'tags' || cmd === 'tag') return callback(TAGS.map(function (t) { return t.name; }));
    var mode = PATH_CMDS[cmd];
    if (!mode || !FS) return callback([]);

    var slash = word.lastIndexOf('/');
    var dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    var segs = normalize(dirPart || '.');
    var dir = lookup(segs);
    if (!dir || dir.type !== 'dir') return callback([]);
    var names = sortedChildren(dir).filter(function (n) {
      return mode === 'any' || n.type === 'dir';
    }).map(function (n) { return dirPart + n.name + (n.type === 'dir' ? '/' : ''); });
    if (!dirPart && segs.length > 0) names.push('../');
    callback(names);
  }

  /* ------------------------------------------------------------------ *
   * 프롬프트
   * ------------------------------------------------------------------ */
  function promptPart(obj, fallbackText) {
    obj = obj || {};
    var s = '';
    if (obj.before) s += fmt('', obj.beforeColor || obj.beforecolor || 'red', obj.before);
    s += fmt('', obj.color || 'white', obj.text != null ? obj.text : fallbackText);
    if (obj.after) s += fmt('', obj.afterColor || obj.aftercolor || 'red', obj.after);
    return s;
  }

  function prompt(cb) {
    var p = CFG.prompt || {};
    var s = promptPart(p.core, 'user@' + (CFG.title || 'blog').replace(/\s+/g, ''));
    if (p.separator) s += fmt('', p.separator.color || 'grey', p.separator.text || '-');
    s += promptPart($.extend({}, p.path, { text: cwdString() }), cwdString());
    s += fmt('', (p.extra && p.extra.color) || 'orange', (p.extra && p.extra.text) || ': ');
    cb(s);
  }

  /* ------------------------------------------------------------------ *
   * 글 열기 (MacReader) + URL 딥링크
   * ------------------------------------------------------------------ */
  var opening = null;

  function postURL(path) {
    var node = lookup(path.split('/'));
    if (node && node.url) return node.url;
    return POSTS_URL + path.split('/').map(encodeURIComponent).join('/') + '/';
  }

  var openingPath = null;
  // hash: 글 안의 앵커 id (다른 글의 #제목 으로 가는 링크)
  function openPost(path, push, hash) {
    var url = postURL(path);
    if (opening && openingPath === path) return;
    if (opening) opening.abort();
    openingPath = path;
    term.echo(dim('opening ' + path + '.md ...'));
    var node = lookup(path.split('/'));
    opening = $.ajax({ url: url, dataType: 'html' }).done(function (html) {
      if (push) {
        // 창 안에서 글 → 글로 이동한 횟수를 기록해 두고, 닫을 때 그만큼 한 번에 되돌립니다.
        // (창을 열기 전에 push 해야 MacReader 가 바꾸는 문서 제목이 새 기록 항목에 붙습니다)
        var depth = (history.state && history.state.dldepth) || 0;
        try { history.pushState({ dlcat: path, dldepth: depth + 1 }, '', '#/' + path); } catch (e) {}
      }
      window.MacReader.open({
        path: path,
        url: url,
        hash: hash || '',
        html: html,
        term: term,
        words: node && node.words,
        onClose: onReaderClosed
      });
    }).fail(function (xhr, status) {
      if (status === 'abort') return;
      err('cat', path + ': 글을 불러오지 못했습니다 (' + (xhr.status || status) + ')');
      if (window.MacReader.isOpen()) location.href = url;
    }).always(function () { opening = null; openingPath = null; });
  }

  // 주소창에서 #/… 를 지움 (기록 항목은 늘리지 않음)
  function clearHash() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }

  var closingNav = false;
  function onReaderClosed() {
    if (/^#\//.test(location.hash)) {
      var depth = history.state && history.state.dldepth;
      if (depth) {
        closingNav = true;   // 되돌아간 항목에서 글을 다시 열지 않도록
        history.go(-depth);
      } else {
        clearHash();
      }
    }
  }

  function hashPath() {
    var h = location.hash.replace(/^#\/?/, '');
    try { h = decodeURIComponent(h); } catch (e) {}
    return h.replace(/^\/+|\/+$/g, '');
  }

  function routeFromHash() {
    if (closingNav) {
      closingNav = false;
      clearHash();
      return;
    }
    var path = hashPath();
    var reader = window.MacReader;
    if (!path) { if (reader.isOpen()) reader.close({ silent: true }); return; }
    if (reader.isOpen() && reader.currentPath() === path) return;
    var node = lookup(path.split('/'));
    if (!(node && node.type === 'post') && reader.isOpen()) reader.close({ silent: true });
    if (node && node.type === 'post') openPost(path, false);
    else if (node && node.type === 'dir') {
      cwd = path.split('/');
      term.set_prompt(prompt);
      clearHash();
    } else if (node && node.type === 'file') {
      cmdAbout();
      clearHash();
    } else {
      // 이름이 바뀐 글의 옛 북마크 등: cat 과 같은 안내를 보여 주고 잘못된 주소는 지움
      err('cat', path + ': 그런 파일이 없습니다');
      var guess = findPostByName(path.replace(/^.*\//, ''));
      if (guess.length) term.echo(dim('혹시 이 글인가요? ') + guess.map(function (p) { return fmt('', 'orange', 'cat ~/' + p.path); }).join(dim(', ')));
      clearHash();
    }
  }

  /* ------------------------------------------------------------------ *
   * 부팅
   * ------------------------------------------------------------------ */
  function greet() {
    var cols = term.cols();
    var g = text(CFG.greeting).replace(/\s+$/, '');
    var lines = g.split('\n');
    var art = [], rest = [], inArt = true;
    lines.forEach(function (l) {
      if (inArt && l.trim() === '' && art.length) inArt = false;
      (inArt ? art : rest).push(l);
    });
    var artWidth = Math.max.apply(null, art.map(strlen).concat([0]));
    var boxed = artWidth > cols;
    if (boxed) {
      // 화면이 좁으면 큰 배너 대신 제목을 상자에 담은 간단한 로고.
      // 상자는 ╔═╗ 글자 대신 CSS 겹줄 테두리로 그립니다 (cli.css .cli-logo): 글꼴의 상자 그리기 글자는
      // 이음매마다 겹치거나 줄 간격에서 끊겨 점선처럼 보입니다. 터미널 프로그램들도 상자 글자는 직접 그립니다.
      art = [(CFG.title || 'Draktharr Lab').toUpperCase()];
    }
    var color = CFG.greetingColor || 'white';
    // 그림 글자는 화면 낭독기에 읽히지 않게 합니다 (제목은 sr-only h1 이 알려 줌)
    function artLine(div) {
      div.attr({ role: 'presentation', 'aria-hidden': 'true' });
      if (boxed) div.addClass('cli-logo');
    }
    art.forEach(function (l) { term.echo(fmt('b', color, l.replace(/\s+$/, '') || ' '), { finalize: artLine }); });
    rest.forEach(function (l) { term.echo(l.trim() ? fmt('b', color, l) : ''); });
    if (isTouch || cols < 60) {
      // 안내 속 gui 는 누르면 그대로 실행됩니다 (cli.css .cli-run)
      var tip = '#ffd12e';
      term.echo('');
      term.echo(fmt('', tip, '모바일에서는 그래픽 모드가 더 편하다 → ') + '[[;' + tip + ';;cli-run]gui]' +
        fmt('', tip, ' 입력 또는 오른쪽 위 [GUI] 버튼'), { keepWords: true });
    }
    term.echo('');
  }

  function boot(done) {
    var ss = storage('sessionStorage');
    var seen = false;
    try { seen = ss && ss.getItem('dl-booted') === '1'; } catch (e) {}
    var lines = text(CFG.bootsequence).replace(/\s+$/, '').split('\n');
    if (seen || reduceMotion || !CFG.bootsequence || /^#\/./.test(location.hash)) {
      try { ss && ss.setItem('dl-booted', '1'); } catch (e) {}
      done();
      return;
    }

    // 부팅 글이 나오는 동안 프롬프트·커서를 숨깁니다. onInit 안의 term.pause() 는 jQuery Terminal 이
    // 초기화 끝에 다시 resume 해 버려서 효과가 없으므로 CSS 로 감춥니다 (cli.css: body.cli-booting .cmd)
    document.body.classList.add('cli-booting');
    var i = 0, skipped = false, timer = null;
    // 건너뛰기용으로 누른 키가 명령줄에 입력되지 않도록 캡처 단계에서 막습니다.
    function skip(e) {
      if ((e.type === 'keydown' || e.type === 'keypress') && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (e.type !== 'pointerdown' && e.cancelable) e.preventDefault();
      if (e.type !== 'pointerdown') e.stopImmediatePropagation();
      skipped = true;
    }
    var SKIP_EVENTS = ['keydown', 'keypress', 'pointerdown', 'compositionstart', 'beforeinput', 'input'];
    SKIP_EVENTS.forEach(function (t) { document.addEventListener(t, skip, true); });
    term.echo(dim('[ press any key to skip ]'));
    (function step() {
      if (skipped || i >= lines.length) return finish();
      var line = lines[i++];
      term.echo(esc(line) || ' ');
      timer = setTimeout(step, /^\.+$/.test(line.trim()) ? 28 : 55);
    })();
    function finish() {
      clearTimeout(timer);
      SKIP_EVENTS.forEach(function (t) { document.removeEventListener(t, skip, true); });
      try { ss && ss.setItem('dl-booted', '1'); } catch (e) {}
      setTimeout(function () {
        term.clear();
        document.body.classList.remove('cli-booting');
        term.resume();   // 멈춰 있지 않아도 명령줄을 다시 활성화(포커스)해 줍니다
        if (skipped) {
          // 한글 IME 로 누른 키(조합 중인 글자)가 명령줄에 남지 않도록 정리
          var a = document.activeElement;
          if (a && a.blur) a.blur();
          term.set_command('');
          term.focus();
        }
        done();
      }, skipped ? 0 : 300);
    }
  }

  /* ------------------------------------------------------------------ *
   * 시작
   * ------------------------------------------------------------------ */
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return $.Deferred().resolve().promise();
    var d = $.Deferred();
    var t = setTimeout(d.resolve, 800);
    // DraktharrMono = 설치된 D2Coding(local) 또는 서브셋 (static/css/terminal.local.css)
    document.fonts.load('16px DraktharrMono', '가A╲').then(function () {
      clearTimeout(t);
      d.resolve();
      if (term && term.resize) term.resize();   // 폰트가 늦게 도착하면 글자 폭을 다시 잰다
    }, d.resolve);
    return d.promise();
  }

  // [GUI] 버튼 · 모바일 안내의 gui: 명령줄에 gui 를 쳐 보인 뒤 같은 설치 과정으로 갑니다.
  // 처리했으면 true (링크 기본 동작을 막음), 터미널이 아직 준비되지 않았거나 다른 화면(less · 글 창)이 떠 있으면 false.
  var booted = false, pendingRun = null, autoTyping = false;
  function runCommand(cmd) {
    if (install || autoTyping) return true;      // 이미 치는 중 · 설치 중 (설치 중 클릭은 window 캡처에서 건너뛰기로 처리됨)
    if (!term) return false;
    if (!booted) { pendingRun = cmd; return true; }   // 부팅 글이 끝나면 이어서
    if (term.paused() || (term.level && term.level() > 1) || (window.MacReader && window.MacReader.isOpen())) return false;
    term.set_command('');
    try { term.history().append(cmd); } catch (e) {}
    // typing: jQuery Terminal 이 프롬프트에 한 글자씩 쳐 넣은 뒤 Enter 처럼 실행 (움직임 줄이기 설정이면 바로).
    // 글 경로처럼 긴 명령은 한 글자 간격을 줄여 전체가 0.6초 안팎에 끝나게 합니다
    autoTyping = true;
    var delay = Math.max(18, Math.min(70, Math.round(600 / cmd.length)));
    term.exec(cmd, reduceMotion ? {} : { typing: true, delay: delay }).always(function () { autoTyping = false; });
    return true;
  }

  // 글 창의 File › Open in GUI: 창을 닫고(#/경로 기록도 정리) 'gui <그 글>' 을 쳐서 같은 설치 과정으로 넘어갑니다.
  // 지금 디렉터리 아래의 글이면 상대 경로로 짧게.
  function readerToGUI(e) {
    var reader = window.MacReader;
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !reader || !reader.isOpen()) return;
    var a = e.target.closest && e.target.closest('.mac-overlay .mac-menubar a[href]');
    var path = reader.currentPath();
    if (!a || !path || !booted || install || autoTyping) return;
    try { if (new URL(a.href).pathname !== new URL(postURL(path), location.href).pathname) return; } catch (x) { return; }
    var here = cwd.join('/');
    var arg = here && path.indexOf(here + '/') === 0 ? path.slice(here.length + 1) : '~/' + path;
    if (/\s/.test(arg)) arg = '"' + arg.replace(/"/g, '\\"') + '"';
    e.preventDefault();
    e.stopPropagation();
    reader.close();
    if (!runCommand('gui ' + arg)) location.href = a.href;
  }

  $(function () {
    $(document).on('click', '[data-mode-switch]', function () { setMode($(this).data('mode-switch')); });
    document.addEventListener('click', readerToGUI, true);
    // 버튼을 누를 때 터미널(body)이 명령줄에 포커스를 가져가지 않게 (모바일에서 키보드가 뜨지 않도록).
    // 키보드로 버튼에 와서 Enter 를 누를 때도 터미널이 그 Enter 를 가로채지 않게 (그래야 링크가 눌림)
    $('.cli-mode-btn').on('mousedown mouseup touchstart touchend keydown keypress', function (e) { e.stopPropagation(); })
      .on('click', function (e) {
        e.stopPropagation();
        // 새 탭 · 보조 클릭은 원래 링크 그대로
        if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !runCommand('gui')) { setMode('gui'); return; }
        e.preventDefault();
      });

    $.when(fontsReady(), loadFS()).always(function () {
      term = $('body').terminal(interpreter, {
        greetings: false,
        prompt: prompt,
        completion: completion,
        checkArity: false,
        exit: false,
        historySize: 200,
        onInit: function (t) {
          term = t;
          t.find('textarea').attr('aria-label', '명령 입력 — help, ls, cd, cat <글 경로>, gui');
          boot(function () {
            greet();
            routeFromHash();
            booted = true;
            if (pendingRun) { var c = pendingRun; pendingRun = null; runCommand(c); }
          });
        }
      });
      term.find('.terminal-output')
        .on('mousedown mouseup touchstart touchend', '.cli-run', function (e) { e.stopPropagation(); })
        .on('click', '.cli-run', function (e) {
          e.preventDefault();
          e.stopPropagation();
          runCommand('gui');
        });
      // 글 안의 링크로 다른 글(또는 같은 글의 #앵커)로 갈 때
      window.MacReader.onNavigate = function (path, hash) {
        var n = lookup(path.split('/'));
        if (!n || n.type !== 'post') return false;
        if (window.MacReader.currentPath() === path) {
          // 지금 열린 글이면 다시 불러오지 않고(기록도 늘리지 않고) 앵커로만 이동
          if (hash) window.MacReader.scrollTo(hash);
          return true;
        }
        openPost(path, true, hash);
        return true;
      };
      window.addEventListener('popstate', routeFromHash);
    });
  });
})(jQuery);
