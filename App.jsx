import React, { useEffect, useMemo, useState } from "react"

// ---------- Utilities ----------
const pad = (n) => String(n).padStart(2, "0")
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const minutes = (h, m = 0) => h * 60 + m
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))
const addMinutes = (date, mins) => { const d = new Date(date); d.setMinutes(d.getMinutes()+mins); return d }
const startOfDay = (d) => { const x=new Date(d); x.setHours(0,0,0,0); return x }
const humanTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const endTime = (start, dur) => addMinutes(start, dur)
const sameMinute = (a,b) => a && b && a.getTime() === b.getTime()
const parseLocalDate = (value) => { const [y,m,d]=value.split("-").map(Number); return new Date(y, m-1, d, 0,0,0,0) }
const overlaps = (startA, durA, startB, durB, buffer=0) => {
  const A1 = startA.getTime() - buffer*60000
  const A2 = A1 + (durA + buffer*2)*60000
  const B1 = startB.getTime() - buffer*60000
  const B2 = B1 + (durB + buffer*2)*60000
  return A1 < B2 && B1 < A2
}
const startOfWeek = (date, weekStartsOn=1) => { const d=new Date(date); const day=(d.getDay()+7-weekStartsOn)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d }
const daysOfWeek = (anchor) => Array.from({length:7},(_,i)=>addMinutes(anchor,i*1440))

// ---------- Storage ----------
const LS_TASKS="cc_tasks_v3", LS_BLOCKS="cc_blocks_v2", LS_SETTINGS="cc_settings_v2"
const load = (k,fb) => { try{ const raw=localStorage.getItem(k); return raw?JSON.parse(raw):fb }catch{return fb} }
const save = (k,v) => { try{ localStorage.setItem(k, JSON.stringify(v)) }catch{} }

// ---------- Defaults ----------
const defaultSettings = {
  workStartMins: minutes(9,0),
  workEndMins: minutes(17,0),
  slotSize: 30,
  weekStartsOn: 1,
  bufferMins: 5,
  preferMornings: true,
  dailyCapacityMins: 420,
  warnThresholdPct: 80,
  calendars: [
    { id:'work', name:'Work', color:'#2563eb', enabled:true },
    { id:'team', name:'Team', color:'#16a34a', enabled:true },
    { id:'personal', name:'Personal', color:'#9333ea', enabled:false },
  ],
  activeCalendarId: 'work',
}
const CALMAP = (s) => Object.fromEntries(s.calendars.map(c=>[c.id,c]))

