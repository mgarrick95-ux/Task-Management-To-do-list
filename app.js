/* Chaos Control — Smart Scheduler v4.4 (Stable)
   ---------------------------------------------
   ✅ Fully fixes auto-schedule + "today" bug
   ✅ Preserves all old data (v3–v4.3 merge)
   ✅ Never deletes; only merges forward
   ✅ Auto-schedule works again for today/week
   ✅ Supports drag, reschedule, and overbook warnings
*/

////////////////////
// Storage & Helpers
////////////////////
const LEGACY_KEYS = [
  "cc_tasks_v43","cc_tasks_v42","cc_tasks_v4","cc_tasks_v3","cc_tasks_v31","cc_tasks_v32","cc_tasks_v33","ChaosControlTasks"
];
const LS_TASKS = "cc_tasks_v44";
const LS_SETTINGS = "cc_settings_v44";

const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load=(k,fb=null)=>{try{return JSON.parse(localStorage.getItem(k))??fb}catch{return fb}};
const pad2=n=>String(n).padStart(2,"0");
const toKey=d=>d.toISOString().slice(0,10);
const escapeHTML=s=>s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const minToHM=m=>`${pad2((m/60)|0)}:${pad2(m%60)}`;
const hmToMin=hm=>{if(!hm)return 0;const[h,m]=hm.split(":").map(Number);return (h||0)*60+(m||0)};
const startOfWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);const dow=(x.getDay()+6)%7;x.setDate(x.getDate()-dow);return x;}
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const parseISO=iso=>{if(!iso)return new Date();const[y,mo,da]=iso.split("T")[0].split("-").map(Number);return new Date(y,mo-1,da);}
const todayKey=()=>toKey(new Date());
const clampToToday=k=>k&&k<todayKey()?todayKey():k||todayKey();

////////////////////
// DOM references
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
const ctx=confettiCanvas.getContext("2d");

////////////////////
// Migration
////////////////////
function normalizeTask(t){
  const dur=Number(t.duration)>0?Number(t.duration):30;
  return {
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
}
function dedupe(arr){
  const out=[];
  for(const t of arr){
    if(!out.some(x=>x.id===t.id||(x.title===t.title&&x.duration===t.duration&&x.scheduledAt===t.scheduledAt)))
      out.push(t);
  }
  return out;
}
function migrate(){
  const curr=load(LS_TASKS,null);
  if(Array.isArray(curr))return dedupe(curr.map(normalizeTask));
  let all=[];
  for(const k of LEGACY_KEYS){
    const arr=load(k,[]);
    if(Array.isArray(arr)&&arr.length)all.push(...arr.map(normalizeTask));
  }
  return dedupe(all);
}
let tasks=migrate();
let settings=load(LS_SETTINGS,{theme:"dark",workStartMins:9*60,workEndMins:17*60,slot:30});
let weekStart=startOfWeek(new Date());

////////////////////
// Holidays
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
