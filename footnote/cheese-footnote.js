document.addEventListener('DOMContentLoaded', function () {
    var refs = document.querySelectorAll('.cheese-footnote-ref');
    if (!refs.length) return;

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

    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    var enableTooltip = hasHover && !touchMode;

    /* 툴팁 요소 (PC용) */
    var tooltip = null;
    if (enableTooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'cheese-footnote-tooltip';
      document.body.appendChild(tooltip);
    }
    
    // [PC Fix] 툴팁이 바로 사라지지 않게 하기 위한 타이머 변수
    var hideTimeout = null;

    /* ───── 각 주석 번호 처리 ───── */
    refs.forEach(function (ref) {
      var id   = ref.getAttribute('data-footnote-id');
      var note = document.getElementById(id);
      if (!note) return;

      /* 터치 환경에서는 href를 제거해서 자동 스크롤 자체를 막기 */
      if (touchMode) {
        var anchorHref = ref.getAttribute('href');
        if (anchorHref) {
          ref.setAttribute('data-anchor', anchorHref);
          ref.removeAttribute('href'); // 앵커 기능 제거 (점프 방지 핵심)
        }
      }

      // ----- PC : hover 툴팁 -----
      if (enableTooltip && tooltip) {
        
        // 툴팁 보여주기 함수
        function showTooltipFunc() {
          // 숨김 타이머가 돌고 있다면 취소 (박스로 마우스 이동 시 꺼짐 방지)
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }

          tooltip.innerHTML = note.innerHTML;
          
          // 위치 계산
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

        // 툴팁 숨기기 함수 (지연 실행)
        function hideTooltipFunc() {
          hideTimeout = setTimeout(function() {
            tooltip.classList.remove('is-open');
          }, 300); // 0.3초 딜레이 (이 사이에 박스로 들어가면 안 꺼짐)
        }

        // 이벤트 연결
        ref.addEventListener('mouseenter', showTooltipFunc);
        ref.addEventListener('mouseleave', hideTooltipFunc);

        // 툴팁 박스 자체에 마우스가 올라갔을 때 꺼짐 방지
        tooltip.addEventListener('mouseenter', function() {
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        });
        
        // 툴팁 박스에서 나갈 때 숨기기
        tooltip.addEventListener('mouseleave', hideTooltipFunc);
      }

      // ----- 공통: 클릭 처리 -----
      ref.addEventListener('click', function (e) {
        if (touchMode) {
          // 모바일/터치 환경 → 아래로 점프 막고 모달 오픈
          e.preventDefault();
          e.stopPropagation();
          openModal(note.innerHTML);
          return false; // 추가 점프 방지
        }
        // PC에서는 href="#fn1" 기본 동작 유지 (점프)
      });
    });
  });
