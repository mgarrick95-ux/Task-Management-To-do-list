/* Chaos Control — Smart Scheduler v4 (Stable+)
 * - auto-closing reward modal (+click & ESC)
 * - confetti burst + optional ding
 * - Alberta stat holidays block days
 * - export/import, theme, flexible & fixed, repeats
 * Data persists in localStorage.
*/

const LS_TASKS = "cc_tasks_v4";
const LS_SETTINGS = "cc_settings_v4";

// ===== Utilities
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const load = (k, fb=null) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fb; }
  catch { return fb; }
};
const pad2 = n => String(n).padStart(2,"0");
const toKey = d => d.toISOString().slice(0,10);

// ===== DOM refs
const themeBtn = $("#themeBtn");
const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");

const form = $("#taskForm");
const title = $("#title");
const durHr = $("#durHr");
const durMin = $("#durMin");
const priority = $("#priority");
const repeatSel = $("#repeat");
const calSel = $("#calendar");
const addBtn = $("#addBtn");
const autoBtn = $("#autoBtn");
const clearInputsBtn = $("#clearInputsBtn");
const clearDayBtn = $("#clearDayBtn");

const flexOpts = $("#flexOpts");
const fixedOpts = $("#fixedOpts");
const byDate = $("#byDate");
const fixedDate = $("#fixedDate");
const fixedTime = $("#fixedTime");

const urgentList = $("#urgentList");
const taskList = $("#taskList");
const unscheduledEmpty = $("#unscheduledEmpty");

const calendarEl = $("#calendarEl");
const prevWeek = $("#prevWeek");
const todayBtn = $("#todayBtn");
const nextWeek = $("#nextWeek");
const autoAllBtn = $("#autoAllBtn");

// reward modal
const reward = $("#reward");
const rewardClose = $("#rewardClose");
const rewardLine = $("#rewardLine");

// audio + confetti
const ding = $("#ding");
const confettiCanvas = $("#confetti");
const ctx = confettiCanvas.getContext("2d");

// ===== State
let tasks = load(LS_TASKS, []);
let settings = load(LS_SETTINGS, {
  theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  workStartMins: 9*60,
  workEndMins: 17*60,
  slot: 30
});
let startOfWeek = startOf(new Date());

// ===== Holidays (Alberta, minimal set; adjust yearly)
function albertaHolidays(year) {
  // YYYY-MM-DD -> label
  const E = easter(year); // Easter Sunday (computus)
  const goodFriday = addDays(E, -2);
  const familyDay = nthWeekdayOfMonth(year,2,1,1,3); // 3rd Monday in Feb
  const victoriaDay = lastWeekdayBefore(year,5,24,1); // Mon before May 25
  const labour = nthWeekdayOfMonth(year,9,1,1,1); // first Mon Sep
  const thanksgiving = nthWeekdayOfMonth(year,10,1,1,2); // 2nd Mon Oct
  const holidays = {
    [`${year}-01-01`]: "New Year’s Day",
    [toKey(goodFriday)]: "Good Friday",
    [`${year}-07-01`]: "Canada Day",
    [`${year}-08-05`]: "Heritage Day (AB)",
    [toKey(labour)]: "Labour Day",
    [toKey(thanksgiving)]: "Thanksgiving",
    [`${year}-11-11`]: "Remembrance Day",
    [`${year}-12-25`]: "Christmas Day",
    [toKey(familyDay)]: "Family Day",
    [toKey(victoriaDay)]: "Victoria Day",
  };
  return holidays;
}
// helpers for holidays
function startOf(d){ const x=new Date(d); x.setHours(0,0,0,0); const dow=(x.getDay()+6)%7; return addDays(x,-dow); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function nthWeekdayOfMonth(y,m,weekday,firstDay=1,n=1){
  // weekday: 1 Monday ... 5 Friday, m: 1..12
  const start = new Date(y, m-1, firstDay);
  let count=0, d=new Date(start);
  while (d.getMonth()===m-1) {
    const wd=((d.getDay()+6)%7)+1;
    if (wd===weekday) { count++; if (count===n) return d; }
    d.setDate(d.getDate()+1);
  }
  return start; // fallback
}
function lastWeekdayBefore(y,m,day,weekday){
  const d=new Date(y,m-1,day);
  while((((d.getDay()+6)%7)+1)!==weekday){ d.setDate(d.getDate()-1); }
  return d;
}
// Meeus/Jones/Butcher
function easter(Y){
  const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,
        f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
        h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4,
        L=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*L)/451),
        month=Math.floor((h+L-7*m+114)/31), day=((h+L-7*m+114)%31)+1;
  return new Date(Y, month-1, day);
}

// ===== Rendering
function render(){
  renderUnscheduled();
  renderCalendar();
  renderUrgent();
  save(LS_TASKS, tasks);
}

