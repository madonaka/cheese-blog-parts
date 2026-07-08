/* ==================================================
   Cheese History Map — 공개 뷰어 (읽기 전용, 의존성 없음)
   ES Module 아님. 일반 <script> 로 로드하면 window.CheeseMap 노출.

   사용:
     CheeseMap.render(mountEl, {
       map:      <published 지도 JSON>,      // Firestore published 또는 data/samguk-map.json
       rivers:   {classes:[{w,d}], lakes},   // assets/rivers.json
       land:     "<land path d>",            // assets/land.json 의 .land
       reliefUrl:"https://cdn.../relief.webp" // 지형 이미지 (jsDelivr 등)
     });

   인터랙션: 휠 줌(커서 기준) · 드래그 이동 · 핀치 줌 · ＋/－/⟳/⛶/📷 버튼.
   줌 대응: 강 굵기 √k 감쇠, 라벨 크기·halo 비례,
            완전 축소(k>0.6)에선 도시 숨김, 도시는 k≤0.6(수도)·k≤0.3(그 외)부터 단계 공개.
            나라 라벨 앵커는 고정(최대 링 중심) — 겹치면 이동 대신 우선순위 낮은 쪽을 숨김.
   모바일: 첫 화면은 콘텐츠 범위로 자동 확대, 최대 줌은 화면폭 비례로 심화,
           전체화면은 화면 비율에 viewBox를 맞춤(미지원 브라우저는 고정 오버레이 폴백).
   ================================================== */
