document.addEventListener('DOMContentLoaded', function () {

    // [추가] 0. 나무위키 스타일 링크 자동 감지 (요청하신 기능 유지)
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

    var refs = document.querySelectorAll('.cheese-footnote-ref');
    var internalLinks = document.querySelectorAll('.namu-internal');
    if (!refs.length && !internalLinks.length) return;

    // 터치/모바일 환경 판별 함수
    function isTouchLike() {
      return (
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || 
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      );
    }

    var touchMode = isTouchLike();

    /* ───── 공통: 모바일 모달 요소 만들기 ───── */
    var modal = document.createElement('div');
    modal.className = 'cheese-footnote-modal';
    modal.innerHTML =
      '<div class="cheese-footnote-modal-inner">' +
        '<div class="cheese-footnote-modal-body"></div>' +
        '<button type="button" class="cheese-footnote-modal-close">닫기</button>' +
      '</div>';
    document.body.appendChild(modal);

    var modalBody  = modal.querySelector('.cheese-footnote-modal-body');
    var modalClose = modal.querySelector('.cheese-footnote-modal-close');

    // 모달 열기 전 스크롤 위치
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
      modalBody.innerHTML = html;
      modalBody.scrollTop = 0; 
      modal.classList.add('is-open');
      cheeseLockScroll();      
    }
    function closeModal() {
      modal.classList.remove('is-open');
      cheeseUnlockScroll();    
    }

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();   
    });

    // 데스크톱에서 hover 지원 여부 (툴팁용)
    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    var enableTooltip = hasHover && !touchMode;
    
    // [PC 수정] 툴팁 제어용 타이머 변수 추가
    var hideTimeout = null;

    /* ───── 각 주석 번호 처리 ───── */
    refs.forEach(function (ref) {
      // ID 및 내용 찾기 로직
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

      /* [모바일 수정] href 속성을 제거하여 강제 스크롤 점프 방지 */
        if (touchMode) {
          var anchorHref = ref.getAttribute('href'); 
          if (anchorHref) {
            ref.setAttribute('data-anchor', anchorHref); 
            ref.removeAttribute('href'); // ★ 핵심: 링크 속성 제거
          }
        }

      // ----- PC : hover 툴팁 -----
      if (enableTooltip) {
        // 툴팁 요소가 없으면 생성 (최초 1회)
        var tooltip = document.querySelector('.cheese-footnote-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'cheese-footnote-tooltip';
            document.body.appendChild(tooltip);

            // ★ [PC 핵심] 툴팁 박스 위에 마우스가 올라가면 끄기 취소
            tooltip.addEventListener('mouseenter', function() {
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            });
            // 툴팁 박스에서 나가면 끄기
            tooltip.addEventListener('mouseleave', function() {
                 hideTooltip();
            });
        }

        function showTooltip(htmlContent) {
          // 꺼짐 대기 중이었다면 취소
          if (hideTimeout) {
              clearTimeout(hideTimeout);
              hideTimeout = null;
          }

          tooltip.innerHTML = htmlContent;
          
          var rect = ref.getBoundingClientRect();
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

        function hideTooltip() {
          // ★ [PC 핵심] 바로 끄지 않고 0.5초 대기 (이동 시간 확보)
          hideTimeout = setTimeout(function() {
              tooltip.classList.remove('is-open');
          }, 500);
        }

        // ref 위에 올리면 보이기
        ref.addEventListener('mouseenter', function() { showTooltip(content); });

        // ref에서 나갈 때 끄기 (지연 적용됨)
        ref.addEventListener('mouseleave', hideTooltip);
      }

      // ----- 공통: 클릭 처리 -----
      ref.addEventListener('click', function (e) {
        if (touchMode) {
          // 모바일/터치 환경 → 모달 오픈
          e.preventDefault();
          e.stopPropagation();
          openModal(content);
          return false; // 더블 체크
        }
        // PC에서는 기본 동작 유지 (점프)
      });
    });

    // [추가] 내부 링크(파란글씨) 툴팁 처리 (동일한 툴팁 로직 사용)
    if(enableTooltip) {
        var tooltip = document.querySelector('.cheese-footnote-tooltip'); // 위에서 생성된 툴팁 재사용
        internalLinks.forEach(function(link) {
            link.addEventListener('mouseenter', function() {
                let title = link.getAttribute('title') || link.getAttribute('data-tooltip-text');
                if(title && tooltip) {
                     // 툴팁 내용 설정 및 표시 (위치 계산 로직 재사용을 위해 간소화된 showTooltip 호출 필요)
                     // 내부 링크는 위치가 제각각이므로 위치 계산을 다시 해야 함
                     if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
                     tooltip.innerHTML = '<span class="cheese-tooltip-title">📄 ' + title + '</span>';
                     
                     var rect = link.getBoundingClientRect();
                     var scrollY = window.pageYOffset || document.documentElement.scrollTop;
                     var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
                     
                     tooltip.style.display = 'block';
                     var ttWidth = tooltip.offsetWidth;
                     var top = rect.bottom + scrollY + 8; // 링크는 아래에 표시
                     var left = rect.left + scrollX;
                     
                     if(left + ttWidth > window.innerWidth) left = window.innerWidth - ttWidth - 20;
                     tooltip.style.top = top + 'px';
                     tooltip.style.left = left + 'px';
                     tooltip.classList.add('is-open');
                }
            });
            link.addEventListener('mouseleave', function() {
                if(tooltip) {
                    hideTimeout = setTimeout(function() { tooltip.classList.remove('is-open'); }, 500);
                }
            });
        });
    }
});
