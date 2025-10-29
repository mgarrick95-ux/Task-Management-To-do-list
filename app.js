/* Chaos Control — Smart Scheduler v4.3
   SCHEDULING FIXES + SAFE MIGRATION
   - Preserves/merges prior data from all older keys (never wipes)
   - Prevents scheduling into the past (but will move a fixed date to today)
   - Auto-schedule searches up to 28 days forward if needed
   - Works with existing UI (buttons, reschedule chips, drag/drop)
*/

////////////////////
// Storage & Utils
////////////////////
const LEGACY_KEYS = [
  "cc_tasks_v42", "cc_tasks_v4", "cc_tasks_v3", "cc_tasks_v31", "cc_tasks_v32", "cc_tasks_v33",
  "ChaosControlTasks", "cc_tasks"
];
const LS_TASKS = "cc_tasks_v43";
const LS_SETTINGS = "cc_settings_v43";

const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k, fb=null) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
const pad2 = n => String(n).padStart(2,"0");
const toKey = d => d.toISOString().slice(0,10);
const escapeHTML = s => s.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
const minToHM = m => `${pad2((m/60)|0)}:${pad2(m%60)}`;
const hmToMin = hm => { if(!hm) return 0; const [h,m] = hm.split(":").map(Number); return (h||0)*60 + (m||0); };
const startOfWeek = d => { const x=new Date(d); x.setHours(0,0,0,0); const dow=(x.getDay()+6)%7; x.setDate(x.getDate()-dow); return x; };
const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const parseISO = iso => { const [y,mo,da] = (iso||"").split("T")[0].split("-").map(Number); return new Date(y||1970,(mo||1)-1,da||1); };
const todayKey = () => toKey(new Date());
const clampToToday = key => (key && key < todayKey()) ? todayKey() : (key || todayKey());

////////////////////
// DOM Refs (IDs from your HTML)
////////////////////
const themeBtn=$("#themeBtn"), exportBtn=$("#exportBtn"), importBtn=$("#importBtn");
const form=$("#taskForm"), title=$("#title"), durHr=$("#durHr"), durMin=$("#durMin");
const priority=$("#priority"), repeatSel=$("#repeat"), calSel=$("#calendar");
const autoBtn=$("#autoBtn"), clearInputsBtn=$("#clearInputsBtn"), clearDayBtn=$("#clearDayBtn");
const flexOpts=$("#flexOpts"), fixedOpts=$("#fixedOpts"), byDate=$("#byDate");
const fixedDate=$("#fixedDate"), fixedTime=$("#fixedTime");
const urgentList=$("#urgentList"), taskList=$("#taskList"), unscheduledEmpty=$("#unscheduledEmpty");
const calendarEl=$("#calendarEl"), prevWeek=$("#prevWeek"), todayBtn=$("#todayBtn"), nextWeek=$("#nextWeek"), autoAllBtn=$("#autoAllBtn");
const reward=$("#reward"), rewardClose=$("#rewardClose");
const ding=$("#ding"), confettiCanvas=$("#confetti"); const ctx=confettiCanvas.getContext("2d");

