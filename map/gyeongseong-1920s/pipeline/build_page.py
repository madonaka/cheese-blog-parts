# -*- coding: utf-8 -*-
"""도엽 4장을 확대·이동 되는 HTML 한 장으로 묶는다.

평양판 page_template.html 의 CSS 와 스크립트를 그대로 쓰고, 글만 경성판으로 갈아 끼운다.
"""
import io, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")

SHEETS = [
    dict(no="SHEET 1", file="gyeongseong-1-wide-inner.svg",
         title="경성부와 그 근교",
         desc="경성부와 그 바깥 고양군·시흥군, 한강과 철도망. 25.6 × 23.8 km, 1 px ≈ 13.5 m. "
              "붉은 점선이 다음 장들이 확대하는 범위입니다."),
    dict(no="SHEET 2", file="gyeongseong-2-city-inner.svg",
         title="경성부 시가도",
         desc="사대문 안에서 용산까지, 1914년 부제가 그은 경성부의 뼈대. 15.0 × 13.3 km, 1 px ≈ 7.1 m. "
              "서대문형무소·연희전문처럼 외곽에 있는 곳은 이 장에서 찾으세요."),
    dict(no="SHEET 3", file="gyeongseong-3-core-inner.svg",
         title="중심부 상세",
         desc="조선총독부·경성부청·종로·황금정이 들어가는 중심 7.1 × 6.6 km, 1 px ≈ 3.4 m. "
              "정(町)·동(洞) 이름 85개가 바탕 글씨로 깔립니다."),
    dict(no="SHEET 4", file="gyeongseong-4-namchon-inner.svg",
         title="본정 · 황금정 일대",
         desc="관청·은행·백화점이 1 km 남짓한 네모 안에 몰려 있어 앞 장에서는 이름표가 겹칩니다. "
              "그 구역만 1 px ≈ 1.7 m로 크게 뜬 장입니다. 시설 62곳."),
]

BLOCK = """  <section class="sheet">
    <div class="sheet-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div class="tools">
        <span class="sheet-no">{no}</span>
        <button type="button" data-act="out" aria-label="축소">&minus;</button>
        <span class="zoom" aria-live="polite">100%</span>
        <button type="button" data-act="in" aria-label="확대">+</button>
        <button type="button" data-act="fit">맞춤</button>
      </div>
    </div>
    <div class="stage">
      <div class="canvas">{svg}</div>
      <div class="hint">드래그로 이동 &middot; 휠로 확대 &middot; 두 번 눌러 맞춤</div>
    </div>
  </section>
"""

LEDE = """
      1922년 조선총독부 육지측량부 «경성도»를 기준으로 삼고, 1920년대에 있었다고
      확인되는 것만 골라 그린 지도입니다. 표기는 <b>1920년대 당시 지명</b>입니다 —
      본정·황금정·태평통, 현재 이름과 섞지 않았습니다.
      색은 <b>범주</b>입니다: 관청, 궁궐·성문, 은행·회사, 시장·백화점, 극장·종교,
      학교·병원, 정거장, 신사·일본군 용지.
"""

SPEC = """  <dl class="spec">
    <div><dt>기준 도판</dt><dd>«경성도» 1922 <span>조선총독부 육지측량부</span></dd></div>
    <div><dt>좌표</dt><dd>OpenStreetMap <span>ODbL &middot; 실측</span></dd></div>
    <div><dt>표기 시점</dt><dd>1920년대 <span>1914년 부제 이후</span></dd></div>
    <div><dt>도엽</dt><dd>4장 <span>SVG 벡터</span></dd></div>
  </dl>
"""

