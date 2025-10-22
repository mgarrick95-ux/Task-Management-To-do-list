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
const LS_TASKS="cc_tasks_v2", LS_BLOCKS="cc_blocks_v2", LS_SETTINGS="cc_settings_v2"
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
  const [settings, setSettings] =
