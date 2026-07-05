/* ==================================================
   Cheese History Map — 공개 뷰어 (읽기 전용, 의존성 없음)
   ES Module 아님. 일반 <script> 로 로드하면 window.CheeseMap 노출.

   사용:
     CheeseMap.render(mountEl, {
       map:      <published 지도 JSON>,     // data/samguk-map.json 형식
       rivers:   {major, minor},            // assets/rivers.json (선택)
       reliefUrl:"https://cdn.../relief.png" // 지형 PNG (jsDelivr 등)
     });

   published 지도 JSON 계약:
     { viewBox, cfg:{WIN,SCALE,pad},
       nations:[{id,name,color}],
       years:[{y,nm}],
       territories:{ "<year>":[{id, d}] },   // d = 겹침 절단 완료된 SVG path (투영 완료)
       cities:[{name,lon,lat, y:{ "<year>":[ownerId,"cap"|"fort"] }}] }
   ================================================== */
(function(){
  var NS="http://www.w3.org/2000/svg";
  function el(t,a){ var e=document.createElementNS(NS,t); for(var k in a) e.setAttribute(k,a[k]); return e; }
  function pbox(d){ var m=d.match(/-?\d+\.?\d*/g); if(!m)return null; var b=[9e9,9e9,-9e9,-9e9];
    for(var i=0;i<m.length-1;i+=2){ var x=+m[i],y=+m[i+1]; if(x<b[0])b[0]=x;if(x>b[2])b[2]=x;if(y<b[1])b[1]=y;if(y>b[3])b[3]=y; } return b; }

  function render(mount, opts){
    var map=opts.map, rivers=opts.rivers||{major:"",minor:""}, reliefUrl=opts.reliefUrl, landD=opts.land||"";
    var cfg=map.cfg, kx=Math.cos((cfg.WIN[1]+cfg.WIN[3])/2*Math.PI/180);
    function proj(lon,lat){ return [ (lon-cfg.WIN[0])*kx*cfg.SCALE+cfg.pad, (cfg.WIN[3]-lat)*cfg.SCALE+cfg.pad ]; }
    var COLOR={}; map.nations.forEach(function(n){ COLOR[n.id]=n.color; });
    var NAME={}; map.nations.forEach(function(n){ NAME[n.id]=n.name; });
    var year=map.years[0].y, vis={terr:1,river:1,city:1};

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

    var svg=el("svg",{class:"cmap-svg",viewBox:map.viewBox}); svg.style.background=(cfg.ocean||"#5f8389");
    // 해안선 기준 = 벡터 land 하나로 통일: relief(투명 바다)·강·영토를 land 모양으로 클립
    var clipId=null;
    if(landD){
      clipId="cmapClip"+(++render._n||(render._n=1));
      var defs=el("defs",{}); var cp=el("clipPath",{id:clipId}); cp.appendChild(el("path",{d:landD})); defs.appendChild(cp); svg.appendChild(defs);
      svg.appendChild(el("path",{class:"cmap-land",d:landD}));
    }
    function clipped(g){ if(clipId) g.setAttribute("clip-path","url(#"+clipId+")"); return g; }
    if(reliefUrl){ var img=el("image",{x:0,y:0,width:map.viewBox.split(" ")[2],height:map.viewBox.split(" ")[3],preserveAspectRatio:"none"}); img.setAttributeNS("http://www.w3.org/1999/xlink","href",reliefUrl); img.setAttribute("href",reliefUrl); if(clipId)img.setAttribute("clip-path","url(#"+clipId+")"); svg.appendChild(img); }
    var gRiver=clipped(el("g",{class:"cmap-rivers"}));
    if(rivers.classes){ rivers.classes.forEach(function(c){ gRiver.appendChild(el("path",{class:"cmap-river","stroke-width":c.w,d:c.d})); }); } // HydroRIVERS 등급별 굵기
    else { gRiver.appendChild(el("path",{class:"cmap-river mn",d:rivers.minor||""})); gRiver.appendChild(el("path",{class:"cmap-river mj",d:rivers.major||""})); }
    svg.appendChild(gRiver);
    var gTerr=clipped(el("g",{})), gTL=el("g",{}), gCity=el("g",{}); svg.appendChild(gTerr); svg.appendChild(gTL); svg.appendChild(gCity);
    mount.appendChild(svg);

    // 범례
    var lg=document.createElement("div"); lg.className="cmap-legend";
    lg.innerHTML='<span><svg width="14" height="14"><text x="7" y="11" text-anchor="middle" font-size="13" fill="#c0453f">★</text></svg> 수도</span>'
      +'<span><svg width="14" height="14"><circle cx="7" cy="7" r="4" fill="#3f6fb0" stroke="#fff"/></svg> 성</span>';
    map.nations.forEach(function(n){ lg.innerHTML+='<span><i style="display:inline-block;width:11px;height:11px;border-radius:2px;background:'+n.color+'"></i> '+n.name+'</span>'; });
    mount.appendChild(lg);
    if(opts.note){ var nt=document.createElement("p"); nt.className="cmap-note"; nt.textContent=opts.note; mount.appendChild(nt); }

    function draw(){
      gRiver.style.display=vis.river?"":"none";
      gTerr.innerHTML=""; gTL.innerHTML=""; gCity.innerHTML="";
      if(vis.terr){ (map.territories[year]||[]).forEach(function(t){
        gTerr.appendChild(el("path",{class:"cmap-terr",d:t.d,fill:COLOR[t.id]||"#888","fill-rule":"evenodd"}));
        var b=pbox(t.d); if(b){ var tx=el("text",{x:(b[0]+b[2])/2,y:(b[1]+b[3])/2,class:"cmap-terrlab"}); tx.textContent=NAME[t.id]||""; gTL.appendChild(tx); } }); }
      if(vis.city){ map.cities.forEach(function(c){ var info=c.y[year]; if(!info)return; var p=proj(c.lon,c.lat), col=COLOR[info[0]]||"#555"; var g=el("g",{});
        if(info[1]==="cap"){ var s=el("text",{x:p[0],y:p[1]+5,"text-anchor":"middle","font-size":16,fill:col,style:"paint-order:stroke;stroke:#fff;stroke-width:2.4px"}); s.textContent="★"; g.appendChild(s); }
        else g.appendChild(el("circle",{cx:p[0],cy:p[1],r:4,fill:col,stroke:"#fff","stroke-width":1}));
        var lab=el("text",{x:p[0]+(info[1]==="cap"?9:7),y:p[1]+4,class:"cmap-citylab"}); lab.textContent=(info[2]||c.name); g.appendChild(lab); gCity.appendChild(g); }); } // info[2]=시대별 이름(개칭)
      var Y=null; map.years.forEach(function(y){ if(y.y===year)Y=y; }); sub.textContent=Y?(Y.y+"년 · "+Y.nm):"";
    }

    map.years.forEach(function(Y,i){ var b=document.createElement("button"); b.className="cmap-btn"+(i===0?" on":"");
      b.innerHTML='<b style="font-family:Georgia,serif">'+Y.y+'년</b> · '+Y.nm;
      b.onclick=function(){ year=Y.y; yb.querySelectorAll(".cmap-btn").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); draw(); };
      yb.appendChild(b); });
    draw();
  }

  window.CheeseMap = { render: render };
})();