(function(){
  var NS="http://www.w3.org/2000/svg";
  function el(t,a){ var e=document.createElementNS(NS,t); for(var k in a) e.setAttribute(k,a[k]); return e; }
  function pbox(d){ var m=d.match(/-?\d+\.?\d*/g); if(!m)return null; var b=[9e9,9e9,-9e9,-9e9];
    for(var i=0;i<m.length-1;i+=2){ var x=+m[i],y=+m[i+1]; if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y; } return b; }
  // 라벨 기준 bbox: 날짜변경선 분할 파편·원거리 영토가 전체 bbox를 늘리므로 가장 큰 링만 사용
  function mainRingBox(d){ var rings=d.match(/M[^M]+/g); if(!rings||rings.length<2) return pbox(d);
    var best=null, bestA=-1;
    for(var i=0;i<rings.length;i++){ var b=pbox(rings[i]); if(!b) continue;
      var a=(b[2]-b[0])*(b[3]-b[1]); if(a>bestA){ bestA=a; best=b; } } return best; }
  function darken(hex){ var m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#2a2417";
    var v=parseInt(m[1],16); return "rgb("+Math.round(((v>>16)&255)*0.5)+","+Math.round(((v>>8)&255)*0.5)+","+Math.round((v&255)*0.5)+")"; }
  // 영토 채움 = 나라 색을 흰색 쪽으로 45% 섞은 파스텔 틴트 — 데이터의 나라 색은 그대로 두고 표시만 밝게
  function tint(hex){ var m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#cccccc";
    var v=parseInt(m[1],16), r=(v>>16)&255, g=(v>>8)&255, b=v&255, t=0.45;
    return "rgb("+Math.round(r+(255-r)*t)+","+Math.round(g+(255-g)*t)+","+Math.round(b+(255-b)*t)+")"; }
  // 영토 테두리 = 채도를 유지한 중간-진한 자기 색 (darken(0.5)은 라벨용 — 테두리에 쓰면 검정에 가깝다)
  function shade(hex){ var m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#666";
    var v=parseInt(m[1],16); return "rgb("+Math.round(((v>>16)&255)*0.75)+","+Math.round(((v>>8)&255)*0.75)+","+Math.round((v&255)*0.75)+")"; }

  var OCEAN="#a9e2f3"; // flat 스타일의 바다색 — 스타일이므로 뷰어가 정한다(발행본 cfg.ocean 은 구형식, opts.ocean 으로만 재정의)
  function render(mount, opts){
    var map=opts.map, rivers=opts.rivers||{}, reliefUrl=opts.reliefUrl, landD=opts.land||"";
    var ocean=opts.ocean||OCEAN;
    var uid=(render._u=(render._u||0)+1); // 한 페이지 다중 지도에서 clipPath id 충돌 방지
    var cfg=map.cfg, kx=Math.cos((cfg.WIN[1]+cfg.WIN[3])/2*Math.PI/180);
    function proj(lon,lat){ return [ (lon-cfg.WIN[0])*kx*cfg.SCALE+cfg.pad, (cfg.WIN[3]-lat)*cfg.SCALE+cfg.pad ]; }
    var COLOR={}, NAME={}, LAB={};
    map.nations.forEach(function(n){ COLOR[n.id]=n.color; NAME[n.id]=n.name; if(n.lab) LAB[n.id]=n.lab; }); // lab={연도:[lon,lat]} — 편집기에서 지정한 나라 라벨 수동 앵커
    var years=map.years.slice().sort(function(a,b){ return (+a.y)-(+b.y); });
    var yearIdx=0, year=years[0].y, vis={terr:1,river:1,city:1,relief:1};

    var W=+map.viewBox.split(" ")[2], H=+map.viewBox.split(" ")[3];
    var vb={x:0,y:0,w:W,h:H};

    mount.classList.add("cmap"); mount.innerHTML="";
    if(opts.title){ var h=document.createElement("h2"); h.className="cmap-title"; h.textContent=opts.title; mount.appendChild(h); }
    var sub=document.createElement("p"); sub.className="cmap-sub"; mount.appendChild(sub);
    var descEl=document.createElement("p"); descEl.className="cmap-desc"; descEl.style.display="none"; mount.appendChild(descEl);

    // 연대 타임라인 (◀ ▶ + 연대선 점)
    var tl=document.createElement("div"); tl.className="cmap-timeline";
    tl.innerHTML='<button class="cmap-tl-nav" data-d="-1" aria-label="이전 시대">◀</button><div class="cmap-tl-track"></div><button class="cmap-tl-nav" data-d="1" aria-label="다음 시대">▶</button>';
    mount.appendChild(tl);
    // 레이어 토글
    var lb=document.createElement("div"); lb.className="cmap-bar";
    lb.innerHTML='<span class="cmap-lbl">레이어</span>';
    [["terr","영토"],["river","강"],["city","도시"],["relief","지형"]].forEach(function(t){
      var b=document.createElement("button"); b.className="cmap-btn on"; b.textContent=t[1]; b.dataset.l=t[0];
      b.onclick=function(){ vis[t[0]]=!vis[t[0]]; b.classList.toggle("on",!!vis[t[0]]); draw(); }; lb.appendChild(b); });
    // 고대 해안선 토글 — 해수면 +8m 비정 해안선으로 land 경로만 교체(클립 기준이라 지형·강·영토가 자동으로 따라옴)
    if(opts.landPaleo){
      var pb=document.createElement("button"); pb.className="cmap-btn"; pb.textContent="고대 해안선";
      pb.title="해수면 +7~9m 상승을 가정한 기원후 고대~중세 초 비정(比定) 해안선";
      pb.onclick=function(){ paleoOn=!paleoOn; pb.classList.toggle("on",paleoOn); setLand(paleoOn?opts.landPaleo:landD); draw(); };
      lb.appendChild(pb);
    }
    mount.appendChild(lb);

    // 지도 래퍼(+줌 버튼 오버레이)
    var wrap=document.createElement("div"); wrap.className="cmap-mapwrap"; mount.appendChild(wrap);
    var svg=el("svg",{class:"cmap-svg",viewBox:map.viewBox}); svg.style.background=ocean;
    // 납작한 지도(세계 전도 등)는 표시 비율을 따로 지정해 크게 — 세로로 넘치는 부분은 바다 레터박스
    var dispAR=+opts.displayAspect||0;
    if(dispAR) svg.style.aspectRatio=String(dispAR);
    wrap.appendChild(svg);
    var zoomBox=document.createElement("div"); zoomBox.className="cmap-zoom";
    zoomBox.innerHTML='<button data-z="in" aria-label="확대">＋</button><button data-z="out" aria-label="축소">－</button><button data-z="rst" aria-label="원래대로">⟳</button><button data-z="fs" aria-label="전체화면">⛶</button><button data-z="shot" aria-label="이미지 저장">📷</button>';
    wrap.appendChild(zoomBox);

    // 해안선 기준 = 벡터 land 하나로 통일: relief(투명 바다)·강·영토를 land 모양으로 클립
    // 고대 해안선 토글은 이 land 경로(클립·글로우·외곽선)만 통째로 교체한다 — +8m 해안선은 현대 해안선의 부분집합이라 안전
    var clipId=null, landEl=null, cpPath=null, glowO=null, glowI=null, paleoOn=false;
    if(landD){
      clipId="cmapClip"+(++render._n||(render._n=1));
      var defs=el("defs",{}); var cp=el("clipPath",{id:clipId}); cpPath=el("path",{d:landD}); cp.appendChild(cpPath); defs.appendChild(cp); svg.appendChild(defs);
      // 해안 글로우: 바깥쪽 밝은 띠 + 흰 띠 — 육지 실루엣을 바다에서 띄운다 (안쪽은 뒤에 그리는 land가 덮음)
      glowO=el("path",{class:"cmap-coastglow",d:landD}); svg.appendChild(glowO);
      glowI=el("path",{class:"cmap-coasthalo",d:landD}); svg.appendChild(glowI);
      landEl=el("path",{class:"cmap-land",d:landD}); svg.appendChild(landEl);
    }
    function clipped(g){ if(clipId) g.setAttribute("clip-path","url(#"+clipId+")"); return g; }
    var landCur=landD;
    function setLand(d){ landCur=d; if(cpPath)cpPath.setAttribute("d",d); if(landEl)landEl.setAttribute("d",d);
      if(glowO)glowO.setAttribute("d",d); if(glowI)glowI.setAttribute("d",d);
      gCoast.querySelectorAll("path.cmap-terrline").forEach(function(p){ p.setAttribute("d",d); }); }

    var gTerr=clipped(el("g",{})); svg.appendChild(gTerr);
    // 해안 띠: 영토 모양으로 클립한 land 외곽 스트로크 — 영토 폴리곤이 해안 밖(바다)까지 뻗어 있어도
    // korsica처럼 해안선에도 자기 색 테두리가 온전히 둘리게 한다. land 경로가 커서 연도·해안선 전환 시에만 재구성.
    var gCoast=clipped(el("g",{})); svg.appendChild(gCoast);
    function rebuildCoast(){ gCoast.innerHTML="";
      if(!landCur) return;
      (map.territories[year]||[]).forEach(function(t,ti){
        var cpid="cmapT"+uid+"_"+ti;
        var tcp=el("clipPath",{id:cpid}); tcp.appendChild(el("path",{d:t.d,"clip-rule":"evenodd"})); gCoast.appendChild(tcp);
        gCoast.appendChild(el("path",{class:"cmap-terrline",d:landCur,stroke:shade(COLOR[t.id]||"#888"),"clip-path":"url(#"+cpid+")"})); }); }
    // 지형은 영토 '위'에 grayscale multiply 오버레이 — flat 원색을 유지하면서 지형감만 은은하게 남긴다
    // base+고해상 패치를 한 그룹에서 보통 합성한 뒤 그룹째 multiply — 이미지마다 multiply 를 걸면
    // 패치 페더 구간에서 곱셈이 겹쳐 밝은 띠(이음매)가 생긴다
    var img=null, imgHi=null, gRelief=null;
    if(reliefUrl||(opts.reliefHi&&opts.reliefHi.url)){ gRelief=el("g",{class:"cmap-reliefg"}); svg.appendChild(gRelief); }
    if(reliefUrl){ img=el("image",{class:"cmap-relief",x:0,y:0,width:W,height:H,preserveAspectRatio:"none"});
      img.setAttributeNS("http://www.w3.org/1999/xlink","href",reliefUrl); img.setAttribute("href",reliefUrl);
      if(clipId) img.setAttribute("clip-path","url(#"+clipId+")"); gRelief.appendChild(img); }
    // 고해상 지형 패치(선택): reliefHi={url, box:[서,남,동,북]} — 주 무대(한반도 등)만 z10급으로 또렷하게.
    // 패치는 박스 안쪽 페더 알파(빌드 시)로 base 위에 얹힌다.
    if(opts.reliefHi&&opts.reliefHi.url){ var hb=opts.reliefHi.box, hp1=proj(hb[0],hb[3]), hp2=proj(hb[2],hb[1]);
      imgHi=el("image",{class:"cmap-relief",x:hp1[0],y:hp1[1],width:hp2[0]-hp1[0],height:hp2[1]-hp1[1],preserveAspectRatio:"none"});
      imgHi.setAttributeNS("http://www.w3.org/1999/xlink","href",opts.reliefHi.url); imgHi.setAttribute("href",opts.reliefHi.url);
      if(clipId) imgHi.setAttribute("clip-path","url(#"+clipId+")"); gRelief.appendChild(imgHi); }

    var gRiver=clipped(el("g",{class:"cmap-rivers"}));
    if(rivers.lakes){ gRiver.appendChild(el("path",{class:"cmap-lake",d:rivers.lakes})); }
    if(rivers.classes){ rivers.classes.forEach(function(c){ var p=el("path",{class:"cmap-river","stroke-width":c.w,d:c.d}); p.dataset.w=c.w; gRiver.appendChild(p); }); }
    else { gRiver.appendChild(el("path",{class:"cmap-river mn",d:rivers.minor||""})); gRiver.appendChild(el("path",{class:"cmap-river mj",d:rivers.major||""})); }
    svg.appendChild(gRiver);
    var gTL=el("g",{}), gCity=el("g",{});
    svg.appendChild(gTL); svg.appendChild(gCity);

    // 범례 — 현재 연도에 존재하는 나라만 (연도 전환 시 draw()에서 갱신)
    var lg=document.createElement("div"); lg.className="cmap-legend";
    mount.appendChild(lg);
    var cityLbl=opts.cityLabel||"성";
    function renderLegend(){
      var present={};
      (map.territories[year]||[]).forEach(function(t){ present[t.id]=1; });
      if(map.cities) map.cities.forEach(function(c){ var i=c.y[year]; if(i) present[i[0]]=1; });
      var html='<span><svg width="14" height="14"><text x="7" y="11" text-anchor="middle" font-size="13" fill="#c0453f">★</text></svg> 수도</span>'
        +'<span><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#3f6fb0" stroke="#fff"/></svg> '+cityLbl+'</span>';
      map.nations.forEach(function(n){ if(present[n.id]) html+='<span><i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:'+tint(n.color)+';border:1.5px solid '+shade(n.color)+'"></i> '+n.name+'</span>'; });
      lg.innerHTML=html;
    }
    if(opts.note){ var nt=document.createElement("p"); nt.className="cmap-note"; nt.textContent=opts.note; mount.appendChild(nt); }

    // ── 줌/패닝 ──
    function applyVB(){ svg.setAttribute("viewBox",vb.x+" "+vb.y+" "+vb.w+" "+vb.h); }
    // 데이터 범위를 넘는 축(전체 축소 레터박스)은 가운데 정렬로 고정
    function clampVB(){
      vb.x = vb.w>=W ? (W-vb.w)/2 : Math.max(0,Math.min(W-vb.w,vb.x));
      vb.y = vb.h>=H ? (H-vb.h)/2 : Math.max(0,Math.min(H-vb.h,vb.y)); }
    function zoomAt(cx,cy,f){ var maxW=W; // 가로 전체가 보일 때까지 축소 허용(세로는 바다 레터박스)
      var minW=W*0.065*Math.min(1,(svg.clientWidth||820)/820); // 작은 화면은 더 깊게 확대 — 화면픽셀 기준 데스크톱과 같은 배율까지
      var nw=Math.min(maxW,Math.max(minW,vb.w*f)); var s=nw/vb.w;
      vb.x=cx-(cx-vb.x)*s; vb.y=cy-(cy-vb.y)*s; vb.w=nw; vb.h*=s;
      clampVB(); applyVB(); draw(); }
    function svgXY(e){ var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
      var q=pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x,q.y]; }
    // 한 손가락=드래그, 두 손가락=핀치 줌 (모바일)
    var ptrs=new Map(), pan=null, pinchD=0;
    function pinchInfo(){ var a=[]; ptrs.forEach(function(v){ a.push(v); });
      var d=Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y);
      return { d:d, mx:(a[0].x+a[1].x)/2, my:(a[0].y+a[1].y)/2 }; }
    svg.addEventListener("pointerdown",function(e){ e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===2){ pan=null; pinchD=pinchInfo().d; }
      else if(ptrs.size===1){ pan={sx:e.clientX,sy:e.clientY,vx:vb.x,vy:vb.y}; } });
    svg.addEventListener("pointermove",function(e){
      if(!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(ptrs.size===2){ var pi=pinchInfo(); if(pinchD>0 && pi.d>0){
          var fake={clientX:pi.mx, clientY:pi.my}; var xy=svgXY(fake);
          zoomAt(xy[0], xy[1], pinchD/pi.d); }
        pinchD=pi.d; return; }
      if(pan){ var sc=vb.w/svg.clientWidth; vb.x=pan.vx-(e.clientX-pan.sx)*sc; vb.y=pan.vy-(e.clientY-pan.sy)*sc;
        clampVB(); applyVB(); } });
    function endPtr(e){ ptrs.delete(e.pointerId); pinchD=0;
      if(ptrs.size===1){ var only; ptrs.forEach(function(v){ only=v; }); pan={sx:only.x,sy:only.y,vx:vb.x,vy:vb.y}; }
      else pan=null; }
    svg.addEventListener("pointerup",endPtr); svg.addEventListener("pointercancel",endPtr);
    // viewBox 비율을 화면 비율에 맞춤 — 세로 폰 전체화면에서 위아래 바다 여백(지형 잘림처럼 보임) 없이 꽉 차게
    function refit(){ var fs=document.fullscreenElement===wrap||wrap.classList.contains("cmap-fsfake");
      var ar=fs?((wrap.clientWidth||1)/(wrap.clientHeight||1)):(dispAR||(W/H));
      var cx=vb.x+vb.w/2, cy=vb.y+vb.h/2;
      var nw=Math.min(W,Math.max(vb.w,vb.h*ar)), nh=nw/ar;
      if(nh>H){ nh=H; nw=nh*ar; }
      vb.w=nw; vb.h=nh;
      vb.x=Math.max(0,Math.min(W-nw,cx-nw/2)); vb.y=Math.max(0,Math.min(H-nh,cy-nh/2));
      applyVB(); draw(); }
    document.addEventListener("fullscreenchange",function(){ setTimeout(refit,60); });
    window.addEventListener("resize",function(){ clearTimeout(render._rz); render._rz=setTimeout(refit,120); });
    svg.addEventListener("wheel",function(e){ e.preventDefault(); var xy=svgXY(e); zoomAt(xy[0],xy[1], e.deltaY<0?0.84:1.19); },{passive:false});
    // ── 이미지 저장(현재 뷰 그대로 + 브랜드 헤더/푸터) ──
    var EXPORT_CSS='.cmap-land{fill:#f2f0e8;stroke:#a8c8d8;stroke-linejoin:round}'
      +'.cmap-coastglow{fill:none;stroke:#dff3fa;stroke-linejoin:round;stroke-linecap:round}'
      +'.cmap-coasthalo{fill:none;stroke:#fff;stroke-linejoin:round;stroke-linecap:round}'
      +'.cmap-reliefg{mix-blend-mode:multiply;opacity:.62}'
      +'.cmap-rivers{opacity:.8}.cmap-river{fill:none;stroke:#8fc6dc;stroke-linejoin:round;stroke-linecap:round}.cmap-lake{fill:#a9e2f3}'
      +'.cmap-terr{fill-opacity:.96;stroke-linejoin:round}'
      +'.cmap-terrline{fill:none;stroke-linejoin:round;stroke-linecap:round}'
      +'.cmap-terrlab{fill:#20242a;paint-order:stroke;stroke:#fff;stroke-linejoin:round;text-anchor:middle;font-weight:700}'
      +'.cmap-ruler{text-anchor:middle;font-weight:600;paint-order:stroke;stroke:#fff;stroke-linejoin:round}'
      +'.cmap-citylab{fill:#1c1a12;paint-order:stroke;stroke:#fff;stroke-linejoin:round;font-weight:700}'
      +'.cmap-region{fill:#5f6570;opacity:.55;text-anchor:middle;font-weight:700}'
      +'.cmap-admin{text-anchor:middle;font-weight:600;opacity:.85;paint-order:stroke;stroke:rgba(255,255,255,.9);stroke-linejoin:round}'
      +'text{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif}';
    var reliefCache={};
    function blobToDataURL(b){ return new Promise(function(res){ var fr=new FileReader(); fr.onload=function(){ res(fr.result); }; fr.readAsDataURL(b); }); }
    function urlData(u){ return reliefCache[u] ? Promise.resolve(reliefCache[u])
      : fetch(u).then(function(r){return r.blob();}).then(blobToDataURL).then(function(d){ reliefCache[u]=d; return d; }); }
    function loadImg(src){ return new Promise(function(res,rej){ var im=new Image(); im.crossOrigin="anonymous"; im.onload=function(){ res(im); }; im.onerror=rej; im.src=src; }); }
    function exportImage(btn){
      var brand=opts.brand||{};
      var old=btn.textContent; btn.textContent="⏳"; btn.disabled=true;
      var done=function(){ btn.textContent=old; btn.disabled=false; };
      // 지형 이미지(베이스 + 고해상 패치) 전부 dataURL로 — 문서 순서와 urls 순서가 같다
      var urls=[]; if(reliefUrl) urls.push(reliefUrl); if(opts.reliefHi&&opts.reliefHi.url) urls.push(opts.reliefHi.url);
      var p=Promise.all(urls.map(urlData)).catch(function(){ return []; });
      Promise.all([p, brand.logo? loadImg(brand.logo).catch(function(){return null;}) : Promise.resolve(null),
                   (document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve()])
      .then(function(rs){ var reliefDs=rs[0]||[], logoImg=rs[1];
        // 현재 뷰 그대로 SVG 복제 → 지형을 dataURL로 치환 → 스타일 내장
        var cl=svg.cloneNode(true);
        var mapW=1600, mapH=Math.round(mapW*vb.h/vb.w);
        cl.setAttribute("width",mapW); cl.setAttribute("height",mapH);
        var st=document.createElementNS(NS,"style"); st.textContent=EXPORT_CSS; cl.insertBefore(st, cl.firstChild);
        var bg=el("rect",{x:vb.x,y:vb.y,width:vb.w,height:vb.h,fill:ocean}); cl.insertBefore(bg, st.nextSibling);
        cl.querySelectorAll("image").forEach(function(imEl,i){
          if(reliefDs[i]){ imEl.setAttribute("href",reliefDs[i]); imEl.setAttributeNS("http://www.w3.org/1999/xlink","href",reliefDs[i]); }
          else imEl.remove(); });
        var svgStr=new XMLSerializer().serializeToString(cl);
        var url=URL.createObjectURL(new Blob([svgStr],{type:"image/svg+xml;charset=utf-8"}));
        return loadImg(url).then(function(mapImg){ URL.revokeObjectURL(url);
          var headerH=150, footerH=64, W=mapW, H=headerH+mapH+footerH;
          var cv=document.createElement("canvas"); cv.width=W; cv.height=H; var g=cv.getContext("2d");
          g.fillStyle="#f7f4ec"; g.fillRect(0,0,W,H);
          // 헤더: 로고 + 타이틀 + (우측) 현재 시대
          var x=44;
          if(logoImg){ var lh=88, lw=Math.round(logoImg.width*lh/logoImg.height); g.drawImage(logoImg,x,31,lw,lh); x+=lw+26; }
          g.textBaseline="alphabetic"; g.fillStyle="#b8860b";
          g.font="700 15px 'Noto Sans KR', sans-serif"; g.fillText((brand.subtitle||"HISTORICAL ATLAS").toUpperCase? (brand.subtitle||"역사 지도") : "역사 지도", x, 62);
          g.fillStyle="#2a2013"; g.font="900 42px 'Noto Serif KR', Georgia, serif";
          g.fillText(brand.title||"", x, 108);
          var Y=years[yearIdx]; g.textAlign="right";
          g.fillStyle="#2a2013"; g.font="900 44px 'Noto Serif KR', Georgia, serif"; g.fillText(Y.y+"년", W-44, 84);
          if(Y.nm){ g.fillStyle="#6b6b6b"; g.font="500 18px 'Noto Sans KR', sans-serif"; g.fillText(Y.nm, W-44, 116); }
          g.textAlign="left";
          g.strokeStyle="#e3dccb"; g.lineWidth=2; g.beginPath(); g.moveTo(0,headerH-1); g.lineTo(W,headerH-1); g.stroke();
          // 지도
          g.drawImage(mapImg,0,headerH,mapW,mapH);
          // 푸터
          g.beginPath(); g.moveTo(0,headerH+mapH+1); g.lineTo(W,headerH+mapH+1); g.stroke();
          g.fillStyle="#6b6b6b"; g.font="600 16px 'Noto Sans KR', sans-serif";
          g.fillText(brand.footer||"", 44, H-24);
          g.textAlign="right"; g.font="400 13px 'Noto Sans KR', sans-serif";
          g.fillText("지형: SRTM 고도 · 하천: HydroRIVERS(HydroSHEDS)", W-44, H-24);
          g.textAlign="left";
          cv.toBlob(function(bl){ var a=document.createElement("a");
            a.href=URL.createObjectURL(bl); a.download=(brand.fileBase||"cheese-history-map")+"-"+Y.y+".png";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function(){ URL.revokeObjectURL(a.href); },5000); done(); },"image/png");
        });
      }).catch(function(err){ console.error("[cmap export]",err); alert("이미지 저장에 실패했습니다: "+(err&&err.message||err)); done(); });
    }
    zoomBox.querySelectorAll("button").forEach(function(b){ b.onclick=function(){
      if(b.dataset.z==="in") zoomAt(vb.x+vb.w/2, vb.y+vb.h/2, 0.7);
      else if(b.dataset.z==="out") zoomAt(vb.x+vb.w/2, vb.y+vb.h/2, 1.43);
      else if(b.dataset.z==="shot"){ exportImage(b); }
      else if(b.dataset.z==="fs"){ if(document.fullscreenElement){ document.exitFullscreen&&document.exitFullscreen(); }
        else if(wrap.requestFullscreen){ wrap.requestFullscreen(); }
        else { wrap.classList.toggle("cmap-fsfake"); setTimeout(refit,60); } } // iOS 사파리 등 Fullscreen API 미지원 폴백
      else { vb={x:initVB.x,y:initVB.y,w:initVB.w,h:initVB.h}; refit(); } }; });

    // ── 렌더 ──
    function draw(){
      var k=vb.w/W;
      var us=W/820; // viewBox 규모 보정 — 지도 좌표계 크기와 무관하게 라벨 화면 크기 동일
      var ui=Math.min(2.6, Math.max(1, 820/((svg.clientWidth||820)))); // 모바일 확대 배율 — 작은 화면일수록 라벨·기호를 키움
      var ku=k*ui*us;
      gRiver.style.display=vis.river?"":"none";
      if(img) img.style.display=vis.relief?"":"none";
      if(imgHi) imgHi.style.display=vis.relief?"":"none";
      gCoast.style.display=vis.terr?"":"none";
      gCoast.querySelectorAll("path.cmap-terrline").forEach(function(p){ p.style.strokeWidth=(6.4*ku)+"px"; });
      // 강 굵기 줌 감쇠(√k)
      var rk=Math.pow(k,0.5)*Math.sqrt(ui)*us;
      gRiver.querySelectorAll(".cmap-river").forEach(function(p){ if(p.dataset.w) p.setAttribute("stroke-width",(+p.dataset.w)*rk); });
      gTerr.innerHTML=""; gTL.innerHTML=""; gCity.innerHTML="";
      if(landEl) landEl.style.strokeWidth=(0.7*ku)+"px";
      if(glowO) glowO.style.strokeWidth=(7*ku)+"px";
      if(glowI) glowI.style.strokeWidth=(2.6*ku)+"px";

      // 지역 통칭(요동·말갈 등) — 저대비 회색 워터마크(크되 시선을 안 뺏는 2순위 라벨). 좁은 화면의 넓은 뷰에서는 숨김
      if(map.regions && !(ui>1.5 && k>0.45)){ map.regions.forEach(function(r){ if(!r.y||!r.y[year]) return; var p=proj(r.lon,r.lat);
        var t2=el("text",{x:p[0],y:p[1],class:"cmap-region"}); t2.style.fontSize=(14*ku)+"px";
        t2.style.letterSpacing=(0.3*14*ku)+"px";
        t2.textContent=r.name; gTL.appendChild(t2); }); }

      // 행정구역(신라 9주, 조선 8도 등) — 소속 나라색 계열의 보조 라벨. 좁은 화면의 넓은 뷰에서는 지역 통칭과 같이 숨김
      if(map.admins && !(ui>1.5 && k>0.45)){ map.admins.forEach(function(a){ if(!a.y||!a.y[year]) return;
        var pA=proj(a.lon,a.lat);
        var tA=el("text",{x:pA[0],y:pA[1],class:"cmap-admin"}); tA.style.fontSize=(10.5*ku)+"px";
        tA.style.strokeWidth=(2.2*ku)+"px"; tA.style.fill=darken(COLOR[a.nat]||"#666");
        tA.textContent=a.name; gTL.appendChild(tA); }); }

      // 영토 + 나라 라벨 — 앵커 고정(최대 링 bbox 중심, 줌과 무관), 겹치면 이동 대신 작은 영토 쪽을 그 줌에선 숨김
      var placedLabs=[];
      if(vis.terr){
        var terrs=(map.territories[year]||[]);
        terrs.forEach(function(t,ti){
          var col=COLOR[t.id]||"#888";
          // korsica 방식: 파스텔 틴트 채움 + 자기 색 진한 테두리를 '안쪽'으로(자기 모양으로 클립한 2배 굵기 스트로크)
          // — 인접국 국경이 두 색의 나란한 띠가 된다. 클립은 rebuildCoast()가 만든 것을 공유.
          gTerr.appendChild(el("path",{class:"cmap-terr",d:t.d,fill:tint(col),"fill-rule":"evenodd"}));
          var ln=el("path",{class:"cmap-terrline",d:t.d,stroke:shade(col),"clip-path":"url(#cmapT"+uid+"_"+ti+")"});
          ln.style.strokeWidth=(6.4*ku)+"px"; gTerr.appendChild(ln); }); // 화면상 보이는 폭 ≈ 절반(안쪽 클립) ≈ 2.5px — korsica 지도의 테두리 두께 기준
        var boxes=terrs.map(function(t){ var b=mainRingBox(t.d); return b&&{t:t,b:b}; }).filter(Boolean);
        boxes.sort(function(x,y){ return (y.b[2]-y.b[0])*(y.b[3]-y.b[1])-(x.b[2]-x.b[0])*(x.b[3]-x.b[1]); }); // 큰 영토부터 자리 선점
        boxes.forEach(function(o){ var b=o.b, nm=NAME[o.t.id]||"";
          var bw=b[2]-b[0], bh=b[3]-b[1], mx=Math.max(bw,bh);
          // 라벨을 영토 크기에 맞춰 축소 — 모든 화면 적용(세계지도의 좁은 유럽 등에서 이름이 과대 표시되지 않게)
          var fit=1.3*mx/(1.24*Math.max(1,nm.length));
          var minFs=(ui>1?11:9)*vb.w/(svg.clientWidth||820); // 화면상 최소 픽셀 보장
          // 구글맵식 줌 연동 상한: 축소(k→1)일수록 12px까지 낮추고, 확대하면 16px까지 커짐
          var capPx=Math.min(16, 12/Math.sqrt(k));
          var fs=Math.min(capPx*ku, Math.max(fit, minFs));
          var man=LAB[o.t.id]&&LAB[o.t.id][year]; // 수동 앵커가 있으면 그 위치에 항상 표시(생략·회피 규칙 제외)
          var lx, ly, halfW=nm.length*fs*0.62;
          if(man){ var mp2=proj(man[0],man[1]); lx=mp2[0]; ly=mp2[1]; }
          else { lx=(b[0]+b[2])/2; ly=(b[1]+b[3])/2+4*ku; }
          // 축소해도 영토의 2.6배를 넘는 소국은 이 줌에선 생략 — 확대하면 표시
          if(!man && halfW*2 > 2.6*mx) return;
          if(!man && placedLabs.some(function(q){ return Math.abs(q[0]-lx)<halfW+q[2] && Math.abs(q[1]-ly)<(fs+q[3])*0.55; })) return;
          placedLabs.push([lx,ly,halfW,fs]);
          var tx=el("text",{x:lx,y:ly,class:"cmap-terrlab"}); tx.style.fontSize=fs+"px";
          tx.style.letterSpacing=(0.14*fs)+"px"; tx.style.strokeWidth=(3*ku)+"px"; tx.style.fill=darken(COLOR[o.t.id]);
          tx.textContent=nm; gTL.appendChild(tx);
          // 지도자명(선택) — 나라 이름 위에 작게. 라벨이 충분히 클 때만(작은 영토에선 생략)
          var rl=map.rulers&&map.rulers[year]&&map.rulers[year][o.t.id];
          if(rl && fs>=11*ku){ var rt=el("text",{x:lx,y:ly-fs*1.02,class:"cmap-ruler"});
            rt.style.fontSize=(fs*0.46)+"px"; rt.style.strokeWidth=(2*ku)+"px"; rt.style.fill=darken(COLOR[o.t.id]);
            rt.textContent=rl; gTL.appendChild(rt); } }); }

      // 도시(줌 규칙 + 시대별 이름) — 완전 축소(k>0.6)에선 숨김, k≤0.6부터 수도★+이름, k≤0.3부터 그 외 도시
      var cityPts=[];
      if(vis.city && map.cities && k<=0.6){
        var cl=map.cities.filter(function(c){ return c.y[year]; });
        cl.sort(function(a,b){ return (b.y[year][1]==="cap"?1:0)-(a.y[year][1]==="cap"?1:0); }); // 수도가 이름 자리를 먼저 차지
        cl.forEach(function(c){ var info=c.y[year];
        var isCap=info[1]==="cap";
        if(!isCap && k>0.3) return;
        var p=proj(c.lon,c.lat), col=COLOR[info[0]]||"#555";
        var g=el("g",{});
        if(isCap){ var ss=13*ku;
          var s=el("text",{x:p[0],y:p[1]+ss*0.34,"text-anchor":"middle","font-size":ss,fill:col,
            style:"paint-order:stroke;stroke:#fff;stroke-width:"+(2*ku)+"px"}); s.textContent="★"; g.appendChild(s); }
        else g.appendChild(el("circle",{cx:p[0],cy:p[1],r:3.5*ku,fill:col,stroke:"#fff","stroke-width":1*ku}));
        var cn=(info[2]||c.name), w2=cn.length*11*ku;
        // 이름 자리 회피: 오른쪽 → 왼쪽 → 생략(기호만). 나라 라벨이 우선권을 가짐
        var hit=function(cx2){ return cityPts.some(function(q){ return Math.abs(cx2-q[0])<w2/2+8*ku+q[2] && Math.abs(p[1]-q[1])<11.5*ku; })
          || placedLabs.some(function(q){ return Math.abs(cx2-q[0])<w2/2+8*ku+q[2] && Math.abs(p[1]-q[1])<(11*ku+q[3])*0.62; }); };
        var side= !hit(p[0]+w2/2) ? 1 : (!hit(p[0]-w2/2) ? -1 : 0);
        if(side){ var lab=el("text",{x:p[0]+side*8*ku,y:p[1]+4*ku,class:"cmap-citylab"}); if(side<0) lab.setAttribute("text-anchor","end");
          lab.style.fontSize=(11*ku)+"px"; lab.style.strokeWidth=(2.4*ku)+"px"; lab.textContent=cn; g.appendChild(lab);
          cityPts.push([p[0]+side*w2/2, p[1], w2/2+8*ku]); } // 충돌용 범위: ★부터 이름 끝까지
        else cityPts.push([p[0],p[1],8*ku]);
        gCity.appendChild(g); }); }

      var Y=years[yearIdx]; sub.innerHTML=Y?('<b class="cmap-sub-year">'+Y.y+'년</b>'+(Y.nm?' <span class="cmap-sub-nm">'+Y.nm+'</span>':'')):"";
      // 연도별 서사(선택) — korsica 지도처럼 한 장이 슬라이드로 완결되게
      if(Y&&Y.desc){ descEl.textContent=Y.desc; descEl.style.display=""; } else { descEl.style.display="none"; }
      renderLegend();
    }

    var track=tl.querySelector(".cmap-tl-track");
    years.forEach(function(Y,i){ var d=document.createElement("button"); d.className="cmap-tl-dot"+(i===0?" on":"");
      d.innerHTML='<span class="dot"></span><span class="yr">'+Y.y+'</span>';
      if(Y.nm) d.title=Y.nm;
      d.onclick=function(){ setYear(i); };
      track.appendChild(d); });
    function setYear(i){ yearIdx=Math.max(0,Math.min(years.length-1,i)); year=years[yearIdx].y;
      rebuildCoast();
      track.querySelectorAll(".cmap-tl-dot").forEach(function(x,xi){ x.classList.toggle("on",xi===yearIdx); });
      var act=track.children[yearIdx]; if(act&&act.scrollIntoView) act.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});
      draw(); }
    tl.querySelectorAll(".cmap-tl-nav").forEach(function(b){ b.onclick=function(){ setYear(yearIdx+(+b.dataset.d)); }; });
    // 초기 화면(initFocus: [서경,남위,동경,북위]) — 주 무대 중심으로 시작, 전세계는 축소로
    var initVB={x:0,y:0,w:W,h:H};
    if(opts.initFocus){ (function(){ var f=opts.initFocus, p1=proj(f[0],f[3]), p2=proj(f[2],f[1]);
      var ar0=dispAR||(W/H), bw=p2[0]-p1[0], bh=p2[1]-p1[1];
      var nw=Math.min(W, Math.max(bw, bh*ar0)), nh=nw/ar0;
      vb={ x:(p1[0]+p2[0])/2-nw/2, y:(p1[1]+p2[1])/2-nh/2, w:nw, h:nh };
      clampVB(); initVB={x:vb.x,y:vb.y,w:vb.w,h:vb.h}; applyVB();
    })(); }
    // 작은 화면: 첫 화면을 콘텐츠(영토·도시) 범위로 맞춰 라벨이 뭉치지 않게 (initFocus가 있으면 그쪽 우선)
    if(!opts.initFocus && (svg.clientWidth||820)<560){ (function(){ var b=null;
      function add(x,y){ if(!b){ b=[x,y,x,y]; return; } if(x<b[0])b[0]=x; if(x>b[2])b[2]=x; if(y<b[1])b[1]=y; if(y>b[3])b[3]=y; }
      Object.keys(map.territories||{}).forEach(function(yy){ (map.territories[yy]||[]).forEach(function(t){ var bb=pbox(t.d); if(bb){ add(bb[0],bb[1]); add(bb[2],bb[3]); } }); });
      (map.cities||[]).forEach(function(c){ var p=proj(c.lon,c.lat); add(p[0],p[1]); });
      if(!b) return;
      var pad=22, ar=W/H, nw=Math.max(b[2]-b[0]+pad*2,(b[3]-b[1]+pad*2)*ar);
      if(nw>=W) return;
      vb.w=nw; vb.h=nw/ar;
      vb.x=Math.max(0,Math.min(W-vb.w,(b[0]+b[2])/2-vb.w/2));
      vb.y=Math.max(0,Math.min(H-vb.h,(b[1]+b[3])/2-vb.h/2));
      applyVB();
    })(); }
    rebuildCoast();
    draw();
  }

  window.CheeseMap = { render: render };
})();
