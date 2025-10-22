import React, { useEffect, useMemo, useState } from "react"

/** Chaos Control — Smart Scheduler (full app) */

const pad = (n) => String(n).padStart(2, "0")
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const minutes = (h, m = 0) => h * 60 + m
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

function parseLocalDate(value) { const [y,m,d]=value.split("-").map(Number); return new Date(y, m-1, d, 0,0,0,0) }
function addMinutes(date, mins) { const d = new Date(date); d.setMinutes(d.getMinutes()+mins); return d }
function sameMinute(a,b){ return a && b && a.getTime()===b.getTime() }
function overlaps(startA, durA, startB, durB, buffer=0){
  const A1 = startA.getTime() - buffer*60000
  const A2 = A1 + (durA + buffer*2)*60000
  const B1 = startB.getTime() - buffer*60000
  const B2 = B1 + (durB + buffer*2)*60000
  return A1 < B2 && B1 < A2
}
function humanTime(d){ return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
function endTime(start, dur){ return addMinutes(start, dur) }
function startOfWeek(date, weekStartsOn=1){ const d=new Date(date); const day=(d.getDay()+7-weekStartsOn)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d }
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x }
function daysOfWeek(anchor){ return Array.from({length:7},(_,i)=>addMinutes(anchor,i*1440)) }

const LS_TASKS="cc_tasks_v1", LS_BLOCKS="cc_blocks_v1", LS_SETTINGS="cc_settings_v1"
function load(key, fallback){ try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback }catch{return fallback} }
function save(key,val){ try{ localStorage.setItem(key, JSON.stringify(val)) }catch{} }

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

