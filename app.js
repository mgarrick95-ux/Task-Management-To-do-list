
(() => {
  const LS_TASKS = "cc_tasks_v40";
  const LS_SETTINGS = "cc_settings_v40";
  const $ = (s,p=document)=>p.querySelector(s);
  const toast = (m)=>{ const t=$("#toast"); t.textContent=m; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1800); };
  const ding = ()=>{ const a=$("#ding"); try{ a.currentTime=0; a.play().catch(()=>{});}catch(e){} }
  const AB_HOLIDAYS_2025 = new Set(["2025-01-01","2025-02-17","2025-04-18","2025-05-19","2025-07-01","2025-08-04","2025-09-01","2025-10-13","2025-11-11","2025-12-25","2025-12-26"]);

  let tasks = load(LS_TASKS, []);
  let settings = load(LS_SETTINGS, { start:"09:00", end:"17:00", theme:"auto", weekStart:1 });

  const el = {
    title: $("#taskTitle"),
    durHr: $("#durHr"),
    durMin: $("#durMin"),
    prio: $("#prio"),
    whenFlex: $('input[name="when"][value="flex"]'),
    whenFixed: $('input[name="when"][value="fixed"]'),
    flexRow: $("#flexRow"),
    fixedRow: $("#fixedRow"),
    flexPreset: $("#flexPreset"),
    fixedDate: $("#fixedDate"),
    fixedTime: $("#fixedTime"),
    recPattern: $("#recPattern"),
    recEnd: $("#recEnd"),
    calSel: $("#calendar"),
    unscheduled: $("#unscheduled"),
    reminders: $("#reminders"),
    searchBox: $("#searchBox"),
    searchResults: $("#searchResults"),
    startTime: $("#startTime"),
    endTime: $("#endTime"),
    tone: $("#tone"),
    grid: $("#calendarGrid"),
    btnAdd: $("#btnAdd"),
    btnAuto: $("#btnAuto"),
    btnClear: $("#btnClearInputs"),
    btnClearAll: $("#btnClearAll"),
    prevWeek: $("#prevWeek"),
    nextWeek: $("#nextWeek"),
    todayBtn: $("#todayBtn"),
    btnSearch: $("#btnSearch"),
    btnTheme: $("#btnTheme"),
    btnExport: $("#btnExport"),
    btnImport: $("#btnImport"),
    importFile: $("#importFile"),
    starModal: $("#starModal"),
    starClose: $("#starClose"),
    quip: $("#quip"),
  };

  // Theme
  function applyTheme(){
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const light = settings.theme==="auto" ? !prefersDark : (settings.theme==="mild");
    document.documentElement.classList.toggle("light", light);
  }
  applyTheme();

  // Utils
  function load(k, fb){ try { return JSON.parse(localStorage.getItem(k)) ?? fb } catch { return fb } }
  function saveAll(){ localStorage.setItem(LS_TASKS, JSON.stringify(tasks)); localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
  const uid = ()=> Math.random().toString(36).slice(2,10);
  const dateKey = (d)=> d.toISOString().slice(0,10);
  const todayKey = ()=> dateKey(new Date());
  const addDays = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x };
  const parseHM = (s)=>{ if(!s) return null; const [h,m]=s.split(":").map(Number); return h*60+m; };
  const hm = (mins)=> `${Math.floor(mins/60)} hr ${String(mins%60).padStart(2,"0")} min`;
  const cap = (s)=> s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
  const esc = (s)=> (s||"").replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  // Week state
  let cursor = startOfWeek(new Date());
  function startOfWeek(d){ const x=new Date(d); const wd=(x.getDay()+7-settings.weekStart)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }

  // Initial missed rollover
  rolloverMissed();

  // Renderers
  function render(){ saveAll(); renderUnscheduled(); renderReminders(); renderWeek(); }
  function workCapacity(){ return parseHM(settings.end) - parseHM(settings.start); }
  function dayEntries(key){ return tasks.filter(t => t.slot && t.slot.date===key); }
  function dayStats(key){ const entries=dayEntries(key); const used=entries.reduce((a,t)=>a+t.duration,0); return { used, free: Math.max(0,workCapacity()-used), entries }; }

  function renderUnscheduled(){
    const list = tasks.filter(t => !t.slot);
    el.unscheduled.innerHTML = list.length ? "" : `<li class="muted">Nothing here — everything else is on the calendar.</li>`;
    for(const t of list){
      const li = document.createElement("li"); li.className="task";
      li.innerHTML = `<div class="row"><div><span class="badge ${t.priority==='high'?'high':''}">${cap(t.priority)}</span> <strong>${esc(t.title)}</strong></div><div class="meta"><span>${hm(t.duration)}</span>${t.flexNote?` <span class="badge">${esc(t.flexNote)}</span>`:""}</div></div><div class="meta"><button data-act="place" class="secondary">Place</button><button data-act="edit" class="ghost">Edit</button><button data-act="del" class="danger">Delete</button></div>`;
      li.addEventListener("click", e => taskAction(e, t.id));
      el.unscheduled.appendChild(li);
    }
  }

  function renderReminders(){
    el.reminders.innerHTML="";
    const now=new Date();
    const urgent = tasks.filter(t => t.slot && !t.done).filter(t => {
      const dt = new Date(t.slot.date + "T" + (t.slot.time ?? "09:00") + ":00");
      return (dt < now) || (t.priority==="high" && dt - now < 36*60*60*1000);
    });
    for(const t of urgent){
      const li=document.createElement("li"); li.className="task";
      li.innerHTML = `<div class="row"><strong>${esc(t.title)}</strong><span class="badge resched">${t.slot.date} ${t.slot.time ?? ""}</span></div>`;
      el.reminders.appendChild(li);
    }
  }

  function renderWeek(){
    el.grid.innerHTML = "";
    for(let i=0;i<7;i++){
      const d = addDays(cursor,i); const key = dateKey(d);
      const {used, free, entries} = dayStats(key);

      const day=document.createElement("div"); day.className="day"+(AB_HOLIDAYS_2025.has(key)?" warn":"");
      const head=document.createElement("div"); head.className="day-head";
      head.innerHTML=`<div><strong>${d.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"})}</strong></div><div class="stats">Scheduled: ${hm(used)} &nbsp;&nbsp; Free: ${hm(free)}</div>`;
      day.appendChild(head);

      const slot=document.createElement("div"); slot.className="slot";
      entries.sort((a,b)=> (a.slot.time??"99:99").localeCompare(b.slot.time??"99:99"));
      for(const t of entries){
        const card=document.createElement("div"); card.className="entry"+(t.done?" done":"");
        const timeStr=t.slot.time?t.slot.time:"(any)";
        card.innerHTML = `<div class="row"><div class="title">${esc(t.title)}</div><div class="ctrls"><input type="checkbox" ${t.done?"checked":""} data-act="toggle" title="Mark complete"><button class="ghost" data-act="edit" title="Edit">✎</button><button class="ghost" data-act="move" title="Move">⇄</button><button class="danger" data-act="del" title="Delete">✕</button></div></div><div class="meta"><span class="badge ${t.priority==='high'?'high':''}">${cap(t.priority)}</span><span>${timeStr}</span><span>${hm(t.duration)}</span>${t.rescheduled?'<span class="badge resched">Rescheduled</span>':''}</div>`;
        card.addEventListener("click", e=>taskAction(e,t.id,key));
        slot.appendChild(card);
      }
      if(used>workCapacity()) day.classList.add("warn");
      day.appendChild(slot);
      el.grid.appendChild(day);

      if(key===todayKey() && entries.length && entries.every(x=>x.done)){ setTimeout(()=>celebrate(),20); }
    }
  }

  function celebrate(){
    const quips=[
      "All done — look at you, a responsible tornado.",
      "Everything finished. The productivity gods are mildly impressed.",
      "Gold star earned. HR can’t ding you for today.",
      "You cleared the board. Treat yo’ self."
    ];
    $("#quip").textContent = quips[(Math.random()*quips.length)|0];
    $("#starModal").classList.remove("hidden"); ding();
  }
  $("#starClose").addEventListener("click", ()=> $("#starModal").classList.add("hidden"));

  // Actions
  function taskAction(e, id){
    const btn=e.target.closest("[data-act]"); if(!btn) return;
    e.preventDefault(); e.stopPropagation();
    const act=btn.getAttribute("data-act");
    const idx=tasks.findIndex(t=>t.id===id); if(idx<0) return;
    const t=tasks[idx];
    if(act==="del"){ tasks.splice(idx,1); render(); return; }
    if(act==="toggle"){ t.done=!t.done; render(); return; }
    if(act==="edit"){ loadIntoForm(t); tasks.splice(idx,1); render(); toast("Loaded into the form. Edit & Add to save."); return; }
    if(act==="move"){ if(t.slot){ t.slot=null; } else { t.slot={date: todayKey(), time:null}; } render(); return; }
    if(act==="place"){ t.slot={date: todayKey(), time:null}; render(); return; }
  }

  function loadIntoForm(t){
    el.title.value=t.title;
    el.durHr.value=Math.floor(t.duration/60);
    el.durMin.value=t.duration%60;
    el.prio.value=t.priority;
    if(t.slot){ el.whenFixed.checked=true; showWhen(); el.fixedDate.value=t.slot.date; el.fixedTime.value=t.slot.time ?? ""; }
    else { el.whenFlex.checked=true; showWhen(); }
    el.calSel.value=t.calendar||"work";
    if(t.rec){ el.recPattern.value=t.rec.pattern; el.recEnd.value=t.rec.end||""; } else { el.recPattern.value="none"; el.recEnd.value=""; }
  }

  // Add & Auto
  $("#btnAdd").addEventListener("click", ()=>{
    const title=(el.title.value||"").trim();
    const dur=(parseInt(el.durHr.value||"0",10)*60)+(parseInt(el.durMin.value||"0",10));
    if(!title) return toast("Need a title.");
    if(!Number.isFinite(dur)||dur<=0) return toast("Duration must be > 0");
    const base={ id:uid(), title, duration:dur, priority:el.prio.value, calendar:el.calSel.value, done:false, rescheduled:false };
    let slot=null, flexNote="";
    if(el.whenFixed.checked){
      if(!el.fixedDate.value) return toast("Pick a fixed date.");
      slot={ date: el.fixedDate.value, time: el.fixedTime.value || null };
    }else{
      const m={today:"Flex: today", next2:"Flex: next 2d", week:"Flex: this week", none:"Flex: any time"};
      flexNote=m[el.flexPreset.value]||"";
    }
    let rec=null; if(el.recPattern.value!=="none"){ rec={ pattern:el.recPattern.value, end: el.recEnd.value || null }; }
    const first={...base, slot, flexNote, rec};
    const items=expandRecurring(first);
    tasks.push(...items);
    clearInputs(); render();
  });

  function expandRecurring(item){
    if(!item.rec) return [item];
    const out=[]; const end=item.rec.end? new Date(item.rec.end) : addDays(new Date(),28);
    let d=item.slot?.date? new Date(item.slot.date) : new Date();
    const base={...item}; delete base.rec;
    const addAt=(day)=>{ const ni={...base, id:uid()}; ni.slot=item.slot? {...item.slot, date: dateKey(day)} : null; out.push(ni); };
    while(d<=end){
      addAt(d);
      if(item.rec.pattern==="daily") d=addDays(d,1);
      else if(item.rec.pattern==="weekdays"){ d=addDays(d,1); while([0,6].includes(d.getDay())) d=addDays(d,1); }
      else if(item.rec.pattern==="weekly") d=addDays(d,7);
      else if(item.rec.pattern==="monthly-date"){ const m=d.getMonth(); d=new Date(d.getFullYear(),m+1,d.getDate()); }
      else break;
    }
    return out;
  }

  $("#btnAuto").addEventListener("click", ()=>{ autoSchedule(); render(); });

  function autoSchedule(){
    const weekKeys=Array.from({length:7},(_,i)=> dateKey(addDays(cursor,i)));
    for(const t of tasks){
      if(t.slot) continue;
      const pref={ "Flex: today":[0], "Flex: next 2d":[0,1,2], "Flex: this week":[0,1,2,3,4,5,6], "Flex: any time":[0,1,2,3,4,5,6] }[t.flexNote||"Flex: any time"] || [0,1,2,3,4,5,6];
      let placed=false;
      for(const i of pref){
        const dk=weekKeys[i]; const {free}=dayStats(dk);
        if(free >= t.duration){ t.slot={date:dk, time:null}; placed=true; break; }
      }
      if(!placed) t.slot={date: weekKeys.at(-1), time:null};
    }
  }

  function rolloverMissed(){
    const now=todayKey(); let changed=false;
    for(const t of tasks){
      if(t.slot && t.slot.date<now && !t.done){
        const options=[0,1,2,3,4,5,6].map(i=> dateKey(addDays(new Date(),i)));
        for(const dk of options){
          const {free}=dayStats(dk);
          if(free>=t.duration){ t.slot.date=dk; t.rescheduled=true; changed=true; break; }
        }
      }
    }
    if(changed) saveAll();
  }

  // Search
  $("#btnSearch").addEventListener("click", ()=>{
    const q=($("#searchBox").value||"").toLowerCase();
    const res=tasks.filter(t=> t.title.toLowerCase().includes(q));
    $("#searchResults").innerHTML = res.length ? res.map(t=>`<li class="task"><strong>${esc(t.title)}</strong> <span class="meta">${t.slot? t.slot.date+" "+(t.slot.time??""):"unscheduled"}</span></li>`).join("") : "<li class='muted'>No matches.</li>";
  });

  // Inputs & Clears
  function clearInputs(){
    el.title.value=""; el.durHr.value=1; el.durMin.value=0;
    el.prio.value="med"; el.whenFlex.checked=true; showWhen();
    el.fixedDate.value=""; el.fixedTime.value="";
    el.recPattern.value="none"; el.recEnd.value="";
  }
  $("#btnClearInputs").addEventListener("click", clearInputs);
  $("#btnClearAll").addEventListener("click", ()=>{ if(confirm("Erase ALL tasks?")) { tasks=[]; render(); }});

  function showWhen(){ el.fixedRow.classList.toggle("hidden", !el.whenFixed.checked); el.flexRow.classList.toggle("hidden", !el.whenFlex.checked); }
  el.whenFixed.addEventListener("change", showWhen); el.whenFlex.addEventListener("change", showWhen);

  // Week nav & settings
  $("#prevWeek").addEventListener("click", ()=>{ cursor=addDays(cursor,-7); render(); });
  $("#nextWeek").addEventListener("click", ()=>{ cursor=addDays(cursor, 7); render(); });
  $("#todayBtn").addEventListener("click", ()=>{ cursor=startOfWeek(new Date()); render(); });

  $("#startTime").addEventListener("change", ()=>{ settings.start=$("#startTime").value; render(); });
  $("#endTime").addEventListener("change",   ()=>{ settings.end=$("#endTime").value; render(); });
  $("#tone").addEventListener("change", ()=>{ settings.theme=$("#tone").value; applyTheme(); saveAll(); });
  $("#btnTheme").addEventListener("click", ()=>{
    settings.theme = settings.theme==="auto" ? "mild" : settings.theme==="mild" ? "zesty" : "auto";
    $("#tone").value=settings.theme; applyTheme(); saveAll(); toast("Theme: "+settings.theme);
  });

  // Export / Import
  $("#btnExport").addEventListener("click", ()=>{
    const blob=new Blob([JSON.stringify({tasks,settings},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download="chaos-control-backup.json"; a.click(); URL.revokeObjectURL(url);
  });
  $("#btnImport").addEventListener("click", ()=> $("#importFile").click());
  $("#importFile").addEventListener("change", async ()=>{
    const f=$("#importFile").files[0]; if(!f) return;
    try{
      const data=JSON.parse(await f.text());
      if(Array.isArray(data.tasks)) tasks=data.tasks;
      if(data.settings) settings={...settings, ...data.settings};
      render(); toast("Imported.");
    }catch{ alert("Invalid JSON"); }
  });

  render();
})();
