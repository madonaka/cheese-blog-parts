# -*- coding: utf-8 -*-
"""문화어 표기 → 남한 표기.

OSM에 등록된 이름은 북한 표기(로동당·릉라도·려명거리)라 남한 독자에겐 낯설다.
세 단계로 옮긴다.

1) 고유명사·외국 국명은 표로 바꾸고, 바꾼 자리는 잠가 둔다
   (루마니아가 두음법칙에 걸려 '누마니아'가 되면 안 되니까)
2) 형태소 경계에서 두음법칙이 적용되는 복합어를 표로 바꾼다
   (혁명렬사릉 → 혁명열사릉, 조선중앙력사박물관 → 조선중앙역사박물관)
3) 나머지는 어절 첫 음절에만 두음법칙을 적용한다
   — 청류대·옥류관·천리마처럼 형태소 안쪽 ㄹ은 남한도 그대로 쓴다
"""
import re

# ── 1) 외국 국명·고유명사 ────────────────────────────────────────
PROPER = {
    "로씨야": "러시아", "도이칠란트": "독일", "스웨리예": "스웨덴",
    "인디아": "인도", "윁남": "베트남", "꾸바": "쿠바", "뽈스까": "폴란드",
    "에짚트": "이집트", "체스코": "체코", "벌가리아": "불가리아",
    "몽골국": "몽골", "로므니아": "루마니아", "말라이시아": "말레이시아",
    "파키스딴": "파키스탄", "캄보쟈": "캄보디아", "수리아": "시리아",
    "나이제리아": "나이지리아", "팔레스티나": "팔레스타인",
    "룽나로터리": "능라로터리",
}

# ── 2) 복합어 안쪽에서 두음법칙이 적용되는 자리 ──────────────────
COMPOUND = [
    ("렬사", "열사"), ("력사", "역사"), ("련습", "연습"), ("려관", "여관"),
    ("로동", "노동"), ("녀성", "여성"), ("년맹", "연맹"), ("력포", "역포"),
    ("쎈터", "센터"), ("쌘터", "센터"), ("료리", "요리"), ("랭면", "냉면"),
]

_LOCK = ""          # 사용자 영역 — 실제 이름에 나올 리 없다
_BASE, _CHO, _JUNG, _JONG = 0xAC00, 19, 21, 28
_R, _N, _NG = 5, 2, 11                       # 초성 ㄹ · ㄴ · ㅇ
_TO_NG_AFTER_R = {2, 6, 7, 12, 17, 20}       # ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
_TO_NG_AFTER_N = {2, 6, 12, 17, 20}          # ㅑ ㅕ ㅛ ㅠ ㅣ


def _initial_law(ch):
    """음절 하나에 두음법칙을 적용한다."""
    o = ord(ch) - _BASE
    if not 0 <= o < _CHO * _JUNG * _JONG:
        return ch
    cho, rest = divmod(o, _JUNG * _JONG)
    jung, jong = divmod(rest, _JONG)
    if cho == _R:
        cho = _NG if jung in _TO_NG_AFTER_R else _N
    elif cho == _N and jung in _TO_NG_AFTER_N:
        cho = _NG
    else:
        return ch
    return chr(_BASE + (cho * _JUNG + jung) * _JONG + jong)


def to_sk(s):
    if not s:
        return s
    locked = []

    def lock(text):
        locked.append(text)
        return "%s%d%s" % (_LOCK, len(locked) - 1, _LOCK)

    for nk, sk in sorted(PROPER.items(), key=lambda kv: -len(kv[0])):
        if nk in s:
            s = s.replace(nk, lock(sk))
    for nk, sk in COMPOUND:
        if nk in s:
            s = s.replace(nk, lock(sk))

    # 어절 첫 음절에만 적용 (숫자·기호로 시작하면 그 다음 한글 음절)
    out, at_start = [], True
    for ch in s:
        if ch in " \t·":
            at_start = True
            out.append(ch)
            continue
        if ch == _LOCK:
            at_start = False
            out.append(ch)
            continue
        if at_start and "가" <= ch <= "힣":
            out.append(_initial_law(ch))
            at_start = False
        else:
            out.append(ch)
            if "가" <= ch <= "힣" or ch.isalnum():
                at_start = False
    s = "".join(out)

    return re.sub(_LOCK + r"(\d+)" + _LOCK, lambda m: locked[int(m.group(1))], s)
