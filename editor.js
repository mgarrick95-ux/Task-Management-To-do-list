// Editor modal with reschedule buttons
(function(){
  const Q=(s,el=document)=>el.querySelector(s);
  function inject(){
    if(Q("#taskEditor")) return;
    const d=document.createElement("div");
    d.innerHTML = `
<div id="taskEditor" class="mc-modal" aria-hidden="true">
  <div class="mc-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="mcEditTitle">
    <div class="mc-modal__header">
      <h2 id="mcEditTitle">Edit task</h2>
      <button class="mc-btn mc-btn--ghost" id="mcCloseEditor" aria-label="Close">✕</button>
    </div>
    <div class="mc-modal__body">
      <label class="mc-field"><span>Title</span><input id="mcEdit_title" type="text"/></label>
      <div class="mc-field-grid">
        <label class="mc-field"><span>Hours</span><input id="mcEdit_hours" type="number" min="0" step="1"/></label>
        <label class="mc-field"><span>Minutes</span><input id="mcEdit_minutes" type="number" min="0" step="5"/></label>
        <label class="mc-field"><span>Priority</span>
          <select id="mcEdit_priority"><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select>
        </label>
      </div>
      <label class="mc-field"><span>Calendar</span>
        <select id="mcEdit_calendar"><option value="Work">Work</option><option value="Home">Home</option></select>
      </label>
      <label class="mc-field mc-field--row"><input id="mcEdit_done" type="checkbox"/><span>Mark complete</span></label>
      <div class="mc-field-grid">
        <label class="mc-field"><span>Date</span><input id="mcEdit_date" type="date"/></label>
        <label class="mc-field"><span>Time</span><input id="mcEdit_time" type="time"/></label>
        <div></div>
      </div>
      <div class="mc-field-grid">
        <button class="mc-btn" id="mcShift1">+1 day</button>
        <button class="mc-btn" id="mcShift2">+2 days</button>
        <button class="mc-btn" id="mcShift7">+1 week</button>
      </div>
    </div>
    <div class="mc-modal__footer">
      <button class="mc-btn mc-btn--danger" id="mcDeleteTask">Delete</button>
      <div class="mc-spacer"></div>
      <button class="mc-btn mc-btn--ghost" id="mcUnscheduleTask">Unschedule</button>
      <button class="mc-btn" id="mcSaveTask">Save</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(d.firstElementChild);
  }
  function show(on){ Q("#taskEditor").setAttribute("aria-hidden", on?"false":"true"); }

  let EDIT=null;
  function openEditor(id){
    const tasks = (window.getTasks && window.getTasks()) || [];
    const t = tasks.find(x=> String(x.id)===String(id) || String(x.id)===String(id.id)); if(!t) return;
    EDIT = t.id;
    Q("#mcEdit_title").value = t.title||"";
    const mins = t.duration||30;
    Q("#mcEdit_hours").value = Math.floor(mins/60)|0;
    Q("#mcEdit_minutes").value = mins%60;
    Q("#mcEdit_priority").value = t.priority||"Medium";
    Q("#mcEdit_calendar").value = t.calendar||"Work";
    Q("#mcEdit_done").checked = !!t.done;
    if(t.scheduledAt){
      Q("#mcEdit_date").value = t.scheduledAt.slice(0,10);
      Q("#mcEdit_time").value = t.scheduledAt.slice(11,16);
    }else{
      Q("#mcEdit_date").value = ""; Q("#mcEdit_time").value = "";
    }
    show(true);
  }
  window.openEditor = openEditor;

  function wire(){
    Q("#mcCloseEditor").addEventListener("click", ()=> show(false));
    Q("#taskEditor").addEventListener("click", e=>{ if(e.target.id==="taskEditor") show(false); });

    Q("#mcSaveTask").addEventListener("click", ()=>{
      if(!EDIT) return;
      const tasks = (window.getTasks && window.getTasks()) || [];
      const t = tasks.find(x=> String(x.id)===String(EDIT)); if(!t) return;
      t.title = Q("#mcEdit_title").value.trim() || t.title;
      const h = parseInt(Q("#mcEdit_hours").value)||0;
      const m = parseInt(Q("#mcEdit_minutes").value)||0;
      t.duration = Math.max(0, h*60 + m);
      t.priority = Q("#mcEdit_priority").value||t.priority;
      t.calendar = Q("#mcEdit_calendar").value||t.calendar;
      t.done = Q("#mcEdit_done").checked;
      const d = Q("#mcEdit_date").value, tm = Q("#mcEdit_time").value;
      if(d && tm){ t.scheduledAt = `${d}T${tm}`; }
      else if(d && !tm){ t.scheduledAt = `${d}T09:00`; }
      (window.setTasks && window.setTasks(tasks));
      show(false); EDIT=null;
    });

    Q("#mcDeleteTask").addEventListener("click", ()=>{
      if(!EDIT) return;
      let tasks = (window.getTasks && window.getTasks()) || [];
      tasks = tasks.filter(x=> String(x.id)!==String(EDIT));
      (window.setTasks && window.setTasks(tasks));
      show(false); EDIT=null;
    });

    Q("#mcUnscheduleTask").addEventListener("click", ()=>{
      if(!EDIT) return;
      const tasks = (window.getTasks && window.getTasks()) || [];
      const t = tasks.find(x=> String(x.id)===String(EDIT)); if(!t) return;
      t.scheduledAt = null;
      (window.setTasks && window.setTasks(tasks));
      show(false); EDIT=null;
    });

    const shift = (days)=>{
      if(!EDIT) return;
      const tasks = (window.getTasks && window.getTasks()) || [];
      const t = tasks.find(x=> String(x.id)===String(EDIT)); if(!t || !t.scheduledAt){
        alert("Schedule it first, then you can bump it.");
        return;
      }
      const d = new Date(t.scheduledAt.slice(0,10));
      d.setDate(d.getDate()+days);
      const key = d.toISOString().slice(0,10);
      t.scheduledAt = `${key}${t.scheduledAt.slice(10)}`;
      (window.setTasks && window.setTasks(tasks));
    };
    Q("#mcShift1").onclick = ()=>shift(1);
    Q("#mcShift2").onclick = ()=>shift(2);
    Q("#mcShift7").onclick = ()=>shift(7);
  }

  function init(){
    inject();
    wire();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();