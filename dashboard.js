/* C360 Entity Dashboard - JS v6
   Worker URL and key hardcoded - users see only the table */

window.C360_WORKER_URL = 'https://c360-cache.mehul-vadher.workers.dev';
window.C360_WORKER_KEY = 'c360dash2026';

window.C360 = {
  companies:[], contacts:[], projects:[],
  mgmtCos:[], funds:[], others:[],
  expanded:{}, drillOpen:{},
  filter:'all', circleFilter:'all', catFilter:'all',
  tagState:{}, allTags:[], allCats:[], allCircles:[],
  sortKey:'name', sortDir:1,
  clsOpen:false,
};

/* -- AUTO LOAD -- */
(function waitForDom(){
  if(document.getElementById('c360tbody')) window.c360loadData();
  else setTimeout(waitForDom,200);
})();

/* -- HELPERS -- */
window.c360esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
window.c360splitTags=function(tags){
  var out=[];
  (tags||[]).forEach(function(t){
    t.split(';').forEach(function(p){ var s=p.trim(); if(s) out.push(s); });
  });
  return out;
};

/* -- LOAD -- */
window.c360setLoading=function(){
  document.getElementById('c360tbody').innerHTML='<tr class="state-row"><td colspan="9"><div class="spinner"></div>Loading from cache...</td></tr>';
};

window.c360loadData=async function(){
  window.c360setLoading();
  try{
    var res=await fetch(window.C360_WORKER_URL+'/data',{headers:{'X-Dashboard-Key':window.C360_WORKER_KEY}});
    if(!res.ok) throw new Error(res.status+': '+await res.text());
    var snap=await res.json();
    window.C360.companies=snap.companies||[];
    window.C360.contacts=snap.contacts||[];
    window.C360.projects=snap.projects||[];

    /* sync badge */
    var dot=document.getElementById('c360dot'),info=document.getElementById('c360syncInfo');
    if(snap.synced_at){
      var mins=Math.round((Date.now()-new Date(snap.synced_at).getTime())/60000);
      if(dot) dot.classList.add('on');
      if(info) info.textContent=mins<2?'Live':'Synced '+mins+'m ago';
    }

    /* extract tags (split on ;), categories, circles */
    var tagSet={},catSet={},circleSet={};
    window.C360.companies.forEach(function(co){
      window.c360splitTags(co.tags).forEach(function(t){if(t)tagSet[t]=true;});
      if(co.category&&co.category.name) catSet[co.category.name]=true;
    });
    window.C360.contacts.forEach(function(ct){
      (ct.circles||[]).forEach(function(c){if(c)circleSet[c]=true;});
    });

    window.C360.allTags=Object.keys(tagSet).sort();
    window.C360.allCats=Object.keys(catSet).sort();
    window.C360.allCircles=Object.keys(circleSet).sort();

    window.C360.allTags.forEach(function(t){if(!(t in window.C360.tagState))window.C360.tagState[t]=null;});
    window.C360.allCats.forEach(function(c){var k='__cat__'+c;if(!(k in window.C360.tagState))window.C360.tagState[k]=null;});

    window.c360renderTagZones();
    window.c360buildCircleFilters();
    window.c360buildCatFilters();
    window.c360classify();
    window.c360updateMetrics();
    window.c360updateCounts();
    window.c360render();
  }catch(e){
    document.getElementById('c360tbody').innerHTML='<tr class="state-row"><td colspan="9">Error: '+window.c360esc(e.message)+'</td></tr>';
    console.error('[C360]',e);
  }
};

window.c360refresh=async function(){
  var btn=document.getElementById('c360btnRefresh');
  if(btn) btn.classList.add('spinning');
  await window.c360loadData();
  if(btn) btn.classList.remove('spinning');
};

/* -- TAG CLASSIFIER -- */
window.c360toggleCls=function(){
  window.C360.clsOpen=!window.C360.clsOpen;
  var p=document.getElementById('c360clsPanel');
  if(p){p.classList.toggle('expanded',window.C360.clsOpen);p.classList.toggle('collapsed',!window.C360.clsOpen);}
};

