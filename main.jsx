import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.js'
import './styles.css' // if you have styles.css in the repo root

const root = createRoot(document.getElementById('root'))
root.render(<App />)
