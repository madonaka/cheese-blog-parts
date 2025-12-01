// Cheese Lightbox Script (from Blogger theme)

  /* ▼ Cheese Image Zoom - 커스텀 라이트박스 + 줌/드래그 ver.250630 -------------------------------------*/
  document.addEventListener('DOMContentLoaded', function () {

    /* 1. 공용 라이트박스 DOM 생성 */
    var lb = document.createElement('div');
    lb.className = 'cheese-lightbox';
    lb.innerHTML =
      '<div class="cheese-lightbox-inner">' +
        '<button type="button" class="cheese-lightbox-close">×</button>' +
        '<div class="cheese-lightbox-img"></div>' +
        '<div class="cheese-lightbox-controls">' +
          '<button type="button" class="cheese-zoom-out">－</button>' +
          '<button type="button" class="cheese-zoom-reset">초기화</button>' +
          '<button type="button" class="cheese-zoom-in">＋</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(lb);

    var lbImgBox     = lb.querySelector('.cheese-lightbox-img');
    var lbClose      = lb.querySelector('.cheese-lightbox-close');
    var zoomInBtn    = lb.querySelector('.cheese-zoom-in');
    var zoomOutBtn   = lb.querySelector('.cheese-zoom-out');
    var zoomResetBtn = lb.querySelector('.cheese-zoom-reset');
    
	var lbInner      = lb.querySelector('.cheese-lightbox-inner');  // 드래그 확대 오류 수정용 변수

    // 우클릭 메뉴 차단(보조)
    lb.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    // 확대/이동 상태값
    var scale    = 1;
    var minScale = 1;
    var maxScale = 4;
 	var doubleTapZoomScale = 2; // 더블탭/더블클릭 시 확대 배율
    var posX = 0;
    var posY = 0;
    var startX = 0;
    var startY = 0;
    var isDragging = false;

    /* 더블탭 감지용 변수 */
    var lastTapTime = 0;

    /* 핀치 줌용 상태 */
    var isPinching = false;
    var startPinchDistance = 0;
    var startScale = 1;


    function applyTransform() {
	  // 확대가 1배 이하면 항상 가운데로 고정
        if (scale <= 1) {
          scale = 1;
          posX = 0;
          posY = 0;
        } else {
          // 라이트박스 안에서 이미지가 너무 벗어나지 않도록 제한
          var boxW = lbImgBox.offsetWidth;
          var boxH = lbImgBox.offsetHeight;

          // 확대된 크기에서 허용되는 최대 이동 거리
          var maxX = (boxW * (scale - 1)) / 2;
          var maxY = (boxH * (scale - 1)) / 2;

          if (posX >  maxX) posX =  maxX;
          if (posX < -maxX) posX = -maxX;
          if (posY >  maxY) posY =  maxY;
          if (posY < -maxY) posY = -maxY;
        }

      lbImgBox.style.transform =
        'translate3d(' + posX + 'px,' + posY + 'px,0) scale(' + scale + ')';
    }

    function resetTransform() {
      scale = 1;
      posX = 0;
      posY = 0;
      applyTransform();
    }

    function openLightbox(src) {
      if (!src) return;
      lbImgBox.style.backgroundImage = 'url("' + src + '")';
      resetTransform();

      // 라이트박스 보이기
      lb.classList.add('is-open');

      // ▼ 배경 스크롤 잠금
      document.documentElement.classList.add('cheese-lock');
      document.body.classList.add('cheese-lock');
    }

    function closeLightbox() {
      lb.classList.remove('is-open');
      lbImgBox.style.backgroundImage = 'none';
      resetTransform();

      // ▼ 배경 스크롤 잠금 해제
      document.documentElement.classList.remove('cheese-lock');
      document.body.classList.remove('cheese-lock');
    }

    /* 2. 닫기 처리 */
    lb.addEventListener('click', function (e) {
      // 1) 바깥 검은 영역 클릭 → 닫기
      if (e.target === lb) {
        closeLightbox();
        return;
      }

      // 2) X 버튼(또는 그 안의 텍스트)을 클릭한 경우 → 닫기
      if (e.target.closest('.cheese-lightbox-close')) {
        e.preventDefault();
        closeLightbox();
      }
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lb.classList.contains('is-open')) {
        closeLightbox();
      }
    });

    /* 3. 줌 컨트롤 (+, -, 1x) */

    zoomInBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var newScale = scale + 0.5;
      if (newScale > maxScale) newScale = maxScale;
      scale = newScale;
      applyTransform();
    });

    zoomOutBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var newScale = scale - 0.5;
      if (newScale < minScale) newScale = minScale;
      scale = newScale;
      if (scale === minScale) {
        posX = 0;
        posY = 0;
      }
      applyTransform();
    });

    zoomResetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      resetTransform();
    });

    /* 4. 드래그로 이미지 이동 (마우스 + 터치) */

    /* 두 터치 포인트 사이 거리 계산 함수 */
    function getTouchDistance(t1, t2) {
      var dx = t1.clientX - t2.clientX;
      var dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function startDrag(e) {
      // 1) 두 손가락으로 시작한 경우 → 핀치 줌 모드
      if (e.touches && e.touches.length === 2) {
        isDragging = false;
        isPinching = true;

        var t1 = e.touches[0];
        var t2 = e.touches[1];

        startPinchDistance = getTouchDistance(t1, t2);
        startScale = scale;          // 현재 배율 기준

        return;
      }

      // 2) 한 손가락 드래그(이미지 이동)
      if (scale <= 1) return;        // 확대 상태에서만 이동 허용
      e.preventDefault();
      isPinching = false;
      isDragging = true;
      lbImgBox.classList.add('is-dragging');

      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;

      startX = clientX - posX;
      startY = clientY - posY;
    }


    // PC 웹: 마우스 휠로 확대 / 축소
    lbImgBox.addEventListener('wheel', function (e) {
      // 페이지 전체가 스크롤되지 않게 막기
      e.preventDefault();

      var delta = e.deltaY || e.wheelDelta;
      var step  = 0.2;   // 한 번 휠 돌릴 때 배율 변화량

      if (delta < 0) {
        // 휠 위로: 확대
        scale += step;
      } else {
        // 휠 아래로: 축소
        scale -= step;
      }

      // 배율 한계 처리
      if (scale < minScale) {
        scale = minScale;
        // 1배면 가운데로 리셋
        posX = 0;
        posY = 0;
      }
      if (scale > maxScale) {
        scale = maxScale;
      }

      applyTransform();
    }, { passive: false });


    function onDrag(e) {
      // 핀치 줌 중일 때 (두 손가락 유지)
      if (isPinching && e.touches && e.touches.length === 2) {
        e.preventDefault();

        var t1 = e.touches[0];
        var t2 = e.touches[1];
        var newDistance = getTouchDistance(t1, t2);

        if (startPinchDistance <= 0) return;

        var ratio = newDistance / startPinchDistance;
        var newScale = startScale * ratio;

        if (newScale < minScale) newScale = minScale;
        if (newScale > maxScale) newScale = maxScale;

        scale = newScale;
        applyTransform();
        return;
      }

      // 일반 드래그(한 손가락 이동)
      if (!isDragging) return;
      e.preventDefault();

      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var clientY = e.touches ? e.touches[0].clientY : e.clientY;

      posX = clientX - startX;
      posY = clientY - startY;
      applyTransform();
    }

    function endDrag() {
      // 손가락/마우스 뗐을 때 공통 종료
      isPinching = false;

      if (!isDragging) return;
      isDragging = false;
      lbImgBox.classList.remove('is-dragging');
    }



    /* PC : 더블클릭 시 토글 (1x <-> 고정 확대 배율) */
    lbImgBox.addEventListener('dblclick', function (e) {
      e.preventDefault();
      e.stopPropagation();

      // 지금이 초기 상태(1x, 가운데)면 → 고정 배율로 확대
      if (scale === 1 && posX === 0 && posY === 0) {
        if (doubleTapZoomScale > maxScale) {
          doubleTapZoomScale = maxScale;
        }
        scale = doubleTapZoomScale;
        posX = 0;
        posY = 0;
        applyTransform();
      } else {
        // 이미 확대/이동된 상태면 → 초기화
        resetTransform();
      }
    });

    /* 모바일 : 더블탭 시 토글 (1x <-> 고정 확대 배율) */
    lbImgBox.addEventListener('touchend', function (e) {
      var now = Date.now();

      // 핀치 직후의 touchend 는 탭으로 취급하지 않음
      if (isPinching) {
        lastTapTime = 0;
        return;
      }

      // 두 손가락 이상이면 탭 아님
      if (e.changedTouches && e.changedTouches.length > 1) {
        lastTapTime = 0;
        return;
      }

      if (now - lastTapTime < 300) {
        // 300ms 이내 두 번 → 더블탭
        e.preventDefault();
        e.stopPropagation();

        if (scale === 1 && posX === 0 && posY === 0) {
          if (doubleTapZoomScale > maxScale) {
            doubleTapZoomScale = maxScale;
          }
          scale = doubleTapZoomScale;
          posX = 0;
          posY = 0;
          applyTransform();
        } else {
          resetTransform();
        }

        lastTapTime = 0;
      } else {
        // 첫 번째 탭이면 시간만 저장
        lastTapTime = now;
      }
    }, { passive: false });


    /* 드래그/핀치 시작 */
    lbImgBox.addEventListener('mousedown', startDrag);
    lbImgBox.addEventListener('touchstart', startDrag, {passive:false});

    /* 이동 처리 (드래그 + 핀치) */
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, {passive:false});

    /* 손 뗐을 때 종료 */
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);



    /* 5. 본문 안의 모든 cheese-img-wrapper와 연결 */

    var wrappers = document.querySelectorAll('.post-body .cheese-img-wrapper');

    wrappers.forEach(function (wrapper) {
      var btn = wrapper.querySelector('.cheese-view-button');
      if (!btn) return;

      var link = wrapper.querySelector('.cheese-img-inner a[href]') ||
                 wrapper.querySelector('a[href]');
      var img  = wrapper.querySelector('.cheese-img-inner img') ||
                 wrapper.querySelector('img');

      btn.addEventListener('click', function (e) {
        e.preventDefault();

        var src = (link && link.getAttribute('href')) ||
                  (img && img.getAttribute('src'));

        if (!src) {
          alert('❌ 이미지를 찾을 수 없습니다.');
          return;
        }
        openLightbox(src);
      });

      // 보조: 원본 img/a 드래그 방지
      var dragTargets = wrapper.querySelectorAll('img, a');
      dragTargets.forEach(function (el) {
        el.setAttribute('draggable', 'false');
        el.addEventListener('dragstart', function (ev) {
          ev.preventDefault();
        });
      });
    });
  });
