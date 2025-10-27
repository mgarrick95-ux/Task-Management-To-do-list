import React, { useEffect, useMemo, useRef, useState } from "react";

/* ===================== Local Storage (v33) ===================== */
const LS_TASKS = "cc_tasks_v33";
const LS_BLOCKS = "cc_blocks_v33";
const LS_SETTINGS = "cc_settings_v33";

const load = (k, fb) => {
  try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fb; }
  catch { return fb; }
};
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ===================== Helpers ===================== */
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0,10);
const toHM = (mins) => {
  const h = Math.floor(Math.max(mins,0)/60);
  const m = Math.max(mins,0)%60;
  return `${h}h ${m}m`;
};
const parseTime = (str) => { // "09:30" -> minutes from 00:00
  if (!str || !/^\d{2}:\d{2}$/.test(str)) return null;
  const [hh, mm] = str.split(":").map(Number);
  return hh*60 + mm;
};
const fmtTime = (mins) => {
  const hh = Math.floor(mins/60).toString().padStart(2,"0");
  const mm = (mins%60).toString().padStart(2,"0");
  return `${hh}:${mm}`;
};
const sameDay = (a,b) => a === b;

/* ===================== Defaults ===================== */
const DEFAULT_SETTINGS = {
  workStartMins: 9*60,     // 09:00
  workEndMins:   17*60,    // 17:00
  slotSize: 30,
  weekStartsOn: 1,         // Mon
  dailyCapacityMins: 8*60, // derived but leave here for clarity
  bufferMins: 5,
  preferMornings: true,
  tone: "mild",            // for smart-ass banner tone
  theme: "auto"
};