window.c360renderTagZones=function(){
  var zm=document.getElementById('c360zoneMgmt'),zf=document.getElementById('c360zoneFund'),zu=document.getElementById('c360zoneUnset');
  if(!zm)return;
  zm.innerHTML='';zf.innerHTML='';zu.innerHTML='';
  var hm=false,hf=false,hu=false;
  function pill(tag,label,state){
    var p=document.createElement('span');
    p.className='tag-pill'+(state==='mgmt'?' is-mgmt':state==='fund'?' is-fund':'');
    p.innerHTML=window.c360esc(label||tag);
    p.title='Click: unset -> Mgmt Co -> Fund -> unset';
    p.onclick=function(){window.c360cycleTag(tag);};
    if(state==='mgmt'){zm.appendChild(p);hm=true;}
    else if(state==='fund'){zf.appendChild(p);hf=true;}
    else{zu.appendChild(p);hu=true;}
  }
  window.C360.allTags.forEach(function(t){pill(t,t,window.C360.tagState[t]||null);});
  window.C360.allCats.forEach(function(c){var k='__cat__'+c;pill(k,c+' (cat)',window.C360.tagState[k]||null);});
  if(!hm)zm.innerHTML='<span style="font-size:11px;color:var(--text3);font-style:italic">click tags -></span>';
  if(!hf)zf.innerHTML='<span style="font-size:11px;color:var(--text3);font-style:italic">click tags -></span>';
  if(!hu)zu.innerHTML='<span style="font-size:11px;color:var(--text3);font-style:italic">all assigned</span>';
  var mc=window.C360.companies.filter(function(c){return window.c360getType(c)==='mgmt';}).length;
  var fc=window.C360.companies.filter(function(c){return window.c360getType(c)==='fund';}).length;
  var em=document.getElementById('c360cntMgmt'),ef=document.getElementById('c360cntFund');
  if(em)em.textContent=mc?mc+' matched':'';
  if(ef)ef.textContent=fc?fc+' matched':'';
};

window.c360cycleTag=function(tag){
  var cur=window.C360.tagState[tag]||null;
  window.C360.tagState[tag]=!cur?'mgmt':cur==='mgmt'?'fund':null;
  window.c360renderTagZones();
  window.c360classify();
  window.c360updateMetrics();
  window.c360updateCounts();
  window.c360render();
};

/* -- CIRCLE + CATEGORY FILTERS -- */
window.c360buildCircleFilters=function(){
  var el=document.getElementById('c360circleFilters');
  if(!el)return;
  if(!window.C360.allCircles.length){el.innerHTML='<span style="font-size:11px;color:var(--text3)">none in data</span>';return;}
  var html='<div class="fchip active" data-circle="all" onclick="window.c360setCircle(\'all\')">All</div>';
  window.C360.allCircles.forEach(function(c){
    html+='<div class="fchip" data-circle="'+window.c360esc(c)+'" onclick="window.c360setCircle(\''+window.c360esc(c)+'\')">'+window.c360esc(c)+'</div>';
  });
  el.innerHTML=html;
};

window.c360buildCatFilters=function(){
  var el=document.getElementById('c360catFilters');
  if(!el)return;
  if(!window.C360.allCats.length){el.innerHTML='<span style="font-size:11px;color:var(--text3)">none</span>';return;}
  var html='<div class="fchip active" data-cat="all" onclick="window.c360setCat(\'all\')">All</div>';
  window.C360.allCats.forEach(function(c){
    html+='<div class="fchip" data-cat="'+window.c360esc(c)+'" onclick="window.c360setCat(\''+window.c360esc(c)+'\')">'+window.c360esc(c)+'</div>';
  });
  el.innerHTML=html;
};

window.c360setCircle=function(circle){
  window.C360.circleFilter=circle;
  document.querySelectorAll('#c360circleFilters .fchip').forEach(function(c){c.classList.toggle('active',c.dataset.circle===circle);});
  window.c360render();
};

window.c360setCat=function(cat){
  window.C360.catFilter=cat;
  document.querySelectorAll('#c360catFilters .fchip').forEach(function(c){c.classList.toggle('active',c.dataset.cat===cat);});
  window.c360render();
};

/* -- CLASSIFY -- */
window.c360getType=function(co){
  var tags=window.c360splitTags(co.tags);
  for(var i=0;i<tags.length;i++){var s=window.C360.tagState[tags[i]];if(s==='mgmt')return 'mgmt';if(s==='fund')return 'fund';}
  var cat=co.category&&co.category.name;
  if(cat){var cs=window.C360.tagState['__cat__'+cat];if(cs==='mgmt')return 'mgmt';if(cs==='fund')return 'fund';}
  return 'other';
};

