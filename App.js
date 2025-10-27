import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Trash2, AlarmClock, Search, Star, AlertTriangle, RotateCcw, CalendarRange } from 'lucide-react'

/** ---------- Local Storage (with migration) ---------- */
const LS_TASKS='cc_tasks_v33';
const LS_SETTINGS='cc_settings_v33';
const save=(k,v)=>{try{ localStorage.setItem(k, JSON.stringify(v)) }catch{}}
const load=(k,fb)=>{ try{ const raw=localStorage.getItem(k); return raw?JSON.parse(raw):fb } catch { return fb } };

// --- tiny helpers ---
const today = () => new Date();
const fmtDay = (d) => d.toISOString().slice(0,10);
const addDays = (d,n)=>{const x=new Date(d); x.setDate(x.getDate()+n); return x}
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

// time helpers
const hmToMins = (h,m)=> (parseInt(h||0)*60 + parseInt(m||0));
const minsToHM = (mins)=>{const h=Math.floor(mins/60); const m=mins%60; return `${h}h ${m}m`};
const parseTime = (t)=>{ if(!t) return null; const [hh,mm]=t.split(':').map(v=>parseInt(v)); return hh*60+mm; }

// default settings
const defaultSettings = {
  workStartMins: 9*60,
  workEndMins: 17*60,
  slotSize: 30,
  tone: 'mild',
  theme: 'auto'
};

// cheeky compliments
const QUIPS=[
  "Certified Chaos Wrangler. Giddy up 🤠",
  "All done. Now hydrate, gremlin.",
  "Productivity: 100%. Sanity: debatable.",
  "You absolutely devoured that to‑do. Nom.",
  "You’re the reason checkboxes exist.",
  "Calendar cleared. Anxiety... also cleared? 🧘"
]
const chime = () => {
  const ctx = new (window.AudioContext||window.webkitAudioContext)();
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type='triangle'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
  o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.5); setTimeout(()=>o.stop(),520);
}

// simple uid
const uid = ()=> Math.random().toString(36).slice(2,9);