NOTES = """  <section class="notes">
    <div>
      <h3>좌표는 어디서 왔나</h3>
      <p>이 지도에서 <b>좌표가 생기는 통로는 하나뿐</b>입니다. 문헌 조사는 좌표를 만들지 않고
      “지금 지도에서 찾을 수 있는 이름”만 내놓습니다 — 문화역서울284, 한국은행 화폐박물관,
      돈의문터 표석 같은 것들. 그 이름을 OpenStreetMap에 물어 실측 좌표를 받습니다.
      못 찾으면 좌표가 없는 채로 남고, 렌더러가 알아서 안 그립니다.</p>
      <p>그래서 이 지도에는 <b>제가 찍은 좌표가 한 점도 없습니다</b>. 조선총독부는 경복궁 흥례문,
      경성부청은 서울도서관, 조선은행은 한국은행 화폐박물관(1912년 그 건물이 그대로 남았습니다)에
      걸려 있습니다.</p>
    </div>
    <div>
      <h3>읽는 법</h3>
      <p>선 굵기가 도로 등급입니다. 가장 굵은 것이 종로·태평통·황금정통 같은 간선이고,
      점선 사다리는 철도입니다. 옅은 실선은 궁장(궁궐 담)입니다.</p>
      <p><b>바탕에 깔린 두 색</b>이 남촌과 북촌입니다.
      <b style="color:#b09070">따뜻한 흙빛</b>이 일본식 정(町) 이름이 붙은 구역,
      <b style="color:#87a088">서늘한 풀빛</b>이 조선식 동(洞) 이름이 남은 구역입니다.
      1914년 개편 때 붙은 이름 자체가 근거고, 개천(청계천)을 경계로 갈리는 것이 보입니다.
      다만 <b>경계선은 현재 법정동 선</b>이라 1920년대의 실제 경계가 아닙니다 —
      그래서 테두리를 긋지 않고 면만 칠했습니다.</p>
      <p><b>색 박스</b>는 이름값이 큰 곳, <b>동그라미</b>는 나머지입니다.
      문(門) 기호는 성문, 도리이 기호는 신사입니다.
      이름 붙인 시설만 실제 건물 외곽선으로 칠했고, 일반 가옥은 그리지 않았습니다.</p>
    </div>
    <div>
      <h3>한계 — 빠진 것과 흐린 것</h3>
      <p><b>근거가 약한 것은 지도 위에서 티가 나게 했습니다.</b> 위치를 동(洞) 수준까지만
      좁힌 것은 <b>기호를 비우고 이름 끝에 가운뎃점</b>을 붙였습니다(미쓰코시 오복점·, 단성사·).
      전체 94곳 중 현존 건물에 건 것이 33곳, 터가 특정된 것이 29곳, 동 수준이 30곳입니다.</p>
      <p><b>도로는 뺄 것만 뺐습니다.</b> 처음엔 “1920년대에 있었다고 확인한 길만” 그렸는데
      길이 끊겨 떠 있고 굵기 위계도 안 읽혔습니다. 1922년 도판에 사대문 안 가로망이 조밀하게
      그려져 있으니 그 격자가 있었다는 것 자체가 근거라, 방식을 뒤집어
      <b>개통 연도가 확인되는 후대 도로만 뺐습니다</b> — 율곡로(1932), 삼일대로(1966),
      청계천로(복개 후), 소월로·소파로·다산로·동호로·녹사평대로 등 16개.</p>
      <p><b>본정통(충무로)이 약합니다.</b> 1922년 도판에서는 조선은행 앞에서 동남쪽으로 뻗는
      뚜렷한 길인데, 현재 OSM의 <code>충무로</code>가 887 m 남북 구간뿐이라 그 축을 다 덮지 못합니다.</p>
      <p><b>한양도성과 전차 노선은 뺐습니다.</b> 도성은 1907~15년에 헐린 서남쪽(돈의문~소의문~숭례문)
      구간의 실측 선형이 없어, 있는 만큼만 긋다 보니 반쪽짜리가 됐습니다. 헐린 두 문은 터 표석에
      걸어 표시만 남겼습니다.</p>
      <p><b>도판을 좌표로 맞춰 얹지는 않았습니다.</b> 지금은 도판을 놓고 눈으로 대조한 단계입니다.
      기준점을 잡아 실제로 겹치려면 한 단계가 더 필요합니다.</p>
      <p>정(町) 대응표 95개 중 삼판통·한강통·원정·청엽정 5개는 현재 법정동 폴리곤이 OSM에 없어
      이름이 안 붙었습니다.</p>
    </div>
  </section>
"""


def main():
    tpl = io.open(os.path.join(HERE, "page_template.html"), encoding="utf-8").read()
    tpl = tpl.replace("<title>평양 도로 안내도</title>",
                      "<title>1920년대 경성 안내도</title>")
    tpl = tpl.replace("<h1>평양 도로 안내도</h1>", "<h1>1920년대 경성</h1>")
    tpl = re.sub(r'<p class="lede">.*?</p>',
                 '<p class="lede">%s</p>' % LEDE, tpl, count=1, flags=re.S)
    tpl = re.sub(r'  <dl class="spec">.*?</dl>\n', SPEC, tpl, count=1, flags=re.S)
    tpl = re.sub(r'  <section class="notes">.*?</section>\n', NOTES, tpl, count=1, flags=re.S)

    blocks = []
    for s in SHEETS:
        p = os.path.join(OUT, s["file"])
        if not os.path.exists(p):
            print("없음, 건너뜀:", s["file"]); continue
        svg = io.open(p, encoding="utf-8").read()
        blocks.append(BLOCK.format(title=s["title"], desc=s["desc"], no=s["no"], svg=svg))
    out = tpl.replace("<!--SHEETS-->", "\n".join(blocks))

    dst = os.path.join(OUT, "gyeongseong-sheets.html")
    io.open(dst, "w", encoding="utf-8").write(out)
    print("%s  %.2f MB  (도엽 %d장)"
          % (os.path.basename(dst), len(out.encode("utf-8")) / 1024 / 1024, len(blocks)))


main()
