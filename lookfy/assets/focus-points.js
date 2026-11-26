/* htmlfy 포커스 포인트 하이라이트 v1 — 문서 맨 끝 <script> 안에 그대로 붙여 넣는다(외부 요청 없음).
   .fp-btn[data-target] 클릭 → 같은 data-focus를 가진 .fp-area 강조(딤+테두리+번호) + 화면 가운데로 스크롤.
   같은 버튼 다시 누르기 또는 Esc → 해제. 한 번에 하나만 켜진다. */
(function () {
  var current = null;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 번호 배지 자리: 영역 밖 왼쪽 → 위 → 오른쪽 → 아래 → 안쪽 순으로 stage 안에 들어가는 첫 자리(영역을 가리지 않게).
  function placeBadge(area) {
    var st = area.closest('.fp-stage').getBoundingClientRect(), r = area.getBoundingClientRect();
    var B = 26, g = 4, x = r.left - st.left, y = r.top - st.top;
    var spots = [[x - B - g, y], [x, y - B - g], [x + r.width + g, y], [x, y + r.height + g], [x + g, y + g]];
    var pick = spots[spots.length - 1];
    for (var i = 0; i < spots.length - 1; i++) {
      var p = spots[i];
      if (p[0] >= 0 && p[1] >= 0 && p[0] + B <= st.width && p[1] + B <= st.height) { pick = p; break; }
    }
    area.style.setProperty('--bx', (pick[0] - x) + 'px');
    area.style.setProperty('--by', (pick[1] - y) + 'px');
  }
  function clear() {
    if (!current) return;
    current.area.classList.remove('fp-active');
    current.area.closest('.fp-stage').classList.remove('fp-on');
    current.btn.setAttribute('aria-pressed', 'false');
    current = null;
  }
  function show(btn) {
    var id = btn.getAttribute('data-target');
    var area = document.querySelector('.fp-area[data-focus="' + id + '"]');
    if (!area) { console.warn('focus-points: 영역 없음 ' + id); return; }
    clear();
    var d = area.closest('details'); if (d && !d.open) d.open = true;
    area.classList.add('fp-active');
    placeBadge(area);
    area.closest('.fp-stage').classList.add('fp-on');
    btn.setAttribute('aria-pressed', 'true');
    current = { btn: btn, area: area };
    area.closest('.fp-stage').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }
  document.querySelectorAll('.fp-btn[data-target]').forEach(function (btn) {
    btn.setAttribute('aria-pressed', 'false');
    var area = document.querySelector('.fp-area[data-focus="' + btn.getAttribute('data-target') + '"]');
    if (area) { area.setAttribute('aria-hidden', 'true'); }
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.fp-btn[data-target]');
    if (!btn) return;
    if (current && current.btn === btn) { clear(); btn.focus(); } else { show(btn); }
  });
  window.addEventListener('resize', function () { if (current) placeBadge(current.area); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) { var b = current.btn; clear(); b.focus({ preventScroll: true }); }
  });
})();