window.c360classify=function(){
  /* build contact->company map */
  var contactsByCompany={};
  window.C360.contacts.forEach(function(ct){
    (ct.companies||[]).forEach(function(co){
      if(!contactsByCompany[co.uid])contactsByCompany[co.uid]=[];
      contactsByCompany[co.uid].push(ct);
    });
  });

  /* build contactUID->companyUIDs map for project linking */
  var contactToCompanies={};
  window.C360.contacts.forEach(function(ct){
    contactToCompanies[ct.uid]=(ct.companies||[]).map(function(c){return c.uid;});
  });

  window.C360.companies.forEach(function(co){
    co._type=window.c360getType(co);
    co._projects=[];
    co._contacts=contactsByCompany[co.uid]||[];
    co._tags=window.c360splitTags(co.tags);
  });

  /* link projects -> companies */
  window.C360.projects.forEach(function(p){
    var linked=false;
    /* try direct company UID match */
    var clientUid=p.client&&p.client.uid;
    if(clientUid){
      /* check if client UID is a company */
      var co=null;
      for(var i=0;i<window.C360.companies.length;i++){
        if(window.C360.companies[i].uid===clientUid){co=window.C360.companies[i];break;}
      }
      if(co){co._projects.push(p);linked=true;}
      else{
        /* client UID is a contact - link to all companies that contact belongs to */
        var companyUids=contactToCompanies[clientUid]||[];
        companyUids.forEach(function(cuid){
          var c=window.C360.companies.find(function(x){return x.uid===cuid;});
          if(c){c._projects.push(p);linked=true;}
        });
        /* also try primaryContact match */
        if(!linked){
          window.C360.companies.forEach(function(c){
            if(c.primaryContact&&c.primaryContact.uid===clientUid){c._projects.push(p);linked=true;}
          });
        }
      }
    }
    /* secondary clients */
    (p.secondary_clients||[]).forEach(function(sc){
      var scCo=window.C360.companies.find(function(c){return c.uid===sc.uid;});
      if(scCo&&scCo._projects.indexOf(p)===-1)scCo._projects.push(p);
    });
  });

  window.C360.mgmtCos=window.C360.companies.filter(function(c){return c._type==='mgmt';});
  window.C360.funds=window.C360.companies.filter(function(c){return c._type==='fund';});
  window.C360.others=window.C360.companies.filter(function(c){return c._type==='other';});

  var newExp={};
  window.C360.mgmtCos.forEach(function(m){newExp[m.uid]=(m.uid in window.C360.expanded)?window.C360.expanded[m.uid]:true;});
  window.C360.expanded=newExp;
};

/* -- SORT -- */
window.c360sort=function(key){
  if(window.C360.sortKey===key)window.C360.sortDir*=-1;
  else{window.C360.sortKey=key;window.C360.sortDir=1;}
  document.querySelectorAll('span[id^="c360s-"]').forEach(function(s){s.textContent='';});
  var el=document.getElementById('c360s-'+key);
  if(el)el.textContent=window.C360.sortDir===1?' ^':' v';
  window.c360render();
};

function c360sortCompanies(list){
  return list.slice().sort(function(a,b){
    var key=window.C360.sortKey,dir=window.C360.sortDir;
    if(key==='projects')return dir*(a._projects.length-b._projects.length);
    return dir*a.name.localeCompare(b.name);
  });
}

/* -- FILTER CHECK -- */
function c360passesFilter(co){
  var cf=window.C360.circleFilter,catf=window.C360.catFilter;
  if(catf!=='all'&&(!co.category||co.category.name!==catf))return false;
  if(cf!=='all'){
    /* check if any contact linked to this company is in the circle */
    var inCircle=co._contacts.some(function(ct){return (ct.circles||[]).indexOf(cf)>-1;});
    if(!inCircle)return false;
  }
  return true;
}

