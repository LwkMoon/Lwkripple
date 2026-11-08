"""Real-browser checks for lwkripple (headless Chromium + SwiftShader WebGL2)."""
import base64, json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
import io

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / 'test' / '.tmp'
pic = base64.b64encode((TMP / 'pic.png').read_bytes()).decode()
PIC = f'data:image/png;base64,{pic}'
lib = (ROOT / 'dist' / 'lwkripple.global.js').read_text()

HTML = f"""<!doctype html><meta charset=utf8><body style="margin:0;background:#0b1620;font:16px sans-serif;color:#fff">
<section id=hero style="height:300px;width:800px;background:linear-gradient(#0b2540,#14507a);padding:20px;box-sizing:border-box">
  <h1 id=title style="margin:0">Hero text</h1><a id=link href="#clicked" style="color:#9cf">a real link</a></section>
<button id=btn style="margin:20px;padding:18px 48px;border:0;border-radius:999px;background:#1d6fa5;color:#fff;font-size:18px">Buy now</button>
<div id=bgsec style="height:260px;width:600px;background:url({PIC}) center/cover;color:#fff;padding:10px;box-sizing:border-box">bg section</div>
<div style="width:600px"><img id=pic src="{PIC}" style="width:100%;display:block" crossorigin=anonymous></div>
<section id=auto data-lwkripple="rain" data-lwkripple-intensity="1.2" style="height:160px;width:500px;background:#123"></section>
<script>window.__errors=[];window.addEventListener('error',e=>__errors.push(String(e.message)));</script>
<script>{lib}</script></body>"""

def shot(page, sel):
    return Image.open(io.BytesIO(page.locator(sel).screenshot())).convert('RGB')

def diff(a, b):
    d = ImageChops.difference(a, b).convert('L')
    h = d.histogram()
    return sum(i * c for i, c in enumerate(h)) / (a.size[0] * a.size[1])