function renderUnscheduled(){
  const uns = tasks.filter(t=>!t.scheduledAt);
  taskList.innerHTML = "";
  unscheduledEmpty.classList.toggle("hide", uns.length>0);
  uns.forEach(t=>{
    const li=document.createElement("li");
    li.className="li";
    const meta = t.fixed ? "fixed" : "flex";
    li.innerHTML = `
      <input type="checkbox" ${t.done?"checked":""} data-id="${t.id}" class="doneBox"/>
      <div style="flex:1 1 auto">
        <div>${escapeHTML(t.title)}</div>
        <div class="meta">${t.duration}m • ${t.priority} • ${t.calendar} • ${meta}</div>
      </div>
      <button class="btn ghost smallBtn" data-act="edit" data-id="${t.id}">Edit</button>
      <button class="btn ghost smallBtn" data-act="del" data-id="${t.id}">Del</button>
    `;
    taskList.appendChild(li);
  });
}

function renderUrgent(){
  const urgent = tasks.filter(t=>t.priority==="High" && !t.done);
  urgentList.innerHTML="";
  urgent.forEach(t=>{
    const li=document.createElement("li");
    li.className="li";
    li.innerHTML = `<div style="flex:1 1 auto"><b>${escapeHTML(t.title)}</b><div class="meta">${t.calendar}</div></div>`;
    urgentList.appendChild(li);
  });
}

function renderCalendar(){
  calendarEl.innerHTML="";
  const year = startOfWeek.getFullYear();
  const hol = albertaHolidays(year);
  for(let i=0;i<7;i++){
    const day = addDays(startOfWeek,i);
    const key = toKey(day);
    const col = document.createElement("div");
    col.className = "col"+(hol[key]?" holiday":"");
    const cap = day.toLocaleDateString(undefined,{weekday:"short", month:"short", day:"numeric"});
    const dayTasks = tasks.filter(t=>t.scheduledAt && t.scheduledAt.startsWith(key));
    const used = dayTasks.reduce((a,t)=>a+t.duration,0);
    const capacity = settings.workEndMins-settings.workStartMins;
    const usedPct = Math.min(100, Math.round(100*used/capacity));

    col.innerHTML = `
      <div class="colhead">
        <div style="font-weight:700">${cap}</div>
        <div class="meter"><i style="width:${usedPct}%"></i></div>
      </div>
      <div class="slot" data-key="${key}"></div>
      <div class="list" id="d-${key}"></div>
    `;
    const list = col.querySelector(".list");
    if(hol[key]){
      const b = document.createElement("div");
      b.className="block fixed";
      b.innerHTML = `<div class="row"><b>${hol[key]}</b><span class="small">Holiday</span></div>`;
      list.appendChild(b);
    }

    dayTasks.forEach(t=>{
      const row=document.createElement("div");
      row.className="block "+(t.fixed?"fixed ":"")+(t.priority==="High"?"high ":"")+(t.done?"done ":"");
      const timeStr = t.scheduledAt.slice(11,16);
      row.innerHTML = `
        <div class="row">
          <div><b>${escapeHTML(t.title)}</b></div>
          <div class="small">${timeStr} • ${t.duration}m</div>
        </div>
        <div class="row small">
          <div>${t.calendar} • ${t.priority}${t.rescheduled?" • bumped":""}</div>
          <div>
            <input type="checkbox" ${t.done?"checked":""} class="doneBox" data-id="${t.id}"/>
            <button class="btn ghost smallBtn" data-act="edit" data-id="${t.id}">Edit</button>
            <button class="btn ghost smallBtn" data-act="unsched" data-id="${t.id}">Unsch</button>
          </div>
        </div>
      `;
      list.appendChild(row);
    });

    calendarEl.appendChild(col);
  }
}

// ===== Scheduling
function scheduleFlexible(t){
  // window based on flex choice
  const now = new Date();
  let from = startOf(now), to = addDays(from,6);
  if (t.flex==="today"){ from=startOf(now); to=addDays(from,0); }
  else if (t.flex==="next2d"){ from=startOf(now); to=addDays(from,2); }
  else if (t.flex==="week"){ from=startOf(now); to=addDays(from,6); }
  else if (t.flex==="bydate" && t.flexDate){ from=new Date(t.flexDate); to=new Date(t.flexDate); }

  // prefer chosen date, keep non-urgent items bumpable
  const cap = settings.workEndMins-settings.workStartMins;
  const hol = albertaHolidays(from.getFullYear());

  for(let d=new Date(from); d<=to; d=addDays(d,1)){
    const key = toKey(d);
    if (hol[key]) continue; // skip holidays
    const dayItems = tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key));
    const used = dayItems.reduce((a,x)=>a+x.duration,0);
    if (used + t.duration > cap) continue; // try next day
    // find next time slot
    let mins = settings.workStartMins;
    const taken = dayItems.map(x=>hmToMin(x.scheduledAt.slice(11,16)));
    while (mins+t.duration <= settings.workEndMins){
      const conflict = taken.includes(mins);
      if (!conflict){
        t.scheduledAt = `${key}T${minToHM(mins)}`;
        return true;
      }
      mins += settings.slot;
    }
  }
  return false;
}

