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

   인터랙션: 휠 줌(커서 기준) · 드래그 이동 · ＋/－/⟳ 버튼.
   줌 대응: 강 굵기 √k 감쇠, 라벨 크기·halo 비례,
            축소(k>0.6)에선 수도★만 표시, 나라 라벨 충돌 회피.
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
    var year=map.years[0].y, vis={terr:1,river:1,city:1};

    var W=+map.viewBox.split(" ")[2], H=+map.viewBox.split(" ")[3];
    var vb={x:0,y:0,w:W,h:H};

    mount.classList.add("cmap"); mount.innerHTML="";
    if(opts.title){ var h=document.createElement("h2"); h.className="cmap-title"; h.textContent=opts.title; mount.appendChild(h); }
    var sub=document.createElement("p"); sub.className="cmap-sub"; mount.appendChild(sub);

    // 연도 버튼
    var yb=document.createElement("div"); yb.className="cmap-bar"; mount.appendChild(yb);
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
    zoomBox.innerHTML='<button data-z="in" aria-label="확대">＋</button><button data-z="out" aria-label="축소">－</button><button data-z="rst" aria-label="원래대로">⟳</button>';
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

    // 범례
    var lg=document.createElement("div"); lg.className="cmap-legend";
    lg.innerHTML='<span><svg width="14" height="14"><text x="7" y="11" text-anchor="middle" font-size="13" fill="#c0453f">★</text></svg> 수도</span>'
      +'<span><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#3f6fb0" stroke="#fff"/></svg> 성</span>';
    map.nations.forEach(function(n){ lg.innerHTML+='<span><i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:'+n.color+'"></i> '+n.name+'</span>'; });
    mount.appendChild(lg);
    if(opts.note){ var nt=document.createElement("p"); nt.className="cmap-note"; nt.textContent=opts.note; mount.appendChild(nt); }

    // ── 줌/패닝 ──
    function applyVB(){ svg.setAttribute("viewBox",vb.x+" "+vb.y+" "+vb.w+" "+vb.h); }
    function zoomAt(cx,cy,f){ var nw=Math.min(W,Math.max(W*0.13,vb.w*f)); var s=nw/vb.w;
      vb.x=cx-(cx-vb.x)*s; vb.y=cy-(cy-vb.y)*s; vb.w=nw; vb.h*=s;
      vb.x=Math.max(0,Math.min(W-vb.w,vb.x)); vb.y=Math.max(0,Math.min(H-vb.h,vb.y)); applyVB(); draw(); }
    function svgXY(e){ var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
      var q=pt.matrixTransform(svg.getScreenCTM().inverse()); return [q.x,q.y]; }
    var pan=null;
    svg.addEventListener("pointerdown",function(e){ e.preventDefault();
      pan={sx:e.clientX,sy:e.clientY,vx:vb.x,vy:vb.y}; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove",function(e){ if(!pan) return;
      var sc=vb.w/svg.clientWidth; vb.x=pan.vx-(e.clientX-pan.sx)*sc; vb.y=pan.vy-(e.clientY-pan.sy)*sc;
      vb.x=Math.max(0,Math.min(W-vb.w,vb.x)); vb.y=Math.max(0,Math.min(H-vb.h,vb.y)); applyVB(); });
    svg.addEventListener("pointerup",function(){ pan=null; });
    svg.addEventListener("wheel",function(e){ e.preventDefault(); var xy=svgXY(e); zoomAt(xy[0],xy[1], e.deltaY<0?0.84:1.19); },{passive:false});
    zoomBox.querySelectorAll("button").forEach(function(b){ b.onclick=function(){
      if(b.dataset.z==="in") zoomAt(vb.x+vb.w/2, vb.y+vb.h/2, 0.7);
      else if(b.dataset.z==="out") zoomAt(vb.x+vb.w/2, vb.y+vb.h/2, 1.43);
      else { vb={x:0,y:0,w:W,h:H}; applyVB(); draw(); } }; });

    // ── 렌더 ──
    function draw(){
      var k=vb.w/W;
      gRiver.style.display=vis.river?"":"none";
      // 강 굵기 줌 감쇠(√k)
      var rk=Math.pow(k,0.5);
      gRiver.querySelectorAll(".cmap-river").forEach(function(p){ if(p.dataset.w) p.setAttribute("stroke-width",(+p.dataset.w)*rk); });
      gTerr.innerHTML=""; gTL.innerHTML=""; gCity.innerHTML="";
      if(landEl) landEl.style.strokeWidth=(0.7*k)+"px";

      // 지역 통칭(요동·말갈 등)
      if(map.regions){ map.regions.forEach(function(r){ if(!r.y||!r.y[year]) return; var p=proj(r.lon,r.lat);
        var t2=el("text",{x:p[0],y:p[1],class:"cmap-region"}); t2.style.fontSize=(12*k)+"px";
        t2.style.letterSpacing=(0.1*12*k)+"px"; t2.style.strokeWidth=(2.2*k)+"px";
        t2.textContent=r.name; gTL.appendChild(t2); }); }

      // 도시(줌 규칙 + 시대별 이름)
      var wide=k>0.6, cityPts=[];
      if(vis.city && map.cities){ map.cities.forEach(function(c){ var info=c.y[year]; if(!info) return;
        var p=proj(c.lon,c.lat), col=COLOR[info[0]]||"#555"; cityPts.push(p);
        if(wide && info[1]!=="cap") return;
        var g=el("g",{});
        if(info[1]==="cap"){ var ss=(wide?9.5:16)*k;
          var s=el("text",{x:p[0],y:p[1]+ss*0.34,"text-anchor":"middle","font-size":ss,fill:col,
            style:"paint-order:stroke;stroke:#fff;stroke-width:"+((wide?1.5:2.4)*k)+"px"}); s.textContent="★"; g.appendChild(s); }
        else g.appendChild(el("circle",{cx:p[0],cy:p[1],r:4*k,fill:col,stroke:"#fff","stroke-width":1*k}));
        if(!wide){ var lab=el("text",{x:p[0]+(info[1]==="cap"?9:7)*k,y:p[1]+4*k,class:"cmap-citylab"}); lab.style.fontSize=(11*k)+"px";
          lab.style.strokeWidth=(2.4*k)+"px"; lab.textContent=(info[2]||c.name); g.appendChild(lab); }
        gCity.appendChild(g); }); }

      // 영토 + 나라 라벨(충돌 회피)
      var placedLabs=[];
      if(vis.terr){ (map.territories[year]||[]).forEach(function(t){
        var tp=el("path",{class:"cmap-terr",d:t.d,fill:COLOR[t.id]||"#888","fill-rule":"evenodd"}); tp.style.strokeWidth=(1.2*k)+"px"; gTerr.appendChild(tp);
        var b=pbox(t.d); if(!b) return;
        var fs=16*k, lx=(b[0]+b[2])/2, ly=(b[1]+b[3])/2+4*k;
        var nm=NAME[t.id]||"", halfW=nm.length*fs*0.62;
        function clash(y){ return cityPts.some(function(p){ return Math.abs(p[0]-lx)<halfW+16*k && Math.abs(p[1]-y)<fs*0.85; })
          || placedLabs.some(function(q){ return Math.abs(q[0]-lx)<halfW+q[2] && Math.abs(q[1]-y)<fs; }); }
        for(var tr=0; tr<5 && clash(ly); tr++){ ly += (tr%2? -1:1)*(tr+1)*fs*0.95; }
        placedLabs.push([lx,ly,halfW]);
        var tx=el("text",{x:lx,y:ly,class:"cmap-terrlab"}); tx.style.fontSize=fs+"px";
        tx.style.letterSpacing=(0.14*fs)+"px"; tx.style.strokeWidth=(3*k)+"px"; tx.style.fill=darken(COLOR[t.id]);
        tx.textContent=nm; gTL.appendChild(tx); }); }

      var Y=null; map.years.forEach(function(y){ if(y.y===year)Y=y; }); sub.textContent=Y?(Y.y+"년"+(Y.nm?" · "+Y.nm:"")):"";
    }

    map.years.forEach(function(Y,i){ var b=document.createElement("button"); b.className="cmap-btn"+(i===0?" on":"");
      b.innerHTML='<b style="font-family:Georgia,serif">'+Y.y+'년</b>'+(Y.nm?' · '+Y.nm:'');
      b.onclick=function(){ year=Y.y; yb.querySelectorAll(".cmap-btn").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); draw(); };
      yb.appendChild(b); });
    draw();
  }

  window.CheeseMap = { render: render };
})();
