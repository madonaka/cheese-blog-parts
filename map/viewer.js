/* ==================================================
   Cheese History Map — 공개 뷰어 (읽기 전용, 의존성 없음)
   ES Module 아님. 일반 <script> 로 로드하면 window.CheeseMap 노출.

   사용:
     CheeseMap.render(mountEl, {
       map:      <published 지도 JSON>,      // Firestore published 또는 data/samguk-map.json
       rivers:   {classes:[{w,d}], lakes},   // assets/rivers.json
       land:     "<land path d>",            // assets/land.json 의 .land
       reliefUrl:"https://cdn.../relief.png" // 지형 PNG (jsDelivr 등)
     });

   인터랙션: 휠 줌(커서 기준) · 드래그 이동 · 핀치 줌 · ＋/－/⟳/⛶/📷 버튼.
   줌 대응: 강 굵기 √k 감쇠, 라벨 크기·halo 비례,
            축소(k>0.6)에선 수도★만 표시, 나라 라벨 충돌 회피.
   모바일: 첫 화면은 콘텐츠 범위로 자동 확대, 최대 줌은 화면폭 비례로 심화,
           전체화면은 화면 비율에 viewBox를 맞춤(미지원 브라우저는 고정 오버레이 폴백).
   ================================================== */
(function(){
  var NS="http://www.w3.org/2000/svg";
  function el(t,a){ var e=document.createElementNS(NS,t); for(var k in a) e.setAttribute(k,a[k]); return e; }
  function pbox(d){ var m=d.match(/-?\d+\.?\d*/g); if(!m)return null; var b=[9e9,9e9,-9e9,-9e9];
    for(var i=0;i<m.length-1;i+=2){ var x=+m[i],y=+m[i+1]; if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y; } return b; }
  function darken(hex){ var m=/^#?([0-9a-f]{6})$/i.exec(hex||""); if(!m) return "#2a2417";
    var v=parseInt(m[1],16); return "rgb("+Math.round(((v>>16)&255)*0.5)+","+Math.round(((v>>8)&255)*0.5)+","+Math.round((v&255)*0.5)+")"; }

  function render(mount, opts){
    var map=opts.map, rivers=opts.rivers||{}, reliefUrl=opts.reliefUrl, landD=opts.land||"";
    var cfg=map.cfg, kx=Math.cos((cfg.WIN[1]+cfg.WIN[3])/2*Math.PI/180);
    function proj(lon,lat){ return [ (lon-cfg.WIN[0])*kx*cfg.SCALE+cfg.pad, (cfg.WIN[3]-lat)*cfg.SCALE+cfg.pad ]; }
    var COLOR={}, NAME={};
    map.nations.forEach(function(n){ COLOR[n.id]=n.color; NAME[n.id]=n.name; });
    var years=map.years.slice().sort(function(a,b){ return (+a.y)-(+b.y); });
    var yearIdx=0, year=years[0].y, vis={terr:1,river:1,city:1};

    var W=+map.viewBox.split(" ")[2], H=+map.viewBox.split(" ")[3];
    var vb={x:0,y:0,w:W,h:H};

    mount.classList.add("cmap"); mount.innerHTML="";
    if(opts.title){ var h=document.createElement("h2"); h.className="cmap-title"; h.textContent=opts.title; mount.appendChild(h); }
    var sub=document.createElement("p"); sub.className="cmap-sub"; mount.appendChild(sub);

    // 연대 타임라인 (◀ ▶ + 연대선 점)
    var tl=document.createElement("div"); tl.className="cmap-timeline";
    tl.innerHTML='<button class="cmap-tl-nav" data-d="-1" aria-label="이전 시대">◀</button><div class="cmap-tl-track"></div><button class="cmap-tl-nav" data-d="1" aria-label="다음 시대">▶</button>';
    mount.appendChild(tl);
    // 레이어 토글
    var lb=document.createElement("div"); lb.className="cmap-bar";
    lb.innerHTML='<span class="cmap-lbl">레이어</span>';
    [["terr","영토"],["river","강"],["city","도시"]].forEach(function(t){
      var b=document.createElement("button"); b.className="cmap-btn on"; b.textContent=t[1]; b.dataset.l=t[0];
      b.onclick=function(){ vis[t[0]]=!vis[t[0]]; b.classList.toggle("on",!!vis[t[0]]); draw(); }; lb.appendChild(b); });
    mount.appendChild(lb);

    // 지도 래퍼(+줌 버튼 오버레이)
    var wrap=document.createElement("div"); wrap.className="cmap-mapwrap"; mount.appendChild(wrap);
    var svg=el("svg",{class:"cmap-svg",viewBox:map.viewBox}); svg.style.background=(cfg.ocean||"#5f8389");
    wrap.appendChild(svg);
    var zoomBox=document.createElement("div"); zoomBox.className="cmap-zoom";
    zoomBox.innerHTML='<button data-z="in" aria-label="확대">＋</button><button data-z="out" aria-label="축소">－</button><button data-z="rst" aria-label="원래대로">⟳</button><button data-z="fs" aria-label="전체화면">⛶</button><button data-z="shot" aria-label="이미지 저장">📷</button>';
    wrap.appendChild(zoomBox);

    // 해안선 기준 = 벡터 land 하나로 통일: relief(투명 바다)·강·영토를 land 모양으로 클립
    var clipId=null, landEl=null;
    if(landD){
      clipId="cmapClip"+(++render._n||(render._n=1));
      var defs=el("defs",{}); var cp=el("clipPath",{id:clipId}); cp.appendChild(el("path",{d:landD})); defs.appendChild(cp); svg.appendChild(defs);
      landEl=el("path",{class:"cmap-land",d:landD}); svg.appendChild(landEl);
    }
    function clipped(g){ if(clipId) g.setAttribute("clip-path","url(#"+clipId+")"); return g; }
    if(reliefUrl){ var img=el("image",{x:0,y:0,width:W,height:H,preserveAspectRatio:"none"});
      img.setAttributeNS("http://www.w3.org/1999/xlink","href",reliefUrl); img.setAttribute("href",reliefUrl);
      if(clipId) img.setAttribute("clip-path","url(#"+clipId+")"); svg.appendChild(img); }

    var gRiver=clipped(el("g",{class:"cmap-rivers"}));
    if(rivers.lakes){ gRiver.appendChild(el("path",{class:"cmap-lake",d:rivers.lakes})); }
    if(rivers.classes){ rivers.classes.forEach(function(c){ var p=el("path",{class:"cmap-river","stroke-width":c.w,d:c.d}); p.dataset.w=c.w; gRiver.appendChild(p); }); }
    else { gRiver.appendChild(el("path",{class:"cmap-river mn",d:rivers.minor||""})); gRiver.appendChild(el("path",{class:"cmap-river mj",d:rivers.major||""})); }
    svg.appendChild(gRiver);
    var gTerr=clipped(el("g",{})), gTL=el("g",{}), gCity=el("g",{});
    svg.appendChild(gTerr); svg.appendChild(gTL); svg.appendChild(gCity);

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
      map.nations.forEach(function(n){ if(present[n.id]) html+='<span><i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:'+n.color+'"></i> '+n.name+'</span>'; });
      lg.innerHTML=html;
    }
    if(opts.note){ var nt=document.createElement("p"); nt.className="cmap-note"; nt.textContent=opts.note; mount.appendChild(nt); }

    // ── 줌/패닝 ──
    function applyVB(){ svg.setAttribute("viewBox",vb.x+" "+vb.y+" "+vb.w+" "+vb.h); }
    function zoomAt(cx,cy,f){ var maxW=Math.min(W,H*vb.w/vb.h);
      var minW=W*0.065*Math.min(1,(svg.clientWidth||820)/820); // 작은 화면은 더 깊게 확대 — 화면픽셀 기준 데스크톱과 같은 배율까지
      var nw=Math.min(maxW,Math.max(minW,vb.w*f)); var s=nw/vb.w;
      vb.x=cx-(cx-vb.x)*s; vb.y=cy-(cy-vb.y)*s; vb.w=nw; vb.h*=s;
      vb.x=Math.max(0,Math.min(W-vb.w,vb.x)); vb.y=Math.max(0,Math.min(H-vb.h,vb.y)); applyVB(); draw(); }
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
        vb.x=Math.max(0,Math.min(W-vb.w,vb.x)); vb.y=Math.max(0,Math.min(H-vb.h,vb.y)); applyVB(); } });
    function endPtr(e){ ptrs.delete(e.pointerId); pinchD=0;
      if(ptrs.size===1){ var only; ptrs.forEach(function(v){ only=v; }); pan={sx:only.x,sy:only.y,vx:vb.x,vy:vb.y}; }
      else pan=null; }
    svg.addEventListener("pointerup",endPtr); svg.addEventListener("pointercancel",endPtr);
    // viewBox 비율을 화면 비율에 맞춤 — 세로 폰 전체화면에서 위아래 바다 여백(지형 잘림처럼 보임) 없이 꽉 차게
    function refit(){ var fs=document.fullscreenElement===wrap||wrap.classList.contains("cmap-fsfake");
      var ar=fs?((wrap.clientWidth||1)/(wrap.clientHeight||1)):(W/H);
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
    var EXPORT_CSS='.cmap-land{fill:#f2f0e8;stroke:#c7b998;stroke-linejoin:round}'
      +'.cmap-rivers{opacity:.55}.cmap-river{fill:none;stroke:#3d6f8e;stroke-linejoin:round;stroke-linecap:round}.cmap-lake{fill:#3d6f8e}'
      +'.cmap-terr{fill-opacity:.4;stroke:#fff;stroke-opacity:.8;stroke-linejoin:round}'
      +'.cmap-terrlab{fill:#20242a;paint-order:stroke;stroke:#fff;stroke-linejoin:round;text-anchor:middle;font-weight:700}'
      +'.cmap-citylab{fill:#1c1a12;paint-order:stroke;stroke:#fff;stroke-linejoin:round;font-weight:700}'
      +'.cmap-region{fill:#514a38;text-anchor:middle;font-style:italic;font-weight:600;paint-order:stroke;stroke:rgba(255,255,255,.85);stroke-linejoin:round}'
      +'text{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif}';
    var reliefDataUrl=null;
    function blobToDataURL(b){ return new Promise(function(res){ var fr=new FileReader(); fr.onload=function(){ res(fr.result); }; fr.readAsDataURL(b); }); }
    function loadImg(src){ return new Promise(function(res,rej){ var im=new Image(); im.crossOrigin="anonymous"; im.onload=function(){ res(im); }; im.onerror=rej; im.src=src; }); }
    function exportImage(btn){
      var brand=opts.brand||{};
      var old=btn.textContent; btn.textContent="⏳"; btn.disabled=true;
      var done=function(){ btn.textContent=old; btn.disabled=false; };
      var p = reliefDataUrl ? Promise.resolve(reliefDataUrl)
        : (reliefUrl ? fetch(reliefUrl).then(function(r){return r.blob();}).then(blobToDataURL).then(function(d){ reliefDataUrl=d; return d; }) : Promise.resolve(null));
      Promise.all([p, brand.logo? loadImg(brand.logo).catch(function(){return null;}) : Promise.resolve(null),
                   (document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve()])
      .then(function(rs){ var reliefD=rs[0], logoImg=rs[1];
        // 현재 뷰 그대로 SVG 복제 → 지형을 dataURL로 치환 → 스타일 내장
        var cl=svg.cloneNode(true);
        var mapW=1600, mapH=Math.round(mapW*vb.h/vb.w);
        cl.setAttribute("width",mapW); cl.setAttribute("height",mapH);
        var st=document.createElementNS(NS,"style"); st.textContent=EXPORT_CSS; cl.insertBefore(st, cl.firstChild);
        var bg=el("rect",{x:vb.x,y:vb.y,width:vb.w,height:vb.h,fill:(cfg.ocean||"#5f8389")}); cl.insertBefore(bg, st.nextSibling);
        var imEl=cl.querySelector("image");
        if(imEl){ if(reliefD){ imEl.setAttribute("href",reliefD); imEl.setAttributeNS("http://www.w3.org/1999/xlink","href",reliefD); } else imEl.remove(); }
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
      else { vb={x:0,y:0,w:W,h:H}; refit(); } }; });

    // ── 렌더 ──
    function draw(){
      var k=vb.w/W;
      var us=W/820; // viewBox 규모 보정 — 지도 좌표계 크기와 무관하게 라벨 화면 크기 동일
      var ui=Math.min(2.6, Math.max(1, 820/((svg.clientWidth||820)))); // 모바일 확대 배율 — 작은 화면일수록 라벨·기호를 키움
      var ku=k*ui*us;
      gRiver.style.display=vis.river?"":"none";
      // 강 굵기 줌 감쇠(√k)
      var rk=Math.pow(k,0.5)*Math.sqrt(ui)*us;
      gRiver.querySelectorAll(".cmap-river").forEach(function(p){ if(p.dataset.w) p.setAttribute("stroke-width",(+p.dataset.w)*rk); });
      gTerr.innerHTML=""; gTL.innerHTML=""; gCity.innerHTML="";
      if(landEl) landEl.style.strokeWidth=(0.7*ku)+"px";

      // 지역 통칭(요동·말갈 등) — 좁은 화면의 넓은 뷰에서는 숨겨 라벨 밀집 완화
      if(map.regions && !(ui>1.5 && k>0.45)){ map.regions.forEach(function(r){ if(!r.y||!r.y[year]) return; var p=proj(r.lon,r.lat);
        var t2=el("text",{x:p[0],y:p[1],class:"cmap-region"}); t2.style.fontSize=(12*ku)+"px";
        t2.style.letterSpacing=(0.1*12*ku)+"px"; t2.style.strokeWidth=(2.2*ku)+"px";
        t2.textContent=r.name; gTL.appendChild(t2); }); }

      // 도시(줌 규칙 + 시대별 이름)
      var wide=k>0.6, cityPts=[];
      if(vis.city && map.cities){ map.cities.forEach(function(c){ var info=c.y[year]; if(!info) return;
        var p=proj(c.lon,c.lat), col=COLOR[info[0]]||"#555"; cityPts.push(p);
        if(wide && info[1]!=="cap") return;
        var g=el("g",{});
        if(info[1]==="cap"){ var ss=(wide?9.5:16)*ku;
          var s=el("text",{x:p[0],y:p[1]+ss*0.34,"text-anchor":"middle","font-size":ss,fill:col,
            style:"paint-order:stroke;stroke:#fff;stroke-width:"+((wide?1.5:2.4)*ku)+"px"}); s.textContent="★"; g.appendChild(s); }
        else g.appendChild(el("circle",{cx:p[0],cy:p[1],r:4*ku,fill:col,stroke:"#fff","stroke-width":1*ku}));
        if(!wide){ var lab=el("text",{x:p[0]+(info[1]==="cap"?9:7)*ku,y:p[1]+4*ku,class:"cmap-citylab"}); lab.style.fontSize=(11*ku)+"px";
          lab.style.strokeWidth=(2.4*ku)+"px"; lab.textContent=(info[2]||c.name); g.appendChild(lab); }
        gCity.appendChild(g); }); }

      // 영토 + 나라 라벨(충돌 회피)
      var placedLabs=[];
      if(vis.terr){ (map.territories[year]||[]).forEach(function(t){
        var tp=el("path",{class:"cmap-terr",d:t.d,fill:COLOR[t.id]||"#888","fill-rule":"evenodd"}); tp.style.strokeWidth=(1.2*ku)+"px"; gTerr.appendChild(tp);
        var b=pbox(t.d); if(!b) return;
        var nm=NAME[t.id]||"", fs=16*ku;
        if(ui>1){ // 좁은 화면: 작은 영토는 라벨 확대(ui)를 깎아 겹침 완화 — 화면상 최소 ~11px는 보장
          var fit=1.7*Math.max(b[2]-b[0],b[3]-b[1])/(1.24*Math.max(1,nm.length));
          var minFs=11*vb.w/(svg.clientWidth||820);
          fs=Math.min(fs, Math.max(fit, minFs, 16*k*us));
        }
        var lx=(b[0]+b[2])/2, ly=(b[1]+b[3])/2+4*ku;
        var halfW=nm.length*fs*0.62;
        function clash(y){ return cityPts.some(function(p){ return Math.abs(p[0]-lx)<halfW+16*ku && Math.abs(p[1]-y)<fs*0.85; })
          || placedLabs.some(function(q){ return Math.abs(q[0]-lx)<halfW+q[2] && Math.abs(q[1]-y)<fs; }); }
        for(var tr=0; tr<5 && clash(ly); tr++){ ly += (tr%2? -1:1)*(tr+1)*fs*0.95; }
        placedLabs.push([lx,ly,halfW]);
        var tx=el("text",{x:lx,y:ly,class:"cmap-terrlab"}); tx.style.fontSize=fs+"px";
        tx.style.letterSpacing=(0.14*fs)+"px"; tx.style.strokeWidth=(3*ku)+"px"; tx.style.fill=darken(COLOR[t.id]);
        tx.textContent=nm; gTL.appendChild(tx); }); }

      var Y=years[yearIdx]; sub.innerHTML=Y?('<b class="cmap-sub-year">'+Y.y+'년</b>'+(Y.nm?' <span class="cmap-sub-nm">'+Y.nm+'</span>':'')):"";
      renderLegend();
    }

    var track=tl.querySelector(".cmap-tl-track");
    years.forEach(function(Y,i){ var d=document.createElement("button"); d.className="cmap-tl-dot"+(i===0?" on":"");
      d.innerHTML='<span class="dot"></span><span class="yr">'+Y.y+'</span>';
      if(Y.nm) d.title=Y.nm;
      d.onclick=function(){ setYear(i); };
      track.appendChild(d); });
    function setYear(i){ yearIdx=Math.max(0,Math.min(years.length-1,i)); year=years[yearIdx].y;
      track.querySelectorAll(".cmap-tl-dot").forEach(function(x,xi){ x.classList.toggle("on",xi===yearIdx); });
      var act=track.children[yearIdx]; if(act&&act.scrollIntoView) act.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});
      draw(); }
    tl.querySelectorAll(".cmap-tl-nav").forEach(function(b){ b.onclick=function(){ setYear(yearIdx+(+b.dataset.d)); }; });
    // 작은 화면: 첫 화면을 콘텐츠(영토·도시) 범위로 맞춰 라벨이 뭉치지 않게
    if((svg.clientWidth||820)<560){ (function(){ var b=null;
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
    draw();
  }

  window.CheeseMap = { render: render };
})();