function scheduleFixed(t){
  if (!t.fixedDate) return false;
  const key = t.fixedDate;
  const hol = albertaHolidays(new Date(key).getFullYear());
  if (hol[key]) return false;

  // set a time (default if missing: first free slot)
  let timeMins = t.fixedTime ? hmToMin(t.fixedTime) : settings.workStartMins;
  const dayItems = tasks.filter(x=>x.scheduledAt && x.scheduledAt.startsWith(key));
  const cap = settings.workEndMins-settings.workStartMins;
  const used = dayItems.reduce((a,x)=>a+x.duration,0);
  if (used + t.duration > cap) return false;

  const taken = dayItems.map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  while (timeMins + t.duration <= settings.workEndMins){
    if (!taken.includes(timeMins)){
      t.scheduledAt = `${key}T${minToHM(timeMins)}`;
      return true;
    }
    timeMins += settings.slot;
  }
  return false;
}

// ===== Actions
form.addEventListener("change", e=>{
  const when = form.elements["when"].value;
  flexOpts.classList.toggle("hide", when!=="flex");
  fixedOpts.classList.toggle("hide", when!=="fixed");
});

form.addEventListener("submit", e=>{
  e.preventDefault();
  const when = form.elements["when"].value;
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
    flex: when==="flex" ? form.elements["flex"].value : null,
    flexDate: when==="flex" && form.elements["flex"].value==="bydate" ? byDate.value||null : null,
    fixedDate: when==="fixed" ? (fixedDate.value||null) : null,
    fixedTime: when==="fixed" ? (fixedTime.value||null) : null,
    rescheduled:false
  };

  if (task.fixed ? scheduleFixed(task) : scheduleFlexible(task)) {
    tasks.push(task);
  } else {
    // leave unscheduled but pinned to chosen day if provided
    if (task.fixed && task.fixedDate) task.scheduledAt = `${task.fixedDate}T${task.fixedTime||"09:00"}`;
    tasks.push(task);
  }

  // repeats create future clones (basic)
  createRepeats(task);

  form.reset();
  durHr.value=1; durMin.value=0; priority.value="Medium";
  render();
});

function createRepeats(base){
  const addClone=(d)=>{
    const c={...base,id:crypto.randomUUID(),done:false,rescheduled:false};
    if (c.fixed){
      c.fixedDate = toKey(d);
      c.fixedTime = base.fixedTime||null;
      c.scheduledAt = null;
      scheduleFixed(c);
    }else{
      c.flexDate = toKey(d);
      c.flex = "bydate";
      c.scheduledAt = null;
      scheduleFlexible(c);
    }
    tasks.push(c);
  };

  if (base.repeat==="daily"){
    for(let i=1;i<=4;i++) addClone(addDays(parseISO(base.scheduledAt||base.fixedDate||toKey(new Date())), i));
  } else if (base.repeat==="weekly"){
    for(let i=1;i<=3;i++) addClone(addDays(parseISO(base.scheduledAt||base.fixedDate||toKey(new Date())), i*7));
  } else if (base.repeat==="mowf"){
    let d=parseISO(base.scheduledAt||base.fixedDate||toKey(new Date()));
    for(let i=1;i<=9;i++){
      d=addDays(d,1);
      const wd=d.getDay();
      if (wd!==0 && wd!==6) addClone(d);
    }
  }
}

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

clearInputsBtn.addEventListener("click", ()=>form.reset());

// day navigation
prevWeek.addEventListener("click", ()=>{ startOfWeek = addDays(startOfWeek,-7); render(); });
nextWeek.addEventListener("click", ()=>{ startOfWeek = addDays(startOfWeek,7); render(); });
todayBtn.addEventListener("click", ()=>{ startOfWeek = startOf(new Date()); render(); });

