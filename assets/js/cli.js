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
  function setMode(mode) { var ls = storage('localStorage'); try { ls && ls.setItem('dl-mode', mode); } catch (e) {} }

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

  function goGUI(args) {
    var segs = args && args.length ? normalize(args[0]) : cwd;
    var node = lookup(segs);
    if (args && args.length && !node) return err('gui', '그런 경로가 없습니다: ' + args[0]);
    var url = POSTS_URL;
    if (node && node.type === 'file') url = CFG.aboutURL || '/about/';
    else if (node && node.type === 'post') url = node.url;
    else if (node && node.type === 'dir' && segs.length) url = node.url || POSTS_URL + segs.join('/') + '/';
    setMode('gui');
    term.echo(dim('switching to GUI → ' + url));
    setTimeout(function () { location.href = url; }, reduceMotion ? 0 : 250);
  }

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
      case 'gui': case 'startx': return goGUI(args);
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
      term.echo('');
      term.echo(fmt('', '#ffd12e', '모바일에서는 그래픽 모드가 더 편하다 → gui 입력 또는 오른쪽 위 [GUI] 버튼'));
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

  $(function () {
    $(document).on('click', '[data-mode-switch]', function () { setMode($(this).data('mode-switch')); });

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
          });
        }
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
