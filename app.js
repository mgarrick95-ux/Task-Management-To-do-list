// Chaos Control base app — minimal version for demo
const LS_TASKS = "cc_tasks_v33";
let tasks = JSON.parse(localStorage.getItem(LS_TASKS) || "[]");

const save = () => localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
const render = () => {
  const cal = document.getElementById("calendar");
  const uns = document.getElementById("unscheduled");
  cal.innerHTML = "";
  uns.innerHTML = "";

  // Make simple week calendar
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayId = d.toISOString().split("T")[0];
    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.innerHTML = `<strong>${d.toDateString()}</strong>`;

    const dayTasks = tasks.filter(t => t.dayLock === dayId);
    for (const t of dayTasks) {
      const el = document.createElement("div");
      el.className = "cc-block" + (t.done ? " done" : "");
      el.textContent = t.title;
      el.dataset.id = t.id;
      dayDiv.appendChild(el);
    }
    cal.appendChild(dayDiv);
  }

  const unsched = tasks.filter(t => !t.dayLock);
  for (const t of unsched) {
    const el = document.createElement("div");
    el.className = "cc-block";
    el.textContent = t.title;
    el.dataset.id = t.id;
    uns.appendChild(el);
  }
};

document.getElementById("addTask").addEventListener("click", () => {
  const title = document.getElementById("taskTitle").value.trim();
  if (!title) return;
  const h = parseInt(document.getElementById("taskHours").value) || 0;
  const m = parseInt(document.getElementById("taskMinutes").value) || 0;
  const dur = h * 60 + m;
  const id = Date.now().toString();
  tasks.push({ id, title, duration: dur, calendar: "work" });
  save();
  render();
});

document.getElementById("autoSchedule").addEventListener("click", () => {
  const today = new Date();
  for (const t of tasks.filter(t => !t.dayLock)) {
    const d = new Date(today);
    d.setDate(today.getDate() + Math.floor(Math.random() * 3)); // spread over next 3 days
    t.dayLock = d.toISOString().split("T")[0];
  }
  save();
  render();
});

render();