/* -- RENDER -- */
window.c360render=function(){
  var q=(document.getElementById('c360srch').value||'').toLowerCase();
  var f=window.C360.filter;
  var tbody=document.getElementById('c360tbody');
  var html='';

  function matchQ(co){
    if(!q)return true;
    if(co.name.toLowerCase().indexOf(q)>-1)return true;
    if(co._projects.some(function(p){return (p.name||'').toLowerCase().indexOf(q)>-1;}))return true;
    return false;
  }

  function renderSection(list,type){
    c360sortCompanies(list).forEach(function(co){
      if(!matchQ(co))return;
      if(!c360passesFilter(co))return;
      html+=type==='mgmt'?window.c360mgmtRow(co):window.c360flatRow(co,type);
      if((type==='mgmt'&&window.C360.expanded[co.uid])||type!=='mgmt'){
        if(type==='mgmt'){
          html+=window.c360drillDown(co);
        }
      }
      if(type!=='mgmt'){
        if(window.C360.drillOpen[co.uid])html+=window.c360drillDown(co);
      }
    });
  }

  if(f==='mgmt'){renderSection(window.C360.mgmtCos,'mgmt');}
  else if(f==='fund'){renderSection(window.C360.funds,'fund');}
  else if(f==='other'){renderSection(window.C360.others,'other');}
  else{
    if(window.C360.mgmtCos.length){
      html+='<tr class="sec-hdr"><td colspan="9">Management Companies ('+window.C360.mgmtCos.length+')</td></tr>';
      renderSection(window.C360.mgmtCos,'mgmt');
    }
    if(window.C360.funds.length){
      html+='<tr class="sec-hdr"><td colspan="9">Funds / LPs ('+window.C360.funds.length+')</td></tr>';
      renderSection(window.C360.funds,'fund');
    }
    if(window.C360.others.length){
      html+='<tr class="sec-hdr"><td colspan="9">Other Companies ('+window.C360.others.length+') - use ? to classify</td></tr>';
      renderSection(window.C360.others,'other');
    }
  }

  if(!html)html='<tr class="state-row"><td colspan="9">No entities match.</td></tr>';
  tbody.innerHTML=html;
};

/* -- ROW BUILDERS -- */
window.c360mgmtRow=function(m){
  var isOpen=!!window.C360.expanded[m.uid];
  var p=m._projects,total=p.length,active=window.c360act(p),done=window.c360done(p);
  var pct=total?Math.round(done/total*100):0;
  var kids=window.C360.funds.filter(function(f){
    var tags=window.c360splitTags(f.tags).map(function(t){return t.toLowerCase();});
    return tags.indexOf(m.name.toLowerCase())>-1||tags.indexOf(m.name.toLowerCase().replace(/\s+/g,'-'))>-1;
  });
  kids.forEach(function(f){f._parentMgmt=m.uid;});
  return '<tr class="mgmt" onclick="window.c360tog(\''+m.uid+'\')">'+
    '<td><span class="chevron '+(isOpen?'open':'')+'">&#9654;</span>'+window.c360esc(m.name)+
    '<span class="badge b-mgmt" style="margin-left:8px;font-size:10px;">MGMT CO</span>'+
    (kids.length?'<span style="font-size:11px;opacity:.6;margin-left:6px;">'+kids.length+' fund'+(kids.length>1?'s':'')+'</span>':'')+
    '<span class="uid-tag">'+m.uid.slice(0,8)+'</span></td>'+
    '<td>'+window.c360catTagBubbles(m,'dark')+'</td>'+
    '<td><span style="font-family:var(--mono);font-size:12px;">'+m._contacts.length+'</span></td>'+
    '<td class="r">'+(total||'-')+'</td>'+
    '<td class="r">'+(active||'-')+'</td>'+
    '<td class="r">'+(done||'-')+'</td>'+
    '<td>'+(total?window.c360bar(pct,'rgba(255,255,255,.7)'):'-')+'</td>'+
    '<td>'+(active>0?'<span class="badge b-ok">Active</span>':'<span class="badge b-neu">Inactive</span>')+'</td>'+
    '<td>'+window.c360sample(p)+'</td></tr>';
};

window.c360flatRow=function(co,type){
  var p=co._projects,total=p.length,active=window.c360act(p),done=window.c360done(p);
  var pct=total?Math.round(done/total*100):0;
  var isOpen=!!window.C360.drillOpen[co.uid];
  var badge=type==='fund'?'<span class="badge b-fund" style="font-size:10px;margin-right:5px;">FUND</span>':'<span class="badge b-neu" style="font-size:10px;margin-right:5px;">-</span>';
  var indent=type==='fund'?'padding-left:30px':'';
  return '<tr class="'+(type==='fund'?'fund':'other')+'" onclick="window.c360togDrill(\''+co.uid+'\')" style="cursor:pointer">'+
    '<td style="'+indent+'"><span class="chevron '+(isOpen?'open':'')+'">&#9654;</span>'+badge+window.c360esc(co.name)+
    '<span class="uid-tag">'+co.uid.slice(0,8)+'</span></td>'+
    '<td>'+window.c360catTagBubbles(co)+'</td>'+
    '<td><span style="font-family:var(--mono);font-size:12px;">'+co._contacts.length+'</span></td>'+
    '<td class="r">'+(total||'-')+'</td>'+
    '<td class="r">'+(active||'-')+'</td>'+
    '<td class="r">'+(done||'-')+'</td>'+
    '<td>'+(total?window.c360bar(pct,'var(--text2)'):'-')+'</td>'+
    '<td>'+window.c360sbadge(p)+'</td>'+
    '<td>'+window.c360sample(p)+'</td></tr>';
};

