# -*- coding: utf-8 -*-
"""1920년대 경성 — 도엽 세 장.

축척은 HANDOFF §1 대로 3배씩 벌렸다.
  광역   1px ≈ 13.5 m   경성부와 그 바깥(고양군), 한강, 철도
  시가지 1px ≈  4.4 m   경성부 전역. 용산까지
  중심부 1px ≈  2.0 m   사대문 안. 종로·본정·황금정이 읽히는 축척
"""
import os

VIEWS = {
    "wide": dict(
        lat0=37.435, lat1=37.650, lon0=126.830, lon1=127.120, w_in=1900.0,
        title="경성부와 그 근교",
        sub="KEIJŌ AND ENVIRONS &#183; c.1925",
        file="gyeongseong-1-wide",
        road_w={"a": 6.4, "b": 4.4, "c": 2.9, "d": 1.9, "e": 1.0}, minor_w=0.0,
        dist_fs=19, tier1_fs=13.5, tier2_fs=11.8, roads_first=False,
        show_tier3=False, show_minor=False, show_dong=False, show_zone=False,
        index_of=("city", "core"),
    ),
    # ── 아래 세 장의 도엽 범위와 선 굵기는 평양판을 실측해 맞춘 것이다 ──
    # 평양판이 또렷했던 까닭 둘: ① 도엽이 넉넉해 뼈대가 한눈에 들어오고
    # ② 도로를 실제보다 훨씬 굵게 과장해 그렸다(간선 실폭 89 m로 그림).
    # 처음 경성판은 도엽이 2.7배 좁고 도로가 절반 굵기라 허전하게 읽혔다.
    "city": dict(
        lat0=37.500, lat1=37.620, lon0=126.900, lon1=127.070, w_in=2120.0,
        title="경성부 시가도",
        sub="KEIJŌ CITY &#183; c.1925",
        file="gyeongseong-2-city",
        # 실폭 a 121 / b 85 / c 56 / d 37 / 이면 18 m  (평양 city 와 같은 값)
        road_w={"a": 17.1, "b": 11.9, "c": 7.9, "d": 5.2, "e": 2.6}, minor_w=0.0,
        dist_fs=23, tier1_fs=14.0, tier2_fs=11.9, roads_first=False,
        show_tier3=False, show_minor=False, show_dong=True, show_zone=True,
        index_of=("core", "namchon"),
    ),
    "core": dict(
        lat0=37.5400, lat1=37.6000, lon0=126.9500, lon1=127.0300, w_in=2100.0,
        title="경성 중심부 상세도",
        sub="CENTRAL KEIJŌ &#183; DETAIL &#183; c.1925",
        file="gyeongseong-3-core",
        # 실폭 a 89 / b 64 / c 42 / d 28 / 이면 13 m  (평양 core 와 같은 값)
        road_w={"a": 26.5, "b": 19.0, "c": 12.6, "d": 8.3, "e": 4.0}, minor_w=4.0,
        dist_fs=27, tier1_fs=15.0, tier2_fs=12.6, roads_first=True,
        show_tier3=True, show_minor=False, show_dong=True, show_zone=True,
        index_of=("namchon",),
    ),
    # 관청·은행·백화점이 반경 700 m 안에 몰려 있어 앞 장에서는 이름표가 겹친다.
    # 평양판의 '당·정 청사도'에 해당하는 장. 축척도 그것과 같게 맞췄다.
    "namchon": dict(
        lat0=37.5500, lat1=37.5780, lon0=126.9680, lon1=127.0050, w_in=1900.0,
        title="본정 · 황금정 일대 상세도",
        sub="NAMCHON &#183; THE JAPANESE QUARTER &#183; c.1925",
        file="gyeongseong-4-namchon",
        # 실폭 a 52 / b 38 / c 26 / d 17 / 이면 9 m  (평양 power 와 같은 값)
        road_w={"a": 30.2, "b": 22.2, "c": 15.1, "d": 10.1, "e": 5.0}, minor_w=5.0,
        dist_fs=30, tier1_fs=15.0, tier2_fs=12.8, roads_first=False,
        show_tier3=True, show_minor=False, show_dong=True, show_zone=True,
        index_of=(),
    ),
}
for _v in VIEWS.values():
    _v.setdefault("show_buildings", False)
    _v.setdefault("keep_unnamed_tertiary", False)
    _v.setdefault("show_wall", True)     # 궁장만 남았다. 도성선은 이 판에서 뺐다
    _v.setdefault("show_zone", False)

V = VIEWS[os.environ.get("PYMAP_VIEW", "core")]

# ── 표기 시점 ─────────────────────────────────────────────────
# era = 1920  : 1920년대 당시 지명(본정·황금정·태평통)  ← 이번 판의 선택
# era = now   : 현재 지명(충무로·을지로·태평로)
# HANDOFF §7 : 옛 지명과 현재 지명을 섞지 말고 어느 시점 표기인지 범례에 못 박을 것.
ERA = os.environ.get("PYMAP_ERA", "1920")

# ── 범주별 색 ─────────────────────────────────────────────────
# 크림 바탕에서 한 식구로 읽히게 채도를 낮춘다 (HANDOFF §3-③)
CAT = {
    "gov":     ("#9c3226", "관청 &#183; 총독부 기관"),
    "palace":  ("#7a4b86", "궁궐 &#183; 종묘 &#183; 성문"),
    "finance": ("#2f7fa8", "은행 &#183; 회사"),
    "market":  ("#1b3a6b", "시장 &#183; 백화점 &#183; 상점가"),
    "culture": ("#1a6156", "극장 &#183; 신문사 &#183; 종교"),
    "school":  ("#6d5326", "학교 &#183; 병원"),
    "rail":    ("#4a4741", "정거장 &#183; 철도"),
    "japan":   ("#8a6d1f", "신사 &#183; 일본군 용지"),
}
CAT_ORDER = ["gov", "palace", "finance", "market", "culture", "school", "rail", "japan"]

# ── 근거 등급 ─────────────────────────────────────────────────
# high  : 현존 건물 / 터 표석 / 실측 유구 — 실선·꽉 찬 기호
# medium: 현 지명 대응 등 블록 수준까지 특정 — 실선·꽉 찬 기호
# low   : "○○ 부근" 수준 — 기호를 비우고 이름 끝에 · 를 붙여 추정임을 드러낸다
#         (HANDOFF §7: 근거가 없으면 '추정'으로 명시하거나 빼라)
EST_MARK = "·"
