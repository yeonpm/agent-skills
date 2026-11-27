/* htmlfy 시안 선택·의견·하단 프롬프트 v1 — 문서 맨 끝 <script> 안에 그대로 붙여 넣는다(외부 요청 없음).
   dcfy(결정 문서) 하단 프롬프트 동작을 차용: 자동 복사는 없다(2026-11-27). '복사' 버튼을 눌러야 복사:
   navigator.clipboard 실패 시 숨은 textarea + execCommand('copy') 폴백, 수동 복사 성공/실패 토스트, localStorage 유지.
   문서 메타(<head>): <meta name="mp-title" content="…"> mp-date, mp-task, mp-path(저장소 경로), mp-url(허브 URL, 없으면 http 주소 자동),
   mp-multi(content="1"이면 복수 선택). 제목이 없으면 document.title. */
(function () {
  'use strict';
  function meta(n) { var m = document.querySelector('meta[name="mp-' + n + '"]'); return m ? (m.getAttribute('content') || '').trim() : ''; }
  var M = {
    title: meta('title') || document.title || '',
    date: meta('date'),
    task: meta('task'),
    path: meta('path'),
    url: meta('url') || (/^https?:$/.test(location.protocol) ? location.href.split('#')[0] : ''),
    multi: /^(1|true|yes)$/i.test(meta('multi'))
  };
  var KEY = 'mockup-picker:' + (M.path || M.title || location.pathname);
  var cards = [].slice.call(document.querySelectorAll('.mp-card[data-mp-id]'));
  if (!cards.length) { console.warn('mockup-picker: .mp-card[data-mp-id] 없음'); return; }
  var ids = cards.map(function (c) { return c.getAttribute('data-mp-id'); });
  var names = {};
  cards.forEach(function (c) { names[c.getAttribute('data-mp-id')] = (c.getAttribute('data-mp-name') || '').trim(); });

  function blank() { return { sel: [], notes: {}, overall: '' }; }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null') || blank();
      s.sel = (s.sel || []).filter(function (id) { return ids.indexOf(id) >= 0; });
      s.notes = s.notes || {}; s.overall = s.overall || '';
      return s;
    } catch (e) { return blank(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var state = load();

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function label(id) { return id + (names[id] ? ' ' + names[id] : ''); }
  function noteText(t) {
    return String(t || '').replace(/\r\n?/g, '\n').split('\n')
      .map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); })
      .filter(function (l) { return l; }).join('\n    ');
  }

  // ---- 카드마다 선택 버튼 + 의견 입력 ----
  if (M.multi) document.documentElement.classList.add('mp-multi');
  cards.forEach(function (c) {
    var id = c.getAttribute('data-mp-id');
    var slot = c.querySelector('.mp-slot') || c.appendChild(el('div', { 'class': 'mp-slot' }));
    var box = el('div', { 'class': 'mp-pick' });
    var btn = el('button', { type: 'button', 'class': 'mp-sel', 'data-mp-sel': id, 'aria-pressed': 'false' });
    btn.appendChild(el('span', { 'class': 'mp-mark', 'aria-hidden': 'true' }));
    btn.appendChild(el('span', { 'class': 'mp-sel-t' }, '이 시안 선택'));
    var tid = 'mp-note-' + id.replace(/[^\w-]/g, '_');
    var lab = el('label', { 'class': 'mp-lbl', 'for': tid }, '시안 ' + id + ' 의견 (선택하지 않아도 적을 수 있어요)');
    var ta = el('textarea', { 'class': 'mp-note', id: tid, 'data-mp-note': id, rows: '2', placeholder: '좋은 점, 바꿀 점, 다른 시안과 섞고 싶은 요소…' });
    box.appendChild(btn); box.appendChild(lab); box.appendChild(ta);
    slot.appendChild(box);
  });

  // ---- 문서 전체 의견 ----
  var ov = document.querySelector('.mp-overall');
  if (!ov) {
    ov = el('section', { 'class': 'mp-overall' });
    var host = document.querySelector('main') || document.body;
    var foot = host.querySelector('footer');
    if (foot && foot.parentNode === host) host.insertBefore(ov, foot); else host.appendChild(ov);
  }
  ov.appendChild(el('label', { 'class': 'mp-lbl', 'for': 'mp-overall-note' }, '전체 의견 (선택)'));
  ov.appendChild(el('textarea', { 'class': 'mp-note', id: 'mp-overall-note', 'data-mp-overall': '', rows: '3', placeholder: '여러 시안에 걸친 의견, 다음 라운드 요청 등' }));

  // ---- 하단 패널 + 토스트 ----
  var panel = el('div', { id: 'mp-panel', role: 'region', 'aria-label': '선택 프롬프트' });
  panel.innerHTML = '<div class="mp-inner"><div class="mp-bar"><strong>프롬프트</strong>' +
    '<span id="mp-status"></span>' +
    '<button type="button" id="mp-copy" class="mp-primary">복사</button>' +
    '<button type="button" id="mp-reset">초기화</button>' +
    '<button type="button" id="mp-toggle" aria-expanded="true" aria-controls="mp-prompt">접기</button></div>' +
    '<pre id="mp-prompt" aria-live="polite"></pre></div>';
  document.body.appendChild(panel);
  var toastEl = el('div', { id: 'mp-toast', role: 'status' });
  document.body.appendChild(toastEl);

  function buildPrompt() {
    var out = ['시안 선택 ' + [M.title, M.date].filter(Boolean).join(' ')];
    var doc = M.url || M.path;
    if (doc || M.task) out.push('문서: ' + (doc || '-') + (M.url && M.path ? ' (원본 ' + M.path + ')' : '') + (M.task ? ' · 작업 ' + M.task : ''));
    var sel = ids.filter(function (id) { return state.sel.indexOf(id) >= 0; });
    if (sel.length) sel.forEach(function (id) { out.push('선택: ' + label(id)); });
    else out.push('선택 없음');
    ids.forEach(function (id) { var t = noteText(state.notes[id]); if (t) out.push('[' + label(id) + '] 의견: ' + t); });
    var o = noteText(state.overall); if (o) out.push('전체 의견: ' + o);
    out.push('이 선택으로 진행해줘');
    return out.join('\n');
  }

  var lastCopied = '';
  function syncUI() {
    cards.forEach(function (c) {
      var id = c.getAttribute('data-mp-id'), on = state.sel.indexOf(id) >= 0;
      c.classList.toggle('mp-selected', on);
      var b = c.querySelector('[data-mp-sel]');
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.mp-sel-t').textContent = on ? '선택됨' : '이 시안 선택';
    });
    document.getElementById('mp-prompt').textContent = buildPrompt();
    var n = ids.filter(function (id) { return noteText(state.notes[id]); }).length + (noteText(state.overall) ? 1 : 0);
    document.getElementById('mp-status').textContent =
      (state.sel.length ? '선택 ' + state.sel.join(', ') : '선택 없음') + ' · 의견 ' + n + '건' +
      (M.multi ? ' · 복수 선택' : '') + (lastCopied ? ' · 마지막 복사 ' + lastCopied : ' · 복사 버튼으로 복사');
  }
  function applyInputs() {
    document.querySelectorAll('[data-mp-note]').forEach(function (t) { t.value = state.notes[t.getAttribute('data-mp-note')] || ''; });
    document.getElementById('mp-overall-note').value = state.overall || '';
  }

  var toastTimer;
  function toast(msg, err) {
    toastEl.textContent = msg; toastEl.classList.toggle('mp-err', !!err); toastEl.classList.add('mp-show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('mp-show'); }, 1600);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'mp-sr';
    var prev = document.activeElement;
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) {}
    return ok;
  }
  function copyPrompt() {
    var text = buildPrompt();
    var done = function (ok) {
      if (ok) { lastCopied = new Date().toLocaleTimeString('ko-KR', { hour12: false }); toast('프롬프트를 클립보드에 복사했습니다'); }
      else toast('복사 실패 — 아래 프롬프트를 직접 선택해 복사하세요', true);
      document.documentElement.setAttribute('data-copy-state', ok ? 'ok' : 'fail');
      syncUI();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
    } else done(fallbackCopy(text));
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-mp-sel]'); if (!b) return;
    var id = b.getAttribute('data-mp-sel'), on = state.sel.indexOf(id) >= 0;
    if (M.multi) state.sel = on ? state.sel.filter(function (x) { return x !== id; }) : state.sel.concat(id);
    else state.sel = on ? [] : [id];
    save(); syncUI();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.hasAttribute && t.hasAttribute('data-mp-note')) state.notes[t.getAttribute('data-mp-note')] = t.value;
    else if (t.id === 'mp-overall-note') state.overall = t.value;
    else return;
    save(); syncUI();
  });
  document.getElementById('mp-copy').addEventListener('click', copyPrompt);
  document.getElementById('mp-reset').addEventListener('click', function () {
    if (!confirm('시안 선택과 의견을 모두 지울까요?')) return;
    state = blank(); save(); applyInputs(); syncUI();
  });
  document.getElementById('mp-toggle').addEventListener('click', function () {
    var c = panel.classList.toggle('mp-collapsed');
    this.textContent = c ? '펼치기' : '접기'; this.setAttribute('aria-expanded', String(!c)); fitPanel();
    try { localStorage.setItem(KEY + ':collapsed', c ? '1' : ''); } catch (e) {}
  });
  try { if (localStorage.getItem(KEY + ':collapsed')) { panel.classList.add('mp-collapsed'); var tg = document.getElementById('mp-toggle'); tg.textContent = '펼치기'; tg.setAttribute('aria-expanded', 'false'); } } catch (e) {}

  // 패널이 내용(마지막 카드 버튼·입력)을 가리지 않게 body 아래 여백과 스크롤 여백을 패널 높이만큼 둔다.
  function fitPanel() {
    var h = panel.offsetHeight;
    document.body.style.paddingBottom = (h + 16) + 'px';
    document.documentElement.style.scrollPaddingBottom = (h + 16) + 'px';
    document.documentElement.style.setProperty('--mp-panel-h', h + 'px');
  }
  applyInputs(); syncUI(); fitPanel();
  if (window.ResizeObserver) new ResizeObserver(fitPanel).observe(panel); else window.addEventListener('resize', fitPanel);
  window.__mockupPicker = { buildPrompt: buildPrompt, storageKey: KEY, meta: M };
})();