/* -- DRILL DOWN -- */
window.c360drillDown=function(co){
  var html='';
  /* PROJECTS */
  html+='<tr class="drill-hdr"><td colspan="9">Projects ('+co._projects.length+')</td></tr>';
  if(!co._projects.length){
    html+='<tr class="drill-empty"><td colspan="9">No projects linked to this entity.</td></tr>';
  } else {
    co._projects.forEach(function(p){
      var s=(p.status||'').toLowerCase();
      var sbadge=s.indexOf('complet')>-1?'<span class="badge b-ok" style="font-size:10px;">Done</span>':
        s.indexOf('pending')>-1?'<span class="badge b-pending" style="font-size:10px;">Pending</span>':
        '<span class="badge b-warn" style="font-size:10px;">Active</span>';
      html+='<tr class="drill-proj">'+
        '<td colspan="3">'+window.c360esc(p.name||'-')+'<span class="uid-tag">'+( p.uid||'').slice(0,8)+'</span></td>'+
        '<td colspan="2">'+sbadge+'</td>'+
        '<td colspan="2" style="font-size:11px;color:var(--text2);">'+(p.start_date||'-')+' -> '+(p.end_date||'-')+'</td>'+
        '<td colspan="2" class="r" style="font-size:11px;color:var(--text3);">'+window.c360esc(p.status||'')+'</td>'+
        '</tr>';
    });
  }
  /* CONTACTS */
  html+='<tr class="drill-hdr"><td colspan="9">Contacts ('+co._contacts.length+')</td></tr>';
  if(!co._contacts.length){
    html+='<tr class="drill-empty"><td colspan="9">No contacts linked to this entity.</td></tr>';
  } else {
    co._contacts.forEach(function(ct){
      var initials=((ct.first_name||'?')[0]+(ct.last_name||'?')[0]).toUpperCase();
      var circles=(ct.circles||[]).map(function(c){return '<span class="itag">'+window.c360esc(c)+'</span>';}).join('');
      html+='<tr class="drill-contact">'+
        '<td colspan="3"><span class="avatar">'+initials+'</span>'+window.c360esc((ct.first_name||'')+' '+(ct.last_name||''))+(ct.title?'<span style="color:var(--text3);margin-left:6px;font-size:11px;">'+window.c360esc(ct.title)+'</span>':'')+'</td>'+
        '<td colspan="2" style="font-size:11px;color:var(--info);">'+(ct.email?window.c360esc(ct.email):'-')+'</td>'+
        '<td colspan="2" style="font-size:11px;">'+(ct.phone||'-')+'</td>'+
        '<td colspan="2">'+circles+'</td>'+
        '</tr>';
    });
  }
  return html;
};

/* -- TOGGLE -- */
window.c360tog=function(uid){window.C360.expanded[uid]=!window.C360.expanded[uid];window.c360render();};
window.c360togDrill=function(uid){window.C360.drillOpen[uid]=!window.C360.drillOpen[uid];window.c360render();};
window.c360expandAll=function(){
  window.C360.mgmtCos.forEach(function(m){window.C360.expanded[m.uid]=true;});
  window.C360.funds.concat(window.C360.others).forEach(function(c){window.C360.drillOpen[c.uid]=true;});
  window.c360render();
};
window.c360collapseAll=function(){
  window.C360.mgmtCos.forEach(function(m){window.C360.expanded[m.uid]=false;});
  window.C360.funds.concat(window.C360.others).forEach(function(c){window.C360.drillOpen[c.uid]=false;});
  window.c360render();
};