// list interactions
document.addEventListener("click", e=>{
  const id = e.target.dataset?.id;
  const act = e.target.dataset?.act;
  if (e.target.classList.contains("doneBox")){
    const t = tasks.find(x=>x.id===id);
    if (t){ t.done = e.target.checked; render(); maybeCelebrateDay(); }
  } else if (act==="del"){
    tasks = tasks.filter(x=>x.id!==id);
    render();
  } else if (act==="unsched"){
    const t = tasks.find(x=>x.id===id);
    if (t){ t.scheduledAt=null; render(); }
  } else if (act==="edit"){
    const t = tasks.find(x=>x.id===id);
    if (!t) return;
    // lightweight inline edit: move values to form
    title.value = t.title;
    durHr.value = Math.floor(t.duration/60);
    durMin.value = t.duration%60;
    priority.value = t.priority;
    calSel.value = t.calendar;
    repeatSel.value = t.repeat||"none";
    if (t.fixed){
      form.elements["when"].value="fixed";
      fixedOpts.classList.remove("hide");
      flexOpts.classList.add("hide");
      fixedDate.value = t.scheduledAt ? t.scheduledAt.slice(0,10) : t.fixedDate||"";
      fixedTime.value = t.scheduledAt ? t.scheduledAt.slice(11,16) : (t.fixedTime||"");
    }else{
      form.elements["when"].value="flex";
      flexOpts.classList.remove("hide");
      fixedOpts.classList.add("hide");
    }
    // delete original (edit-as-new)
    tasks = tasks.filter(x=>x.id!==id);
    render();
  }
});

// clear entire schedule of current week -> celebration
clearDayBtn.addEventListener("click", ()=>{
  const keys = [...Array(7)].map((_,i)=>toKey(addDays(startOfWeek,i)));
  tasks.forEach(t=>{
    if (t.scheduledAt && keys.some(k=>t.scheduledAt.startsWith(k))) t.done = true;
  });
  render();
  celebrate();
});

// theme
themeBtn.addEventListener("click", ()=>{
  settings.theme = settings.theme==="dark" ? "light" : "dark";
  document.documentElement.style.colorScheme = settings.theme;
  save(LS_SETTINGS, settings);
});

// export/import
exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({tasks, settings}, null, 2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="chaos-control.json";
  a.click();
});
importBtn.addEventListener("click", async ()=>{
  const inp=document.createElement("input");
  inp.type="file"; inp.accept="application/json";
  inp.onchange = async ()=> {
    const txt = await inp.files[0].text();
    try{
      const obj = JSON.parse(txt);
      if (Array.isArray(obj.tasks)) tasks = obj.tasks;
      if (obj.settings) settings = {...settings, ...obj.settings};
      render();
    }catch(e){ alert("Import failed: invalid file."); }
  };
  inp.click();
});

// ===== Reward popup / confetti
let rewardTimer=null;
function celebrate(){
  // play ding if available
  try{ ding.currentTime=0; ding.play().catch(()=>{}); }catch{}
  // modal
  reward.classList.remove("hide");
  clearTimeout(rewardTimer);
  rewardTimer = setTimeout(closeReward, 2200);
  // confetti
  burstConfetti();
}
function maybeCelebrateDay(){
  // if every block in current day done -> celebrate
  const keys = [...Array(7)].map((_,i)=>toKey(addDays(startOfWeek,i)));
  const todayKey = toKey(new Date());
  const list = tasks.filter(t=>t.scheduledAt && t.scheduledAt.startsWith(todayKey));
  if (list.length && list.every(t=>t.done)) celebrate();
}
function closeReward(){
  reward.classList.add("hide");
}
reward.addEventListener("click", e=>{
  if (e.target===reward) closeReward();
});
rewardClose.addEventListener("click", closeReward);
document.addEventListener("keydown", e=>{ if (e.key==="Escape") closeReward(); });

// confetti engine (tiny)
function burstConfetti(){
  const W = confettiCanvas.width = innerWidth;
  const H = confettiCanvas.height = innerHeight;
  const N = 140;
  const pieces = Array.from({length:N}).map(()=>({
    x: Math.random()*W, y: -20, r: Math.random()*4+2,
    vx:(Math.random()-.5)*1.5, vy: Math.random()*2+2,
    a: Math.random()*360
  }));
  const colors = ["#ffd166","#e76f51","#43aa8b","#90be6d","#577590","#7aa2ff"];

  let t = 0;
  function tick(){
    ctx.clearRect(0,0,W,H);
    for (const p of pieces){
      p.x += p.vx; p.y += p.vy; p.a += 6;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.a*Math.PI/180);
      ctx.fillStyle = colors[(p.a|0)%colors.length];
      ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r);
      ctx.restore();
    }
    t++;
    if (t<80) requestAnimationFrame(tick);
    else ctx.clearRect(0,0,W,H);
  }
  tick();
}

// ===== Helpers
function escapeHTML(s){ return s.replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }
function hmToMin(hm){ const [h,m]=hm.split(":").map(Number); return h*60+m; }
function minToHM(m){ return `${pad2((m/60)|0)}:${pad2(m%60)}`; }
function parseISO(yyyyMMdd){ const [y,mo,d]=yyyyMMdd.split("T")[0].split("-").map(Number); return new Date(y,mo-1,d); }

// ===== Init
document.documentElement.style.colorScheme = settings.theme;
render();
