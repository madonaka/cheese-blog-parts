// Cheese Footnote Tooltip (위키 스타일 주석 + 모바일 모달)
  document.addEventListener('DOMContentLoaded', function () {
    var refs = document.querySelectorAll('.cheese-footnote-ref');
    if (!refs.length) return;

    // 터치/모바일 환경 판별 함수
	// 터치/모바일 + 좁은 화면이면 모바일처럼 취급
	function isTouchLike() {
	  var realTouch =
	    ('ontouchstart' in window) ||
	    (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
	    (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
	
	  var narrowViewport = window.innerWidth <= 900; // 폭이 좁으면 모바일 취급
	
	  return realTouch || narrowViewport;
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
      cheeseScrollYBeforeModal =
        window.pageYOffset || document.documentElement.scrollTop || 0;

      // ✅ html/body 스크롤락
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }

    function cheeseUnlockScroll() {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';

      // 모달 열기 전 위치로 복귀
      window.scrollTo(0, cheeseScrollYBeforeModal || 0);
    }

    function openModal(html) {
      modalBody.innerHTML = html;
      modalBody.scrollTop = 0;  // 항상 맨 위에서 시작하게
      modal.classList.add('is-open');
	  cheeseLockScroll();      // 모달 열릴 때 배경 스크롤 잠그기
    }
    function closeModal() {
      modal.classList.remove('is-open');
	  cheeseUnlockScroll();    // 모달 닫힐 때 다시 풀어주기
    }

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();   // 바깥 검은 영역 탭해도 닫힘
    });

    // 데스크톱에서 hover 지원 여부 (툴팁용)
    var hasHover = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    var enableTooltip = hasHover && !touchMode;

    /* ───── 각 주석 번호 처리 ───── */
    refs.forEach(function (ref) {
      var id   = ref.getAttribute('data-footnote-id');
      var note = document.getElementById(id);
      if (!note) return;

      /* 터치 환경에서는 href를 제거해서 자동 스크롤 자체를 막기 */
        if (touchMode) {
          var anchorHref = ref.getAttribute('href');   // 예: "#fn1"
          if (anchorHref) {
            ref.setAttribute('data-anchor', anchorHref); // 필요하면 나중에 쓸 수 있게 저장만
            ref.removeAttribute('href');                // ← 이게 핵심! 스크롤 앵커 제거
          }
        }

      // ----- PC : hover 툴팁 -----
      if (enableTooltip) {
        var tooltip = document.createElement('div');
        tooltip.className = 'cheese-footnote-tooltip';
        tooltip.innerHTML = note.innerHTML;
        document.body.appendChild(tooltip);

        function positionTooltip() {
          var rect    = ref.getBoundingClientRect();
          var scrollY = window.pageYOffset || document.documentElement.scrollTop;
          var scrollX = window.pageXOffset || document.documentElement.scrollLeft;

          tooltip.style.display = 'block';  // 크기 계산용
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
        }

        function showTooltip() {
          positionTooltip();
          tooltip.classList.add('is-open');
        }

        function hideTooltip() {
          tooltip.classList.remove('is-open');
        }

        // ref 위에 올리면 보이기
        ref.addEventListener('mouseenter', showTooltip);

        // ref에서 나갈 때: 진짜로 tooltip 영역이 아닌 곳으로 나간 경우에만 닫기
        ref.addEventListener('mouseleave', function (e) {
          var to = e.relatedTarget;
          if (!to || (!tooltip.contains(to) && to !== tooltip)) {
            hideTooltip();
          }
        });

        // 툴팁 안에 마우스를 올리면 계속 유지
        tooltip.addEventListener('mouseenter', function () {
          tooltip.classList.add('is-open');
        });

        // 툴팁에서 나갈 때:
        //   - ref로 돌아가는 경우 → 유지
        //   - ref/툴팁 둘 다 아닌 곳으로 나가는 경우 → 닫기
        tooltip.addEventListener('mouseleave', function (e) {
          var to = e.relatedTarget;
          if (!to || (!ref.contains(to) && to !== ref && !tooltip.contains(to))) {
            hideTooltip();
          }
        });
      }

      // ----- 공통: 클릭 처리 -----
      ref.addEventListener('click', function (e) {
        if (touchMode) {
          // 모바일/터치 환경 → 아래로 점프 막고 모달 오픈
          e.preventDefault();
          e.stopPropagation();
          openModal(note.innerHTML);
        }
        // PC에서는 기본 동작 유지: href="#fn1" → 아래 주석으로 점프
      });
    });
  });
