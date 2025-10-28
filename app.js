/* Chaos Control — Smart Scheduler v4.2 (Stable+)
   - Keeps prior data (auto-migration from v3/v4 keys)
   - Prevents scheduling into the past
   - Quick reschedule: +1d / +2d / +1w
   - Drag & drop between days
   - Urgent list shows scheduled date
   - Day header shows Scheduled/Free in hours+mins
   - Warn & mark when overbooked; column shows red dot
*/

const LS_VERSIONS = ["cc_tasks_v4","cc_tasks_v3","cc_tasks_v31","cc_tasks_v33","cc_tasks_v32"]; // any older keys we used
const LS_TASKS = "cc_tasks_v42";
const LS_SETTINGS = "cc_settings_v42";

// ---------- helpers ----------
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load=(k,fb=null)=>{try{return JSON.parse(localStorage.getItem(k))??fb}catch{return fb}};
const pad2=n=>String(n).padStart(2,"0");
const toKey=d=>d.toISOString().slice(0,10);
const escapeHTML=s=>s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const minToHM=m=>`${pad2((m/60)|0)}:${pad2(m%60)}`;
const hmToMin=hm=>{const[a,b]=hm.split(":").map(Number);return a*60+b};
const startOf=d=>{const x=new Date(d);x.setHours(0,0,0,0);const dow=(x.getDay()+6)%7; x.setDate(x.getDate()-dow); return x;}
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const parseISO=iso=>{const [y,mo,da]=iso.split("T")[0].split("-").map(Number);return new Date(y,mo-1,da)}

// ---------- DOM ----------
const themeBtn=$("#themeBtn"), exportBtn=$("#exportBtn"), importBtn=$("#importBtn");
const form=$("#taskForm"), title=$("#title"), durHr=$("#durHr"), durMin=$("#durMin");
const priority=$("#priority"), repeatSel=$("#repeat"), calSel=$("#calendar");
const autoBtn=$("#autoBtn"), clearInputsBtn=$("#clearInputsBtn"), clearDayBtn=$("#clearDayBtn");
const flexOpts=$("#flexOpts"), fixedOpts=$("#fixedOpts"), byDate=$("#byDate");
const fixedDate=$("#fixedDate"), fixedTime=$("#fixedTime");
const urgentList=$("#urgentList"), taskList=$("#taskList"), unscheduledEmpty=$("#unscheduledEmpty");
const calendarEl=$("#calendarEl"), prevWeek=$("#prevWeek"), todayBtn=$("#todayBtn"), nextWeek=$("#nextWeek"), autoAllBtn=$("#autoAllBtn");
const reward=$("#reward"), rewardClose=$("#rewardClose"), rewardLine=$("#rewardLine");
const ding=$("#ding"), confettiCanvas=$("#confetti"); const ctx=confettiCanvas.getContext("2d");

// ---------- state (with MIGRATION) ----------
function migrateTasks(){
  // if current key missing, try older keys and merge distinct ids/titles
  let merged = load(LS_TASKS,null);
  if (merged) return merged;
  merged = [];
  for(const k of LS_VERSIONS){
    const arr = load(k, []);
    if (Array.isArray(arr) && arr.length){
      arr.forEach(t=>{
        if (!merged.some(m=>m.id===t.id || (m.title===t.title && m.duration===t.duration && m.scheduledAt===t.scheduledAt))){
          merged.push(t);
        }
      });
    }
  }
  return merged;
}
let tasks = migrateTasks();
let settings = load(LS_SETTINGS,{
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  workStartMins: 9*60,
  workEndMins: 17*60,
  slot: 30
});
let startOfWeek = startOf(new Date());

