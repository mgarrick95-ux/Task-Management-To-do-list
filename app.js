/* Chaos Control — v6 Consolidated
   - Keeps localStorage keys from last night (cc_tasks_v33 / cc_settings_v33)
   - Edit-on-click, reschedule buttons, drag & drop
   - Past-date safeguard & capacity warning
   - Urgent list shows scheduled date
   - Gold star + quips when today's done
*/
const LS_TASKS = "cc_tasks_v33";
const LS_SETTINGS = "cc_settings_v33";
const LS_BACKUP = "cc_tasks_backup";

// Helpers
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const pad2 = n => String(n).padStart(2,"0");
const toKey = d => { const x=new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`; };
const todayKey = () => toKey(new Date());
const addDays = (d,n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfWeek = d => { const x=new Date(d); x.setHours(0,0,0,0); const dow=(x.getDay()+6)%7; x.setDate(x.getDate()-dow); return x; };
const clampToToday = k => k && k<todayKey()? todayKey(): (k||todayKey());
const minsToHrs = m => `${Math.floor(m/60)}h ${m%60}m`;

// Load/save (with backup)
function ld(k, fb){ try{ const v=localStorage.getItem(k); return v? JSON.parse(v): fb }catch{ return fb } }
function sv(k, v){ localStorage.setItem(k, JSON.stringify(v)); if(k===LS_TASKS){ localStorage.setItem(LS_BACKUP, JSON.stringify(v)); } }

let tasks = ld(LS_TASKS, null);
if(!Array.isArray(tasks) || tasks.length===0){
  const backup = ld(LS_BACKUP, []);
  if(Array.isArray(backup) && backup.length>0){ tasks = backup; sv(LS_TASKS, tasks); }
}
if(!Array.isArray(tasks)) tasks = [];

let settings = ld(LS_SETTINGS, { theme:"auto", workStartMins:9*60, workEndMins:17*60, slot:30, dailyCapMins: 8*60 });

let weekStart = startOfWeek(new Date());

// Theme
function applyTheme(){
  const pref = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark":"light";
  const mode = settings.theme==="auto"? pref : settings.theme;
  document.documentElement.setAttribute("data-theme", mode);
}
applyTheme();
$("#themeToggle").addEventListener("click", ()=>{
  settings.theme = settings.theme==="auto" ? "dark" : settings.theme==="dark" ? "light" : "auto";
  sv(LS_SETTINGS, settings); applyTheme();
});

// Holidays (AB minimal)
function easter(Y){const a=Y%19,b=Math.floor(Y/100),c=Y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,L=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*L)/451),month=Math.floor((h+L-7*m+114)/31),day=((h+L-7*m+114)%31)+1;return new Date(Y,month-1,day)}
function nthWeekdayOfMonth(y,m,weekday,firstDay=1,n=1){const start=new Date(y,m-1,firstDay);let c=0,d=new Date(start);while(d.getMonth()===m-1){const wd=((d.getDay()+6)%7)+1;if(wd===weekday){c++;if(c===n)return d}d.setDate(d.getDate()+1)}return start}
function lastWeekdayBefore(y,m,day,weekday){const d=new Date(y,m-1,day);while((((d.getDay()+6)%7)+1)!==weekday){d.setDate(d.getDate()-1)}return d}
function albertaHolidays(y){
  const E=easter(y), goodFriday=addDays(E,-2),
  family=nthWeekdayOfMonth(y,2,1,1,3),
  victoria=lastWeekdayBefore(y,5,24,1),
  labour=nthWeekdayOfMonth(y,9,1,1,1),
  thanksgiving=nthWeekdayOfMonth(y,10,1,1,2);
  return {
    [`${y}-01-01`]:"New Year’s Day",
    [toKey(goodFriday)]:"Good Friday",
    [`${y}-07-01`]:"Canada Day",
    [`${y}-08-05`]:"Heritage Day (AB)",
    [toKey(labour)]:"Labour Day",
    [toKey(thanksgiving)]:"Thanksgiving",
    [`${y}-11-11`]:"Remembrance Day",
    [`${y}-12-25`]:"Christmas Day",
    [toKey(family)]:"Family Day",
    [toKey(victoria)]:"Victoria Day"
  };
}

// UI refs
const title = $("#title");
const durHr = $("#durHr");
const durMin = $("#durMin");
const priority = $("#priority");
const calendar = $("#calendar");
const addBtn = $("#addBtn");
const autoBtn = $("#autoBtn");
const todayBtn = $("#todayBtn");
const prevWeek = $("#prevWeek");
const nextWeek = $("#nextWeek");
const prevDay = $("#prevDay");
const nextDay = $("#nextDay");
const urgentList = $("#urgentList");
const unscheduledList = $("#unscheduledList");
const calendarEl = $("#calendarEl");
const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");
const reward = $("#reward");
const rewardMsg = $("#rewardMsg");
const ding = $("#ding");

const flexChips = $("#flexChips");
const flexDate = $("#flexDate");
const fixedDate = $("#fixedDate");
const fixedTime = $("#fixedTime");

$$("input[name='when']").forEach(r=>{
  r.addEventListener("change", ()=>{
    const v = $("input[name='when']:checked").value;
    $("#flexOpts").classList.toggle("hide", v!=="flex");
    $("#fixedOpts").classList.toggle("hide", v!=="fixed");
  });
});
flexChips.addEventListener("click",(e)=>{
  const b = e.target.closest(".chip"); if(!b) return;
  $$(".chip", flexChips).forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  flexDate.classList.toggle("hide", b.dataset.flex!=="bydate");
});

function minsToHrsStr(m){const h=(m/60)|0,mm=m%60;return `${h}h ${mm}m`;}

// Render functions
function render(){
  renderUrgent();
  renderUnscheduled();
  renderCalendar();
  sv(LS_TASKS, tasks);
  sv(LS_SETTINGS, settings);
}

function renderUrgent(){
  urgentList.innerHTML="";
  const nowK = todayKey();
  const list = tasks
    .filter(t=> !t.done && ((t.priority==="High"||t.priority==="high") || (t.scheduledAt && t.scheduledAt.slice(0,10)<=nowK)))
    .sort((a,b)=> (a.scheduledAt||'9999').localeCompare(b.scheduledAt||'9999'));
  for(const t of list){
    const d = t.scheduledAt? t.scheduledAt.slice(0,10) : (t.fixedDate||"—");
    const dStr = d!=="—"? new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "—";
    const li = document.createElement("li");
    li.className="item";
    li.innerHTML = `<div><b>${t.title||"Untitled"}</b><div class="small">${t.calendar||"Work"} • ${dStr}</div></div>
    <span class="badge">${minsToHrsStr(t.duration||30)}</span>`;
    li.addEventListener("click",()=> openEditor(t.id));
    urgentList.appendChild(li);
  }
}

function renderUnscheduled(){
  unscheduledList.innerHTML="";
  const list = tasks.filter(t=> !t.scheduledAt);
  for(const t of list){
    const li = document.createElement("li");
    li.className="item";
    li.innerHTML = `<div><b>${t.title||"Untitled"}</b><div class="small">${t.calendar||"Work"} • ${minsToHrsStr(t.duration||30)}</div></div>
    <div class="actions"><button class="btn ghost" data-act="del" data-id="${t.id}">Del</button></div>`;
    li.addEventListener("click",(e)=>{
      if(e.target.dataset.act==="del"){ tasks = tasks.filter(x=>x.id!==t.id); render(); return; }
      openEditor(t.id);
    });
    unscheduledList.appendChild(li);
  }
}

function renderCalendar(){
  calendarEl.innerHTML = "";
  const y = weekStart.getFullYear(), hol = albertaHolidays(y);
  const cap = settings.dailyCapMins;
  for(let i=0;i<7;i++){
    const day = addDays(weekStart, i), key = toKey(day);
    const dayTasks = tasks.filter(t=> t.scheduledAt && t.scheduledAt.startsWith(key));
    // sort: not done first, high prio first
    dayTasks.sort((a,b)=> (a.done-b.done) || ((b.priority==="High")-(a.priority==="High")));
    const used = dayTasks.reduce((a,t)=> a + (t.duration||30), 0);
    const over = used > cap;

    const col = document.createElement("div");
    col.className = "col";
    col.innerHTML = `<div class="colhead ${over?'over':''}">
      <div>${day.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</div>
      <div class="badge">Used ${minsToHrsStr(used)} / Free ${minsToHrsStr(Math.max(0,cap-used))}</div>
    </div>
    <div class="daylist" data-key="${key}"></div>`;
    const list = $(".daylist", col);

    if(hol[key]){
      const h = document.createElement("div");
      h.className="block fixed";
      h.innerHTML = `<b>${hol[key]}</b> <span class="small">Holiday</span>`;
      list.appendChild(h);
    }

    for(const t of dayTasks){
      const el = document.createElement("div");
      el.className = `block cc-block ${(t.fixed?"fixed ":"")} ${(t.priority==="High"||t.priority==="high"?"high ":"")} ${(t.done?"done ":"")}`;
      el.dataset.id = t.id;
      const time = t.scheduledAt.slice(11,16);
      el.innerHTML = `<div class="cc-block__menu">
          <button class="cc-iconbtn" data-act="edit" title="Edit">⋯</button>
          <button class="cc-iconbtn" data-act="done" title="Done">✓</button>
          <button class="cc-iconbtn" data-act="shift1" title="+1 day">+1</button>
          <button class="cc-iconbtn" data-act="shift2" title="+2 days">+2</button>
          <button class="cc-iconbtn" data-act="shift7" title="+1 week">+7</button>
          <button class="cc-iconbtn" data-act="del" title="Delete">🗑</button>
        </div>
        <div><b>${t.title||"Untitled"}</b> <span class="small">${time} • ${minsToHrsStr(t.duration||30)}</span></div>`;
      list.appendChild(el);
    }

    calendarEl.appendChild(col);
  }

  // DnD: move to another day
  $$(".daylist").forEach(zone=>{
    zone.addEventListener("dragover", ev=> ev.preventDefault());
    zone.addEventListener("drop", ev=>{
      const id = ev.dataTransfer.getData("text/plain");
      const t = tasks.find(x=>x.id===id); if(!t) return;
      const key = zone.dataset.key;
      const tm = t.scheduledAt.slice(11,16);
      t.fixed = true; t.fixedDate = key; t.fixedTime = tm;
      t.scheduledAt = `${key}T${tm}`; t.rescheduled = true;
      render();
    });
  });

  // set draggable + handlers
  $$(".cc-block").forEach(b=>{
    b.setAttribute("draggable","true");
    b.addEventListener("dragstart", e=>{
      e.dataTransfer.setData("text/plain", b.dataset.id);
    });
    $(".cc-block__menu", b).addEventListener("click",(e)=>{
      const act = e.target.closest("button")?.dataset.act;
      const id = b.dataset.id; const t = tasks.find(x=>x.id===id); if(!t) return;
      if(act==="edit"){ openEditor(id); }
      if(act==="done"){ t.done=!t.done; render(); checkReward(); }
      if(act==="del"){ tasks = tasks.filter(x=>x.id!==id); render(); }
      if(act==="shift1"){ shiftTask(t,1); }
      if(act==="shift2"){ shiftTask(t,2); }
      if(act==="shift7"){ shiftTask(t,7); }
      e.stopPropagation();
    });
    b.addEventListener("click", (e)=>{
      if(e.target.closest(".cc-iconbtn")) return;
      openEditor(b.dataset.id);
    });
  });
}

function shiftTask(t, days){
  const d = new Date(t.scheduledAt.slice(0,10));
  d.setDate(d.getDate()+days);
  const key = toKey(d);
  t.scheduledAt = `${key}${t.scheduledAt.slice(10)}`;
  render();
}

// Capacity helpers
function dayUsed(key){
  return tasks.filter(x=> x.scheduledAt && x.scheduledAt.startsWith(key))
              .reduce((a,x)=> a + (x.duration||30), 0);
}

// Scheduling
function scheduleFlexible(t){
  const chipsel = $(".chip.active", flexChips)?.dataset.flex || "today";
  let from = new Date(), to = new Date();
  if(chipsel==="next2d") to = addDays(from,2);
  else if(chipsel==="week") to = addDays(from,6);
  else if(chipsel==="bydate" && flexDate.value){ from=new Date(flexDate.value); to=new Date(flexDate.value); }
  if(toKey(from) < todayKey()) from = new Date();
  const hol = albertaHolidays(from.getFullYear());
  for(let d = new Date(from); d <= to; d = addDays(d,1)){
    const key = toKey(d);
    if(key<todayKey()) continue;
    if(hol[key]) continue;
    const used = dayUsed(key);
    if(used + (t.duration||30) <= settings.dailyCapMins){
      t.scheduledAt = `${key}T09:00`;
      return true;
    }
  }
  return false;
}

function scheduleFixed(t){
  let key = clampToToday($("#fixedDate").value || t.fixedDate);
  if(!key) return false;
  const want = $("#fixedTime").value || t.fixedTime || "09:00";
  const used = dayUsed(key);
  const dur = t.duration||30;
  if(used + dur > settings.dailyCapMins){
    if(!confirm("That day is over capacity. Schedule anyway?")) return false;
  }
  t.scheduledAt = `${key}T${want}`;
  t.fixed = true; t.fixedDate = key; t.fixedTime = want;
  return true;
}

// Globals for editor
window.getTasks = ()=>tasks;
window.setTasks = (arr)=>{ tasks = arr; render(); };
window.openEditor = (id)=>{
  const t = tasks.find(x=> String(x.id)===String(id)); if(!t) return;
  window.Editor.open(t, { onSave:()=>{ sv(LS_TASKS,tasks); render(); }, onDelete:()=>{ tasks = tasks.filter(x=>x.id!==t.id); sv(LS_TASKS,tasks); render(); } });
};

function goldQuip(){
  const qs = [
    "Gold star! You demolished today’s chaos. ✨",
    "Chef’s kiss. Calendar = conquered. 😘",
    "You vs tasks: flawless victory. 🏆",
    "Admin dragon: slain. Carry on, hero. 🐉",
    "No crumbs. Just vibes. ✔️"
  ];
  return qs[Math.floor(Math.random()*qs.length)];
}
function checkReward(){
  const k = todayKey();
  const todays = tasks.filter(t=> t.scheduledAt && t.scheduledAt.startsWith(k) && !t.done===false);
  const any = tasks.some(t=> t.scheduledAt && t.scheduledAt.startsWith(k));
  const allDone = any && tasks.filter(t=> t.scheduledAt && t.scheduledAt.startsWith(k)).every(t=> t.done);
  if(allDone){
    rewardMsg.textContent = goldQuip();
    reward.classList.remove("hide");
    ding.currentTime=0; ding.play().catch(()=>{});
    $("#rewardClose").onclick = ()=> reward.classList.add("hide");
  }
}

// Actions
addBtn.addEventListener("click", ()=>{
  const ttl = title.value.trim(); if(!ttl) return;
  const dur = (parseInt(durHr.value)||0)*60 + (parseInt(durMin.value)||0);
  if(dur<=0) return;
  const when = $("input[name='when']:checked").value;
  const t = { id: (crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())), title: ttl, duration: dur, priority: priority.value, calendar: calendar.value, done:false };
  let placed=false;
  if(when==="fixed"){ t.fixed=true; t.fixedDate = $("#fixedDate").value; t.fixedTime = $("#fixedTime").value; placed=scheduleFixed(t); }
  else { t.fixed=false; placed=scheduleFlexible(t); }
  if(!placed){ t.scheduledAt = null; }
  tasks.push(t);
  render();
  title.value=""; durHr.value="0"; durMin.value="30";
});

autoBtn.addEventListener("click", ()=>{
  tasks.filter(t=> !t.scheduledAt).forEach(t=> scheduleFlexible(t));
  render();
});

todayBtn.addEventListener("click", ()=>{ weekStart = startOfWeek(new Date()); render(); });
prevWeek.addEventListener("click", ()=>{ weekStart = addDays(weekStart, -7); render(); });
nextWeek.addEventListener("click", ()=>{ weekStart = addDays(weekStart, 7); render(); });
prevDay.addEventListener("click", ()=>{ weekStart = addDays(weekStart, -1); render(); });
nextDay.addEventListener("click", ()=>{ weekStart = addDays(weekStart, 1); render(); });

// Export / Import
exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({tasks,settings},null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "chaos-control-backup.json"; a.click();
});
importBtn.addEventListener("click", ()=>{
  const inp = document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange = async ()=>{
    try{
      const txt = await inp.files[0].text();
      const obj = JSON.parse(txt);
      if(Array.isArray(obj.tasks)) tasks = obj.tasks;
      if(obj.settings) settings = {...settings, ...obj.settings};
      render();
    }catch{ alert("Import failed"); }
  };
  inp.click();
});

render();
