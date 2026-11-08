// Entry for the <script> tag build: exposes window.Lwkripple and wires up data-lwkripple attributes.
import ripple, { autoInit, presets, supported, version } from './index'

export { ripple, autoInit, presets, supported, version }
export default ripple

if (typeof window !== 'undefined' && !(window as unknown as { LWKRIPPLE_NO_AUTO?: boolean }).LWKRIPPLE_NO_AUTO) {
  const run = (): void => { autoInit() }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run)
  else run()
}
