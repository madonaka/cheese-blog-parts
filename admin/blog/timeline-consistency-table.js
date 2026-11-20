/* admin/blog/timeline-consistency-table.js — 「자료 맞춰보기」 표 보기. 사건 한 줄에 포스터·워크북·1년연표·치즈위키 칸을 두고,
   그 자료에 들어 있으면 적힌 날짜를, 날짜나 내용이 다르면 빨강, 없으면 회색 「없음」을 보인다. 줄을 누르면 카드 상세가 열린다(data-i). */
(function () {
  'use strict';

  var COLS = [
    { key: 'poster', label: '포스터' },
    { key: 'workbook', label: '워크북' },
    { key: 'year', label: '1년연표' },
    { key: 'db', label: '치즈위키' }
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function md(e) { return e.m + (e.d ? '.' + e.d : '월'); }

  /* list: [{g, i}] 또는 직접 추가 줄 [{row, id, y, m, d, status}]. h: TC_VIEW 도우미(odd, contentOf, toneOf, manualTone), er: TC_ERRATA */
  function render(box, list, h, er) {
    if (!box) return;
    if (!list.length) { box.innerHTML = '<div class="tc-empty">해당하는 사건이 없어요.</div>'; return; }
    var lastY = null, rows = '';
    list.forEach(function (x) {
      if (x.y !== lastY) { rows += '<tr class="tc-tr-year"><th colspan="7">' + x.y + '년</th></tr>'; lastY = x.y; }
      if (!x.g) {
        var st0 = x.status;
        rows += '<tr class="tc-tr manual t-' + h.manualTone(x) + '" data-manual="' + esc(x.id) + '"><td class="tc-td-date">' + esc(x.m + (x.d ? '.' + x.d : '월')) + '</td>' +
          '<td class="tc-td-name">' + esc(x.row.event) + ' <small class="tc-manual-tag">직접 추가</small></td>' +
          '<td class="tc-td-src" colspan="4">' + esc([x.row.before, x.row.after].filter(Boolean).join(' → ')) + '</td>' +
          '<td class="tc-td-st" data-l="처리">' + (st0 && st0 !== 'check' ? '<i class="tc-st s-' + st0 + '">' + esc(er.labelOf(st0)) + '</i>' : '<span class="tc-dash">확인 필요</span>') + '</td></tr>';
        return;
      }
      var g = x.g;
      var cells = COLS.map(function (c) {
        var e = g[c.key];
        if (!e) return '<td class="tc-td-src none" data-l="' + c.label + '"><span>없음</span></td>';
        var badDate = h.odd(g, c.key), badText = h.contentOf(g, c.key) === 'diff';
        return '<td class="tc-td-src' + (badDate || badText ? ' bad' : ' ok') + '" data-l="' + c.label + '"><span>' + esc(md(e)) + '</span>' +
          (badText ? '<small>내용 다름</small>' : '') + '</td>';
      }).join('');
      var st = er ? er.statusOfGroup(g) : '';
      rows += '<tr class="tc-tr v-' + g.verdict + ' t-' + h.toneOf(g) + '" data-i="' + x.i + '"><td class="tc-td-date">' + esc(md(g)) + '</td>' +
        '<td class="tc-td-name">' + esc(g.name) + '</td>' + cells +
        '<td class="tc-td-st" data-l="처리">' + (st ? (st === 'check' ? '<span class="tc-dash">확인 필요</span>' : '<i class="tc-st s-' + st + '">' + esc(er.labelOf(st)) + '</i>') : '') + '</td></tr>';
    });
    box.innerHTML = '<div class="tc-table-wrap"><table class="tc-list"><thead><tr><th>날짜</th><th>사건</th>' +
      COLS.map(function (c) { return '<th>' + c.label + '</th>'; }).join('') + '<th>처리 상태</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  window.TC_TABLE = { render: render, COLS: COLS };
})();
