"""React component + hook check. Build first: npx esbuild test/react-app.tsx --bundle --format=iife --outfile=test/.tmp/react-app.js --define:process.env.NODE_ENV=\"production\" --define:__VERSION__=\"0.1.0\""""
from pathlib import Path
from playwright.sync_api import sync_playwright
app = Path(__file__).resolve().parent.joinpath('.tmp', 'react-app.js').read_text()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.set_content(f'<div id=app></div><script>{app}</script>'); pg.wait_for_timeout(600)
    q = pg.evaluate
    assert q("document.querySelectorAll('#r1 canvas[data-lwkripple-canvas]').length") == 1
    assert q("document.querySelectorAll('#r2 canvas[data-lwkripple-canvas]').length") == 1
    q("api.setPreset('storm')"); pg.wait_for_timeout(300)
    assert q("document.querySelectorAll('#r1 canvas').length") == 1
    q("api.setShow(false)"); pg.wait_for_timeout(300)
    assert q("document.querySelectorAll('canvas[data-lwkripple-canvas]').length") == 1
    assert not errs, errs
    print('react ok'); b.close()
