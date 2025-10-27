import React, { useState } from 'react'

export default function App() {
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')

  const addTask = () => {
    if (newTask.trim() === '') return
    setTasks([...tasks, { text: newTask, done: false }])
    setNewTask('')
  }

  const toggleTask = (index) => {
    const updated = tasks.map((t, i) =>
      i === index ? { ...t, done: !t.done } : t
    )
    setTasks(updated)
  }

  const clearCompleted = () => {
    setTasks(tasks.filter(t => !t.done))
  }

  return (
    <div
      style={{
        fontFamily: 'Poppins, sans-serif',
        padding: '40px',
        maxWidth: '600px',
        margin: '0 auto',
        background: '#121212',
        color: '#fff',
        borderRadius: '16px',
        boxShadow: '0 0 25px rgba(0,0,0,0.3)'
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '1rem' }}>
        💣 Chaos Control — Smart Scheduler (Base)
      </h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: '#1e1e1e',
            color: '#fff',
          }}
        />
        <button
          onClick={addTask}
          style={{
            padding: '10px 20px',
            background: '#ff007f',
            border: 'none',
            borderRadius: '6px',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>

      {tasks.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#aaa' }}>No tasks yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tasks.map((task, index) => (
            <li
              key={index}
              onClick={() => toggleTask(index)}
              style={{
                padding: '10px',
                borderBottom: '1px solid #333',
                cursor: 'pointer',
                textDecoration: task.done ? 'line-through' : 'none',
                color: task.done ? '#888' : '#fff',
              }}
            >
              {task.text}
            </li>
          ))}
        </ul>
      )}

      {tasks.some((t) => t.done) && (
        <button
          onClick={clearCompleted}
          style={{
            marginTop: '1rem',
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: 'none',
            background: '#444',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Clear Completed
        </button>
      )}
    </div>
  )
}