// ---------- holidays (AB minimal) ----------
function easter(Y){const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,L=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*L)/451),month=Math.floor((h+L-7*m+114)/31),day=((h+L-7*m+114)%31)+1;return new Date(Y, month-1, day)}
function nthWeekdayOfMonth(y,m,weekday,firstDay=1,n=1){const start=new Date(y,m-1,firstDay);let c=0,d=new Date(start);while(d.getMonth()===m-1){const wd=((d.getDay()+6)%7)+1;if(wd===weekday){c++;if(c===n)return d}d.setDate(d.getDate()+1)}return start}
function lastWeekdayBefore(y,m,day,weekday){const d=new Date(y,m-1,day);while((((d.getDay()+6)%7)+1)!==weekday){d.setDate(d.getDate()-1)}return d}
function albertaHolidays(year){
  const E=easter(year), goodFriday=addDays(E,-2),
        family=nthWeekdayOfMonth(year,2,1,1,3),
        victoria=lastWeekdayBefore(year,5,24,1),
        labour=nthWeekdayOfMonth(year,9,1,1,1),
        thanksgiving=nthWeekdayOfMonth(year,10,1,1,2);
  return {
    [`${year}-01-01`]:"New Year’s Day",
    [toKey(goodFriday)]:"Good Friday",
    [`${year}-07-01`]:"Canada Day",
    [`${year}-08-05`]:"Heritage Day (AB)",
    [toKey(labour)]:"Labour Day",
    [toKey(thanksgiving)]:"Thanksgiving",
    [`${year}-11-11`]:"Remembrance Day",
    [`${year}-12-25`]:"Christmas Day",
    [toKey(family)]:"Family Day",
    [toKey(victoria)]:"Victoria Day",
  };
}

// ---------- render ----------
function render(){
  renderUnscheduled();
  renderCalendar();
  renderUrgent();
  save(LS_TASKS,tasks);
  save(LS_SETTINGS,settings);
}
function renderUnscheduled(){
  const uns=tasks.filter(t=>!t.scheduledAt);
  taskList.innerHTML="";
  unscheduledEmpty.classList.toggle("hide", uns.length>0);
  uns.forEach(t=>{
    const li=document.createElement("li");
    li.className="li";
    const meta=t.fixed?"fixed":"flex";
    li.innerHTML=`
      <input type="checkbox" ${t.done?"checked":""} data-id="${t.id}" class="doneBox"/>
      <div style="flex:1">
        <div>${escapeHTML(t.title)}</div>
        <div class="meta">${t.duration}m • ${t.priority} • ${t.calendar} • ${meta}</div>
      </div>
      <div class="move">
        <button class="btn tiny" data-act="r1" data-id="${t.id}">+1d</button>
        <button class="btn tiny" data-act="r2" data-id="${t.id}">+2d</button>
        <button class="btn tiny" data-act="r7" data-id="${t.id}">+1w</button>
      </div>
      <button class="btn ghost smallBtn" data-act="del" data-id="${t.id}">Del</button>
    `;
    taskList.appendChild(li);
  });
}

function minsToHrsStr(m){ const h=(m/60)|0, mm=m%60; return `${h}h ${mm}m`; }

function renderCalendar(){
  calendarEl.innerHTML="";
  const year=startOfWeek.getFullYear();
  const hol=albertaHolidays(year);
  const cap=settings.workEndMins-settings.workStartMins;

  for(let i=0;i<7;i++){
    const day=addDays(startOfWeek,i);
    const key=toKey(day);
    const dayTasks=tasks.filter(t=>t.scheduledAt && t.scheduledAt.startsWith(key));
    const used=dayTasks.reduce((a,t)=>a+t.duration,0);
    const over=used>cap;
    const usedPct=Math.min(100, Math.round(100*used/cap));

    const col=document.createElement("div");
    col.className="col"+(hol[key]?" holiday":"");
    col.innerHTML=`
      <div class="colhead ${over?"over":""}">
        <div style="font-weight:700">${day.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</div>
        <div class="meter"><i style="width:${usedPct}%"></i></div>
        <div class="badge">Scheduled: ${minsToHrsStr(used)} • Free: ${minsToHrsStr(Math.max(0,cap-used))}</div>
      </div>
      <div class="slot" data-key="${key}"></div>
      <div class="list dropzone" id="d-${key}" data-key="${key}"></div>
    `;
    const list=col.querySelector(".list");

    // holiday banner
    if(hol[key]){
      const b=document.createElement("div");
      b.className="block fixed";
      b.innerHTML=`<div class="row"><b>${hol[key]}</b><span class="small">Holiday</span></div>`;
      list.appendChild(b);
    }

    // tasks
    dayTasks.forEach(t=>{
      const row=document.createElement("div");
      row.className=`block ${(t.fixed?"fixed ":"")}${(t.priority==="High"?"high ":"")}${(t.done?"done ":"")}`;
      row.setAttribute("draggable","true");
      row.dataset.id=t.id;

      const timeStr=t.scheduledAt.slice(11,16);
      row.innerHTML=`
        <div class="row">
          <div><b>${escapeHTML(t.title)}</b></div>
          <div class="small">${timeStr} • ${t.duration}m</div>
        </div>
        <div class="row small">
          <div>${t.calendar} • ${t.priority}${t.rescheduled?" • bumped":""}</div>
          <div class="move">
            <input type="checkbox" ${t.done?"checked":""} class="doneBox" data-id="${t.id}"/>
            <button class="btn tiny" data-act="r1" data-id="${t.id}">+1d</button>
            <button class="btn tiny" data-act="r2" data-id="${t.id}">+2d</button>
            <button class="btn tiny" data-act="r7" data-id="${t.id}">+1w</button>
            <button class="btn ghost smallBtn" data-act="unsched" data-id="${t.id}">Unsch</button>
            <button class="btn ghost smallBtn" data-act="del" data-id="${t.id}">Del</button>
          </div>
        </div>
      `;
      list.appendChild(row);
    });

    calendarEl.appendChild(col);
  }

  // enable drag & drop
  setupDnD();
}