////////////////////
// State + Migration (NON-DESTRUCTIVE)
////////////////////
function normalizeTask(t) {
  const whenFixed = !!t.fixed;
  const duration = Number(t.duration) > 0 ? Number(t.duration) : 30;
  let scheduledAt = t.scheduledAt || null;
  if (scheduledAt && scheduledAt.length >= 16) {
    // keep ISO date format
    const key = scheduledAt.slice(0,10);
    const hm  = scheduledAt.slice(11,16);
    scheduledAt = `${key}T${hm}`;
  }
  return {
    id: t.id || crypto.randomUUID(),
    title: String(t.title || "").trim() || "Untitled",
    duration,
    priority: t.priority || "Medium",
    calendar: t.calendar || "Work",
    repeat: t.repeat || "none",
    done: !!t.done,
    fixed: whenFixed,
    flex: whenFixed ? null : (t.flex || "today"),
    flexDate: !whenFixed ? (t.flexDate || null) : null,
    fixedDate: whenFixed ? (t.fixedDate || (scheduledAt ? scheduledAt.slice(0,10) : null)) : null,
    fixedTime: whenFixed ? (t.fixedTime || (scheduledAt ? scheduledAt.slice(11,16) : null)) : null,
    rescheduled: !!t.rescheduled,
    scheduledAt
  };
}
function dedupeByIdOrSignature(arr){
  const out=[]; 
  for(const t of arr){
    if (!out.some(x => x.id===t.id || (x.title===t.title && x.duration===t.duration && x.scheduledAt===t.scheduledAt))) {
      out.push(t);
    }
  }
  return out;
}
function migrateAllTasks() {
  // prefer current; merge legacy underneath (never deleting)
  let current = load(LS_TASKS, null);
  if (Array.isArray(current)) {
    return dedupeByIdOrSignature(current.map(normalizeTask));
  }
  let merged=[];
  for(const key of LEGACY_KEYS){
    const arr = load(key, []);
    if (Array.isArray(arr) && arr.length){
      merged.push(...arr.map(normalizeTask));
    }
  }
  merged = dedupeByIdOrSignature(merged);
  return merged;
}

let tasks = migrateAllTasks();
let settings = load(LS_SETTINGS, {
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  workStartMins: 9*60,
  workEndMins: 17*60,
  slot: 30
});
if (settings.workEndMins <= settings.workStartMins) {
  settings.workStartMins = 9*60; settings.workEndMins = 17*60; // guard
}
let weekStart = startOfWeek(new Date());

////////////////////
// Holidays (AB minimal)
////////////////////
function easter(Y){const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,L=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*L)/451),month=Math.floor((h+L-7*m+114)/31),day=((h+L-7*m+114)%31)+1;return new Date(Y,month-1,day)}
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

////////////////////
// Rendering
////////////////////
function minsToHrsStr(m){ const h=(m/60)|0, mm=m%60; return `${h}h ${mm}m`; }

function render(){
  renderUnscheduled();
  renderCalendar();
  renderUrgent();
  save(LS_TASKS, tasks);
  save(LS_SETTINGS, settings);
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
function renderUrgent(){
  const list=tasks.filter(t=>t.priority==="High" && !t.done);
  urgentList.innerHTML="";
  list.forEach(t=>{
    const d = t.scheduledAt ? t.scheduledAt.slice(0,10) : (t.fixedDate||"—");
    const dStr = d && d!=="—" ? new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML=`<div style="flex:1"><b>${escapeHTML(t.title)}</b><div class="meta">${t.calendar} • ${dStr}</div></div>`;
    urgentList.appendChild(li);
  });
}
function renderCalendar(){
  calendarEl.innerHTML="";
  const y = weekStart.getFullYear();
  const hol = albertaHolidays(y);
  const cap = settings.workEndMins - settings.workStartMins;

  for(let i=0;i<7;i++){
    const day=addDays(weekStart,i);
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

    if(hol[key]){
      const b=document.createElement("div");
      b.className="block fixed";
      b.innerHTML=`<div class="row"><b>${hol[key]}</b><span class="small">Holiday</span></div>`;
      list.appendChild(b);
    }

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
  setupDnD();
}

////////////////////
// Capacity helpers
////////////////////
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
    mins += settings.slot;
  }
  return null;
}

////////////////////
// Scheduling (FIXED)
////////////////////
function scheduleFlexible(t){
  // Determine base window
  const now=new Date();
  let from = startOfWeek(now), to = addDays(from,6);
  const flex = t.flex || "today";
  if (flex==="today"){ from=startOfWeek(now); to=addDays(from,0); }
  else if (flex==="next2d"){ from=startOfWeek(now); to=addDays(from,2); }
  else if (flex==="week"){ from=startOfWeek(now); to=addDays(from,6); }
  else if (flex==="bydate" && t.flexDate){ from=parseISO(t.flexDate); to=parseISO(t.flexDate); }

  // Never schedule in the past
  if (from < startOfWeek(now)) { from = startOfWeek(now); to = (to < from ? from : to); }

  // Try window, then roll up to 28 days forward
  const hol = albertaHolidays(from.getFullYear());
  const MAX_DAYS_AHEAD = 28;

  let tries = 0;
  while (tries <= MAX_DAYS_AHEAD) {
    for (let d=new Date(from); d<=to; d=addDays(d,1)) {
      const key = toKey(d);
      if (key < todayKey()) continue;
      if (hol[key]) continue;
      const cap = dayCapacity(key);
      if (cap.free < t.duration) continue;
      const slot = nextFreeTime(key, t.duration);
      if (slot != null) {
        t.scheduledAt = `${key}T${minToHM(slot)}`;
        return true;
      }
    }
    // extend both ends forward by 7d
    from = addDays(from, 7);
    to   = addDays(to,   7);
    tries += 7;
  }
  return false;
}

