# -*- coding: utf-8 -*-
"""두 도엽 SVG를 페이지 틀에 끼워 넣어 아티팩트용 HTML을 만든다."""
import io

SHEETS = [
    dict(no="SHEET 1", file="pyongyang-wide-inner.svg",
         title="평양직할시 구역도",
         desc="순안구역부터 강동군까지 21개 구역·군의 경계와 이름, 그리고 순안국제공항. "
              "붉은 점선이 다음 세 장이 각각 확대하는 범위입니다. 80 × 60 km, 1 px ≈ 40 m."),
    dict(no="SHEET 2", file="pyongyang-map-inner.svg",
         title="시가지 전역",
         desc="만경대에서 대성산까지, 대동강과 보통강이 만드는 도시의 뼈대. 21.6 × 18.8 km, 1 px ≈ 10.2 m. "
              "용성관저·대성산 혁명열사릉처럼 외곽에 있는 곳은 이 장에서 찾으세요."),
    dict(no="SHEET 3", file="pyongyang-core-inner.svg",
         title="중심부 상세",
         desc="노동당 중앙위원회·김일성광장·모란봉·능라도가 들어가는 중심 11.7 × 10.0 km. "
              "축척이 두 배 가까워(1 px ≈ 5.6 m) 이면도로와 골목까지 읽힙니다."),
    dict(no="SHEET 4", file="pyongyang-power-inner.svg",
         title="중구역 당·정 청사",
         desc="당·정 기관 24곳이 1.4 km 남짓한 네모 안에 몰려 있어 앞의 장에서는 이름표가 겹칩니다. "
              "그 구역만 1 px ≈ 1.7 m로 크게 뜨고, 이름 붙은 건물의 실제 외곽선을 그렸습니다."),
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

tpl = io.open("page_template.html", encoding="utf-8").read()
blocks = []
for s in SHEETS:
    svg = io.open(s["file"], encoding="utf-8").read()
    blocks.append(BLOCK.format(title=s["title"], desc=s["desc"], no=s["no"], svg=svg))
out = tpl.replace("<!--SHEETS-->", "\n".join(blocks))
io.open("pyongyang-sheets.html", "w", encoding="utf-8").write(out)
print("pyongyang-sheets.html  %.2f MB" % (len(out.encode("utf-8")) / 1024 / 1024))