// ---------- App ----------
export default function App(){
  const [tasks, setTasks] = useState(()=>load(LS_TASKS, []))
  const [blocks, setBlocks] = useState(()=>load(LS_BLOCKS, []))
  const [settings, setSettings] = useState(()=>load(LS_SETTINGS, defaultSettings))
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [anchorDate, setAnchorDate] = useState(()=> startOfWeek(new Date(), load(LS_SETTINGS, defaultSettings).weekStartsOn))
  const [filterCalendars, setFilterCalendars] = useState(()=> new Set(load(LS_SETTINGS, defaultSettings).calendars.filter(c=>c.enabled).map(c=>c.id)))
  const [editTaskId, setEditTaskId] = useState(null)           // NEW: modal
  const weekDays = useMemo(()=> daysOfWeek(anchorDate), [anchorDate])
  const calmap = useMemo(()=> CALMAP(settings), [settings])

  useEffect(()=> save(LS_TASKS, tasks), [tasks])
  useEffect(()=> save(LS_BLOCKS, blocks), [blocks])
  useEffect(()=> save(LS_SETTINGS, settings), [settings])

  // ----- CRUD -----
  function addTask(form){
    const data=new FormData(form)
    const title=(data.get("title")||"").toString().trim(); if(!title) return
    const duration=clamp(parseInt(data.get("duration"),10)||30,5,24*60)
    const dueDate=(data.get("due")||toKey(new Date())).toString()
    const flexible=data.get("flexible")==="on"
    const priority=parseInt((data.get("priority")||"2").toString(),10)||2
    const recurrence=(data.get("recurrence")||"none").toString()
    const calendar=(data.get("calendar")||settings.activeCalendarId).toString()
    const dependsOn=(data.get("dependson")||"").toString()||null
    const newTask={ id:crypto.randomUUID(), title, duration, dueDate, flexible, priority, done:false, scheduledStart:null, recurrence, calendar, dependsOn, _moved:false }
    setTasks(prev=>[newTask, ...prev]); form.reset()
  }
  function addBlock(form){
    const data=new FormData(form)
    const title=(data.get("btitle")||"").toString().trim(); if(!title) return
    const date=(data.get("bdate")||"").toString(), time=(data.get("btime")||"").toString(); if(!date||!time) return
    const duration=clamp(parseInt((data.get("bduration")||"60").toString(),10)||60,5,24*60)
    const calendar=(data.get("bcalendar")||settings.activeCalendarId).toString()
    const startISO=new Date(`${date}T${time}:00`).toISOString()
    const block={ id:crypto.randomUUID(), title, startISO, duration, calendar }
    setBlocks(prev=>[block, ...prev]); form.reset()
  }
  function updateTask(id, patch){
    setTasks(prev=>prev.map(t=> t.id===id ? ({...t, ...patch}) : t))
  }
  function toggleDone(id){
    setTasks(prev=>prev.map(t=>t.id===id?{...t, done:!t.done}:t))
    const t=tasks.find(x=>x.id===id)
    if(t && !t.done && t.recurrence && t.recurrence!=='none'){
      const nextDue=nextRecurrenceDate(t.dueDate, t.recurrence)
      const clone={...t, id:crypto.randomUUID(), done:false, scheduledStart:null, _moved:false, dueDate:nextDue}
      setTasks(prev=>[clone, ...prev])
    }
  }
  function removeTask(id){ setTasks(prev=>prev.filter(t=>t.id!==id)); if(selectedTaskId===id) setSelectedTaskId(null); if(editTaskId===id) setEditTaskId(null) }
  function unscheduleTask(id){ setTasks(prev=>prev.map(t=>t.id===id?{...t, scheduledStart:null, _moved:false}:t)) }
  function assignTaskToStart(taskId, startDate){
    setTasks(prev=>prev.map(t=> t.id===taskId ? ({...t, scheduledStart:startDate.toISOString(), _moved:true}) : t ))
  }
  function nextRecurrenceDate(yyyyMMdd, rule){
    const d=parseLocalDate(yyyyMMdd)
    switch(rule){
      case 'daily': d.setDate(d.getDate()+1); break
      case 'weekdays': { const day=d.getDay(); d.setDate(d.getDate() + (day===5?3:1)); break }
      case 'weekly': d.setDate(d.getDate()+7); break
      default: d.setDate(d.getDate()+1)
    }
    return toKey(d)
  }

  // ----- Scheduling -----
  function busyBlocksOnDay(dayDate){
    const dayKey=toKey(dayDate)
    const busy=[]
    for(const b of blocks.filter(b=>filterCalendars.has(b.calendar))){
      const s=new Date(b.startISO)
      if(toKey(s)===dayKey) busy.push({ start:s, duration:b.duration, title:b.title, type:'block', calendar:b.calendar })
    }
    for(const t of tasks){
      if(!t.scheduledStart || t.done) continue
      if(!filterCalendars.has(t.calendar)) continue
      const s=new Date(t.scheduledStart)
      if(toKey(s)===dayKey) busy.push({ start:s, duration:t.duration, title:t.title, type:'task', taskId:t.id, calendar:t.calendar })
    }
    busy.sort((a,b)=>a.start-b.start)
    return busy
  }

  function autoSchedule(selectedOnly=false){
    setTasks(prev=>{
      // clone tasks; remember previous schedule to detect changes
      const next=prev.map(t=>({...t, _moved:false}))
      const prevMap=new Map(prev.map(t=>[t.id, t.scheduledStart]))

      const { workStartMins, workEndMins, slotSize, bufferMins, preferMornings, dailyCapacityMins }=settings

      const dayBusyCache=new Map()
      const getBusyOn=(day)=>{
        const key=toKey(day); if(dayBusyCache.has(key)) return dayBusyCache.get(key)
        const busy=[]
        for(const b of blocks.filter(b=>filterCalendars.has(b.calendar))){
          const s=new Date(b.startISO); if(toKey(s)===key) busy.push({start:s, duration:b.duration})
        }
        for(const t of next){
          if(t.scheduledStart && !t.done && filterCalendars.has(t.calendar)){
            const s=new Date(t.scheduledStart); if(toKey(s)===key) busy.push({start:s, duration:t.duration})
          }
        }
        busy.sort((a,b)=>a.start-b.start); dayBusyCache.set(key,busy); return busy
      }

      const byId=new Map(next.map(t=>[t.id,t]))
      const candidates=next
        .filter(t=>!t.done && filterCalendars.has(t.calendar))
        .filter(t=>selectedOnly ? t.id===selectedTaskId : true)
        .sort((a,b)=>a.priority-b.priority || (a.dueDate>b.dueDate?1:-1))

      for(const t of candidates) if(t.flexible) t.scheduledStart=null

      const fromDate=startOfDay(new Date())

      function tryPlace(task){
        const due=parseLocalDate(task.dueDate)
        const days=Math.max(1, Math.ceil((due-fromDate)/86400000)+1)
        for(let d=0; d<days; d++){
          const day=addMinutes(fromDate, d*1440)
          if(toKey(day) > task.dueDate) break
          const busy=getBusyOn(day)

          const used=busy.reduce((s,b)=>s+b.duration,0)
          if(used >= dailyCapacityMins) continue

          const order=[]
          for(let tmin=workStartMins; tmin + task.duration <= workEndMins; tmin += slotSize) order.push(tmin)
          if(!preferMornings) order.reverse()

          for(const tmin of order){
            const start=addMinutes(day, tmin)
            const conflict=busy.some(b=>overlaps(start, task.duration, b.start, b.duration, bufferMins))
            if(!conflict && (used + task.duration) <= dailyCapacityMins){
              task.scheduledStart=start.toISOString()
              busy.push({start, duration:task.duration})
              busy.sort((a,b)=>a.start-b.start)
              return true
            }
          }
        }
        return false
      }

      for(const task of candidates){
        if(!task.flexible && task.scheduledStart) continue
        if(task.dependsOn && !byId.get(task.dependsOn)?.scheduledStart) continue
        tryPlace(task)
      }
      for(const task of candidates){
        if(task.scheduledStart) continue
        if(task.dependsOn && !byId.get(task.dependsOn)?.scheduledStart) continue
        tryPlace(task)
      }

      // flag tasks that changed time
      for(const t of next){
        const before=prevMap.get(t.id)
        if(before && t.scheduledStart && before !== t.scheduledStart){
          t._moved = true
        }
      }
      return next
    })
  }

  function clearAllSchedules(){ setTasks(prev=>prev.map(t=>({...t, scheduledStart:null, _moved:false}))) }

  function assignSelectedToSlot(day, minutesFromStart){
    if(!selectedTaskId) return
    const task=tasks.find(t=>t.id===selectedTaskId); if(!task) return
    if(task.dependsOn){
      const dep=tasks.find(t=>t.id===task.dependsOn)
      if(dep?.scheduledStart){
        const depEnd=endTime(new Date(dep.scheduledStart), dep.duration)
        const candidate=addMinutes(day, minutesFromStart)
        if(candidate < depEnd) return alert("This task depends on another that ends later. Place it after the predecessor.")
      }
    }
    const start=addMinutes(day, minutesFromStart)
    const busy=busyBlocksOnDay(day)
    const conflict=busy.some(b=>overlaps(start, task.duration, b.start, b.duration, settings.bufferMins) && b.taskId!==task.id)
    const used=busy.reduce((s,b)=>s+b.duration,0)
    if((used + task.duration) > settings.dailyCapacityMins) return alert("That would exceed the day's capacity.")
    if(conflict) return alert("That slot overlaps another item (respecting buffer).")
    assignTaskToStart(task.id, start)
  }

  function onDragStartTask(e,payload){ e.dataTransfer.setData('text/task', JSON.stringify(payload)) }
  function onDropSlot(e, day, m){ const data=e.dataTransfer.getData('text/task'); if(!data) return; const {taskId}=JSON.parse(data); setSelectedTaskId(taskId); assignSelectedToSlot(day,m) }

  // ----- UI Components -----
  function TaskItem({ t }){
    const scheduled=t.scheduledStart?new Date(t.scheduledStart):null
    const color=calmap[t.calendar]?.color || '#334155'
    const classes=['task','border','rounded-xl','p-3','mb-2']
    if(t.done) classes.push('done')
    if(t.priority===1) classes.push('priority-high')
    if(t._moved) classes.push('rescheduled')

    return (
      <div className={classes.join(' ')} style={{borderColor:color}} draggable onDragStart={(e)=>onDragStartTask(e,{taskId:t.id})}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={t.done} onChange={()=>toggleDone(t.id)} />
            <button className="text-left" onClick={()=>setSelectedTaskId(selectedTaskId===t.id?null:t.id)}>
              <div className="font-medium flex items-center gap-2">
                <span className="inline-block" style={{width:10,height:10,borderRadius:999,background:color}} />
                {t.title}
              </div>
              <div className="text-xs text-gray-500 flex" style={{gap:8,flexWrap:'wrap'}}>
                <span>{t.duration} min</span>
                <span>due {t.dueDate}</span>
                <span>{t.flexible?'flexible':'fixed'}</span>
                <span>{t.priority===1?'High':t.priority===2?'Med':'Low'}</span>
                {t.priority===1 && <span className="badge red">High</span>}
                {t._moved && <span className="badge amber">Rescheduled</span>}
                {t.recurrence!=='none' && <span>↻ {t.recurrence}</span>}
                {t.dependsOn && <span>▶ depends</span>}
              </div>
              {scheduled && <div className="text-xs" style={{color}}>Scheduled: {toKey(scheduled)} {humanTime(scheduled)}–{humanTime(endTime(scheduled, t.duration))}</div>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs p-3 hover:bg-gray-200 bg-gray-100 rounded-xl" onClick={()=>unscheduleTask(t.id)}>Unschedule</button>
            <button className="text-xs p-3 bg-red-50 text-red-700 rounded-xl" onClick={()=>removeTask(t.id)}>Delete</button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Edit Modal ----------
  function EditTaskModal({ task, onClose }){
    const [form, setForm] = useState(()=>({
      title: task.title,
      duration: task.duration,
      dueDate: task.dueDate,
      priority: task.priority,
      flexible: task.flexible,
      calendar: task.calendar
    }))
    const set = (k,v)=>setForm(prev=>({...prev,[k]:v}))

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
          <h3 className="text-sm font-semibold mb-3">Edit Task</h3>

          <div className="mb-3">
            <label className="text-xs text-gray-500">Title</label>
            <input className="border rounded-xl p-3" value={form.title} onChange={e=>set('title', e.target.value)} style={{width:'100%'}} />
          </div>

          <div className="modal-row mb-3">
            <div>
              <label className="text-xs text-gray-500">Duration (min)</label>
              <input type="number" className="border rounded-xl p-3" value={form.duration} onChange={e=>set('duration', parseInt(e.target.value||'0',10))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Due date</label>
              <input type="date" className="border rounded-xl p-3" value={form.dueDate} onChange={e=>set('dueDate', e.target.value)} />
            </div>
          </div>

          <div className="modal-row mb-3">
            <div>
              <label className="text-xs text-gray-500">Priority</label>
              <select className="border rounded-xl p-3" value={form.priority} onChange={e=>set('priority', parseInt(e.target.value,10))}>
                <option value={1}>High</option>
                <option value={2}>Medium</option>
                <option value={3}>Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Calendar</label>
              <select className="border rounded-xl p-3" value={form.calendar} onChange={e=>set('calendar', e.target.value)}>
                {settings.calendars.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={form.flexible} onChange={e=>set('flexible', e.target.checked)} /> Flexible time
          </label>

          <div className="modal-actions">
            <button className="p-3 rounded-xl bg-indigo-600" onClick={()=>{
              updateTask(task.id, {
                title: form.title.trim() || task.title,
                duration: clamp(parseInt(form.duration,10)||task.duration, 5, 24*60),
                dueDate: form.dueDate,
                priority: form.priority,
                flexible: form.flexible,
                calendar: form.calendar
              })
              onClose()
            }}>Save</button>

            <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" onClick={()=>{ unscheduleTask(task.id); onClose() }}>Unschedule</button>

            <button className="p-3 rounded-xl bg-red-50 text-red-700" onClick={()=>{ removeTask(task.id); onClose() }}>Delete</button>

            <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  function CalendarDay({ day }){
    const busy=busyBlocksOnDay(day)
    const used=busy.reduce((s,b)=>s+b.duration,0)
    const cap=settings.dailyCapacityMins
    const warnPct=settings.warnThresholdPct
    const pct=Math.min(100, Math.round((used/cap)*100))
    const status=used>cap?'over':(pct>=warnPct?'warn':'ok')
    const barColor=status==='over'?'#ef4444':status==='warn'?'#f59e0b':'#10b981'

    const { workStartMins, workEndMins, slotSize }=settings
    const slots=[]; for(let t=workStartMins; t<workEndMins; t+=slotSize) slots.push(t)

    // tasks due/overdue for this day that have NO scheduled time
    const dayKey = toKey(day)
    const dueOrOverdueUnscheduled = tasks.filter(t =>
      !t.done &&
      !t.scheduledStart &&
      filterCalendars.has(t.calendar) &&
      t.dueDate <= dayKey
    ).sort((a,b)=> a.priority - b.priority || (a.dueDate > b.dueDate ? 1 : -1))

    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-gray-50 p-3 text-sm font-medium">
          <div className="flex items-center justify-between">
            <span>{day.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span>
            <span className="text-xs text-gray-500">{used}/{cap} min • {pct}%</span>
          </div>
          <div className="w-full" style={{height:4, borderRadius:4, marginTop:8, background:'#e5e7eb'}}>
            <div style={{height:4, borderRadius:4, width:`${pct}%`, background:barColor}} />
          </div>
          {status!=='ok' && <div className="text-xs" style={{marginTop:6, color:barColor}}>{status==='warn'?'Warning: nearing daily capacity':'Over capacity: consider moving tasks'}</div>}
        </div>

        {/* Time slots */}
        <div className="divide-y">
          {slots.map((m)=>{
            const slotStart=addMinutes(day,m)
            const block=busy.find(b=>sameMinute(b.start, slotStart))
            if(block){
              const height=Math.max(44, Math.floor((block.duration/slotSize)*44))
              const color=calmap[block.calendar]?.color || '#334155'
              const isTask = block.type==='task'
              const t = isTask ? tasks.find(x=>x.id===block.taskId) : null

              return (
                <div key={m} className="p-3" style={{height, background:`${color}20`}} draggable={isTask} onDragStart={(e)=> isTask && onDragStartTask(e,{taskId:block.taskId})}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium" style={{color}}>
                      {humanTime(slotStart)} •{" "}
                      {isTask ? (
                        <span className="cursor-pointer" onClick={()=> setEditTaskId(block.taskId)} title="Click to edit">
                          {block.title}
                        </span>
                      ) : (
                        block.title
                      )}
                    </div>
                    {/* NEW: checkbox inline to mark complete */}
                    {isTask && t && (
                      <label className="text-xs" style={{display:'inline-flex',alignItems:'center',gap:6}}>
                        <input
                          type="checkbox"
                          checked={!!t.done}
                          onChange={(e)=>{ e.stopPropagation(); toggleDone(block.taskId) }}
                          title="Mark complete"
                        />
                        <span style={{opacity:.8}}>Done</span>
                      </label>
                    )}
                  </div>
                  <div className="text-xs" style={{opacity:.85, color}}>
                    {block.duration} min
                    {isTask && t && t.priority===1 && <span className="badge red" style={{marginLeft:8}}>High</span>}
                  </div>
                </div>
              )
            }
            return (
              <div key={m} className={`p-3 ${selectedTaskId?'cursor-pointer':'cursor-default'}`} onClick={()=>assignSelectedToSlot(day,m)} onDragOver={(e)=>{ if(selectedTaskId) e.preventDefault() }} onDrop={(e)=>onDropSlot(e, day, m)} title={selectedTaskId?'Place selected task here':'Select a task to place'}>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{humanTime(slotStart)}</span>
                  {!selectedTaskId && <span>—</span>}
                  {selectedTaskId && <span className="text-indigo-500">Place</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Unscheduled (due/overdue) */}
        {dueOrOverdueUnscheduled.length > 0 && (
          <div className="p-3" style={{borderTop:'1px solid #e5e7eb'}}>
            <div className="text-xs text-gray-600" style={{marginBottom:6}}>Unscheduled (due/overdue):</div>
            <div style={{display:'grid', gap:6}}>
              {dueOrOverdueUnscheduled.map(t => {
                const color=calmap[t.calendar]?.color || '#334155'
                const pillClasses=['task','border','rounded-xl','p-3']
                if(t.priority===1) pillClasses.push('priority-high')
                return (
                  <div
                    key={t.id}
                    className={pillClasses.join(' ')}
                    style={{borderColor:color}}
                    draggable
                    onDragStart={(e)=>{ setSelectedTaskId(t.id); onDragStartTask(e,{taskId:t.id}) }}
                    onClick={()=> setSelectedTaskId(t.id)}
                    title="Drag to a time slot, or click then tap a slot to place"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium" style={{display:'flex',alignItems:'center',gap:8}}>
                        <span className="inline-block" style={{width:10,height:10,borderRadius:999,background:color}} />
                        {t.title}
                      </div>
                      <div className="text-xs text-gray-500" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <span>{t.duration} min</span>
                        <span>due {t.dueDate}</span>
                        {t.priority===1 && <span className="badge red">High</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Chaos Control — Smart Scheduler</h1>
        <span title="bomb" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,fontSize:12,borderRadius:999,background:'conic-gradient(from 45deg, #ef4444, #f59e0b, #10b981, #3b82f6, #a855f7, #ef4444)'}}>💣</span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-1">
          <section className="border rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-3">New Task</h2>
            <form className="grid grid-cols-1 gap-3" onSubmit={(e)=>{ e.preventDefault(); addTask(e.currentTarget) }}>
              <input name="title" placeholder="Task title" className="border rounded-xl p-3" />
              <div className="flex gap-3">
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Duration (min)</label>
                  <input name="duration" type="number" defaultValue={60} min={5} className="border rounded-xl p-3" style={{width:'100%'}} />
                </div>
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Due date</label>
                  <input name="due" type="date" defaultValue={toKey(new Date())} className="border rounded-xl p-3" style={{width:'100%'}} />
                </div>
              </div>
              <div className="flex gap-3">
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Priority</label>
                  <select name="priority" defaultValue={2} className="border rounded-xl p-3" style={{width:'100%'}}>
                    <option value={1}>High</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Low</option>
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Recurrence</label>
                  <select name="recurrence" defaultValue={'none'} className="border rounded-xl p-3" style={{width:'100%'}}>
                    <option value="none">None</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Calendar</label>
                  <select name="calendar" defaultValue={settings.activeCalendarId} className="border rounded-xl p-3" style={{width:'100%'}}>
                    {settings.calendars.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Depends on (optional)</label>
                  <select name="dependson" className="border rounded-xl p-3" style={{width:'100%'}}>
                    <option value="">— None —</option>
                    {tasks.map(t=> <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input name="flexible" type="checkbox" defaultChecked /> Flexible time
              </label>
              <div className="flex gap-2" style={{flexWrap:'wrap'}}>
                <button className="p-3 rounded-xl bg-indigo-600" type="submit">Add</button>
                <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" type="button" onClick={()=>autoSchedule(false)}>Auto-Schedule All</button>
                <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" type="button" onClick={clearAllSchedules}>Clear Schedules</button>
                <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" type="button" onClick={()=>{
                  const blob=new Blob([JSON.stringify({tasks,blocks,settings},null,2)],{type:'application/json'});
                  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`chaos-control-backup-${toKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url);
                }}>Export JSON</button>
                <label className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200 cursor-pointer">
                  Import JSON
                  <input type="file" accept="application/json" style={{display:'none'}} onChange={(e)=> e.target.files && ((()=>{const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(data.tasks) setTasks(data.tasks); if(data.blocks) setBlocks(data.blocks); if(data.settings) setSettings(data.settings); alert('Imported successfully.') }catch{ alert('Invalid file.') } }; reader.readAsText(e.target.files[0]);})())} />
                </label>
              </div>
            </form>
          </section>

          <section className="border rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-3">Fixed-time Block</h2>
            <form className="grid grid-cols-1 gap-3" onSubmit={(e)=>{ e.preventDefault(); addBlock(e.currentTarget) }}>
              <input name="btitle" placeholder="Meeting / Appointment" className="border rounded-xl p-3" />
              <div className="flex gap-3">
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Date</label>
                  <input name="bdate" type="date" defaultValue={toKey(new Date())} className="border rounded-xl p-3" style={{width:'100%'}} />
                </div>
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Start time</label>
                  <input name="btime" type="time" className="border rounded-xl p-3" style={{width:'100%'}} />
                </div>
              </div>
              <div className="flex gap-3">
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Duration (min)</label>
                  <input name="bduration" type="number" defaultValue={60} min={5} className="border rounded-xl p-3" style={{width:'100%'}} />
                </div>
                <div style={{flex:1}}>
                  <label className="text-xs text-gray-500">Calendar</label>
                  <select name="bcalendar" defaultValue={settings.activeCalendarId} className="border rounded-xl p-3" style={{width:'100%'}} >
                    {settings.calendars.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <button className="p-3 rounded-xl bg-emerald-600">Add Block</button>
              </div>
            </form>
          </section>

          <section className="border rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Tasks</h2>
            {tasks.length===0 && <div className="text-sm text-gray-500">No tasks yet. Add one above.</div>}
            {tasks.map(t=> <TaskItem key={t.id} t={t} />)}
          </section>
        </div>

        {/* Right column */}
        <div className="lg:col-span-2">
          <section className="border rounded-2xl p-4 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(addMinutes(anchorDate, -7*1440))}>← Prev</button>
              <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(startOfWeek(new Date(), settings.weekStartsOn))}>Today</button>
              <button className="p-3 rounded-xl bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(addMinutes(anchorDate, 7*1440))}>Next →</button>
            </div>
            <div className="text-sm text-gray-600">Week of {anchorDate.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</div>
            <div className="flex items-center gap-2">
              <button className="p-3 rounded-xl bg-indigo-600" onClick={()=>autoSchedule(false)}>Auto-Schedule All</button>
              <button className={`p-3 rounded-xl ${selectedTaskId?'bg-emerald-600':'bg-gray-100 text-gray-600'}`} onClick={()=> selectedTaskId && autoSchedule(true)}>Schedule Selected</button>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            {weekDays.map((d)=> <CalendarDay key={d.toISOString()} day={d} />)}
          </section>

          <p className="mt-4 text-xs text-gray-500">Tip: Click a scheduled task’s title to edit, or tick its checkbox to mark complete. Drag tasks to slots, and use auto-schedule to fill your week.</p>
        </div>
      </div>

      {/* Modal mount */}
      {editTaskId && (() => {
        const t = tasks.find(x=>x.id===editTaskId)
        return t ? <EditTaskModal task={t} onClose={()=>setEditTaskId(null)} /> : null
      })()}
    </div>
  )
}
