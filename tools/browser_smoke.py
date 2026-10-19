"""Functional browser checks against the actual bundled HTML. No external server."""
import json
import os
import shutil
import tempfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
server = ThreadingHTTPServer(("127.0.0.1", 0), partial(SimpleHTTPRequestHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p, tempfile.TemporaryDirectory() as scratch:
        executable = os.environ.get("CHROMIUM_EXECUTABLE") or shutil.which("chromium")
        browser = p.chromium.launch(**({"executable_path": executable} if executable else {}), headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://127.0.0.1:{server.server_port}", wait_until="networkidle")
        assert page.locator('meta[name="game-version"]').get_attribute("content") == "0.4.0"
        page.locator('.quick-start-more summary').first.click()
        page.locator('#start [data-act="cx-settings"]').click()
        page.locator('[data-act="closemodal"]').click()
        assert page.evaluate('UI.modal === null && G === null')
        page.locator('[data-act="opt"][data-g="scenario"][data-v="sandbox"]').click()
        page.locator('.cx-start-options summary').click()
        page.locator('#cx-full').check()
        page.locator('#cx-seed').fill('42')
        page.locator('#gobtn').click()
        page.locator('#hud').wait_for(state="visible")
        page.locator('[data-act="tutgo"]').click()
        page.evaluate('G.paused=true; UI.tut=-1; updateTutorial()')
        page.locator('[data-act="cx-advisor"]').click()
        assert page.locator('.cx-card').count() > 0
        if os.environ.get('SMOKE_ARTIFACT_DIR'):
            target=Path(os.environ['SMOKE_ARTIFACT_DIR']);target.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(target/'desktop.png'))
        for tab in ['budget', 'forces', 'treaties', 'reports', 'decisions', 'history', 'achievements', 'guide', 'settings', 'changes', 'advisor']:
            page.locator(f'[data-act="tab"][data-m="command"][data-t="{tab}"]').click()
            assert page.locator('#modal .mb').inner_text().strip(), tab
        print('PASS: all headquarters tabs render')
        page.locator('[data-t="budget"][data-m="command"]').click()
        page.locator('#cx-tax').fill('120')
        page.locator('[data-act="cx-tax"]').click()
        assert page.evaluate('G.C[G.player].tax') == 1.2
        page.locator('[data-act="closemodal"]').click()
        page.locator('[data-act="cx-search"]').click()
        page.locator('#cx-search').fill('Варшава')
        assert page.locator('#cx-search-results button').count() > 0
        page.locator('#cx-search-results button').first.click()
        assert page.evaluate('PROV[SEL.prov].name') == 'Варшава'
        print('PASS: real budget action and city search')
        page.locator('#campaign-bar [data-act="cx-settings"]').click()
        page.locator('[data-cx-pref="theme"]').select_option('light')
        page.locator('[data-cx-pref="font"]').fill('16')
        page.locator('[data-cx-pref="font"]').dispatch_event('change')
        assert page.evaluate('getComputedStyle(document.body).fontSize') == '16px'
        page.locator('[data-cx-key="advisor"]').fill('N')
        page.locator('[data-cx-key="advisor"]').dispatch_event('change')
        page.locator('[data-act="closemodal"]').click()
        page.keyboard.press('n')
        assert page.evaluate('UI.modal === "command" && UI.tab.command === "advisor"')
        print('PASS: persistent preferences, font size, remapped keyboard')
        page.evaluate('''() => {
          closeModal(); const ids=unitsOf(G.player).filter(u=>UNITS[u.t].dom==='land').slice(0,3).map(u=>u.id);
          selectUnits(ids,false);
        }''')
        page.keyboard.press('Control+1')
        assert page.evaluate('G.campaign.groups[0].ids.length') == 3
        page.locator('[data-act="cx-stance"][data-s="defend"]').click()
        assert page.evaluate('[...SEL.units].every(id=>G.U.get(id).hold)')
        page.evaluate('''() => {
          G.paused=true; for(let h=0;h<48;h++)tick(); refreshHUD(true);
        }''')
        assert page.evaluate('G.hour') == 48
        page.locator('#campaign-bar [data-act="cx-settings"]').click()
        with page.expect_download() as info:
            page.locator('[data-act="cx-export"]').click()
        save_path = Path(scratch) / 'save.json'
        info.value.save_as(save_path)
        exported = json.loads(save_path.read_text())
        assert exported['v'] == 2 and exported['hour'] == 48
        page.evaluate('tick()')
        with page.expect_file_chooser() as info:
            page.locator('#modal [data-act="cx-import"]').click()
        info.value.set_files(save_path)
        page.wait_for_function('G.hour === 48 && UI.modal === null')
        assert page.evaluate('G.C[G.player].tax') == 1.2
        assert page.evaluate('G.campaign.groups[0].ids.length') == 3
        print('PASS: downloadable versioned save imports through the real file picker')
        page.locator('#campaign-bar [data-act="cx-settings"]').click()
        invalid_path = Path(scratch) / 'invalid.json'
        invalid_path.write_text('{"v":999}')
        with page.expect_file_chooser() as info:
            page.locator('#modal [data-act="cx-import"]').click()
        info.value.set_files(invalid_path)
        page.wait_for_function('document.querySelector("#toasts").textContent.includes("неподдерживаемая версия")')
        assert page.evaluate('G.hour') == 48
        page.evaluate('closeModal(); PREF.theme="dark";PREF.font=13;PREF.lowPower=true;applyPreferences();')
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator('#campaign-bar [data-act="cx-settings"]').click()
        assert page.locator('#modal').bounding_box()['width'] <= 390
        page.locator('[data-act="closemodal"]').click()
        page.evaluate('MV.mode="supply"; updateModeBtns(); MV.dirty=true;')
        page.wait_for_timeout(300)
        rail=page.locator('#leftbar').bounding_box();bar=page.locator('#campaign-bar').bounding_box();legend=page.locator('#legend').bounding_box()
        assert bar['x'] >= rail['x']+rail['width']
        assert legend['y'] >= bar['y']+bar['height']
        page.evaluate('hideTip()')
        page.screenshot(path=str(Path(os.environ.get('SMOKE_ARTIFACT_DIR', scratch)) / 'mobile.png'))
        assert not errors, errors
        print('PASS: invalid import preserves game, mobile layout, supply layer, no JS exceptions')
        page.goto(f"http://127.0.0.1:{server.server_port}", wait_until="networkidle")
        page.locator('#cs').fill('Польша')
        page.locator('#clist [data-act="startselect"]').first.click()
        page.locator('#gobtn').click()
        page.locator('[data-act="tutgo"]').click()
        page.evaluate('G.paused=true')
        assert page.evaluate('G.opts.casual === true && G.opts.supply === false')
        assert page.locator('#tb-res .rchip').count() == 3
        assert page.locator('#leftbar button').count() == 3
        assert page.locator('#prov-panel [data-t="cruise"]').count() == 0
        assert page.evaluate('[...G.U.values()].every(u=>UNITS[u.t].dom!=="msl")')
        before = page.evaluate('G.U.size')
        page.locator('#prov-panel [data-act="queue"][data-t="inf"]').click()
        assert page.evaluate('G.pv[SEL.prov].q.length') == 1
        page.evaluate('for(let i=0;i<12;i++)tick();refreshHUD(true)')
        assert page.evaluate('G.U.size') > before
        page.locator('#tb-right [data-m="menu"]').click()
        assert page.locator('#modal [data-act="optauto"]').count() == 0
        page.locator('#modal [data-act="closemodal"]').first.click()
        if os.environ.get('SMOKE_ARTIFACT_DIR'):
            page.screenshot(path=str(Path(os.environ['SMOKE_ARTIFACT_DIR'])/'quick.png'))
        assert not errors, errors
        print('PASS: default quick play: 3 resources, 3 sections, no missiles, fast recruitment, short menu')
        browser.close()
finally:
    server.shutdown()