export default function App(){
  const [tasks, setTasks] = useState(()=>load(LS_TASKS, []))
  const [blocks, setBlocks] = useState(()=>load(LS_BLOCKS, []))
  const [settings, setSettings] = useState(()=>load(LS_SETTINGS, defaultSettings))
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [anchorDate, setAnchorDate] = useState(()=> startOfWeek(new Date(), load(LS_SETTINGS, defaultSettings).weekStartsOn))
  const [filterCalendars, setFilterCalendars] = useState(()=> new Set(load(LS_SETTINGS, defaultSettings).calendars.filter(c=>c.enabled).map(c=>c.id)))
  const weekDays = useMemo(()=> daysOfWeek(anchorDate), [anchorDate])
  const calmap = useMemo(()=> CALMAP(settings), [settings])

  useEffect(()=> save(LS_TASKS, tasks), [tasks])
  useEffect(()=> save(LS_BLOCKS, blocks), [blocks])
  useEffect(()=> save(LS_SETTINGS, settings), [settings])

  function addTask(form){
    const data = new FormData(form)
    const title = (data.get("title")||"").toString().trim(); if(!title) return
    const duration = clamp(parseInt(data.get("duration"),10)||30, 5, 24*60)
    const dueDate = (data.get("due")||toKey(new Date())).toString()
    const flexible = data.get("flexible")==="on"
    const priority = parseInt((data.get("priority")||"2").toString(),10)||2
    const recurrence = (data.get("recurrence")||"none").toString()
    const calendar = (data.get("calendar")||settings.activeCalendarId).toString()
    const dependsOn = (data.get("dependson")||"").toString()||null
    const newTask = { id: crypto.randomUUID(), title, duration, dueDate, flexible, priority, done:false, scheduledStart:null, recurrence, calendar, dependsOn }
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
  function toggleDone(id){
    setTasks(prev=>prev.map(t=>t.id===id?{...t, done:!t.done}:t))
    const t=tasks.find(x=>x.id===id)
    if(t && !t.done && t.recurrence && t.recurrence!=='none'){
      const nextDue=nextRecurrenceDate(t.dueDate, t.recurrence)
      const clone={...t, id:crypto.randomUUID(), done:false, scheduledStart:null, dueDate:nextDue}
      setTasks(prev=>[clone, ...prev])
    }
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
  function removeTask(id){ setTasks(prev=>prev.filter(t=>t.id!==id)); if(selectedTaskId===id) setSelectedTaskId(null) }
  function unscheduleTask(id){ setTasks(prev=>prev.map(t=>t.id===id?{...t, scheduledStart:null}:t)) }
  function assignTaskToStart(taskId, startDate){ setTasks(prev=>prev.map(t=>t.id===taskId?{...t, scheduledStart:startDate.toISOString()}:t)) }

  function busyBlocksOnDay(dayDate){
    const dayKey=toKey(dayDate), busy=[]
    for(const b of blocks.filter(b=>filterCalendars.has(b.calendar))){
      const s=new Date(b.startISO); if(toKey(s)===dayKey) busy.push({start:s,duration:b.duration,title:b.title,type:'block',calendar:b.calendar})
    }
    for(const t of tasks){
      if(!t.scheduledStart||t.done) continue; if(!filterCalendars.has(t.calendar)) continue
      const s=new Date(t.scheduledStart); if(toKey(s)===dayKey) busy.push({start:s,duration:t.duration,title:t.title,type:'task',taskId:t.id,calendar:t.calendar})
    }
    busy.sort((a,b)=>a.start-b.start); return busy
  }

  function autoSchedule(selectedOnly=false){
    setTasks(prev=>{
      const next=prev.map(t=>({...t}))
      const { workStartMins, workEndMins, slotSize, bufferMins, preferMornings, dailyCapacityMins }=settings
      const dayBusyCache=new Map()
      const getBusyOn=(day)=>{
        const key=toKey(day); if(dayBusyCache.has(key)) return dayBusyCache.get(key)
        const busy=[]
        for(const b of blocks.filter(b=>filterCalendars.has(b.calendar))){
          const s=new Date(b.startISO); if(toKey(s)===key) busy.push({start:s,duration:b.duration})
        }
        for(const t of next){
          if(t.scheduledStart && !t.done && filterCalendars.has(t.calendar)){
            const s=new Date(t.scheduledStart); if(toKey(s)===key) busy.push({start:s,duration:t.duration})
          }
        }
        busy.sort((a,b)=>a.start-b.start); dayBusyCache.set(key,busy); return busy
      }
      const byId=new Map(next.map(t=>[t.id,t]))
      const candidates=next.filter(t=>!t.done && filterCalendars.has(t.calendar)).filter(t=>selectedOnly?t.id===selectedTaskId:true).sort((a,b)=>a.priority-b.priority || (a.dueDate>b.dueDate?1:-1))
      for(const t of candidates) if(t.flexible) t.scheduledStart=null
      const now=new Date(), fromDate=startOfDay(now)
      function tryPlace(task){
        const due=parseLocalDate(task.dueDate); const days=Math.max(1, Math.ceil((due-fromDate)/86400000)+1)
        for(let d=0; d<days; d++){
          const day=addMinutes(fromDate, d*1440); if(toKey(day)>task.dueDate) break
          const busy=getBusyOn(day)
          const used=busy.reduce((s,b)=>s+b.duration,0); if(used>=dailyCapacityMins) continue
          const order=[]; for(let tmin=workStartMins; tmin+task.duration<=workEndMins; tmin+=slotSize) order.push(tmin)
          if(!preferMornings) order.reverse()
          for(const tmin of order){
            const start=addMinutes(day, tmin)
            const conflict=busy.some(b=>overlaps(start, task.duration, b.start, b.duration, bufferMins))
            if(!conflict && (used+task.duration)<=dailyCapacityMins){
              task.scheduledStart=start.toISOString(); busy.push({start, duration:task.duration}); busy.sort((a,b)=>a.start-b.start); return true
            }
          }
        }
        return false
      }
      for(const task of candidates){ if(!task.flexible && task.scheduledStart) continue; if(task.dependsOn && !byId.get(task.dependsOn)?.scheduledStart) continue; tryPlace(task) }
      for(const task of candidates){ if(task.scheduledStart) continue; if(task.dependsOn && !byId.get(task.dependsOn)?.scheduledStart) continue; tryPlace(task) }
      return next
    })
  }
  function clearAllSchedules(){ setTasks(prev=>prev.map(t=>({...t, scheduledStart:null}))) }

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
    if((used+task.duration)>settings.dailyCapacityMins) return alert("That would exceed the day's capacity.")
    if(conflict) return alert("That slot overlaps another item (respecting buffer).")
    assignTaskToStart(task.id, start)
  }

  function onDragStartTask(e,payload){ e.dataTransfer.setData('text/task', JSON.stringify(payload)) }
  function onDropSlot(e, day, m){ const data=e.dataTransfer.getData('text/task'); if(!data) return; const {taskId}=JSON.parse(data); setSelectedTaskId(taskId); assignSelectedToSlot(day, m) }

  function exportData(){
    const blob=new Blob([JSON.stringify({tasks,blocks,settings},null,2)], {type:'application/json'})
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`chaos-control-backup-${toKey(new Date())}.json`; a.click(); URL.revokeObjectURL(url)
  }
  function importData(file){
    const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); if(data.tasks) setTasks(data.tasks); if(data.blocks) setBlocks(data.blocks); if(data.settings) setSettings(data.settings); alert('Imported successfully.') }catch{ alert('Invalid file.') } }; reader.readAsText(file)
  }

  function TaskItem({t}){
    const scheduled=t.scheduledStart?new Date(t.scheduledStart):null
    const color=calmap[t.calendar]?.color || '#334155'
    return (
      <div className={`border rounded-xl p-3 mb-2 ${t.done?"opacity-60":""} ${selectedTaskId===t.id?"ring-2":""}`} style={{borderColor:color}} draggable onDragStart={(e)=>onDragStartTask(e,{taskId:t.id})}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={t.done} onChange={()=>toggleDone(t.id)} />
            <button className="text-left" onClick={()=>setSelectedTaskId(selectedTaskId===t.id?null:t.id)} title="Select to place on calendar">
              <div className="font-medium flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:color}} />
                {t.title}
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
                <span>{t.duration} min</span>
                <span>due {t.dueDate}</span>
                <span>{t.flexible?"flexible":"fixed"}</span>
                <span>{t.priority===1?"High":t.priority===2?"Med":"Low"}</span>
                {t.recurrence!=='none' && <span>↻ {t.recurrence}</span>}
                {t.dependsOn && <span>▶ depends</span>}
              </div>
              {scheduled && <div className="text-xs" style={{color}}>Scheduled: {toKey(scheduled)} {humanTime(scheduled)}–{humanTime(endTime(scheduled, t.duration))}</div>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={()=>unscheduleTask(t.id)}>Unschedule</button>
            <button className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100" onClick={()=>removeTask(t.id)}>Delete</button>
          </div>
        </div>
      </div>
    )
  }

  function CalendarDay({day}){
    const busy=busyBlocksOnDay(day)
    const used=busy.reduce((s,b)=>s+b.duration,0)
    const cap=settings.dailyCapacityMins
    const warnPct=settings.warnThresholdPct
    const pct=Math.min(100, Math.round((used/cap)*100))
    const status=used>cap?'over':(pct>=warnPct?'warn':'ok')
    const barColor=status==='over'?'#ef4444':status==='warn'?'#f59e0b':'#10b981'
    const {workStartMins, workEndMins, slotSize}=settings
    const slots=[]; for(let t=workStartMins; t<workEndMins; t+=slotSize) slots.push(t)

    return (
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 text-sm font-medium">
          <div className="flex items-center justify-between">
            <span>{day.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span>
            <span className="text-xs text-gray-500">{used}/{cap} min • {pct}%</span>
          </div>
          <div className="w-full h-1 mt-2 rounded" style={{background:'#e5e7eb'}}>
            <div className="h-1 rounded" style={{width:`${pct}%`, background:barColor}} />
          </div>
          {status!=='ok' && <div className="mt-1 text-[11px]" style={{color:barColor}}>{status==='warn'?'Warning: nearing daily capacity':'Over capacity: consider moving tasks'}</div>}
        </div>
        <div className="divide-y">
          {slots.map((m)=>{
            const slotStart=addMinutes(day,m)
            const block=busy.find(b=>sameMinute(b.start, slotStart))
            if(block){
              const height=Math.max(40, Math.floor((block.duration/slotSize)*40))
              const color=calmap[block.calendar]?.color || '#334155'
              return (
                <div key={m} className="relative px-3 py-2" style={{height, background:`${color}20`}} draggable={block.type==='task'} onDragStart={(e)=> block.type==='task' && onDragStartTask(e,{taskId:block.taskId})}>
                  <div className="text-xs font-medium" style={{color}}>{humanTime(slotStart)} • {block.title}</div>
                  <div className="text-[10px] opacity-80" style={{color}}>{block.duration} min</div>
                </div>
              )
            }
            return (
              <div key={m} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${selectedTaskId?'cursor-pointer':'cursor-default'}`} onClick={()=>assignSelectedToSlot(day,m)} onDragOver={(e)=>{ if(selectedTaskId) e.preventDefault() }} onDrop={(e)=>onDropSlot(e,day,m)} title={selectedTaskId?'Place selected task here':'Select a task to place'}>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{humanTime(slotStart)}</span>
                  {!selectedTaskId && <span>—</span>}
                  {selectedTaskId && <span className="text-indigo-500">Place</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const doneToday=useMemo(()=>{
    const today=toKey(new Date())
    return tasks.filter(t=>t.done && t.scheduledStart && toKey(new Date(t.scheduledStart))===today).length
  }, [tasks])

  function updateCalendarEnabled(id, enabled){
    setSettings(s=>({...s, calendars:s.calendars.map(c=>c.id===id?{...c, enabled}:c)}))
    setFilterCalendars(prev=>{ const next=new Set(prev); if(enabled) next.add(id); else next.delete(id); return next })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold">Chaos Control — Smart Scheduler</h1>
        <span title="tiny colorful bomb" className="inline-flex items-center justify-center w-6 h-6 text-xs rounded-full" style={{background:'conic-gradient(from 45deg, #ef4444, #f59e0b, #10b981, #3b82f6, #a855f7, #ef4444)'}}>💣</span>
        <p className="text-gray-600 text-sm ml-auto">Local mode • {doneToday} done today</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <section className="border rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-3">New Task</h2>
            <form className="grid grid-cols-2 gap-3" onSubmit={(e)=>{e.preventDefault(); addTask(e.currentTarget);}}>
              <input name="title" placeholder="Task title" className="col-span-2 border rounded-lg px-3 py-2" />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Duration (min)</label>
                <input name="duration" type="number" defaultValue={60} min={5} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Due date</label>
                <input name="due" type="date" defaultValue={toKey(new Date())} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Priority</label>
                <select name="priority" defaultValue={2} className="w-full border rounded-lg px-3 py-2">
                  <option value={1}>High</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Recurrence</label>
                <select name="recurrence" defaultValue={'none'} className="w-full border rounded-lg px-3 py-2">
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Calendar</label>
                <select name="calendar" defaultValue={settings.activeCalendarId} className="w-full border rounded-lg px-3 py-2">
                  {settings.calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Depends on (optional)</label>
                <select name="dependson" className="w-full border rounded-lg px-3 py-2">
                  <option value="">— None —</option>
                  {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input name="flexible" type="checkbox" defaultChecked /> Flexible time
              </label>
              <div className="col-span-2 flex gap-2 flex-wrap">
                <button className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" type="submit">Add</button>
                <button className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" type="button" onClick={() => autoSchedule(false)}>Auto‑Schedule All</button>
                <button className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" type="button" onClick={clearAllSchedules}>Clear Schedules</button>
                <button className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" type="button" onClick={exportData}>Export JSON</button>
                <label className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer">
                  Import JSON
                  <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && importData(e.target.files[0])} />
                </label>
              </div>
            </form>
          </section>

          <section className="border rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-3">Fixed‑time Block</h2>
            <form className="grid grid-cols-2 gap-3" onSubmit={(e)=>{ e.preventDefault(); addBlock(e.currentTarget); }}>
              <input name="btitle" placeholder="Meeting / Appointment" className="col-span-2 border rounded-lg px-3 py-2" />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input name="bdate" type="date" defaultValue={toKey(new Date())} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start time</label>
                <input name="btime" type="time" className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Duration (min)</label>
                <input name="bduration" type="number" defaultValue={60} min={5} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Calendar</label>
                <select name="bcalendar" defaultValue={settings.activeCalendarId} className="w-full border rounded-lg px-3 py-2">
                  {settings.calendars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <button className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" type="submit">Add Block</button>
              </div>
            </form>
          </section>

          <section className="border rounded-2xl p-4 mb-6">
            <h2 className="font-semibold mb-3">Tasks</h2>
            {tasks.length === 0 && <div className="text-sm text-gray-500">No tasks yet. Add one above.</div>}
            {tasks.map(t => <TaskItem key={t.id} t={t} />)}
          </section>

          <section className="border rounded-2xl p-4">
            <h2 className="font-semibold mb-3">Settings</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Workday start</span>
                <input type="time" value={`${pad(Math.floor(settings.workStartMins/60))}:${pad(settings.workStartMins%60)}`} onChange={(e)=>{ const [h,m]=e.target.value.split(':').map(Number); setSettings(s=>({...s, workStartMins: minutes(h,m)})); }} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Workday end</span>
                <input type="time" value={`${pad(Math.floor(settings.workEndMins/60))}:${pad(settings.workEndMins%60)}`} onChange={(e)=>{ const [h,m]=e.target.value.split(':').map(Number); setSettings(s=>({...s, workEndMins: minutes(h,m)})); }} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Slot size (min)</span>
                <input type="number" min={5} step={5} value={settings.slotSize} onChange={(e)=> setSettings(s=>({...s, slotSize: clamp(parseInt(e.target.value||'0',10),5,240)}))} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={settings.preferMornings} onChange={(e)=> setSettings(s=>({...s, preferMornings: e.target.checked}))} /> Prefer mornings
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Buffer (min)</span>
                <input type="number" min={0} step={1} value={settings.bufferMins} onChange={(e)=> setSettings(s=>({...s, bufferMins: clamp(parseInt(e.target.value||'0',10),0,120)}))} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Daily capacity (min)</span>
                <input type="number" min={30} step={15} value={settings.dailyCapacityMins} onChange={(e)=> setSettings(s=>({...s, dailyCapacityMins: clamp(parseInt(e.target.value||'0',10),30,24*60)}))} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Warn at (%)</span>
                <input type="number" min={10} max={100} step={5} value={settings.warnThresholdPct} onChange={(e)=> setSettings(s=>({...s, warnThresholdPct: clamp(parseInt(e.target.value||'0',10),10,100)}))} className="border rounded-lg px-2 py-1" />
              </label>
              <label className="flex flex-col">
                <span className="text-xs text-gray-500 mb-1">Week starts on</span>
                <select value={settings.weekStartsOn} onChange={(e)=>{ const val=parseInt(e.target.value,10); setSettings(s=>({...s, weekStartsOn: val})); setAnchorDate(startOfWeek(new Date(), val)); }} className="border rounded-lg px-2 py-1">
                  <option value={1}>Monday</option>
                  <option value={0}>Sunday</option>
                </select>
              </label>
            </div>
            <div className="mt-4">
              <div className="font-medium mb-2">Calendars</div>
              <div className="flex flex-col gap-2">
                {settings.calendars.map(c => (
                  <label key={c.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: c.color }} /> {c.name}
                    </span>
                    <input type="checkbox" checked={filterCalendars.has(c.id)} onChange={(e)=> updateCalendarEnabled(c.id, e.target.checked)} />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-500">Done today: {doneToday}</div>
          </section>
        </div>

        <div className="lg:col-span-2">
          <section className="border rounded-2xl p-4 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(addMinutes(anchorDate, -7*1440))}>← Prev</button>
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(startOfWeek(new Date(), settings.weekStartsOn))}>Today</button>
              <button className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={()=> setAnchorDate(addMinutes(anchorDate, 7*1440))}>Next →</button>
            </div>
            <div className="text-sm text-gray-600">Week of {anchorDate.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}</div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700" onClick={()=> autoSchedule(false)}>Auto‑Schedule All</button>
              <button className={`px-3 py-2 rounded-lg ${selectedTaskId?"bg-emerald-600 text-white hover:bg-emerald-700":"bg-gray-100 text-gray-600"}`} onClick={()=> selectedTaskId && autoSchedule(true)} title="Auto‑place the selected task">Schedule Selected</button>
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {weekDays.map((d)=>( <CalendarDay key={d.toISOString()} day={d} /> ))}
          </section>

          <p className="mt-4 text-xs text-gray-500">Tips: Drag a task onto a calendar time to place it. Fixed‑time blocks act as busy time. Buffers are respected. Daily capacity bars warn when you're approaching or exceed your limit. Recurring tasks spawn a new copy when you mark them done. Dependencies ensure a task is placed only after its predecessor.</p>
        </div>
      </div>
    </div>
  )
}