function renderUrgent(){
  const list=tasks.filter(t=>t.priority==="High" && !t.done);
  urgentList.innerHTML="";
  list.forEach(t=>{
    const d = t.scheduledAt ? t.scheduledAt.slice(0,10) : (t.fixedDate||"—");
    const dStr = d && d!=="—" ? new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML=`<div style="flex:1 1 auto"><b>${escapeHTML(t.title)}</b><div class="meta">${t.calendar} • ${dStr}</div></div>`;
    urgentList.appendChild(li);
  });
}

// ---------- scheduling rules ----------
function dayCapacity(key){
  const items=tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key));
  const used=items.reduce((a,x)=>a+x.duration,0);
  const cap=settings.workEndMins-settings.workStartMins;
  return {used, cap, free: Math.max(0, cap-used)};
}
function nextFreeTime(key, duration){
  const items=tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key));
  const taken=items.map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  let mins=settings.workStartMins;
  while (mins+duration <= settings.workEndMins){
    if (!taken.includes(mins)) return mins;
    mins+=settings.slot;
  }
  return null;
}
function todayKey(){ return toKey(new Date()); }

function scheduleFlexible(t){
  const now=new Date();
  let from=startOf(now), to=addDays(from,6);

  if (t.flex==="today"){ from=startOf(now); to=addDays(from,0); }
  else if (t.flex==="next2d"){ from=startOf(now); to=addDays(from,2); }
  else if (t.flex==="week"){ from=startOf(now); to=addDays(from,6); }
  else if (t.flex==="bydate" && t.flexDate){
    from=new Date(t.flexDate); to=new Date(t.flexDate);
    // if chosen date is in the past -> start today
    if (from < startOf(now)) { from = startOf(now); to = startOf(now); }
  }

  const hol=albertaHolidays(from.getFullYear());
  for(let d=new Date(from); d<=to; d=addDays(d,1)){
    const key=toKey(d);
    if (key < todayKey()) continue; // never schedule in the past
    if (hol[key]) continue;
    const cap=dayCapacity(key);
    if (cap.free < t.duration) continue;
    const slot = nextFreeTime(key, t.duration);
    if (slot!=null){
      t.scheduledAt=`${key}T${minToHM(slot)}`;
      return true;
    }
  }
  return false;
}

function scheduleFixed(t, {confirmOverbook=true}={}){
  if (!t.fixedDate) return false;
  let key=t.fixedDate;
  // do not schedule in the past; push to today
  if (key < todayKey()) key = todayKey();

  const hol=albertaHolidays(new Date(key).getFullYear());
  if (hol[key]) return false;

  const cap=dayCapacity(key);
  const wantTime = t.fixedTime ? hmToMin(t.fixedTime) : settings.workStartMins;

  // warn when exceeding
  if (cap.free < t.duration && confirmOverbook){
    const ok = confirm(`That day is over capacity.\nScheduled: ${minsToHrsStr(cap.used)} / ${minsToHrsStr(cap.cap)}.\nProceed anyway?`);
    if (!ok) return false;
  }

  // pick requested time or next free
  let time = wantTime;
  const taken=tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key))
                  .map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  while(time + t.duration <= settings.workEndMins){
    if (!taken.includes(time)){ t.scheduledAt=`${key}T${minToHM(time)}`; return true; }
    time += settings.slot;
  }
  return false;
}