/* ===================== App ===================== */
export default function App(){
  /* ---------- state ---------- */
  const [settings, setSettings] = useState(() => load(LS_SETTINGS, DEFAULT_SETTINGS));
  const [tasks, setTasks] = useState(() => load(LS_TASKS, []));
  const [calendar, setCalendar] = useState("work"); // future: multiple calendars
  const [form, setForm] = useState({
    title: "",
    hrs: 1, mins: 0,
    priority: "Medium",
    flexible: true,
    whenPreset: "today",     // today | next2d | week | bydate
    fixedDate: "",
    fixedTime: "",           // "HH:MM"
    recur: { freq: "none", interval: 1, count: 0, until: "" } // new
  });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [banner, setBanner] = useState(null); // gold star banner text
  const chimeRef = useRef(null);

  /* ---------- persist ---------- */
  useEffect(()=> save(LS_SETTINGS, settings), [settings]);
  useEffect(()=> save(LS_TASKS, tasks), [tasks]);

  /* ---------- computed ---------- */
  const weekDays = useMemo(()=>{
    const base = new Date();
    const day = base.getDay(); // 0 Sun … 6 Sat
    const weekStart = new Date(base);
    const delta = ((day + 7) % 7) - settings.weekStartsOn; // days since Monday (or configured)
    weekStart.setDate(base.getDate() - (delta<0 ? 6 : delta));
    const arr = [];
    for (let i=0;i<7;i++){
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate()+i);
      arr.push(d.toISOString().slice(0,10));
    }
    return arr;
  }, [settings.weekStartsOn]);

  const dayCapacity = useMemo(()=> settings.workEndMins - settings.workStartMins, [settings]);

  /* ---------- scheduling utils ---------- */
  const dayTasks = (iso) => tasks.filter(t=> t.calendar===calendar && t.scheduled && sameDay(t.day, iso));
  const unscheduled = tasks.filter(t=> t.calendar===calendar && !t.scheduled);

  const sumScheduledMins = (iso) => dayTasks(iso).reduce((a,t)=>a+t.duration,0);

  const overbooked = (iso) => sumScheduledMins(iso) > dayCapacity;

  /* ---------- create tasks (incl. recurrence) ---------- */
  const addTask = () => {
    const duration = Number(form.hrs)*60 + Number(form.mins);
    if (!form.title.trim() || duration<=0) return;
    const base = {
      id: uid(),
      title: form.title.trim(),
      duration,
      priority: form.priority,
      flexible: form.flexible,
      calendar,
      createdAt: Date.now(),
      scheduled: false,
      day: null,
      start: null, // minutes in day
      completed: false,
      bumpedCount: 0,
      fixedDate: form.fixedDate || null,
      fixedTime: form.fixedTime || null,
      meta: {}
    };

    let newOnes = [ base ];

    // recurrence expansion
    const { freq, interval, count, until } = form.recur;
    const hasRecurrence = freq !== "none";
    if (hasRecurrence) {
      const maxItems = Math.min(count || 30, 100); // guard rails
      const firstDate = base.fixedDate || todayISO();
      const d = new Date(firstDate);
      for (let i=1;i<maxItems;i++){
        const nd = new Date(d);
        if (freq==="daily")   nd.setDate(d.getDate()+i*interval);
        if (freq==="weekly")  nd.setDate(d.getDate()+7*i*interval);
        if (freq==="monthly") { nd.setMonth(d.getMonth()+i*interval); }
        const iso = nd.toISOString().slice(0,10);
        if (until && iso>until) break;
        newOnes.push({
          ...base,
          id: uid(),
          fixedDate: iso,
          title: `${base.title} (recurring)`
        });
      }
    }

    // if user selected Fixed + date/time, respect immediately
    if (!form.flexible && form.fixedDate){
      newOnes = newOnes.map(t => ({
        ...t,
        flexible: false,
        scheduled: true,
        day: t.fixedDate,
        start: t.fixedTime ? parseTime(t.fixedTime) ?? settings.workStartMins : settings.workStartMins
      }));
    }

    setTasks(prev=> [...prev, ...newOnes]);

    // clear only the input area (not schedule)
    setForm(f=>({ ...f, title:"", hrs:1, mins:0, fixedDate:"", fixedTime:"", recur:{freq:"none",interval:1,count:0,until:""}, flexible:true, whenPreset:"today" }));
  };

  /* ---------- auto schedule ---------- */
  const firstFreeSlot = (iso, duration) => {
    const used = dayTasks(iso).map(t=>({start:t.start, end:t.start+t.duration})).sort((a,b)=>a.start-b.start);
    let cur = settings.workStartMins;
    for (const b of used){
      if (b.start - cur >= duration) return cur;
      cur = Math.max(cur, b.end + settings.bufferMins);
    }
    if (settings.workEndMins - cur >= duration) return cur;
    return null;
  };

  const scheduleOne = (t) => {
    const duration = t.duration;

    // 1) If it has a requested fixedDate, schedule ON that date (bump lowest priority flexible items)
    const targetDay = t.fixedDate || (form.whenPreset==="today" ? todayISO()
                     : form.whenPreset==="next2d" ? weekDays.slice(0,2).find(d=>d>=todayISO()) || todayISO()
                     : form.whenPreset==="week" ? todayISO()
                     : null);

    const planDays = targetDay ? [targetDay] : weekDays;

    for (const iso of planDays){
      let slot = firstFreeSlot(iso, duration);

      // if no space and we *must* place on iso (because fixedDate exists), try bumping lowest priority flexible tasks
      if (!slot && t.fixedDate){
        const flexibles = dayTasks(iso)
          .filter(x=>x.flexible && !x.completed)
          .sort((a,b)=> priorityRank(a.priority)-priorityRank(b.priority) || b.duration-a.duration);

        let freed = 0;
        const toBump = [];
        for (const f of flexibles){
          toBump.push(f);
          freed += f.duration;
          if (firstFreeSlot(iso, duration)) break;
        }
        if (toBump.length){
          // bump them to the next day(s)
          setTasks(prev => prev.map(x => toBump.some(b=>b.id===x.id)
            ? { ...x, scheduled:false, day:null, start:null, bumpedCount:(x.bumpedCount||0)+1 }
            : x));
          slot = firstFreeSlot(iso, duration);
        }
      }

      if (slot!=null){
        setTasks(prev=> prev.map(x=> x.id===t.id ? ({...x, scheduled:true, day:iso, start:slot}) : x));
        return true;
      }
      // no slot on this day → try next
    }
    return false;
  };

  const priorityRank = (p) => (p==="High"?3 : p==="Medium"?2 : 1);

  const autoSchedule = (subset=null) => {
    const pool = (subset || unscheduled)
      .filter(t=>t.calendar===calendar)
      .sort((a,b)=> priorityRank(b.priority)-priorityRank(a.priority) || b.duration-a.duration);

    pool.forEach(t=> scheduleOne(t));
  };

  /* ---------- complete, edit, move ---------- */
  const toggleDone = (t) => {
    setTasks(prev => prev.map(x => x.id===t.id ? ({...x, completed:!x.completed}) : x));

    // if the day becomes fully complete -> gold star moment
    const iso = t.day;
    if (iso){
      const allDone = dayTasks(iso).every(d=> d.completed || d.scheduled===false);
      if (allDone){
        fireCelebration();
      }
    }
  };

  const moveTask = (t, iso, newStart=null) => {
    setTasks(prev => prev.map(x => x.id===t.id ? ({...x, scheduled:true, day:iso, start:newStart ?? t.start}) : x));
  };

  /* ---------- search (with button) ---------- */
  const allEvents = useMemo(()=> tasks.filter(t=>t.scheduled), [tasks]);
  const searchResults = useMemo(()=>{
    if (!search.trim()) return [];
    const s = search.toLowerCase();
    return allEvents.filter(e =>
      e.title.toLowerCase().includes(s) ||
      (e.fixedDate && e.fixedDate.includes(s)) ||
      fmtTime(e.start).includes(s)
    );
  }, [search, allEvents]);

  /* ---------- missed/urgent panel ---------- */
  const missedOrUrgent = useMemo(()=>{
    const nowISO = todayISO();
    const soon = new Date(); soon.setDate(soon.getDate()+2);
    const soonISO = soon.toISOString().slice(0,10);
    return tasks.filter(t=>{
      if (t.completed) return false;
      // missed fixed tasks
      if (t.fixedDate && t.fixedDate < nowISO) return true;
      // due soon (fixed within 2 days)
      if (t.fixedDate && t.fixedDate <= soonISO) return true;
      return false;
    }).sort((a,b)=> (a.fixedDate||"").localeCompare(b.fixedDate||""));
  }, [tasks]);

  /* ---------- celebration (gold star + chime) ---------- */
  const fireCelebration = () => {
    const quips = [
      "Gold star! You bulldozed the chaos. ⭐",
      "Look at you, Productivity Goblin. ⭐",
      "Tasks: 0. Drama: 0. Vibes: immaculate. ⭐",
      "You did it all. Even the thing you were avoiding. ⭐"
    ];
    const msg = quips[Math.floor(Math.random()*quips.length)];
    setBanner(msg);
    try {
      if (!chimeRef.current){
        const ctx = new (window.AudioContext||window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type="triangle"; o.frequency.value=880;
        o.connect(g); g.connect(ctx.destination);
        o.start();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.35);
        o.stop(ctx.currentTime+0.36);
      }
    } catch {}
    setTimeout(()=>setBanner(null), 3500);
  };

  /* ---------- UI pieces ---------- */

  const ClearFormButton = () => (
    <button className="btn" onClick={()=>{
      setForm(f=>({ ...f, title:"", hrs:1, mins:0, fixedDate:"", fixedTime:"", recur:{freq:"none",interval:1,count:0,until:""}, flexible:true, whenPreset:"today" }));
    }}>Clear</button>
  );

  const ClearAllButton = () => (
    <button className="btn danger" onClick={()=>{
      if (confirm("Clear entire schedule (keeps settings)?")){
        setTasks([]);
      }
    }}>Clear entire schedule</button>
  );

  /* guard for mobile single-digit issue: never limit input length; accept whole string */
  const Num = ({value,onChange,min=0,max=1440,step=1,style}) => (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e=> onChange(e.target.value === "" ? "" : Number(e.target.value))}
      style={style}
      className="num"
    />
  );

  return (
    <div className="wrap">
      <h1 className="hdr">Chaos Control — Smart Scheduler</h1>

      {banner && <div className="banner">{banner}</div>}

      <section className="panel">
        <div className="row">
          <input
            className="taskTitle"
            placeholder="+ Add a new task…"
            value={form.title}
            onChange={e=> setForm(f=>({...f, title:e.target.value}))}
          />

          <span>Duration</span>
          <Num value={form.hrs} onChange={(v)=> setForm(f=>({...f, hrs:v}))} min={0} max={24} />
          <span>hr</span>
          <Num value={form.mins} onChange={(v)=> setForm(f=>({...f, mins:v}))} min={0} max={59} step={5}/>
          <span>min</span>

          <label><span>Priority</span>
            <select
              value={form.priority}
              onChange={e=> setForm(f=>({...f, priority:e.target.value}))}
            >
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </label>

          <label className="pill">
            <input type="radio" checked={form.flexible} onChange={()=> setForm(f=>({...f, flexible:true}))}/> Flexible
          </label>
          <label className="pill">
            <input type="radio" checked={!form.flexible} onChange={()=> setForm(f=>({...f, flexible:false}))}/> Fixed
          </label>
        </div>

        {/* When presets */}
        <div className="row">
          <label className="pill">
            <input type="radio" checked={form.whenPreset==="today"} onChange={()=> setForm(f=>({...f, whenPreset:"today"}))}/> Today
          </label>
          <label className="pill">
            <input type="radio" checked={form.whenPreset==="next2d"} onChange={()=> setForm(f=>({...f, whenPreset:"next2d"}))}/> Next 2d
          </label>
          <label className="pill">
            <input type="radio" checked={form.whenPreset==="week"} onChange={()=> setForm(f=>({...f, whenPreset:"week"}))}/> This week
          </label>
          <label className="pill">
            <input type="radio" checked={form.whenPreset==="bydate"} onChange={()=> setForm(f=>({...f, whenPreset:"bydate"}))}/> By date
          </label>

          <div className="fixedBox">
            <span>Fixed date</span>
            <input type="date" value={form.fixedDate} onChange={e=> setForm(f=>({...f, fixedDate:e.target.value}))}/>
            <span>time</span>
            <input type="time" value={form.fixedTime} onChange={e=> setForm(f=>({...f, fixedTime:e.target.value}))}/>
          </div>

          {/* Recurrence */}
          <div className="recurBox">
            <span>Repeat</span>
            <select value={form.recur.freq} onChange={e=> setForm(f=>({...f, recur:{...f.recur, freq:e.target.value}}))}>
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <span>every</span>
            <Num value={form.recur.interval} onChange={(v)=> setForm(f=>({...f, recur:{...f.recur, interval:Number(v)||1}}))} min={1} max={30}/>
            <span>times</span>
            <Num value={form.recur.count} onChange={(v)=> setForm(f=>({...f, recur:{...f.recur, count:Number(v)||0}}))} min={0} max={100}/>
            <span>until</span>
            <input type="date" value={form.recur.until} onChange={e=> setForm(f=>({...f, recur:{...f.recur, until:e.target.value}}))}/>
          </div>

          <label><span>Calendar</span>
            <select value={calendar} onChange={e=> setCalendar(e.target.value)}>
              <option value="work">Work</option>
              <option value="home">Home</option>
            </select>
          </label>

          <button className="btn primary" onClick={addTask}>Add</button>
          <button className="btn" onClick={()=> autoSchedule()} >Auto-Schedule</button>
          <ClearFormButton/>
          <ClearAllButton/>
        </div>
      </section>

      {/* Unscheduled list (only shows if any) */}
      <section className="panel">
        <h3>Unscheduled Tasks</h3>
        {unscheduled.length===0 ? (
          <div className="muted">Nothing here — everything else is on the calendar.</div>
        ) : (
          <div className="tasks">
            {unscheduled.map(t=>(
              <article key={t.id} className={`task ${t.priority.toLowerCase()}`}>
                <div className="title">{t.title}</div>
                <div className="meta">{toHM(t.duration)} • {t.priority}</div>
                <div className="row">
                  <button className="btn" onClick={()=> autoSchedule([t])}>Schedule</button>
                  <button className="btn" onClick={()=> setTasks(prev=>prev.filter(x=>x.id!==t.id))}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Search */}
      <section className="panel">
        <div className="row">
          <button className="btn" onClick={()=> setSearchOpen(s=>!s)}>Search</button>
          {searchOpen && <>
            <input className="taskTitle" placeholder="Find by title, date (yyyy-mm-dd) or time (hh:mm)…" value={search} onChange={e=> setSearch(e.target.value)}/>
            <button className="btn" onClick={()=> setSearch(search.trim())}>Go</button>
          </>}
        </div>
        {searchOpen && searchResults.length>0 && (
          <div className="results">
            {searchResults.map(r=>(
              <div key={r.id} className="muted">{r.day} • {fmtTime(r.start)} • {r.title}</div>
            ))}
          </div>
        )}
      </section>

      {/* Urgent / missed */}
      <section className="panel">
        <h3>Attention</h3>
        {missedOrUrgent.length===0 ? <div className="muted">No urgent or missed items.</div> :
          missedOrUrgent.map(t=>(
            <div key={t.id} className="warnLine">
              <span className="warn">!</span> {t.title} {t.fixedDate ? `• due ${t.fixedDate}` : ""}
            </div>
          ))
        }
      </section>

      {/* Week view */}
      <section className="grid">
        {weekDays.map(iso=>{
          const items = dayTasks(iso).slice().sort((a,b)=> (a.completed===b.completed? a.start-b.start : a.completed?1:-1));
          const sch = sumScheduledMins(iso);
          const free = Math.max(0, dayCapacity - sch);
          const usedPct = Math.min(100, Math.round((sch/dayCapacity)*100));
          const over = overbooked(iso);

          return (
            <div key={iso} className={`day ${over? "over":""}`}>
              <div className="dayhdr">
                <div className="dtitle">
                  {new Date(iso).toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric"})}
                </div>
                {over && <span className="overIcon" title="Over booked">⚠</span>}
              </div>

              <div className="meter">
                <div className="bar" style={{width:`${usedPct}%`}} />
              </div>

              <div className="summary">
                <div><b>Scheduled:</b> {toHM(sch)}</div>
                <div><b>Capacity used:</b> {usedPct}%</div>
                <div><b>Free:</b> {toHM(free)}</div>
              </div>

              <div className="slots">
                {items.map(t=>(
                  <div key={t.id} className={`event ${t.completed?"done":""} ${t.priority.toLowerCase()} ${t.bumpedCount>0?"bumped":""}`}>
                    <div className="row between">
                      <div className="etitle">
                        <input type="checkbox" checked={t.completed} onChange={()=> toggleDone(t)} />
                        <span className="ttl">{t.title}</span>
                      </div>
                      <div className="etimes">
                        <input
                          className="time"
                          type="time"
                          value={fmtTime(t.start)}
                          onChange={e=>{
                            const val = parseTime(e.target.value);
                            if (val!=null) moveTask(t, iso, val);
                          }}
                        />
                        <span className="dur">{toHM(t.duration)}</span>
                      </div>
                    </div>

                    <div className="row gap">
                      <button className="btn" onClick={()=>{
                        // move to previous day
                        const i = weekDays.indexOf(iso);
                        if (i>0) moveTask(t, weekDays[i-1], t.start);
                      }}>◀</button>
                      <button className="btn" onClick={()=>{
                        const i = weekDays.indexOf(iso);
                        if (i<weekDays.length-1) moveTask(t, weekDays[i+1], t.start);
                      }}>▶</button>
                      <button className="btn" onClick={()=> setTasks(prev=> prev.filter(x=>x.id!==t.id))}>Delete</button>
                      <button className="btn" onClick={()=> setTasks(prev=> prev.map(x=> x.id===t.id ? ({...x, scheduled:false, day:null, start:null}) : x))}>Unsch.</button>
                    </div>

                    {/* show original info if rescheduled/bumped */}
                    {t.bumpedCount>0 && <div className="bumpNote">Rescheduled • bumped {t.bumpedCount}×</div>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  );
}
