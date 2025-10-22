import React, { useEffect, useMemo, useRef, useState } from "react";

/* ---------- Local Storage (with migration) ---------- */
const LS_TASKS="cc_tasks_v33";
const LS_BLOCKS="cc_blocks_v33";
const LS_SETTINGS="cc_settings_v33";
const save = (k,v)=>{ try { localStorage.setItem(k, JSON.stringify(v)) } catch {} };
const load = (k,fb)=>{ try { const raw=localStorage.getItem(k); return raw?JSON.parse(raw):fb } catch { return fb } };

/* ---------- Utils ---------- */
const pad = n => String(n).padStart(2, "0");
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const minutes = (h,m)=>h*60+m;
const fmtMinutes = (mins)=>{
  const h = Math.floor(mins/60), m = mins%60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};
const addDays = (d, n)=>{ const x=new Date(d); x.setDate(x.getDate()+n); return x; };
const sameDay = (a,b)=>a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();

/* ---------- Gold star comments & chime ---------- */
const STAR_COMMENTS = [
  "⭐ Gold star! You demolished today’s chaos.",
  "⭐ All done! Consider yourself professionally awesome.",
  "⭐ Perfection. The to-do list tapped out.",
  "⭐ Everything finished—treat yo’ self.",
  "⭐ Maximum productivity achieved. Minimum drama."
];
const STAR_SOUND = new Audio(
  "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA..." // tiny chime removed for brevity; optional
);

