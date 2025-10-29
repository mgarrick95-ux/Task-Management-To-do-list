/* Chaos Control — Smart Scheduler v4.5 (Stable Local-Time Fix)
   ------------------------------------------------------------
   ✅ Uses LOCAL date keys (no UTC shift → no “Monday” bug)
   ✅ Keeps all data (same keys: cc_tasks_v45 / cc_settings_v45)
   ✅ Migrates from legacy keys (v3/v4) if found
   ✅ Auto-Schedule + Drag/Drop + Reschedule chips
   ✅ Overbook warnings + AB holidays + day capacity in hours
*/

////////////////////
// Storage & Helpers
////////////////////
const LEGACY_KEYS = [
  "cc_tasks_v43","cc_tasks_v42","cc_tasks_v4","cc_tasks_v3","cc_tasks_v31","cc_tasks_v32","cc_tasks_v33","ChaosControlTasks"
];
const LS_TASKS = "cc_tasks_v45";
const LS_SETTINGS = "cc_settings_v45";

const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load=(k,fb=null)=>{try{return JSON.parse(localStorage.getItem(k))??fb}catch{return fb}};
const pad2=n=>String(n).padStart(2,"0");

// ✅ LOCAL date key (no UTC)
const toKey = (d) => { const x=new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}`; };
const todayKey = () => toKey(new Date());

const escapeHTML=s=>s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const minToHM=m=>`${pad2((m/60)|0)}:${pad2(m%60)}`;
const hmToMin=hm=>{if(!hm)return 0;const[h,m]=hm.split(":").map(Number);return (h||0)*60+(m||0)};
const startOfWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);const dow=(x.getDay()+6)%7;x.setDate(x.getDate()-dow);return x;}
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const parseISO=iso=>{if(!iso)return new Date();const[y,mo,da]=iso.split("T")[0].split("-").map(Number);return new Date(y,mo-1,da);}
const clampToToday=k=>k&&k<todayKey()?todayKey():k||todayKey();

////////////////////
// DOM references (must match your index.html IDs)
////////////////////
const form=$("#taskForm"), title=$("#title"), durHr=$("#durHr"), durMin=$("#durMin");
const priority=$("#priority"), repeatSel=$("#repeat"), calSel=$("#calendar");
const flexOpts=$("#flexOpts"), fixedOpts=$("#fixedOpts"), byDate=$("#byDate");
const fixedDate=$("#fixedDate"), fixedTime=$("#fixedTime");
const taskList=$("#taskList"), unscheduledEmpty=$("#unscheduledEmpty");
const urgentList=$("#urgentList"), calendarEl=$("#calendarEl");
const autoBtn=$("#autoBtn"), autoAllBtn=$("#autoAllBtn");
const prevWeek=$("#prevWeek"), todayBtn=$("#todayBtn"), nextWeek=$("#nextWeek");
const clearDayBtn=$("#clearDayBtn"), exportBtn=$("#exportBtn"), importBtn=$("#importBtn"), themeBtn=$("#themeBtn");
const reward=$("#reward"), rewardClose=$("#rewardClose"), ding=$("#ding"), confettiCanvas=$("#confetti");

////////////////////
// Migration (NON-DESTRUCTIVE)
////////////////////
function normalizeTask(t){
  const dur=Number(t.duration)>0?Number(t.duration):30;
  const norm={
    id:t.id||crypto.randomUUID(),
    title:String(t.title||"Untitled"),
    duration:dur,
    priority:t.priority||"Medium",
    calendar:t.calendar||"Work",
    repeat:t.repeat||"none",
    done:!!t.done,
    fixed:!!t.fixed,
    flex:t.flex||"today",
    flexDate:t.flexDate||null,
    fixedDate:t.fixedDate||null,
    fixedTime:t.fixedTime||null,
    rescheduled:!!t.rescheduled,
    scheduledAt:t.scheduledAt||null
  };
  // Normalize scheduledAt to local YYYY-MM-DDTHH:mm if present
  if (norm.scheduledAt && norm.scheduledAt.length>=16){
    const k = norm.scheduledAt.slice(0,10);
    const tm = norm.scheduledAt.slice(11,16);
    norm.scheduledAt = `${k}T${tm}`;
  }
  return norm;
}
function dedupe(arr){
  const out=[];
  for(const t of arr){
    if(!out.some(x=>x.id===t.id||(x.title===t.title&&x.duration===t.duration&&x.scheduledAt===t.scheduledAt))){
      out.push(t);
    }
  }
  return out;
}
function migrate(){
  const curr=load(LS_TASKS,null);
  if(Array.isArray(curr)) return dedupe(curr.map(normalizeTask));
  let all=[];
  for(const k of LEGACY_KEYS){
    const arr=load(k,[]);
    if(Array.isArray(arr)&&arr.length) all.push(...arr.map(normalizeTask));
  }
  return dedupe(all);
}
let tasks=migrate();
let settings=load(LS_SETTINGS,{theme:"dark",workStartMins:9*60,workEndMins:17*60,slot:30});
let weekStart=startOfWeek(new Date());

////////////////////
// Holidays (AB minimal set)
////////////////////
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

////////////////////
// Rendering
////////////////////
function minsToHrsStr(m){const h=(m/60)|0,mm=m%60;return`${h}h ${mm}m`;}
function render(){
  renderUnscheduled();renderCalendar();renderUrgent();
  save(LS_TASKS,tasks);save(LS_SETTINGS,settings);
}
function renderUnscheduled(){
  const uns=tasks.filter(t=>!t.scheduledAt);
  taskList.innerHTML="";unscheduledEmpty.classList.toggle("hide",uns.length>0);
  for(const t of uns){
    const li=document.createElement("li");li.className="li";
    li.innerHTML=`<input type="checkbox" ${t.done?"checked":""} data-id="${t.id}" class="doneBox"/>
    <div style="flex:1"><div>${escapeHTML(t.title)}</div>
    <div class="meta">${t.duration}m • ${t.priority} • ${t.calendar}</div></div>
    <button class="btn ghost smallBtn" data-act="del" data-id="${t.id}">Del</button>`;
    taskList.appendChild(li);
  }
}
function renderUrgent(){
  urgentList.innerHTML="";
  const list=tasks.filter(t=>t.priority==="High"&&!t.done);
  for(const t of list){
    const d=t.scheduledAt?t.scheduledAt.slice(0,10):(t.fixedDate||"—");
    const dStr=d!=="—"?new Date(d).toLocaleDateString(undefined,{month:"short",day:"numeric"}):"—";
    const li=document.createElement("li");li.className="li";
    li.innerHTML=`<div style="flex:1"><b>${escapeHTML(t.title)}</b><div class="meta">${t.calendar} • ${dStr}</div></div>`;
    urgentList.appendChild(li);
  }
}
function renderCalendar(){
  calendarEl.innerHTML="";
  const y=weekStart.getFullYear(),hol=albertaHolidays(y);
  const cap=settings.workEndMins-settings.workStartMins;
  for(let i=0;i<7;i++){
    const day=addDays(weekStart,i),key=toKey(day);
    const dayTasks=tasks.filter(t=>t.scheduledAt&&t.scheduledAt.startsWith(key));
    const used=dayTasks.reduce((a,t)=>a+t.duration,0);
    const over=used>cap;
    const col=document.createElement("div");
    col.className="col"+(hol[key]?" holiday":"");
    col.innerHTML=`<div class="colhead ${over?"over":""}">
      <div style="font-weight:700">${day.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</div>
      <div class="badge">Used ${minsToHrsStr(used)} / Free ${minsToHrsStr(Math.max(0,cap-used))}</div>
    </div><div class="list dropzone" data-key="${key}"></div>`;
    const list=col.querySelector(".list");
    if(hol[key]){
      const b=document.createElement("div");b.className="block fixed";
      b.innerHTML=`<b>${hol[key]}</b> <span class="small">Holiday</span>`;list.appendChild(b);
    }
    for(const t of dayTasks){
      const row=document.createElement("div");
      row.className=`block ${(t.fixed?"fixed ":"")}${(t.priority==="High"?"high ":"")}${(t.done?"done ":"")}`;
      row.setAttribute("draggable","true");row.dataset.id=t.id;
      const time=t.scheduledAt.slice(11,16);
      row.innerHTML=`<div><b>${escapeHTML(t.title)}</b> <span class="small">${time} • ${t.duration}m</span></div>`;
      list.appendChild(row);
    }
    calendarEl.appendChild(col);
  }
  setupDnD();
}

////////////////////
// Capacity helpers
////////////////////
function dayCapacity(k){
  const arr=tasks.filter(x=>x.scheduledAt&&x.scheduledAt.startsWith(k));
  const used=arr.reduce((a,x)=>a+x.duration,0);
  const cap=settings.workEndMins-settings.workStartMins;
  return{used,cap,free:Math.max(0,cap-used)};
}
function nextFreeTime(k,dur){
  const items=tasks.filter(x=>x.scheduledAt&&x.scheduledAt.startsWith(k));
  const taken=items.map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  let mins=settings.workStartMins;
  while(mins+dur<=settings.workEndMins){
    if(!taken.includes(mins))return mins;
    mins+=settings.slot;
  }
  return null;
}

////////////////////
// Scheduling logic (LOCAL “today”)
////////////////////
function scheduleFlexible(t){
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let from=new Date(today),to=new Date(today);
  const flex=t.flex||"today";
  if(flex==="next2d"){to=addDays(today,2);}
  else if(flex==="week"){to=addDays(today,6);}
  else if(flex==="bydate"&&t.flexDate){from=parseISO(t.flexDate);to=parseISO(t.flexDate);}
  const todayK=todayKey();
  if(toKey(from)<todayK)from=today;if(toKey(to)<toKey(from))to=new Date(from);
  const MAX_DAYS_AHEAD=28;let tries=0;
  while(tries<=MAX_DAYS_AHEAD){
    const hol=albertaHolidays(from.getFullYear());
    for(let d=new Date(from);d<=to;d=addDays(d,1)){
      const key=toKey(d);
      if(key<todayK)continue;if(hol[key])continue;
      const cap=dayCapacity(key);
      if(cap.free<t.duration)continue;
      const slot=nextFreeTime(key,t.duration);
      if(slot!=null){t.scheduledAt=`${key}T${minToHM(slot)}`;return true;}
    }
    from=addDays(from,1);to=addDays(to,1);tries++;
  }
  return false;
}
function scheduleFixed(t,{confirmOverbook=true}={}){
  let key=clampToToday(t.fixedDate);
  const hol=albertaHolidays(new Date(key).getFullYear());
  if(hol[key])return false;
  const cap=dayCapacity(key);
  const want=t.fixedTime?hmToMin(t.fixedTime):settings.workStartMins;
  if(cap.free<t.duration&&confirmOverbook){
    const ok=confirm(`That day is over capacity.\nProceed anyway?`);if(!ok)return false;
  }
  let time=want;
  const taken=tasks.filter(x=>x.scheduledAt&&x.scheduledAt.startsWith(key))
                  .map(x=>hmToMin(x.scheduledAt.slice(11,16)));
  while(time+t.duration<=settings.workEndMins){
    if(!taken.includes(time)){t.scheduledAt=`${key}T${minToHM(time)}`;return true;}
    time+=settings.slot;
  }
  return false;
}

////////////////////
// Events
////////////////////
form.addEventListener("submit",e=>{
  e.preventDefault();
  const dur=(+durHr.value||0)*60+(+durMin.value||0);
  if(!title.value.trim()||dur<=0)return;
  const when=form.elements["when"]?.value||"flex";
  const task={id:crypto.randomUUID(),title:title.value.trim(),duration:dur,priority:priority.value,
    calendar:calSel.value,repeat:repeatSel.value,done:false,fixed:when==="fixed",
    flex:when==="flex"?form.elements["flex"]?.value||"today":null,
    flexDate:when==="flex"&&form.elements["flex"]?.value==="bydate"?byDate.value:null,
    fixedDate:when==="fixed"?fixedDate.value:null,fixedTime:when==="fixed"?fixedTime.value:null,rescheduled:false};
  (task.fixed?scheduleFixed(task):scheduleFlexible(task));tasks.push(task);render();
});

autoBtn.addEventListener("click",()=>{
  tasks.filter(t=>!t.scheduledAt).forEach(t=>(t.fixed?scheduleFixed(t):scheduleFlexible(t)));
  render();
});
autoAllBtn.addEventListener("click",()=>{
  tasks.forEach(t=>{if(!t.scheduledAt)(t.fixed?scheduleFixed(t):scheduleFlexible(t));});
  render();
});
prevWeek.addEventListener("click",()=>{weekStart=addDays(weekStart,-7);render();});
nextWeek.addEventListener("click",()=>{weekStart=addDays(weekStart,7);render();});
todayBtn.addEventListener("click",()=>{weekStart=startOfWeek(new Date());render();});

document.addEventListener("click",e=>{
  const id=e.target.dataset?.id,act=e.target.dataset?.act;
  if(e.target.classList.contains("doneBox")){
    const t=tasks.find(x=>x.id===id); if(t){ t.done=e.target.checked; render(); }
  }
  if(act==="del"){ tasks=tasks.filter(x=>x.id!==id); render(); }
});

////////////////////
// Drag & Drop
////////////////////
function setupDnD(){
  $$(".block[draggable]").forEach(b=>{
    b.addEventListener("dragstart",ev=>{b.classList.add("dragging");ev.dataTransfer.setData("text/plain",b.dataset.id);});
    b.addEventListener("dragend",()=>b.classList.remove("dragging"));
  });
  $$(".list.dropzone").forEach(zone=>{
    zone.addEventListener("dragover",ev=>{ev.preventDefault();zone.classList.add("drop-target");});
    zone.addEventListener("dragleave",()=>zone.classList.remove("drop-target"));
    zone.addEventListener("drop",ev=>{
      ev.preventDefault();zone.classList.remove("drop-target");
      const id=ev.dataTransfer.getData("text/plain");const t=tasks.find(x=>x.id===id);if(!t)return;
      const key=zone.dataset.key;const time=t.scheduledAt?t.scheduledAt.slice(11,16):"09:00";
      t.fixed=true;t.fixedDate=key;t.fixedTime=time;t.rescheduled=true;t.scheduledAt=null;
      scheduleFixed(t);render();
    });
  });
}

////////////////////
// Reward / Theme / Import / Export
////////////////////
function celebrate(){try{ding.currentTime=0;ding.play().catch(()=>{})}catch{}reward.classList.remove("hide");
setTimeout(()=>reward.classList.add("hide"),2000);}
rewardClose.addEventListener("click",()=>reward.classList.add("hide"));
document.documentElement.style.colorScheme=settings.theme;
themeBtn.addEventListener("click",()=>{settings.theme=settings.theme==="dark"?"light":"dark";
document.documentElement.style.colorScheme=settings.theme;save(LS_SETTINGS,settings);});
exportBtn.addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify({tasks,settings},null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="chaos-control.json";a.click();
});
importBtn.addEventListener("click",async()=>{
  const inp=document.createElement("input");inp.type="file";inp.accept="application/json";
  inp.onchange=async()=>{
    const txt=await inp.files[0].text();
    try{const obj=JSON.parse(txt);
      if(Array.isArray(obj.tasks))tasks=obj.tasks.map(normalizeTask);
      if(obj.settings)settings={...settings,...obj.settings};
      render();
    }catch{alert("Import failed: invalid file.");}
  };
  inp.click();
});

////////////////////
// Init
////////////////////
render();
