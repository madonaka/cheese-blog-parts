document.addEventListener('DOMContentLoaded', function () {
    // -----------------------------------------------------------
    // 1. 링크 자동 감지 및 스타일 적용 (나무위키 스타일)
    // -----------------------------------------------------------
    const myHost = window.location.hostname; // 내 블로그 도메인
    const postBody = document.querySelector('.post-body'); // 본문 영역
    const footnotes = document.querySelector('.cheese-footnotes'); // 주석 영역

    // 본문과 주석 영역 내의 모든 a 태그 수집
    let allLinks = [];
    if(postBody) allLinks = allLinks.concat(Array.from(postBody.getElementsByTagName('a')));
    if(footnotes) allLinks = allLinks.concat(Array.from(footnotes.getElementsByTagName('a')));

    allLinks.forEach(a => {
        // 주석 번호(*1)나 이미지가 포함된 링크는 제외
        if(a.classList.contains('cheese-footnote-ref') || a.querySelector('img')) return;
        
        const href = a.getAttribute('href');
        if(!href || href.startsWith('#') || href.startsWith('javascript')) return;

        // 외부 링크 판별 (http로 시작하고, 내 도메인이 아님)
        if(href.startsWith('http') && !href.includes(myHost)) {
            a.classList.add('namu-external');
            a.target = "_blank"; // 새 창 열기
        } 
        // 내부 링크 판별
        else {
            a.classList.add('namu-internal');
            // title 속성이 없으면 텍스트를 title로 설정 (툴팁용)
            if(!a.getAttribute('title') && a.textContent.trim()) {
                a.setAttribute('data-tooltip-text', a.textContent.trim());
            }
        }
    });

    // -----------------------------------------------------------
    // 2. 주석 및 툴팁 시스템 시작
    // -----------------------------------------------------------
    var refs = document.querySelectorAll('.cheese-footnote-ref');
    var internalLinks = document.querySelectorAll('.namu-internal'); // 내부 링크도 툴팁 대상
    
    function isTouchLike() {
      return (
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    }
    var touchMode = isTouchLike();
    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    var enableTooltip = hasHover && !touchMode;

    // 모달 생성
    var modal = document.createElement('div');
    modal.className = 'cheese-footnote-modal';
    modal.innerHTML = '<div class="cheese-footnote-modal-inner"><div class="cheese-footnote-modal-body"></div><button class="cheese-footnote-modal-close">닫기</button></div>';
    document.body.appendChild(modal);

    var mBody = modal.querySelector('.cheese-footnote-modal-body');
    var mClose = modal.querySelector('.cheese-footnote-modal-close');
    
    const closeModal = () => modal.classList.remove('is-open');
    mClose.onclick = closeModal;
    modal.onclick = (e) => { if(e.target === modal) closeModal(); };

    // 툴팁 생성
    var tooltip = document.createElement('div');
    tooltip.className = 'cheese-footnote-tooltip';
    document.body.appendChild(tooltip);
    
    // [PC Fix] 툴팁 제어용 타이머 변수
    var tooltipTimeout = null;

    // -----------------------------------------------------------
    // [공통 함수] 툴팁 표시 로직 (PC용)
    // -----------------------------------------------------------
    function showTooltip(el, content) {
        // 숨김 타이머가 돌고 있다면 취소 (박스로 이동 중 꺼짐 방지)
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }

        if(!content) return;
        tooltip.innerHTML = content;
        
        // 위치 계산
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        tooltip.style.display = 'block';
        
        let top = rect.bottom + scrollTop + 8;
        let left = rect.left + scrollLeft;
        
        // 화면 오른쪽 넘어감 방지
        const ttWidth = tooltip.offsetWidth;
        if(left + ttWidth > window.innerWidth) {
            left = window.innerWidth - ttWidth - 20;
        }

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.classList.add('is-open');
    }

    function hideTooltip() {
        // 바로 끄지 않고 0.3초 딜레이를 줌
        tooltipTimeout = setTimeout(function() {
            tooltip.classList.remove('is-open');
        }, 300); 
    }

    // ★ [PC Fix 핵심] 툴팁 박스 자체에 마우스를 올렸을 때 꺼짐 방지
    tooltip.addEventListener('mouseenter', function() {
        if(tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }
    });
    // 툴팁 박스에서 마우스가 나가면 끄기
    tooltip.addEventListener('mouseleave', function() {
        hideTooltip(); 
    });


    // -----------------------------------------------------------
    // A. 주석(*1) 처리
    // -----------------------------------------------------------
    refs.forEach(function (ref) {
      var id = ref.getAttribute('data-footnote-id');
      if (!id) {
        var href = ref.getAttribute('href');
        if (href && href.startsWith('#')) id = href.substring(1);
      }
      var note = id ? document.getElementById(id) : null;
      var content = "";

      if (note) content = note.innerHTML;
      else {
        var raw = ref.getAttribute('data-note');
        if (raw) { try { content = decodeURIComponent(raw); } catch(e) { content = raw; } }
      }
      if (!content) return;

      // [모바일] 터치 환경: 클릭 시 모달 (점프 방지)
      if (touchMode) {
        // 핵심: href 속성을 제거하여 브라우저의 기본 앵커 이동 차단
        if(ref.hasAttribute('href')) {
            ref.setAttribute('data-anchor', ref.getAttribute('href'));
            ref.removeAttribute('href');
        }

        ref.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            mBody.innerHTML = content;
            modal.classList.add('is-open');
            return false;
        });
      } 
      // [PC] 호버 시 툴팁 (딜레이 적용)
      else if (enableTooltip) {
        ref.addEventListener('mouseenter', function() { showTooltip(ref, content); });
        ref.addEventListener('mouseleave', hideTooltip);
      }
    });

    // -----------------------------------------------------------
    // B. 내부 링크(파란글씨) 처리
    // -----------------------------------------------------------
    if(enableTooltip) {
        internalLinks.forEach(function(link) {
            link.addEventListener('mouseenter', function() {
                // 링크의 title 속성이나 data-tooltip-text를 가져옴
                let title = link.getAttribute('title') || link.getAttribute('data-tooltip-text');
                if(title) {
                    // 나무위키 스타일: 제목을 박스에 보여줌
                    let html = '<span class="cheese-tooltip-title">📄 ' + title + '</span>';
                    showTooltip(link, html);
                }
            });
            link.addEventListener('mouseleave', hideTooltip);
        });
    }

});