function scheduleFixed(t, {confirmOverbook=true}={}){
  let key = clampToToday(t.fixedDate);
  if (!key) key = todayKey();

  const hol = albertaHolidays(new Date(key).getFullYear());
  if (hol[key]) return false;

  const cap = dayCapacity(key);
  const want = t.fixedTime ? hmToMin(t.fixedTime) : settings.workStartMins;

  if (cap.free < t.duration && confirmOverbook) {
    const ok = confirm(
      `That day is over capacity.\nScheduled: ${minsToHrsStr(cap.used)} / ${minsToHrsStr(cap.cap)}.\nProceed anyway?`
    );
    if (!ok) return false;
  }

  // Try requested time, then next free slot
  let time = want;
  const taken=tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key))
                  .map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  while (time + t.duration <= settings.workEndMins) {
    if (!taken.includes(time)) {
      t.scheduledAt = `${key}T${minToHM(time)}`;
      return true;
    }
    time += settings.slot;
  }
  return false;
}

////////////////////
// Repeats (unchanged behaviour)
////////////////////
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
    let d=anchor; for(let i=1;i<=9;i++){ d=addDays(d,1); const wd=d.getDay(); if (wd!==0 && wd!==6) addClone(d); }
  }
}

////////////////////
// Events
////////////////////
form.addEventListener("change", ()=>{
  const when = form.elements["when"]?.value || "flex";
  flexOpts.classList.toggle("hide", when!=="flex");
  fixedOpts.classList.toggle("hide", when!=="fixed");
});

form.addEventListener("submit", e=>{
  e.preventDefault();
  const when = form.elements["when"]?.value || "flex";
  const dur = (+durHr.value||0)*60 + (+durMin.value||0);
  if (!title.value.trim() || dur<=0) return;

  const task = {
    id: crypto.randomUUID(),
    title: title.value.trim(),
    duration: dur,
    priority: priority.value,
    calendar: calSel.value,
    repeat: repeatSel.value,
    done:false,
    fixed: when==="fixed",
    flex: when==="flex" ? (form.elements["flex"]?.value || "today") : null,
    flexDate: when==="flex" && (form.elements["flex"]?.value==="bydate") ? (byDate.value||null) : null,
    fixedDate: when==="fixed" ? (fixedDate.value||null) : null,
    fixedTime: when==="fixed" ? (fixedTime.value||null) : null,
    rescheduled:false,
    scheduledAt:null
  };

  // schedule now (but never in past)
  const placed = task.fixed ? scheduleFixed(task) : scheduleFlexible(task);
  tasks.push(task);
  createRepeats(task); // optional clones

  form.reset(); durHr.value=1; durMin.value=0; priority.value="Medium";
  render();
});

