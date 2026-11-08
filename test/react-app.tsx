import { createElement as h, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Ripple, useRipple } from '../src/react'
import type { RippleController } from '../src/types'

function App() {
  const [preset, setPreset] = useState<'pond' | 'storm'>('pond')
  const [show, setShow] = useState(true)
  const ctl = useRef<RippleController | null>(null)
  const hooked = useRipple<HTMLElement>('rain')
  ;(window as any).api = { setPreset, setShow, ctl }
  return h('div', null,
    show && h(Ripple, { ref: ctl, preset, id: 'r1', style: { height: 200, width: 400 } } as any, h('p', { id: 'kid' }, 'child')),
    h('section', { ref: hooked, id: 'r2', style: { height: 120, width: 300 } }, 'hook'))
}
createRoot(document.getElementById('app')!).render(h(App))
