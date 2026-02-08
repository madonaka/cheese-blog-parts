document.addEventListener('DOMContentLoaded', function () {
    // -----------------------------------------------------------
    // [추가 기능] 1. 나무위키 스타일 링크 자동 감지
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
        } else {
            a.classList.add('namu-internal');
            if(!a.getAttribute('title') && a.textContent.trim()) {
                a.setAttribute('data-tooltip-text', a.textContent.trim());
            }
        }
    });

    // -----------------------------------------------------------
    // 2. 주석 및 툴팁 시스템
    // -----------------------------------------------------------
    var refs = document.querySelectorAll('.cheese-footnote-ref');
    var internalLinks = document.querySelectorAll('.namu-internal');
    
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

    /* 모바일 모달 생성 */
    var modal = document.createElement('div');
    modal.className = 'cheese-footnote-modal';
    modal.innerHTML = '<div class="cheese-footnote-modal-inner"><div class="cheese-footnote-modal-body"></div><button type="button" class="cheese-footnote-modal-close">닫기</button></div>';
    document.body.appendChild(modal);

    var mBody = modal.querySelector('.cheese-footnote-modal-body');
    var mClose = modal.querySelector('.cheese-footnote-modal-close');
    var cheeseScrollYBeforeModal = 0;

    function cheeseLockScroll() {
      cheeseScrollYBeforeModal = window.pageYOffset || document.documentElement.scrollTop || 0;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }
    function cheeseUnlockScroll() {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      window.scrollTo(0, cheeseScrollYBeforeModal || 0);
    }
    function openModal(html) {
      mBody.innerHTML = html;
      mBody.scrollTop = 0; 
      modal.classList.add('is-open');
      cheeseLockScroll();      
    }
    function closeModal() {
      modal.classList.remove('is-open');
      cheeseUnlockScroll();    
    }
    mClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    /* PC 툴팁 생성 (단일 객체 재사용) */
    var tooltip = document.createElement('div');
    tooltip.className = 'cheese-footnote-tooltip';
    document.body.appendChild(tooltip);
    
    var hideTimeout = null; // 타이머 변수

    // 툴팁 표시 함수
    function showTooltip(el, content) {
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } // 끄기 취소
        if (!content) return;

        tooltip.innerHTML = content;
        var rect = el.getBoundingClientRect();
        var scrollY = window.pageYOffset || document.documentElement.scrollTop;
        var scrollX = window.pageXOffset || document.documentElement.scrollLeft;

        tooltip.style.display = 'block'; 
        var ttWidth  = tooltip.offsetWidth;
        var ttHeight = tooltip.offsetHeight;
        tooltip.style.display = '';

        var top  = rect.top + scrollY - ttHeight - 8;
        var left = rect.left + scrollX;
        var maxLeft = scrollX + document.documentElement.clientWidth - ttWidth - 10;
        
        if (left > maxLeft) left = maxLeft;
        if (left < scrollX + 10) left = scrollX + 10;
        if (top < scrollY + 10) top = rect.bottom + scrollY + 8;

        tooltip.style.top  = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.classList.add('is-open');
    }

    // 툴팁 숨기기 함수 (0.5초 지연)
    function hideTooltip() {
        hideTimeout = setTimeout(function() {
            tooltip.classList.remove('is-open');
        }, 500);
    }

    // ★ 툴팁 박스 위에 마우스 올리면 끄기 취소 (PC 핵심)
    tooltip.addEventListener('mouseenter', function() {
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
    });
    tooltip.addEventListener('mouseleave', hideTooltip);


    /* ───── 주석(*1) 처리 Loop ───── */
    refs.forEach(function (ref) {
      // 1. ID 연결
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

      // 2. 모바일 처리: 기존 코드 방식(removeAttribute) 복원 -> 점프 완벽 방지
      if (touchMode) {
          if (ref.hasAttribute('href')) {
            ref.setAttribute('data-anchor', ref.getAttribute('href')); // 백업
            ref.removeAttribute('href'); // ★ 핵심: 링크 속성 삭제
          }
          ref.addEventListener('click', function(e) {
            e.preventDefault();
            openModal(content);
          });
      } 
      // 3. PC 처리: 호버 (타이머 적용)
      else if (enableTooltip) {
          ref.addEventListener('mouseenter', function() { showTooltip(ref, content); });
          ref.addEventListener('mouseleave', hideTooltip);
      }
    });

    /* ───── 내부 링크(파란글씨) 처리 Loop ───── */
    if(enableTooltip) {
        internalLinks.forEach(function(link) {
            link.addEventListener('mouseenter', function() {
                let title = link.getAttribute('title') || link.getAttribute('data-tooltip-text');
                if(title) {
                    showTooltip(link, '<span class="cheese-tooltip-title">📄 ' + title + '</span>');
                }
            });
            link.addEventListener('mouseleave', hideTooltip);
        });
    }
});