autoBtn.addEventListener("click", ()=>{
  // schedule only currently unscheduled
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

prevWeek.addEventListener("click", ()=>{ weekStart = addDays(weekStart,-7); render(); });
nextWeek.addEventListener("click", ()=>{ weekStart = addDays(weekStart, 7); render(); });
todayBtn.addEventListener("click", ()=>{ weekStart = startOfWeek(new Date()); render(); });

document.addEventListener("click", e=>{
  const id = e.target.dataset?.id;
  const act = e.target.dataset?.act;

  if (e.target.classList.contains("doneBox")){
    const t=tasks.find(x=>x.id===id); if(t){ t.done=e.target.checked; render(); maybeCelebrateDay(); }
    return;
  }

  if (act==="r1"||act==="r2"||act==="r7"){
    const t=tasks.find(x=>x.id===id); if (!t) return;
    const add = act==="r1"?1:act==="r2"?2:7;
    const anchor = t.scheduledAt ? parseISO(t.scheduledAt) : (t.fixedDate? parseISO(t.fixedDate): new Date());
    const targetKey = toKey(addDays(anchor, add));
    const keepTime = t.scheduledAt ? t.scheduledAt.slice(11,16) : (t.fixedTime||"09:00");
    t.fixed=true; t.fixedDate=targetKey; t.fixedTime=keepTime; t.rescheduled=true; t.scheduledAt=null;
    scheduleFixed(t);
    render();
    return;
  }

  if (act==="unsched"){ const t=tasks.find(x=>x.id===id); if(!t) return; t.scheduledAt=null; render(); return; }
  if (act==="del"){ tasks = tasks.filter(x=>x.id!==id); render(); return; }
});

clearInputsBtn.addEventListener("click", ()=>form.reset());

clearDayBtn.addEventListener("click", ()=>{
  const keys=[...Array(7)].map((_,i)=>toKey(addDays(weekStart,i)));
  tasks.forEach(t=>{ if (t.scheduledAt && keys.some(k=>t.scheduledAt.startsWith(k))) t.done=true; });
  render(); celebrate();
});

////////////////////
// Drag & Drop
////////////////////
function setupDnD(){
  $$(".block[draggable]").forEach(b=>{
    b.addEventListener("dragstart", ev=>{
      b.classList.add("dragging");
      ev.dataTransfer.setData("text/plain", b.dataset.id);
      ev.dataTransfer.effectAllowed="move";
    });
    b.addEventListener("dragend", ()=>b.classList.remove("dragging"));
  });
  $$(".list.dropzone").forEach(zone=>{
    zone.addEventListener("dragover", ev=>{ ev.preventDefault(); zone.classList.add("drop-target"); ev.dataTransfer.dropEffect="move"; });
    zone.addEventListener("dragleave", ()=>zone.classList.remove("drop-target"));
    zone.addEventListener("drop", ev=>{
      ev.preventDefault(); zone.classList.remove("drop-target");
      const id=ev.dataTransfer.getData("text/plain");
      const t=tasks.find(x=>x.id===id); if(!t) return;
      const key=zone.dataset.key;
      const time = t.scheduledAt ? t.scheduledAt.slice(11,16) : (t.fixedTime||"09:00");
      t.fixed=true; t.fixedDate=key; t.fixedTime=time; t.rescheduled=true; t.scheduledAt=null;
      scheduleFixed(t);
      render();
    });
  });
}

////////////////////
// Reward bits (unchanged)
////////////////////
let rewardTimer=null;
function celebrate(){ try{ ding.currentTime=0; ding.play().catch(()=>{}) }catch{} reward.classList.remove("hide"); clearTimeout(rewardTimer); rewardTimer=setTimeout(closeReward,2200); burstConfetti(); }
function maybeCelebrateDay(){
  const today = todayKey();
  const list = tasks.filter(t=>t.scheduledAt && t.scheduledAt.startsWith(today));
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

////////////////////
// Theme / Import / Export
////////////////////
document.documentElement.style.colorScheme = settings.theme;
themeBtn.addEventListener("click", ()=>{
  settings.theme = settings.theme==="dark" ? "light" : "dark";
  document.documentElement.style.colorScheme = settings.theme;
  save(LS_SETTINGS, settings);
});
exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({tasks,settings},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="chaos-control.json"; a.click();
});
importBtn.addEventListener("click", async ()=>{
  const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange = async ()=> {
    const txt = await inp.files[0].text();
    try{
      const obj = JSON.parse(txt);
      if (Array.isArray(obj.tasks)) tasks = obj.tasks.map(normalizeTask);
      if (obj.settings) settings = {...settings, ...obj.settings};
      render();
    }catch(e){ alert("Import failed: invalid file."); }
  };
  inp.click();
});

////////////////////
// Init
////////////////////
render();