/* ---------- App ---------- */
export default function App(){
  // SETTINGS
  const [settings, setSettings] = useState(()=>load(LS_SETTINGS,{
    workStartMins: 9*60,   // 09:00
    workEndMins: 17*60,    // 17:00
    slotSize: 30,
    theme: "auto",
  }));

  // TASK MODEL
  // id, title, duration (mins), priority ("low"|"medium"|"high"),
  // flexible (bool), fixedDate (ISO yyyy-mm-dd or ""), fixedTime ("HH:MM" or ""),
  // calendar ("Work"|"Home" etc), completed (bool), scheduledStart (ISO string) optional
  // recurrence: { type:"none"|"daily"|"weekly"|"monthly", until?: "yyyy-mm-dd" }
  const [tasks,setTasks] = useState(()=>load(LS_TASKS,[]));
  const [blocks,setBlocks] = useState(()=>load(LS_BLOCKS,[]));

  useEffect(()=>save(LS_SETTINGS,settings),[settings]);
  useEffect(()=>save(LS_TASKS,tasks),[tasks]);
  useEffect(()=>save(LS_BLOCKS,blocks),[blocks]);

  // FORM state
  const [title,setTitle] = useState("");
  const [priority,setPriority]=useState("medium");
  const [durH,setDurH]=useState(1);
  const [durM,setDurM]=useState(0);
  const [flexible,setFlexible]=useState(true);
  const [whenScope,setWhenScope]=useState("today"); // today|next2d|week|by
  const [byDate,setByDate]=useState("");
  const [fixedDate,setFixedDate]=useState("");
  const [fixedTime,setFixedTime]=useState("");
  const [calendar,setCalendar]=useState("Work");

  // NEW: recurrence
  const [recType,setRecType]=useState("none"); // none|daily|weekly|monthly
  const [recUntil,setRecUntil]=useState("");   // yyyy-mm-dd or empty

  // Calendar navigation
  const [anchorDate,setAnchorDate]=useState(new Date());

  // derived week
  const weekDays = useMemo(()=>{
    const monday = addDays(anchorDate, -((anchorDate.getDay()+6)%7));
    return Array.from({length:7},(_,i)=>addDays(monday,i));
  },[anchorDate]);

  /* ---------- Add Task & Recurrences ---------- */
  function addTask(){
    const base = {
      id: crypto.randomUUID(),
      title: title.trim(),
      duration: minutes(Number(durH||0), Number(durM||0)),
      priority,
      flexible,
      calendar,
      completed:false,
      createdAt: new Date().toISOString(),
      recurrence: { type: recType, until: recUntil || "" }
    };

    if (!base.title) return;
    if (base.duration <= 0) return;

    // If FIXED, set date/time
    if (!flexible){
      base.fixedDate = fixedDate || toKey(anchorDate);
      base.fixedTime = fixedTime || "";
    } else {
      // Flexible + date scopes
      if (whenScope==="by" && byDate) base.dueBy = byDate;
      else base.dueBy = ""; // today/next2d/week handled by auto-schedule anyway
    }

    // Build list to insert (recurrences create future copies)
    const toInsert = expandRecurrences(base);
    setTasks(prev=>[...prev, ...toInsert]);

    // clear form
    setTitle("");
  }

  function expandRecurrences(t){
    if (t.recurrence?.type==="none") return [t];

    // default horizon = 12 weeks; user may set 'until'
    const horizonEnd = t.recurrence.until ? new Date(t.recurrence.until) : addDays(new Date(), 84);
    const firstDate = t.fixedDate ? new Date(t.fixedDate) : new Date(); // recurrences make more sense for fixed
    const copies = [];
    const recurrenceId = crypto.randomUUID();

    const stepper = {
      daily:  (d)=>addDays(d,1),
      weekly: (d)=>addDays(d,7),
      monthly:(d)=>{ const x=new Date(d); x.setMonth(x.getMonth()+1); return x; }
    }[t.recurrence.type];

    let cursor = new Date(firstDate);
    while (cursor <= horizonEnd){
      const copy = {...t, id: crypto.randomUUID(), recurrenceId };
      copy.fixedDate = toKey(cursor);
      copies.push(copy);
      cursor = stepper(cursor);
    }

    // Avoid duplicates if user re-adds a recurring task
    const existing = load(LS_TASKS,[]);
    const noDupes = copies.filter(c =>
      !existing.some(e => e.recurrenceId && e.recurrenceId===c.recurrenceId && e.fixedDate===c.fixedDate && e.title===c.title)
    );
    return noDupes.length? noDupes : [t]; // fallback to single if blocked
  }

  /* ---------- Scheduling helpers ---------- */
  function tasksOnDay(date){
    const key = toKey(date);
    return tasks.filter(t=>{
      if (t.scheduledStart) {
        return sameDay(new Date(t.scheduledStart), date);
      }
      if (!t.flexible && t.fixedDate) return t.fixedDate===key;
      // flexible not yet scheduled: appear in “Unscheduled”
      return false;
    });
  }

  function dayCapacityMins(){
    const span = settings.workEndMins - settings.workStartMins;
    return span > 0 ? span : 0;
  }

  function scheduledMinsForDay(date){
    return tasksOnDay(date).reduce((sum,t)=>sum + Number(t.duration||0),0);
  }

  /* ---------- Mark complete & gold star ---------- */
  function toggleComplete(tid, done){
    setTasks(prev => prev.map(t=> t.id===tid ? {...t, completed: !!done} : t));
    setTimeout(()=>maybeStarForDay(new Date()),0);
  }

  function maybeStarForDay(day){
    const key = "cc_star_"+toKey(day);
    if (localStorage.getItem(key)) return; // already celebrated

    const todays = tasksOnDay(day);
    if (todays.length && todays.every(t=>t.completed)){
      // celebrate
      try { STAR_SOUND.currentTime = 0; STAR_SOUND.play().catch(()=>{}); } catch {}
      const msg = STAR_COMMENTS[Math.floor(Math.random()*STAR_COMMENTS.length)];
      showStarToast(msg);
      localStorage.setItem(key, "1");
    }
  }

  /* ---------- UI helpers ---------- */
  const [toast,setToast]=useState(null);
  const toastTimer = useRef(null);
  function showStarToast(msg){
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast(null), 4500);
  }

  /* ---------- Render ---------- */
  return (
    <div className="app">
      <header className="topbar">
        <h1>Chaos Control — Smart Scheduler</h1>
      </header>

      {/* Add Task */}
      <section className="card">
        <div className="row">
          <input className="grow" placeholder="Add a new task…" value={title} onChange={e=>setTitle(e.target.value)} />
          <select value={priority} onChange={e=>setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="row">
          <label>Duration</label>
          <input type="number" min="0" value={durH} onChange={e=>setDurH(e.target.value)} style={{width:70}}/> hr
          <input type="number" min="0" max="59" value={durM} onChange={e=>setDurM(e.target.value)} style={{width:70, marginLeft:8}}/> min
          <label style={{marginLeft:16}}>When</label>
          <div className="seg">
            <button className={flexible?"on":""} onClick={()=>setFlexible(true)}>Flexible</button>
            <button className={!flexible?"on":""} onClick={()=>setFlexible(false)}>Fixed</button>
          </div>
        </div>

        {flexible ? (
          <div className="row">
            <div className="seg">
              <button className={whenScope==="today"?"on":""} onClick={()=>setWhenScope("today")}>Today</button>
              <button className={whenScope==="next2d"?"on":""} onClick={()=>setWhenScope("next2d")}>Next 2d</button>
              <button className={whenScope==="week"?"on":""} onClick={()=>setWhenScope("week")}>This week</button>
              <button className={whenScope==="by"?"on":""} onClick={()=>setWhenScope("by")}>By date</button>
            </div>
            {whenScope==="by" && (
              <input type="date" value={byDate} onChange={e=>setByDate(e.target.value)} />
            )}
          </div>
        ) : (
          <div className="row">
            <label>Fixed</label>
            <input type="date" value={fixedDate} onChange={e=>setFixedDate(e.target.value)} />
            <input type="time" value={fixedTime} onChange={e=>setFixedTime(e.target.value)} />
          </div>
        )}

        {/* Recurrence */}
        <div className="row">
          <label>Repeat</label>
          <select value={recType} onChange={e=>setRecType(e.target.value)}>
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <span className="muted" style={{marginLeft:8}}>until</span>
          <input type="date" value={recUntil} onChange={e=>setRecUntil(e.target.value)} />
          <select value={calendar} onChange={e=>setCalendar(e.target.value)} style={{marginLeft:"auto"}}>
            <option>Work</option>
            <option>Home</option>
          </select>
          <button className="primary" onClick={addTask}>Add</button>
        </div>
      </section>

      {/* Week grid */}
      <section className="week">
        {weekDays.map(d=>{
          const schedM = scheduledMinsForDay(d);
          const capM = dayCapacityMins();
          const freeM = Math.max(0, capM - schedM);
          const pct = capM? Math.round((schedM/capM)*100) : 0;

          return (
            <div className="day card" key={toKey(d)}>
              <div className="dayhdr">
                <div className="name">{d.toLocaleDateString(undefined,{weekday:"short"})}</div>
                <div className="date">{d.getDate()}</div>
                <div className="bar"><span style={{width:`${pct}%`}}/></div>
              </div>

              <div className="box">
                <div><b>Scheduled:</b> {fmtMinutes(schedM)}</div>
                <div><b>Capacity used:</b> {pct}%</div>
                <div><b>Free:</b> {fmtMinutes(freeM)}</div>
              </div>

              <div className="tasks">
                {tasksOnDay(d).map(t=>(
                  <div className={`task ${t.completed?"done":""}`} key={t.id}>
                    <div className="row">
                      <input
                        type="checkbox"
                        checked={!!t.completed}
                        onChange={e=>toggleComplete(t.id, e.target.checked)}
                      />
                      <div className="grow">
                        <div className={`ttl ${t.priority==="high"?"high":""}`}>{t.title}</div>
                        <div className="muted">
                          {fmtMinutes(t.duration)} {t.priority==="high" && <span className="pill danger">High</span>}
                          {t.recurrence?.type!=="none" && <span className="pill">Repeats</span>}
                        </div>
                      </div>
                      {!t.flexible && t.fixedTime && <div className="time">{t.fixedTime}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {/* Toast */}
      {toast && (
        <div className="toast">
          <div className="star">★</div>
          <div>{toast}</div>
        </div>
      )}
    </div>
  );
}
