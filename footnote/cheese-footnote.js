document.addEventListener('DOMContentLoaded', function () {
    // -----------------------------------------------------------
    // 1. 링크 자동 감지 및 스타일 적용 (기존 코드 유지)
    // -----------------------------------------------------------
    const myHost = window.location.hostname;
    const postBody = document.querySelector('.post-body');
    const footnotes = document.querySelector('.cheese-footnotes');

    let allLinks = [];
    if(postBody) allLinks = allLinks.concat(Array.from(postBody.getElementsByTagName('a')));
    if(footnotes) allLinks = allLinks.concat(Array.from(footnotes.getElementsByTagName('a')));

    allLinks.forEach(a => {
        if(a.classList.contains('cheese-footnote-ref') || a.querySelector('img')) return;
        
        const href = a.getAttribute('href');
        if(!href || href.startsWith('#') || href.startsWith('javascript')) return;

        if(href.startsWith('http') && !href.includes(myHost)) {
            a.classList.add('namu-external');
            a.target = "_blank"; 
        } 
        else {
            a.classList.add('namu-internal');
            if(!a.getAttribute('title') && a.textContent.trim()) {
                a.setAttribute('data-tooltip-text', a.textContent.trim());
            }
        }
    });

    // -----------------------------------------------------------
    // 2. 주석 및 툴팁 시스템 시작
    // -----------------------------------------------------------
    var refs = document.querySelectorAll('.cheese-footnote-ref');
    var internalLinks = document.querySelectorAll('.namu-internal');
    
    // 터치/모바일 환경 판별
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

    // 모달 생성 (기존 코드 유지)
    var modal = document.createElement('div');
    modal.className = 'cheese-footnote-modal';
    modal.innerHTML = '<div class="cheese-footnote-modal-inner"><div class="cheese-footnote-modal-body"></div><button class="cheese-footnote-modal-close">닫기</button></div>';
    document.body.appendChild(modal);

    var mBody = modal.querySelector('.cheese-footnote-modal-body');
    var mClose = modal.querySelector('.cheese-footnote-modal-close');
    
    const closeModal = () => modal.classList.remove('is-open');
    mClose.onclick = closeModal;
    modal.onclick = (e) => { if(e.target === modal) closeModal(); };

    // 툴팁 생성 (기존 코드 유지)
    var tooltip = document.createElement('div');
    tooltip.className = 'cheese-footnote-tooltip';
    document.body.appendChild(tooltip);
    
    // ✅ [수정 1] PC용 타이머 변수 추가
    var tooltipTimeout = null;

    // -----------------------------------------------------------
    // [공통 함수] 툴팁 표시 로직 (PC용)
    // -----------------------------------------------------------
    function showTooltip(el, content) {
        // ✅ 툴팁이 꺼지려고 대기 중이었다면 취소 (마우스가 다시 돌아옴)
        if (tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }

        if(!content) return;
        tooltip.innerHTML = content;
        
        // 위치 계산 (기존 코드 유지)
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        tooltip.style.display = 'block';
        
        let top = rect.bottom + scrollTop + 8;
        let left = rect.left + scrollLeft;
        
        const ttWidth = tooltip.offsetWidth;
        if(left + ttWidth > window.innerWidth) {
            left = window.innerWidth - ttWidth - 20;
        }

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.classList.add('is-open');
    }

    function hideTooltip() {
        // ✅ [수정 2] 바로 끄지 않고 0.5초 딜레이 (이 사이에 박스로 이동 가능)
        tooltipTimeout = setTimeout(function() {
            tooltip.classList.remove('is-open');
        }, 500); 
    }

    // ✅ [수정 3] 툴팁 박스 자체에 마우스 올리면 안 꺼지게 설정
    tooltip.addEventListener('mouseenter', function() {
        if(tooltipTimeout) {
            clearTimeout(tooltipTimeout);
            tooltipTimeout = null;
        }
    });
    tooltip.addEventListener('mouseleave', function() {
        hideTooltip(); 
    });

    // -----------------------------------------------------------
    // A. 주석(*1) 처리
    // -----------------------------------------------------------
    refs.forEach(function (ref) {
      // ID 찾기 로직 (기존 유지)
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

      // 모바일: 터치 시 모달
      if (touchMode) {
        // ✅ [수정 4] 모바일 점프 방지 (href 속성 삭제 방식 복구)
        if(ref.hasAttribute('href')) {
            ref.setAttribute('data-anchor', ref.getAttribute('href'));
            ref.removeAttribute('href'); // 링크 기능 제거 -> 점프 안함
        }

        ref.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            mBody.innerHTML = content;
            modal.classList.add('is-open');
        });
      } 
      // PC: 호버 시 툴팁
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
                let title = link.getAttribute('title') || link.getAttribute('data-tooltip-text');
                if(title) {
                    let html = '<span class="cheese-tooltip-title">📄 ' + title + '</span>';
                    showTooltip(link, html);
                }
            });
            link.addEventListener('mouseleave', hideTooltip);
        });
    }

});
