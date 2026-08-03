/** Entry point for the full-screen break overlay windows (one per display). */

import { createRoot } from 'react-dom/client'
import { BreakOverlay } from './features/break/BreakOverlay'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container missing')

createRoot(container).render(<BreakOverlay />)