/* -- TAG / CATEGORY BUBBLES -- */
window.c360catTagBubbles=function(co,dark){
  var out='';
  if(co.category&&co.category.name){
    out+='<span class="itag" style="background:'+co.category.color+';color:#fff;opacity:.85;">'+window.c360esc(co.category.name)+'</span>';
  }
  var tags=window.c360splitTags(co.tags);
  tags.slice(0,2).forEach(function(t){
    var s=window.C360.tagState[t];
    var style=s==='mgmt'?'background:rgba(239,68,35,.15);color:var(--accent);':s==='fund'?'background:var(--info-bg);color:var(--info);':dark?'background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);':'';
    out+='<span class="itag" style="'+style+'">'+window.c360esc(t)+'</span>';
  });
  if(tags.length>2)out+='<span style="font-size:10px;color:var(--text3);">+'+(tags.length-2)+'</span>';
  return out||'<span style="color:var(--text3);font-size:11px;">-</span>';
};

/* -- UTILS -- */
window.c360bar=function(pct,color){return '<div class="prog-wrap"><div class="prog"><div class="prog-fill" style="width:'+pct+'%"></div></div><span style="font-size:11px;font-family:var(--mono);color:'+(color||'var(--text2)')+'">'+pct+'%</span></div>';};
window.c360sample=function(projs){
  if(!projs||!projs.length)return '<span style="color:var(--text3);font-size:11px;">none</span>';
  var html=projs.slice(0,2).map(function(p){
    var s=(p.status||'').toLowerCase();
    return '<span style="font-size:11px;color:'+(s.indexOf('complet')>-1?'var(--text3)':'var(--ok)')+'">'+window.c360esc((p.name||'').slice(0,16))+'</span>';
  }).join('<br>');
  if(projs.length>2)html+='<br><span style="font-size:10px;color:var(--text3);">+'+(projs.length-2)+' more</span>';
  return html;
};
window.c360sbadge=function(p){
  if(!p||!p.length)return '<span class="badge b-neu">No projects</span>';
  if(window.c360act(p)>0)return '<span class="badge b-ok">Active</span>';
  return '<span class="badge b-neu">Done</span>';
};
window.c360act=function(p){return (p||[]).filter(function(x){var s=(x.status||'').toLowerCase();return s.indexOf('complet')===-1&&s.indexOf('cancel')===-1&&s.indexOf('archiv')===-1;}).length;};
window.c360done=function(p){return (p||[]).filter(function(x){return (x.status||'').toLowerCase().indexOf('complet')>-1;}).length;};

/* -- METRICS + COUNTS -- */
window.c360updateMetrics=function(){
  var allP=window.C360.companies.reduce(function(s,c){return s+c._projects.length;},0);
  var actP=window.C360.companies.reduce(function(s,c){return s+window.c360act(c._projects);},0);
  document.getElementById('c360m0').textContent=window.C360.companies.length;
  document.getElementById('c360m1').textContent=window.C360.mgmtCos.length;
  document.getElementById('c360m2').textContent=window.C360.funds.length;
  document.getElementById('c360m6').textContent=window.C360.contacts.length;
  document.getElementById('c360m4').textContent=allP;
  document.getElementById('c360m5').textContent=actP;
};
window.c360updateCounts=function(){
  document.getElementById('c360cAll').textContent=window.C360.companies.length;
  document.getElementById('c360cMgmt').textContent=window.C360.mgmtCos.length;
  document.getElementById('c360cFund').textContent=window.C360.funds.length;
  document.getElementById('c360cOther').textContent=window.C360.others.length;
};

/* -- FILTER -- */
window.c360setFilter=function(f){
  window.C360.filter=f;
  document.querySelectorAll('#c360dash .fchip[data-f]').forEach(function(c){c.classList.toggle('active',c.dataset.f===f);});
  window.c360render();
};

/* -- CSV -- */
window.c360exportCSV=function(){
  if(!window.C360.companies.length)return;
  var rows=[['Type','Name','UID','Category','Tags','Contacts','Projects','Active','Completed','AUM','Strategy']];
  window.C360.companies.forEach(function(co){
    var pub=co.public_custom_fields||{};
    rows.push([
      co._type,co.name,co.uid,
      (co.category&&co.category.name)||'',
      window.c360splitTags(co.tags).join(';'),
      co._contacts.length,
      co._projects.length,
      window.c360act(co._projects),
      window.c360done(co._projects),
      pub['35db15c9-4723-4dd3-9ef2-c45e6134b4f6']||'',
      pub['7d85f68f-c5b6-4fd0-9d69-eaa582dc812d']||''
    ]);
  });
  var csv=rows.map(function(r){return r.map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');}).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download='c360_'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
};