// ---------- repeats ----------
function createRepeats(base){
  const addClone=(d)=>{
    const c={...base,id:crypto.randomUUID(),done:false,rescheduled:false};
    if (c.fixed){
      c.fixedDate=toKey(d); c.fixedTime=base.fixedTime||null; c.scheduledAt=null;
      scheduleFixed(c,{confirmOverbook:false});
    }else{
      c.flexDate=toKey(d); c.flex="bydate"; c.scheduledAt=null;
      scheduleFlexible(c);
    }
    tasks.push(c);
  };
  const anchor = base.scheduledAt ? parseISO(base.scheduledAt) : (base.fixedDate? parseISO(base.fixedDate) : new Date());
  if (base.repeat==="daily"){ for(let i=1;i<=4;i++) addClone(addDays(anchor,i)); }
  else if (base.repeat==="weekly"){ for(let i=1;i<=3;i++) addClone(addDays(anchor,7*i)); }
  else if (base.repeat==="mowf"){
    let d=anchor;
    for(let i=1;i<=9;i++){ d=addDays(d,1); const wd=d.getDay(); if (wd!==0 && wd!==6) addClone(d); }
  }
}

// ---------- events ----------
form.addEventListener("change", ()=>{
  const when=form.elements["when"].value;
  flexOpts.classList.toggle("hide", when!=="flex");
  fixedOpts.classList.toggle("hide", when!=="fixed");
});

form.addEventListener("submit", e=>{
  e.preventDefault();
  const when=form.elements["when"].value;
  const dur=(+durHr.value||0)*60 + (+durMin.value||0);
  if (!title.value.trim() || dur<=0) return;

  const task={
    id: crypto.randomUUID(),
    title: title.value.trim(),
    duration: dur,
    priority: priority.value,
    calendar: calSel.value,
    repeat: repeatSel.value,
    done:false,
    fixed: when==="fixed",
    flex: when==="flex" ? form.elements["flex"].value : null,
    flexDate: when==="flex" && form.elements["flex"].value==="bydate" ? byDate.value||null : null,
    fixedDate: when==="fixed" ? (fixedDate.value||null) : null,
    fixedTime: when==="fixed" ? (fixedTime.value||null) : null,
    rescheduled:false
  };

  if (task.fixed ? scheduleFixed(task) : scheduleFlexible(task)) {
    tasks.push(task);
  } else {
    tasks.push(task); // keep unscheduled if we couldn't place it
  }
  createRepeats(task);
  form.reset(); durHr.value=1; durMin.value=0; priority.value="Medium";
  render();
});

autoBtn.addEventListener("click", ()=>{
  tasks.filter(t=>!t.scheduledAt).forEach(t=>{
    (t.fixed ? scheduleFixed(t) : scheduleFlexible(t));
  });
  render();
});
autoAllBtn.addEventListener("click", ()=>{
  tasks.forEach(t=>{
    if (t.scheduledAt) return;
    (t.fixed ? scheduleFixed(t) : scheduleFlexible(t));
  });
  render();
});
prevWeek.addEventListener("click", ()=>{ startOfWeek=addDays(startOfWeek,-7); render(); });
nextWeek.addEventListener("click", ()=>{ startOfWeek=addDays(startOfWeek,7); render(); });
todayBtn.addEventListener("click", ()=>{ startOfWeek=startOf(new Date()); render(); });

document.addEventListener("click", e=>{
  const id=e.target.dataset?.id;
  const act=e.target.dataset?.act;

  // finish
  if (e.target.classList.contains("doneBox")){
    const t=tasks.find(x=>x.id===id);
    if (t){ t.done=e.target.checked; render(); maybeCelebrateDay(); }
    return;
  }

  // reschedule quick buttons
  if (act==="r1"||act==="r2"||act==="r7"){
    const t=tasks.find(x=>x.id===id); if (!t) return;
    const add = act==="r1"?1:act==="r2"?2:7;
    const anchor = t.scheduledAt ? parseISO(t.scheduledAt) : (t.fixedDate? parseISO(t.fixedDate): new Date());
    const targetKey=toKey(addDays(anchor,add));
    // keep time if existed
    const time = t.scheduledAt ? t.scheduledAt.slice(11,16) : (t.fixedTime||"09:00");
    t.fixed=true; t.fixedDate=targetKey; t.fixedTime=time; t.rescheduled=true; t.scheduledAt=null;
    scheduleFixed(t);
    render();
    return;
  }

  if (act==="unsched"){
    const t=tasks.find(x=>x.id===id); if(!t) return;
    t.scheduledAt=null; render(); return;
  }
  if (act==="del"){
    tasks = tasks.filter(x=>x.id!==id); render(); return;
  }
});

