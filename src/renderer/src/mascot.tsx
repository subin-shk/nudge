/** Entry point for the transparent desktop-mascot window. */

import { createRoot } from 'react-dom/client'
import { MascotApp } from './features/mascot/MascotApp'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

// No StrictMode here: its double-invocation of effects would start two animation
// loops and two blink schedulers in development, which makes the mascot's timing
// impossible to tune by eye.
createRoot(container).render(<MascotApp />)