results = []
def check(name, ok, info=''):
    results.append((name, ok, info))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  [{info}]' if info else ''))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 900, 'height': 1100})
    logs = []
    page.on('console', lambda m: logs.append((m.type, m.text)))
    page.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    page.set_content(HTML)
    page.wait_for_function('window.Lwkripple')
    page.wait_for_timeout(300)

    sup = page.evaluate('Lwkripple.supported()')
    check('WebGL2 available in test browser', sup['webgl'], json.dumps(sup))

    # ---- auto-init via data attribute
    n = page.evaluate("document.querySelectorAll('#auto canvas[data-lwkripple-canvas]').length")
    check('data-lwkripple auto-init mounts a canvas', n == 1, f'canvases={n}')

    # ---- section, procedural water (default), WebGL
    page.evaluate("window.c1 = Lwkripple.ripple('#hero', {preset:'pond'})")
    page.wait_for_timeout(200)
    check('section uses webgl renderer', page.evaluate('c1.renderer') == 'webgl', page.evaluate('c1.renderer'))
    calm = shot(page, '#hero')
    page.evaluate('c1.drop(300,150,1.4); c1.drop(520,90,1)')
    page.wait_for_timeout(450)
    wet = shot(page, '#hero'); wet.save(TMP / 'hero_wet.png')
    d = diff(calm, wet)
    check('procedural ripple changes the pixels', d > 0.3, f'mean diff {d:.2f}')
    # settle -> back to calm, loop sleeps
    page.wait_for_timeout(9000)
    settled = shot(page, '#hero')
    check('ripples fade back to calm', diff(calm, settled) < diff(calm, wet) * 0.35, f'settled diff {diff(calm, settled):.2f}')

    # ---- content stays clickable and on top
    page.evaluate("location.hash=''")
    page.click('#link')
    check('links inside the section stay clickable', page.evaluate('location.hash') == '#clicked')
    z = page.evaluate("""(()=>{const c=document.querySelector('#hero canvas');const t=document.getElementById('title');
      const r=t.getBoundingClientRect();const top=document.elementFromPoint(r.left+5,r.top+5);return [getComputedStyle(c).zIndex, top&&top.id]})()""")
    check('canvas sits under the content', z[0] == '-1' and z[1] == 'title', json.dumps(z))

    # ---- hover + click create ripples
    page.evaluate("c1.clear()"); page.wait_for_timeout(150)
    calm2 = shot(page, '#hero')
    box = page.locator('#hero').bounding_box()
    page.mouse.move(box['x'] + 100, box['y'] + 200)
    for i in range(12):
        page.mouse.move(box['x'] + 100 + i * 35, box['y'] + 200 - i * 6)
        page.wait_for_timeout(16)
    page.wait_for_timeout(250)
    check('hover trail makes ripples', diff(calm2, shot(page, '#hero')) > 0.2)
    page.evaluate("c1.clear()"); page.wait_for_timeout(150)
    calm3 = shot(page, '#hero')
    page.mouse.click(box['x'] + 400, box['y'] + 180)
    page.wait_for_timeout(300)
    check('click makes a ripple', diff(calm3, shot(page, '#hero')) > 0.2)

    # ---- canvas fallback renderer
    page.evaluate("c1.destroy(); window.c2 = Lwkripple.ripple('#hero', {preset:'pond', renderer:'canvas'})")
    page.wait_for_timeout(200)
    check('forced canvas renderer works', page.evaluate('c2.renderer') == 'canvas')
    calm4 = shot(page, '#hero')
    page.evaluate('c2.drop(300,150,1.4)'); page.wait_for_timeout(450)
    wet4 = shot(page, '#hero'); wet4.save(TMP / 'hero_canvas.png')
    check('canvas renderer ripples', diff(calm4, wet4) > 0.3, f'{diff(calm4, wet4):.2f}')
    page.evaluate('c2.destroy()')

    # ---- image refraction on CSS background ('auto')
    page.evaluate("window.c3 = Lwkripple.ripple('#bgsec', {preset:'pond', image:'auto'})")
    page.wait_for_timeout(500)
    imgcalm = shot(page, '#bgsec')
    page.evaluate('c3.drop(300,130,1.6); c3.drop(150,80,1.2)')
    page.wait_for_timeout(420)
    imgwet = shot(page, '#bgsec'); imgwet.save(TMP / 'bg_refract.png')
    check('image refraction renders (webgl)', page.evaluate('c3.renderer') == 'webgl' and diff(imgcalm, imgwet) > 1.0, f'{diff(imgcalm, imgwet):.2f}')
    page.evaluate('c3.destroy()')

    # ---- <img> as a target (wrapper + hidden source), then clean unwrap
    before = page.evaluate("document.getElementById('pic').parentElement.outerHTML")
    page.evaluate("window.c4 = Lwkripple.ripple('#pic', 'ocean')")
    page.wait_for_timeout(600)
    wrapped = page.evaluate("!!document.querySelector('[data-lwkripple-wrap] #pic')")
    hidden = page.evaluate("getComputedStyle(document.getElementById('pic')).opacity")
    page.evaluate('c4.drop(300,200,2)'); page.wait_for_timeout(500)
    Image.open(io.BytesIO(page.locator('[data-lwkripple-wrap]').screenshot())).save(TMP / 'img_target.png')
    check('<img> target wraps and hides the source', wrapped and hidden == '0', f'wrapped={wrapped} opacity={hidden}')
    page.evaluate('c4.destroy()')
    after = page.evaluate("document.getElementById('pic').parentElement.outerHTML")
    op = page.evaluate("getComputedStyle(document.getElementById('pic')).opacity")
    norm = lambda h: h.replace(' ', '').replace(';"', '"')
    check('destroy() restores the image and DOM', norm(before) == norm(after) and op == '1', f'opacity={op}')

    # ---- button
    page.evaluate("window.c5 = Lwkripple.ripple('#btn', {preset:'glass', color:'rgba(120,200,255,0.25)'})")
    page.wait_for_timeout(250)
    bcalm = shot(page, '#btn')
    bb = page.locator('#btn').bounding_box()
    page.mouse.click(bb['x'] + 40, bb['y'] + 20)
    page.wait_for_timeout(250)
    bwet = shot(page, '#btn'); bwet.save(TMP / 'button.png')
    check('button ripples on click', diff(bcalm, bwet) > 0.3, f'{diff(bcalm, bwet):.2f}')
    page.evaluate("c5.clear()"); page.wait_for_timeout(200)
    hcalm = shot(page, '#btn')
    for i in range(10):
        page.mouse.move(bb['x'] + 10 + i * 16, bb['y'] + 10 + (i % 3) * 8); page.wait_for_timeout(16)
    page.wait_for_timeout(200)
    check('button is click-only (hover leaves it calm)', diff(hcalm, shot(page, '#btn')) < 0.15, f'{diff(hcalm, shot(page, "#btn")):.3f}')
    page.evaluate('c5.destroy()')

    # ---- page code that wipes the host's children must not kill the effect
    page.evaluate("window.c8 = Lwkripple.ripple('#btn', 'glass'); document.getElementById('btn').textContent = 'Changed label'")
    page.wait_for_timeout(200)
    back = page.evaluate("document.querySelectorAll('#btn canvas[data-lwkripple-canvas]').length")
    check('canvas re-attaches after textContent/innerHTML wipes the host', back == 1, f'canvases in button={back}')
    page.evaluate("document.getElementById('btn').innerHTML = '<b>again</b>'"); page.wait_for_timeout(150)
    check('...and again after innerHTML', page.evaluate("document.querySelectorAll('#btn canvas[data-lwkripple-canvas]').length") == 1)
    page.evaluate("c8.destroy()")
    check('destroy() still removes it for good', page.evaluate("document.querySelectorAll('#btn canvas[data-lwkripple-canvas]').length") == 0)

    # ---- fullscreen
    page.evaluate("window.c6 = Lwkripple.ripple('fullscreen', {preset:'storm'})")
    page.wait_for_timeout(1200)
    fs = page.evaluate("(()=>{const c=[...document.querySelectorAll('canvas[data-lwkripple-canvas]')].find(x=>getComputedStyle(x).position==='fixed');const r=c.getBoundingClientRect();return [r.width,r.height,getComputedStyle(c).pointerEvents,c.width,c.height]})()")
    check('fullscreen canvas covers viewport, never blocks input', fs[0] == 900 and fs[1] == 1100 and fs[2] == 'none', json.dumps(fs))
    page.screenshot(path=str(TMP / 'fullscreen.png'))
    page.evaluate('c6.destroy()')
    left = page.evaluate("document.querySelectorAll('canvas[data-lwkripple-canvas]').length")
    check('destroy() removes fullscreen canvas', left == 1, f'remaining canvases (the data-attr one) = {left}')

    # ---- update + preset switching + resize
    page.evaluate("window.c7 = Lwkripple.ripple('#hero', 'rain')")
    page.wait_for_timeout(400)
    page.evaluate("c7.setPreset('storm'); c7.update({intensity:1.5, color:'#06304f'})")
    page.set_viewport_size({'width': 700, 'height': 1100})
    page.evaluate("document.getElementById('hero').style.width='500px'")
    page.wait_for_timeout(500)
    cw = page.evaluate("document.querySelector('#hero canvas').width")
    check('resize rebuilds the water', cw >= 400, f'canvas px width {cw}')
    page.wait_for_timeout(600)
    shot(page, '#hero').save(TMP / 'hero_storm.png')
    page.evaluate('c7.destroy()')

    # ---- bad inputs don't throw
    r = page.evaluate("""(()=>{try{const a=Lwkripple.ripple('#nope');const b=Lwkripple.ripple('#hero',{preset:'wat'});b.destroy();
      let msg='';try{Lwkripple.ripple(document.createElement('input'))}catch(e){msg=e.message}
      return [a.renderer, msg]}catch(e){return ['threw '+e.message]}})()""")
    check('unknown target/preset fail soft, <input> gives a clear error', r[0] == 'none' and 'cannot hold' in r[1], json.dumps(r))

    errs = [l for l in logs if l[0] in ('error', 'pageerror')]
    warns = [l for l in logs if l[0] == 'warning']
    check('no console errors', not errs, json.dumps(errs)[:300])
    if warns: print('warnings seen:', [w[1][:90] for w in warns])
    b.close()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} passed')
sys.exit(1 if failed else 0)