// clear week: mark done (celebrate)
clearDayBtn.addEventListener("click", ()=>{
  const keys=[...Array(7)].map((_,i)=>toKey(addDays(startOfWeek,i)));
  tasks.forEach(t=>{ if (t.scheduledAt && keys.some(k=>t.scheduledAt.startsWith(k))) t.done=true; });
  render(); celebrate();
});

// ---------- drag & drop ----------
function setupDnD(){
  // draggable blocks
  $$(".block[draggable]").forEach(b=>{
    b.addEventListener("dragstart", ev=>{
      b.classList.add("dragging");
      ev.dataTransfer.setData("text/plain", b.dataset.id);
      ev.dataTransfer.effectAllowed="move";
    });
    b.addEventListener("dragend", ()=>b.classList.remove("dragging"));
  });
  // drop zones (lists)
  $$(".list.dropzone").forEach(zone=>{
    zone.addEventListener("dragover", ev=>{
      ev.preventDefault(); zone.classList.add("drop-target"); ev.dataTransfer.dropEffect="move";
    });
    zone.addEventListener("dragleave", ()=>zone.classList.remove("drop-target"));
    zone.addEventListener("drop", ev=>{
      ev.preventDefault(); zone.classList.remove("drop-target");
      const id=ev.dataTransfer.getData("text/plain");
      const t=tasks.find(x=>x.id===id); if(!t) return;
      const key=zone.dataset.key;
      // keep same time if possible; else next free
      let time = t.scheduledAt ? t.scheduledAt.slice(11,16) : (t.fixedTime||"09:00");
      t.fixed=true; t.fixedDate=key; t.fixedTime=time; t.rescheduled=true; t.scheduledAt=null;
      scheduleFixed(t);
      render();
    });
  });
}

// ---------- reward ----------
let rewardTimer=null;
function celebrate(){ try{ding.currentTime=0; ding.play().catch(()=>{})}catch{} reward.classList.remove("hide"); clearTimeout(rewardTimer); rewardTimer=setTimeout(closeReward,2200); burstConfetti(); }
function maybeCelebrateDay(){
  const today=todayKey();
  const list=tasks.filter(t=>t.scheduledAt && t.scheduledAt.startsWith(today));
  if (list.length && list.every(t=>t.done)) celebrate();
}
function closeReward(){ reward.classList.add("hide"); }
reward.addEventListener("click", e=>{ if (e.target===reward) closeReward(); });
rewardClose.addEventListener("click", closeReward);
document.addEventListener("keydown", e=>{ if (e.key==="Escape") closeReward(); });

function burstConfetti(){
  const W=confettiCanvas.width=innerWidth, H=confettiCanvas.height=innerHeight, N=130;
  const pieces=Array.from({length:N}).map(()=>({x:Math.random()*W,y:-20,r:Math.random()*4+2,vx:(Math.random()-.5)*1.5,vy:Math.random()*2+2,a:Math.random()*360}));
  const colors=["#ffd166","#e76f51","#43aa8b","#90be6d","#577590","#7aa2ff"]; let t=0;
  (function tick(){ ctx.clearRect(0,0,W,H); for(const p of pieces){ p.x+=p.vx;p.y+=p.vy;p.a+=6; ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a*Math.PI/180);ctx.fillStyle=colors[(p.a|0)%colors.length];ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r);ctx.restore(); } if ((t++)<80) requestAnimationFrame(tick); else ctx.clearRect(0,0,W,H); })();
}

// ---------- theme / io ----------
document.documentElement.style.colorScheme=settings.theme;
themeBtn.addEventListener("click", ()=>{ settings.theme=settings.theme==="dark"?"light":"dark"; document.documentElement.style.colorScheme=settings.theme; save(LS_SETTINGS,settings); });

exportBtn.addEventListener("click", ()=>{
  const blob=new Blob([JSON.stringify({tasks,settings},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="chaos-control.json"; a.click();
});
importBtn.addEventListener("click", async ()=>{
  const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange=async ()=>{ const txt=await inp.files[0].text(); try{ const obj=JSON.parse(txt); if(Array.isArray(obj.tasks)) tasks=obj.tasks; if(obj.settings) settings={...settings,...obj.settings}; render(); }catch{ alert("Import failed."); } };
  inp.click();
});

// ---------- init ----------
render();