/** ---------- App ---------- */
export default function App(){
  const [tasks, setTasks] = useState(load(LS_TASKS, []));
  const [settings, setSettings] = useState(load(LS_SETTINGS, defaultSettings));
  const [draft, setDraft] = useState({title:'', priority:'Medium', hours:1, mins:0, flexible:true, when:'today', fixedDate:'',
    calendar:'work'});
  const [weekStart, setWeekStart] = useState(()=>{
    const d=today(); const day=(d.getDay()+6)%7; // Mon=0
    return addDays(new Date(fmtDay(d)), -day);
  });
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(()=>save(LS_TASKS, tasks),[tasks]);
  useEffect(()=>save(LS_SETTINGS, settings),[settings]);

  // derived week days
  const days = useMemo(()=> Array.from({length:7},(_,i)=> addDays(weekStart,i)),[weekStart]);

  // search + duplicates flag (basic: same title on same date)
  const filteredTasks = useMemo(()=>{
    const q=search.trim().toLowerCase();
    let arr = tasks;
    if(q){ arr = arr.filter(t=> (t.title||'').toLowerCase().includes(q) ) }
    // mark dupes
    const map=new Map();
    arr.forEach(t=>{
      const k=(t.title||'').trim().toLowerCase()+'|'+(t.scheduledStart?fmtDay(new Date(t.scheduledStart)):'unscheduled');
      map.set(k, (map.get(k)||0)+1);
    });
    return arr.map(t=>{
      const k=(t.title||'').trim().toLowerCase()+'|'+(t.scheduledStart?fmtDay(new Date(t.scheduledStart)):'unscheduled');
      return {...t, _dupe:(map.get(k)>1)}
    });
  },[tasks,search]);

  // add task
  const addTask=()=>{
    if(!draft.title.trim()) return;
    const duration = hmToMins(draft.hours, draft.mins);
    const base = {
      id: uid(),
      title: draft.title.trim(),
      duration,
      priority: draft.priority,
      calendar: draft.calendar||'work',
      flexible: draft.flexible,
      completed:false,
      rescheduled:false,
      createdAt: Date.now(),
    };
    let t = base;
    if(!draft.flexible){
      t.fixedDate = draft.fixedDate||fmtDay(today());
      t.fixedTime = draft.fixedTime || null;
    }else{
      // flexible window
      const winStart = draft.when==='today' ? fmtDay(today())
        : draft.when==='next2d' ? fmtDay(addDays(today(),1))
        : draft.when==='week' ? fmtDay(weekStart)
        : draft.when==='by' ? draft.byDate : fmtDay(today());
      const winEnd = draft.when==='today' ? fmtDay(today())
        : draft.when==='next2d' ? fmtDay(addDays(today(),2))
        : draft.when==='week' ? fmtDay(addDays(weekStart,6))
        : draft.when==='by' ? draft.byDate : fmtDay(today());
      t.windowStart=winStart; t.windowEnd=winEnd;
    }
    setTasks(prev=>[t,...prev]);
    setDraft({...draft, title:''});
  };

  // schedule: find first slot respecting fixed date when provided
  const firstFreeSlot=(day, duration)=>{
    const start=settings.workStartMins, end=settings.workEndMins, step=settings.slotSize;
    // taken intervals on the day
    const taken = filteredTasks.filter(t=> t.scheduledStart && fmtDay(new Date(t.scheduledStart))===fmtDay(day) && !t.completed)
      .map(t=>({s: parseTime(new Date(t.scheduledStart).toTimeString().slice(0,5)), e: parseTime(new Date(t.scheduledStart).toTimeString().slice(0,5))+t.duration}));
    for(let s=start; s+duration<=end; s+=step){
      const e=s+duration; const clash = taken.some(b=> !(e<=b.s || s>=b.e));
      if(!clash) return s;
    }
    return null;
  };

  const autoScheduleOne=(t)=>{
    // if fixed date -> try that date first
    if(!t.flexible && t.fixedDate){
      const d=new Date(t.fixedDate+'T00:00:00');
      const ss = t.fixedTime ? parseTime(t.fixedTime) : firstFreeSlot(d, t.duration);
      if(ss!=null){
        return {...t, scheduledStart: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(ss/60), ss%60).toISOString()}
      }
      // no slot -> leave unscheduled
      return t;
    }
    // otherwise within window
    const start=new Date(t.windowStart||fmtDay(weekStart));
    const end=new Date(t.windowEnd||fmtDay(addDays(weekStart,6)));
    for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
      const ss = firstFreeSlot(new Date(d), t.duration);
      if(ss!=null){
        return {...t, scheduledStart: new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(ss/60), ss%60).toISOString()}
      }
    }
    return t; // couldn't place
  };

  const autoScheduleAll=()=>{
    setTasks(prev=> prev.map(t=> t.scheduledStart? t : autoScheduleOne(t)));
  };

  const placeAt=(taskId, day, timeMins)=>{
    setTasks(prev=> prev.map(t=> t.id===taskId? {...t, scheduledStart:new Date(day.getFullYear(),day.getMonth(),day.getDate(),Math.floor(timeMins/60), timeMins%60).toISOString() } : t))
  };

  const unschedule=(id)=> setTasks(prev=> prev.map(t=> t.id===id? {...t, scheduledStart:null, rescheduled:true}:t));
  const remove=(id)=> setTasks(prev=> prev.filter(t=> t.id!==id));
  const toggleDone=(id)=>{
    const allPrevDone = tasks.filter(t=> t.scheduledStart && fmtDay(new Date(t.scheduledStart))===fmtDay(today()) && !t.completed && t.id!==id).length===0;
    setTasks(prev=> prev.map(t=> t.id===id? {...t, completed:!t.completed}:t));
    const nowDone = tasks.filter(t=> t.completed).length+1;
    if(allPrevDone){ // potentially last one today
      chime();
      const msg=QUIPS[(Math.floor(Math.random()*QUIPS.length))];
      setToast({icon:'star', text:'Gold star unlocked ✨ '+msg});
      setTimeout(()=>setToast(null), 4000);
    }
  }

  // KPI per day
  const dayStats=(day)=>{
    const total = settings.workEndMins - settings.workStartMins;
    const used = filteredTasks.filter(t=> t.scheduledStart && fmtDay(new Date(t.scheduledStart))===fmtDay(day))
      .reduce((a,t)=>a+t.duration,0);
    return {used, total, free: Math.max(0,total-used)}
  }

  const overbook=(day)=> dayStats(day).used>dayStats(day).total;

  const clearDraft=()=> setDraft({title:'', priority:'Medium', hours:1, mins:0, flexible:true, when:'today', fixedDate:'', calendar:'work'});
  const clearAll=()=>{ if(confirm('Clear ALL tasks on calendar (keeps settings)?')) setTasks([]) }

  // recurring quick add (simple: daily/weekly)
  const addRecurring=(rule)=>{
    if(!draft.title.trim()) return;
    const baseStart = new Date(draft.fixedDate||fmtDay(today()));
    const count = rule.count||4; const every = rule.every||1;
    const duration = hmToMins(draft.hours, draft.mins);
    const arr=[];
    for(let i=0;i<count;i++){
      const d=new Date(baseStart);
      if(rule.type==='weekly'){ d.setDate(d.getDate()+i*7*every) }
      if(rule.type==='daily'){ d.setDate(d.getDate()+i*every) }
      arr.push({
        id: uid(),
        title: draft.title.trim(),
        duration,
        priority: draft.priority,
        calendar: draft.calendar||'work',
        flexible:false,
        fixedDate: fmtDay(d),
        fixedTime: draft.fixedTime || null,
        completed:false,
        createdAt: Date.now()
      })
    }
    setTasks(prev=>[...arr, ...prev]);
  }

  const themeClass='theme-dark'; // (quick: dark only; CSS ready for auto)

  return <div className={themeClass}>
    <header>
      <div className="logo">Chaos Control <span className="bomb"></span></div>
      <div className="searchbar">
        <Search size={16}/>
        <input placeholder="Search tasks…" value={search} onChange={e=>setSearch(e.target.value)} />
        <button className="ghost" onClick={()=>setWeekStart(addDays(weekStart,-7))}>Prev</button>
        <button className="ghost" onClick={()=>setWeekStart(()=>{
          const d=today(); const day=(d.getDay()+6)%7; return addDays(new Date(fmtDay(d)),-day)})}>Today</button>
        <button className="ghost" onClick={()=>setWeekStart(addDays(weekStart,7))}>Next</button>
      </div>
    </header>

    <div className="wrap">
      <div className="card">
        <div className="row">
          <input style={{flex:2}} placeholder="Add a new task..." value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} />
          <div className="row" style={{flex:2}}>
            <label>Duration</label>
            <input type="number" min="0" value={draft.hours} onChange={e=>setDraft({...draft, hours: clamp(parseInt(e.target.value||0),0,12)})} style={{width:70}}/>
            <span>hr</span>
            <input type="number" min="0" max="59" value={draft.mins} onChange={e=>setDraft({...draft, mins: clamp(parseInt(e.target.value||0),0,59)})} style={{width:70}}/>
            <span>min</span>
            <label>Priority</label>
            <select value={draft.priority} onChange={e=>setDraft({...draft, priority:e.target.value})}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
          </div>
        </div>

        <div className="row" style={{marginTop:8}}>
          <div className="chips">
            <span className="chip">When</span>
            <label className="chip"><input type="radio" checked={draft.flexible} onChange={()=>setDraft({...draft, flexible:true})}/> Flexible</label>
            <label className="chip"><input type="radio" checked={!draft.flexible} onChange={()=>setDraft({...draft, flexible:false})}/> Fixed</label>
          </div>

          {draft.flexible ? (
            <div className="chips">
              <label className="chip"><input type="radio" name="when" checked={draft.when==='today'} onChange={()=>setDraft({...draft, when:'today'})}/> Today</label>
              <label className="chip"><input type="radio" name="when" checked={draft.when==='next2d'} onChange={()=>setDraft({...draft, when:'next2d'})}/> Next 2d</label>
              <label className="chip"><input type="radio" name="when" checked={draft.when==='week'} onChange={()=>setDraft({...draft, when:'week'})}/> This week</label>
              <label className="chip"><input type="radio" name="when" checked={draft.when==='by'} onChange={()=>setDraft({...draft, when:'by'})}/> By date</label>
              {draft.when==='by' && <input type="date" value={draft.byDate||''} onChange={e=>setDraft({...draft, byDate:e.target.value})}/>}
            </div>
          ) : (
            <div className="row" style={{gap:8}}>
              <label>Fixed date</label>
              <input type="date" value={draft.fixedDate||''} onChange={e=>setDraft({...draft, fixedDate:e.target.value})}/>
              <label>time</label>
              <input type="time" value={draft.fixedTime||''} onChange={e=>setDraft({...draft, fixedTime:e.target.value})}/>
            </div>
          )}

          <div style={{marginLeft:'auto', display:'flex', gap:8}}>
            <button className="primary" onClick={addTask}>Add</button>
            <button onClick={autoScheduleAll}>Auto-Schedule</button>
            <button onClick={clearDraft}>Clear</button>
            <button className="danger" onClick={clearAll}>Clear entire schedule</button>
          </div>
        </div>

        <hr className="sep"/>
        <div className="row">
          <button onClick={()=>addRecurring({type:'weekly', every:1, count:6})}><CalendarRange size={16}/> Add weekly (6)</button>
          <button onClick={()=>addRecurring({type:'daily', every:1, count:5})}><CalendarRange size={16}/> Add daily (5)</button>
          <div className="chip warn">Unscheduled Tasks show below the grid.</div>
        </div>
      </div>

      {/* Week Grid */}
      <div className="grid">
        {days.map((d,i)=>{
          const list = filteredTasks.filter(t=> t.scheduledStart && fmtDay(new Date(t.scheduledStart))===fmtDay(d))
            .sort((a,b)=> new Date(a.scheduledStart)-new Date(b.scheduledStart));
          const st = dayStats(d);
          const bar = Math.min(100, Math.round(st.used*100/st.total));
          return <div className="day" key={i}>
            <header>
              <h3>{d.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'})}</h3>
              <div className="meta">{minsToHM(st.used)} / {minsToHM(st.total)}</div>
              <div className="kpi">
                <b>{minsToHM(st.free)} free</b>
                <div className={overbook(d)?'over':'ok'}>{bar}% used</div>
              </div>
              {overbook(d) && <AlertTriangle size={16} className="warn-icon" title="Over capacity"/>}
            </header>
            <div style={{padding:10, display:'flex', flexDirection:'column', gap:8}}>
              {list.map(t=>
                <div className={'task'+(t.completed?' done':'')} key={t.id} title={t._dupe?'Possible duplicate on this day':''}>
                  <div className="title">{new Date(t.scheduledStart).toTimeString().slice(0,5)} — {t.title}</div>
                  <div className="badges">
                    {t._dupe && <span className="chip bad">Dupe?</span>}
                    {t.rescheduled && <span className="chip warn">Rescheduled</span>}
                    {t.priority==='High' && <span className="chip bad">High</span>}
                    {t.priority==='Medium' && <span className="chip">Med</span>}
                    {t.priority==='Low' && <span className="chip ok">Low</span>}
                  </div>
                  <div className="controls">
                    <button className="ghost" onClick={()=>toggleDone(t.id)} title="Complete"><CheckCircle2 size={16}/></button>
                    <button className="ghost" onClick={()=>unschedule(t.id)} title="Unschedule"><RotateCcw size={16}/></button>
                    <button className="ghost danger" onClick={()=>remove(t.id)} title="Delete"><Trash2 size={16}/></button>
                  </div>
                </div>
              )}

              {/* place slots */}
              {(()=>{
                const slots=[];
                for(let m=settings.workStartMins; m<settings.workEndMins; m+=settings.slotSize){
                  const tt = ('0'+Math.floor(m/60)).slice(-2)+':'+('0'+(m%60)).slice(-2);
                  const canPlace = firstFreeSlot(d,0) !== null; // show as place
                  slots.push(<div className="slot place" key={m} onClick={()=>{
                    // place the FIRST unscheduled task
                    const u = filteredTasks.find(t=> !t.scheduledStart);
                    if(u){
                      const ss = firstFreeSlot(d, u.duration);
                      if(ss!=null) placeAt(u.id, d, ss);
                    }
                  }}><span>{tt}</span><span>Place</span></div>)
                }
                return slots;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Unscheduled list */}
      <div className="card" style={{marginTop:16}}>
        <h3>Unscheduled Tasks</h3>
        {filteredTasks.filter(t=> !t.scheduledStart).length===0
          ? <div>Nothing here — everything else is on the calendar.</div>
          : filteredTasks.filter(t=> !t.scheduledStart).map(t=>
            <div className="task" key={t.id}>
              <div className="title">{t.title}</div>
              <div className="badges">
                {t.priority==='High' && <span className="chip bad">High</span>}
                {t.flexible? <span className="chip">Flexible</span> : <span className="chip warn">Fixed</span>}
                {t.flexible && <span className="chip">Win: {t.windowStart} → {t.windowEnd}</span>}
                {!t.flexible && <span className="chip">On: {t.fixedDate} {t.fixedTime||''}</span>}
              </div>
              <div className="controls">
                <button onClick={()=>setTasks(prev=> prev.map(x=>x.id===t.id? autoScheduleOne(x):x))}>Schedule</button>
                <button className="ghost danger" onClick={()=>remove(t.id)}><Trash2 size={16}/></button>
              </div>
            </div>
          )
        }
      </div>

      <div className="footer">Disfunctional adults managing total chaos! • v2</div>
    </div>

    {toast && <div className="toast">{toast.icon==='star' && <Star className="star" size={16}/>} {toast.text}</div>}
  </div>
}
