# -*- coding: utf-8 -*-
"""두 장의 지도 — 전역 골격 / 중심부 상세."""
import os

VIEWS = {
    # 전국 — 관저·특각·초대소가 어디에 흩어져 있는지 한 장으로
    "nation": dict(
        lat0=37.60, lat1=43.10, lon0=124.10, lon1=130.80, w_in=1560.0,
        title="조선민주주의인민공화국 관저·특각도",
        sub="LEADERSHIP RESIDENCES &#183; NATIONWIDE",
        file="pyongyang-residences",
        keep_unnamed_tertiary=False,
        road_w={"a": 1.6, "b": 1.1, "c": 0.8, "d": 0.6}, minor_w=0.0,
        dist_fs=15, tier1_fs=12.0, tier2_fs=11.0, roads_first=False,
    ),
    # 평양직할시 전체 — 구역·군 경계와 이름, 순안공항. 도엽 색인 노릇도 한다.
    "wide": dict(
        lat0=38.780, lat1=39.320, lon0=125.500, lon1=126.420, w_in=2000.0,
        title="평양직할시 구역도",
        sub="PYONGYANG MUNICIPALITY &#183; DISTRICTS",
        file="pyongyang-wide",
        keep_unnamed_tertiary=False,
        road_w={"a": 5.0, "b": 3.2, "c": 2.0, "d": 1.4}, minor_w=0.0,
        dist_fs=17, tier1_fs=13.0, tier2_fs=11.5, roads_first=False,
    ),
    "city": dict(
        lat0=38.955, lat1=39.125, lon0=125.630, lon1=125.880, w_in=2120.0,
        title="평양시 도로 및 주요 시설 안내도",
        sub="PYONGYANG CITY &#183; ROADS AND LANDMARKS",
        file="pyongyang-map",
        keep_unnamed_tertiary=False,
        road_w={"a": 11.9, "b": 8.3, "c": 5.5, "d": 3.6}, minor_w=1.8,
        dist_fs=23, tier1_fs=14.0, tier2_fs=11.9, roads_first=False,
    ),
    "core": dict(
        lat0=38.982, lat1=39.072, lon0=125.685, lon1=125.820, w_in=2100.0,
        title="평양 중심부 상세도",
        sub="CENTRAL PYONGYANG &#183; DETAIL",
        file="pyongyang-core",
        keep_unnamed_tertiary=True,
        road_w={"a": 16.0, "b": 11.5, "c": 7.6, "d": 5.0}, minor_w=2.4,
        dist_fs=27, tier1_fs=15.0, tier2_fs=12.6, roads_first=True, show_restricted=True,
    ),
    # 당·정 청사가 반경 700 m 안에 24곳 몰려 있다. 그 구역만 크게 뜬 도엽.
    "power": dict(
        lat0=39.007, lat1=39.031, lon0=125.730, lon1=125.766, w_in=1800.0,
        title="평양 중구역 당·정 청사도",
        sub="PARTY AND STATE INSTITUTIONS &#183; CENTRAL DISTRICT",
        file="pyongyang-power",
        keep_unnamed_tertiary=True, show_buildings=True, show_tier3=True, show_restricted=True,
        road_w={"a": 30.0, "b": 22.0, "c": 15.0, "d": 10.0}, minor_w=5.0,
        dist_fs=30, tier1_fs=15.0, tier2_fs=12.8, roads_first=False,
    ),
}
for _v in VIEWS.values():
    _v.setdefault("show_buildings", False)
    _v.setdefault("show_tier3", False)
    _v.setdefault("show_restricted", False)

V = VIEWS[os.environ.get("PYMAP_VIEW", "city")]

# 표기: sk = 남한 표기(두음법칙 적용), nk = OSM 원문(문화어) 그대로
ORTHO = os.environ.get("PYMAP_ORTHO", "sk")
