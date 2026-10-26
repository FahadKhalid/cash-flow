"""
Cash Flow: automated test suite.

Covers unit calculations, full UI journeys, corrupted/hostile data, fuzzing,
Google Drive sync failures (with a fake Drive), performance and layout.

Run:  pip install playwright && playwright install chromium
      python tests/test_cashflow.py
Exit code is 0 when every check passes, so it works in CI.
"""
import json, os, re, sys, time, threading, http.server, socketserver, random, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8799
RESULTS = []

class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(("127.0.0.1", PORT), Q)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{PORT}/index.html"

def check(name, cond, info=""):
    RESULTS.append((name, bool(cond), info))
    print(("  ✅ " if cond else "  ❌ ") + name + ("" if cond else f"   → {info}"))

def section(t): print(f"\n━━ {t}")

def unlock(pg, pin="1234"):
    """Get past the PIN lock: set a test PIN on first launch, or enter it when locked."""
    if not pg.locator("#lock").is_visible():
        return
    if "Set" in (pg.text_content("#lkT") or ""):
        for _ in range(2):
            pg.keyboard.type(pin); pg.keyboard.press("Enter"); pg.wait_for_timeout(150)
    else:
        pg.keyboard.type(pin)
        if not pg.evaluate("document.getElementById('lock').hidden"): pg.keyboard.press("Enter")
    pg.wait_for_function("document.getElementById('lock').hidden", timeout=20000)
    pg.wait_for_timeout(250)

def fresh(browser, w=1280, h=900, mobile=False, scheme="light", storage=None):
    ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, color_scheme=scheme, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept(getattr(pg, "_prompt", "")))
    pg.goto(URL); pg.wait_for_timeout(300); unlock(pg)
    if storage is not None:
        pg.evaluate("s=>{localStorage.clear();for(const k in s)localStorage.setItem(k,s[k])}", storage); pg.reload(); pg.wait_for_timeout(400); unlock(pg)
    return pg, errs

def month(inc=3000, ext=0, pas=0, exp=2000, sad=0, zp=0):
    return {"income": [{"n": "Salary", "a": inc}], "extra": [{"n": "Side", "a": ext}] if ext else [], "passive": [{"n": "Rent", "a": pas}] if pas else [],
            "expenses": [{"n": "Rent", "a": exp}], "sadaqah": sad, "zakatPaid": zp}

def bad_text(pg):
    t = pg.evaluate("document.body.innerText")
    return [w for w in ["NaN", "Infinity", "undefined", "[object Object]"] if re.search(r"\b" + re.escape(w) + r"\b", t)]

TABS = ["ov", "lr", "as", "rd", "go", "lg", "zk", "pj", "al", "gr"]

with sync_playwright() as P:
    B = P.chromium.launch()

    # ───────────────────────── UNIT ─────────────────────────
    section("Unit: money math")
    pg, errs = fresh(B)
    r = pg.evaluate("""()=>{S=migrate({});S.log={'2026-01':%s,'2026-02':%s,'2026-04':%s};
      V='m';NY=2026;NM=1;const m=agg(rangeKeys());V='q';const q=agg(rangeKeys());V='y';const y=agg(rangeKeys());V='a';const a=agg(rangeKeys());V='m';NM=3;const empty=rangeKeys().length;
      return{m,q,y,a,empty}}""" % (json.dumps(month(3000, 500, 100, 2000, 50, 0)), json.dumps(month(3000, 0, 100, 2500, 0, 300)), json.dumps(month(4000, 0, 0, 1000))))
    check("month totals", r["m"]["tin"] == 3600 and r["m"]["exp"] == 2000 and r["m"]["sv"] == 1550, r["m"])
    check("quarter excludes April", r["q"]["n"] == 2 and r["q"]["tin"] == 6700, r["q"])
    check("year includes all 3 months", r["y"]["n"] == 3 and r["y"]["tin"] == 10700, r["y"])
    check("savings rate", abs(r["y"]["rate"] - (10700 - 5500 - 350) / 10700) < 1e-9, r["y"]["rate"])
    check("empty month range", r["empty"] == 0)
    check("category aggregation", r["y"]["cat"]["Rent"] == 5500, r["y"]["cat"])
    r = pg.evaluate("""()=>{S=migrate({});const z=agg([]);const b=base();return{z,b}}""")
    check("agg of nothing is zero, not NaN", r["z"]["tin"] == 0 and r["z"]["rate"] == 0, r)
    check("base with no months", r["b"]["n"] == 0 and r["b"]["exp"] == 0)

    section("Unit: zakat")
    r = pg.evaluate("""()=>{S=migrate({});const a=zakatNow();S.assets={cash:10000,emergency:0,stocks:0,gold:0};const b=zakatNow();
      S.zakat.goldPrice=100;const c=zakatNow();S.assets.cash=8000;const d=zakatNow();
      S.port=[{id:'x',type:'plot',v:20000,own:50,zk:true},{id:'y',type:'rental',v:100000,own:100,zk:false}];S.assets.cash=0;const e=zakatNow();return{a,b,c,d,e}}""")
    check("no gold price → no zakat", r["a"]["due"] == 0 and r["b"]["due"] == 0, r["b"])
    check("above nisab → 2.5%", r["c"]["nis"] == 8500 and abs(r["c"]["due"] - 250) < 1e-9, r["c"])
    check("below nisab → 0", r["d"]["due"] == 0, r["d"])
    check("only zakat-marked assets count, by ownership", r["e"]["w"] == 10000 and abs(r["e"]["due"] - 250) < 1e-9, r["e"])

    section("Unit: assets (pocket test)")
    r = pg.evaluate("""()=>{const t=a=>{const p=pa(a);return[p.vd[0],Math.round(p.net),Math.round(p.val),Math.round(p.eq),+p.yld.toFixed(4)]};return{
      rental:t({type:'rental',v:200000,own:100,inc:1000,cost:200,lo:100000,lp:500}),
      half:t({type:'biz',v:100000,own:50,inc:2000,cost:400}),
      car:t({type:'vehicle',v:15000,own:100,cost:300,lp:250,lo:8000}),
      plot:t({type:'plot',v:50000,own:100}),
      junk:t({type:'nope',v:'abc',own:'x',inc:null}),
      over:t({type:'app',v:1000,own:250,inc:10}),
      neg:t({type:'app',v:-500,own:-20,inc:-5})}}""")
    check("rental with loan is an asset", r["rental"][:3] == ["asset", 300, 200000] and r["rental"][3] == 100000, r["rental"])
    check("50% ownership halves income and value", r["half"][1] == 800 and r["half"][2] == 50000, r["half"])
    check("car on finance is a liability", r["car"][0] == "liab" and r["car"][1] == -550, r["car"])
    check("idle plot is a store of value", r["plot"][0] == "store", r["plot"])
    check("garbage input never produces NaN", all(isinstance(x, (int, float, str)) and str(x) != "nan" for x in r["junk"]), r["junk"])
    check("ownership capped at 100%", r["over"][2] == 1000, r["over"])
    check("negative ownership clamps to 0", r["neg"][2] == 0 and r["neg"][1] == 0, r["neg"])

    section("Unit: net worth & projection")
    r = pg.evaluate("""()=>{S=migrate({});S.assets={cash:1000,emergency:2000,stocks:3000,gold:4000};S.bs.liab=[{n:'loan',v:500,p:50}];
      S.port=[{id:'a',type:'rental',v:100000,own:100,lo:60000,lp:400,g:3}];const nw=netWorth();
      S.log={'2026-01':%s};const p=project(base());S.proj.years=60;const p60=project(base());
      S.log={};const p0=project(base());return{nw,first:p.rows[0],len:p.rows.length,free:p.free,free60:p60.free,p0last:p0.rows.at(-1)}}""" % json.dumps(month(5000, 0, 1000, 2000)))
    check("net worth = everything owned − everything owed", r["nw"] == 1000 + 2000 + 3000 + 4000 + 100000 - 60000 - 500, r["nw"])
    check("projection length matches years", r["len"] == 20, r["len"])
    check("projection rows are finite numbers", all(isinstance(v, (int, float)) and v == v for v in r["first"].values()), r["first"])
    check("projection with no data doesn't crash", r["p0last"]["nw"] == r["p0last"]["nw"], r["p0last"])
    check("freedom year found when reachable", r["free60"] is not None and r["free60"] >= 1, r)

    section("Unit: sync merge")
    r = pg.evaluate("""()=>{const mk=()=>{const s=migrate({});return s};
      let L=mk(),R=mk();L.mt={'log:2026-01':10};L.log={'2026-01':{a:'L'}};R.mt={'log:2026-01':20};R.log={'2026-01':{a:'R'}};const newer=merge(L,R).log['2026-01'].a;
      L.mt={'log:2026-01':30};const localNewer=merge(L,R).log['2026-01'].a;
      L=mk();R=mk();L.log={'2026-02':{x:1}};L.mt={'log:2026-02':5};R.del={'log:2026-02':9};const del=merge(L,R).log['2026-02'];
      L=mk();R=mk();L.log={'2026-03':{x:1}};L.mt={'log:2026-03':10};R.del={'log:2026-03':5};const kept=!!merge(L,R).log['2026-03'];
      L=mk();R=mk();L.goals=[{id:'g1',n:'A'}];L.mt={'goal:g1':1};R.goals=[{id:'g2',n:'B'}];R.mt={'goal:g2':1};const union=merge(L,R).goals.map(g=>g.id).sort().join();
      L=mk();R=mk();R.port=[{id:'p1',type:'app',v:1}];R.mt={};const legacy=merge(L,R).port.length;
      L=mk();R=mk();L.nwHist={'2026-01':1};R.nwHist={'2026-02':2};const nwh=Object.keys(merge(L,R).nwHist).length;
      const A=mk();A.log={'2026-05':{q:1}};const B2=merge(merge(A,mk()),A);const idem=JSON.stringify(B2.log)===JSON.stringify(A.log);
      return{newer,localNewer,del,kept,union,legacy,nwh,idem}}""")
    check("newer remote edit wins", r["newer"] == "R")
    check("newer local edit wins", r["localNewer"] == "L")
    check("newer deletion removes item", r["del"] is None)
    check("older deletion doesn't remove newer edit", r["kept"])
    check("goals from both devices are kept", r["union"] == "g1,g2", r["union"])
    check("remote items without timestamps are adopted", r["legacy"] == 1)
    check("net worth history merged", r["nwh"] == 2)
    check("merge is idempotent", r["idem"])

    section("Unit: migration & data hygiene")
    r = pg.evaluate("""()=>{const v1=migrate({income:[{n:'Salary',a:100}],extra:[],passive:[],expenses:[{n:'R',a:50}],giving:{sadaqah:5,zakatPaid:0}});
      const bsMig=migrate({bs:{assets:[{n:'Shop',v:5000},{n:'zero',v:0}],liab:[]}});
      const junk=migrate({log:{'2026-01':{income:'x',expenses:null},'bad':5},goals:[{n:'G'},null,'x'],port:[{type:'app'},null],assets:{cash:'12'},learn:null,proj:'x'});
      return{v1:Object.keys(v1.log).length,v1inc:Object.values(v1.log)[0].income[0].a,bsMig:bsMig.port.map(p=>p.n),bsLeft:bsMig.bs.assets.length,
       junkLog:JSON.stringify(junk.log),junkGoals:junk.goals.length,junkPort:junk.port.length,cash:junk.assets.cash,learnOk:!!junk.learn&&typeof junk.learn.read==='object',projOk:typeof junk.proj==='object'}}""")
    check("v1 data upgrades to monthly log", r["v1"] == 1 and r["v1inc"] == 100, r)
    check("old balance-sheet assets move to portfolio", r["bsMig"] == ["Shop"] and r["bsLeft"] == 0, r)
    check("corrupt months are repaired, not crashing", "income" in r["junkLog"] and "bad" not in r["junkLog"], r["junkLog"])
    check("invalid goals/assets are dropped", r["junkGoals"] == 1 and r["junkPort"] == 1, r)
    check("numbers stored as text are normalized", r["cash"] == 12, r["cash"])
    check("missing sections are restored", r["learnOk"] and r["projOk"], r)

    section("Unit: chart engine")
    r = pg.evaluate("""()=>[ticks(0,0),ticks(-50,100),ticks(0,1e9).length<=8,ticks(1.5,1.5).length>1]""")
    check("tick generation handles flat, negative and huge ranges", r[0][0] == 0 and r[1][0] <= -50 and r[1][-1] >= 100 and r[2] and r[3], r)
    check("no runtime errors in unit section", not errs, errs[:3])
    pg.context.close()

    # ───────────────────── INTEGRATION (UI) ─────────────────────
    section("Integration: first run is empty")
    pg, errs = fresh(B, storage={})
    check("starts with zero data", pg.evaluate("Object.keys(S.log).length+S.goals.length+S.port.length") == 0)
    check("welcome card visible", pg.is_visible("#ovWel"))
    check("guide progress 0/10", pg.evaluate("stepState().filter(x=>x.done).length") == 0)
    for t in TABS:
        pg.evaluate(f"showTab('{t}')"); pg.wait_for_timeout(120)
    check("every tab renders empty data without NaN/undefined", not bad_text(pg), bad_text(pg))

    section("Integration: log a month through the UI")
    pg.evaluate("showTab('ov')"); pg.wait_for_timeout(150); pg.click("#ovWel [data-go=lg]"); pg.wait_for_timeout(200)
    pg.click("#mEdit button:has-text('Start empty')"); pg.wait_for_timeout(200)
    pg.locator("#mEdit .panel").nth(0).locator(".row input[type=number]").first.fill("4000")
    pg.locator("#mEdit .panel").nth(3).locator(".row input[type=number]").first.fill("1500")
    pg.locator("#mEdit .panel").nth(4).locator("input").nth(0).fill("100")
    pg.wait_for_timeout(600)
    pg.evaluate("showTab('ov')"); pg.wait_for_timeout(900)
    check("overview shows typed income", pg.inner_text("#sIn") == "€4,000", pg.inner_text("#sIn"))
    check("overview shows saved amount", pg.inner_text("#sSv") == "€2,400", pg.inner_text("#sSv"))
    check("welcome card hides after first month", not pg.is_visible("#ovWel"))
    pg.evaluate("flushWrites()")
    check("saved to device", json.loads(pg.evaluate("LS.get('cashflow:data:'+PID)"))["log"] != {})
    check("saved data is encrypted on disk", (pg.evaluate("localStorage.getItem('cashflow:data:'+PID)") or "").startswith("enc1:"))
    pg.evaluate("showTab('lg')"); pg.click("#next"); pg.wait_for_timeout(200)
    pg.click("#mEdit button:has-text('Copy from')"); pg.wait_for_timeout(300)
    check("copy previous month works", pg.evaluate("Object.keys(S.log).length") == 2)
    for v in ["q", "y", "a"]:
        pg.click(f"#view button[data-v={v}]"); pg.wait_for_timeout(150)
    pg.evaluate("showTab('ov')"); pg.wait_for_timeout(900)
    check("all time view sums both months", pg.inner_text("#sIn") == "€8,000", pg.inner_text("#sIn"))
    pg.click("#view button[data-v=m]")
    for _ in range(14): pg.click("#next")
    for _ in range(28): pg.click("#prev")
    check("navigating across years doesn't break", not errs and pg.inner_text("#navL") != "", errs[:2])
    pg.evaluate("showTab('lg')"); pg.wait_for_timeout(150)
    pg.on("dialog", lambda d: None)
    pg.evaluate("NY=now.getFullYear();NM=now.getMonth()+2>12?1:now.getMonth()+2;renderEditor()")

    section("Integration: goals, assets, zakat, plans")
    pg.evaluate("showTab('go')"); pg.click("#glAdd"); pg.wait_for_timeout(200)
    g = pg.locator(".goal").first
    g.locator(".top input").fill("Umrah"); g.locator("[data-f=t]").fill("6000"); g.locator("[data-f=s]").fill("1500"); pg.wait_for_timeout(400)
    check("goal progress shows 25%", "25%" in pg.inner_text(".goal .a"), pg.inner_text(".goal .a"))
    pg.evaluate("showTab('as')"); pg.click("#asAdd"); pg.wait_for_timeout(200); pg.click("#atC button:has-text('Shop')"); pg.wait_for_timeout(200)
    pg.fill("#af-n", "Shop A"); pg.fill("#af-v", "90000"); pg.fill("#af-inc", "800"); pg.fill("#af-cost", "100"); pg.click("#aSave"); pg.wait_for_timeout(400)
    check("asset saved with verdict", pg.locator(".acard").count() == 1 and "Asset" in pg.inner_text(".acard"))
    pg.click(".acard"); pg.wait_for_timeout(200); pg.fill("#af-inc", "50"); pg.click("#aSave"); pg.wait_for_timeout(300)
    check("editing asset flips verdict to liability", "Liability" in pg.inner_text(".acard"), pg.inner_text(".acard"))
    pg.evaluate("showTab('rd')"); pg.wait_for_timeout(200)
    check("Rich Dad view lists the asset", "Shop A" in pg.inner_text("#rdA"))
    pg.evaluate("showTab('zk')"); pg.fill("#a-cash", "20000"); pg.fill("#a-gp", "90"); pg.wait_for_timeout(400)
    check("zakat due computed from inputs", pg.inner_text("#zD") == "€500", pg.inner_text("#zD"))
    pg.evaluate("showTab('pj')"); pg.click("#yrBtns button[data-y='30']"); pg.wait_for_timeout(300)
    check("projection updates to 30 years", pg.evaluate("project(base()).rows.length") == 30)
    pg.evaluate("showTab('al')"); pg.click(".presets button[data-pr=grow]"); pg.wait_for_timeout(200)
    check("savings preset applied", pg.evaluate("S.alloc.stocks") == 65 and pg.inner_text("#alT") == "100%")
    pg.evaluate("showTab('gr')"); pg.fill("#wExt", "1000"); pg.dispatch_event("#wExt", "input"); pg.wait_for_timeout(200)
    check("what-if responds", pg.inner_text("#wExtV") == "€1,000")
    check("no errors in core flows", not errs, errs[:3])

    section("Integration: Learn, quizzes and games")
    pg.evaluate("showTab('lr')"); pg.fill("#lPur", "By 2035 I will have 300,000 in halal investments paying 1,500 a month."); pg.wait_for_timeout(400)
    check("purpose completes step 1", pg.evaluate("stepState()[0].done"))
    pg.locator(".lcard").first.click(); pg.wait_for_timeout(200); pg.click("#lessonC .btn"); pg.wait_for_timeout(300)
    check("lesson marked read", pg.evaluate("Object.keys(S.learn.read).length") == 1)
    pg.evaluate("LTP('Saving').forEach(l=>S.learn.read[l.id]=1);change(true)"); pg.wait_for_timeout(300)
    pg.click("#lQuiz .qcard:has-text('Saving')"); pg.wait_for_timeout(200)
    for i in range(4):
        c = pg.evaluate(f"TQ['Saving'][{i}][2]"); pg.locator(".qopts button").nth(c).click(); pg.wait_for_timeout(80); pg.click("#qNext"); pg.wait_for_timeout(120)
    check("quiz awards badge", pg.evaluate("S.learn.quiz['Saving']") == 4)
    pg.click("#qClose")
    pg.click(".gcard:has-text('Asset or liability')"); pg.wait_for_timeout(200)
    pg.click("#playX"); pg.click(".gcard:has-text('Asset or liability')"); pg.wait_for_timeout(1300)
    t1 = int(pg.inner_text("#spT")); pg.wait_for_timeout(2100); t2 = int(pg.inner_text("#spT"))
    check("speed-game timer runs once after reopening (no double timer)", 1 <= t1 - t2 <= 3, (t1, t2))
    pg.click("#playX")
    pg.click(".gcard:has-text('Cashflow Challenge')"); pg.wait_for_timeout(200)
    for _ in range(31):
        if pg.locator(".qend").count(): break
        pg.locator(".cfo.l button").first.click() if pg.locator(".cfo.l button").count() else None
        pg.click("#cfN"); pg.wait_for_timeout(40)
    check("Cashflow Challenge ends after 30 years even when only buying liabilities", pg.locator(".qend").count() == 1)
    pg.click("#cfC")
    for gname in ["The snowball", "Early vs late", "Cost of a habit"]:
        pg.click(f".gcard:has-text('{gname}')"); pg.wait_for_timeout(250)
        for sl in pg.locator("#playC input[type=range]").all():
            sl.fill(sl.get_attribute("max")); sl.fill(sl.get_attribute("min"))
        pg.click("#playX")
    check("simulators handle slider extremes", not bad_text(pg) and not errs, errs[:3])
    pg.click("#mQuizB"); pg.wait_for_timeout(150)
    for _ in range(5): pg.locator(".qopts button").first.click(); pg.wait_for_timeout(60)
    check("mindset self-check completes", pg.locator(".qend").count() == 1); pg.click("#mqC")

    section("Integration: backup, profiles, settings")
    pg.click("#setB"); pg.wait_for_timeout(150)
    with pg.expect_download() as dl: pg.click("#exp")
    path = dl.value.path(); data = json.load(open(path))
    check("export contains everything", all(k in data for k in ["log", "goals", "port", "assets", "learn"]))
    pg.click("#setX")
    pg._prompt = "Aisha"; pg.click("#profB"); pg.click("#profAdd"); pg.wait_for_timeout(400)
    check("new profile starts empty", pg.evaluate("Object.keys(S.log).length+S.port.length+S.goals.length") == 0)
    pg.set_input_files("#impF", path); pg.wait_for_timeout(500)
    check("import restores data into profile", pg.evaluate("S.port.length") == 1 and pg.evaluate("Object.keys(S.log).length") == 2)
    open(os.path.join(tempfile.gettempdir(), "bad.json"), "w").write("{not json")
    pg.set_input_files("#impF", os.path.join(tempfile.gettempdir(), "bad.json")); pg.wait_for_timeout(300)
    check("broken backup file is rejected safely", pg.evaluate("S.port.length") == 1)
    pg.click("#profB"); pg.locator(".prow .pn").first.click(); pg.wait_for_timeout(300)
    check("switching back keeps profiles separate", pg.evaluate("prof().name") == "Me" and pg.evaluate("S.goals.length") == 1)
    pg.click("#thB"); pg.wait_for_timeout(100); th1 = pg.evaluate("document.documentElement.dataset.theme"); pg.click("#thB"); th2 = pg.evaluate("document.documentElement.dataset.theme")
    check("theme toggle switches", th1 != th2 and th1 in ("dark", "light"))
    pg._prompt = "ERASE"; pg.click("#setB"); pg.click("#wipeB"); pg.wait_for_timeout(400)
    check("erase resets profile to zero", pg.evaluate("Object.keys(S.log).length+S.port.length+S.goals.length") == 0)
    pg.reload(); pg.wait_for_timeout(400); unlock(pg)
    check("erase persists after reload", pg.evaluate("Object.keys(S.log).length") == 0)
    check("no errors in backup/profile flows", not errs, errs[:3])
    pg.context.close()


    section("Unit + UI: investments (buy / update / sell / dividend)")
    pg, errs = fresh(B, storage={})
    r = pg.evaluate("""()=>{S=migrate({});S.currency='PKR';
      const h={id:'s',type:'stock',n:'PSX stocks',tx:[{k:'buy',amt:100000,d:'2026-08'},{k:'val',amt:80000,d:'2026-09'},{k:'val',amt:110000,d:'2026-10'}]};
      const a=invCalc(h);h.tx.push({k:'sell',amt:60000,pct:50,d:'2026-10'});const b=invCalc(h);
      const g={id:'g',type:'gold',tx:[{k:'buy',amt:5000,u:10,d:'2026-08'},{k:'buy',amt:3000,u:5,d:'2026-09'},{k:'sell',amt:2800,u:5,d:'2026-10'}]};const c=invCalc(g);
      const z={id:'z',type:'stock',tx:[{k:'buy',amt:1000,d:'2026-01'},{k:'sell',amt:1200,pct:100,d:'2026-02'},{k:'div',amt:50,d:'2026-02'}]};const d=invCalc(z);
      S.inv=[h,g];invSync();return{a,b,c,d,stocks:S.assets.stocks,gold:S.assets.gold}}""")
    check("Aug 1 lakh → Sep 80k → Oct 1.1 lakh = +10k (+10%)", r["a"]["value"] == 110000 and r["a"]["gain"] == 10000 and abs(r["a"]["pct"] - .1) < 1e-9, r["a"])
    check("value history kept per month", r["a"]["hist"] == {"2026-08": 100000, "2026-09": 80000, "2026-10": 110000}, r["a"]["hist"])
    check("selling half: cost halves, profit realized", r["b"]["value"] == 55000 and r["b"]["cost"] == 50000 and r["b"]["real"] == 10000, r["b"])
    check("gold by grams: average cost on sale", abs(r["c"]["units"] - 10) < 1e-9 and abs(r["c"]["cost"] - 16000/3) < 1e-6 and abs(r["c"]["real"] - (2800 - 8000/3)) < 1e-6, r["c"])
    check("full sale + dividend", r["d"]["value"] == 0 and r["d"]["real"] == 200 and r["d"]["div"] == 50, r["d"])
    check("investments feed stocks & gold totals", r["stocks"] == 55000 and r["gold"] == 5333, r)
    pg.evaluate("S=migrate({});S.assets.cash=200000;renderAll();showTab('as')")
    pg.click("#invAdd"); pg.click("#ivT button[data-k=stock]"); pg.fill("#iv-n", "Meezan fund"); pg.fill("#iv-a", "100000"); pg.click("#ivS"); pg.wait_for_timeout(300)
    check("UI: add investment, cash reduced", pg.evaluate("S.inv.length") == 1 and pg.evaluate("S.assets.cash") == 100000)
    pg.click(".acard.inv"); pg.click(".ivact [data-a=val]"); pg.fill("#iv-a", "80000"); pg.click("#ivOk"); pg.wait_for_timeout(250)
    pg.click(".ivact [data-a=val]"); pg.fill("#iv-a", "110000"); pg.fill("#iv-d", "2026-12"); pg.click("#ivOk"); pg.wait_for_timeout(250)
    check("UI: value updates show gain", "+" in pg.inner_text(".ivg") and pg.evaluate("invCalc(S.inv[0]).gain") == 10000, pg.evaluate("invCalc(S.inv[0])"))
    pg.click(".ivact [data-a=sell]"); pg.fill("#iv-a", "60000"); pg.evaluate("$('iv-p').value=50;$('iv-p').dispatchEvent(new Event('input'))"); pg.fill("#iv-d", "2026-12"); pg.click("#ivOk"); pg.wait_for_timeout(250)
    check("UI: sale adds cash and realizes profit", pg.evaluate("S.assets.cash") == 160000 and pg.evaluate("invCalc(S.inv[0]).real") == 10000, pg.evaluate("[S.assets.cash,invCalc(S.inv[0])]"))
    pg.click(".ivact [data-a=div]"); pg.fill("#iv-a", "500"); pg.click("#ivOk"); pg.wait_for_timeout(250)
    check("UI: dividend lands in passive income", any(x["a"] == 500 for x in pg.evaluate("S.log[curM()].passive")))
    pg.click("#ivClose"); pg.evaluate("showTab('zk')"); pg.wait_for_timeout(200)
    check("zakat tab locks stocks field to investments", pg.is_disabled("#a-st") and pg.input_value("#a-st") == str(pg.evaluate("S.assets.stocks")))
    check("no errors in investments", not errs, errs[:3])
    pg.context.close()

    section("Spending check-up")
    pg, errs = fresh(B, storage={})
    r = pg.evaluate("""()=>{S=migrate({});S.log[curM()]={income:[{n:'Salary',a:3000}],extra:[],passive:[],expenses:[{n:'Netflix',a:15},{n:'Spotify',a:10},{n:'Eating out',a:200},{n:'Cigarettes',a:300},{n:'Rent',a:900}],sadaqah:0,zakatPaid:0};
      S.coach={coffee:4};const R=coachScan();const g=k=>R.find(x=>x.k===k);return{subs:g('subs').m,eat:g('eat').m,smoke:g('smoke').save,coffee:Math.round(g('coffee').m),rent:R.some(x=>x.items.includes('Rent'))}}""")
    check("detects subscriptions, eating out, smoking from expense names", r["subs"] == 25 and r["eat"] == 200 and r["smoke"] == 300, r)
    check("manual daily habit converted to monthly", r["coffee"] == 122, r)
    check("normal expenses not flagged", not r["rent"])
    pg.evaluate("ANIM=false;showTab('ov')"); pg.wait_for_timeout(300)
    check("overview shows savings tip", pg.is_visible("#ovSave") and "save about" in pg.inner_text("#ovSave"))
    pg.click("#ovSave"); pg.wait_for_timeout(300); pg.click("#coachUse"); pg.wait_for_timeout(300)
    check("savings move into What-if", int(pg.evaluate("$('wCut').value")) > 0)
    check("no errors in check-up", not errs, errs[:3])
    pg.context.close()


    section("Old sample data is always removed (every legacy format)")
    DM={"income":[{"n":"Salary (net)","a":4500}],"extra":[{"n":"Freelance","a":600},{"n":"Agency","a":400}],"passive":[{"n":"Dividends","a":50}],"expenses":[{"n":"Rent","a":1300},{"n":"Food","a":500},{"n":"Transport","a":120},{"n":"Utilities & phone","a":220},{"n":"Family support","a":400},{"n":"Other","a":300}],"sadaqah":100,"zakatPaid":0}
    DMr={"zakatPaid":0,"sadaqah":100,"expenses":DM["expenses"][::-1],"passive":DM["passive"],"extra":DM["extra"][::-1],"income":DM["income"]}
    GOALS=[{"id":"a","n":"Emergency fund top-up","ic":"🛟","t":15000,"s":5000,"d":"2027-06"},{"id":"b","n":"Umrah","ic":"🕋","t":5000,"s":0,"d":"2027-12"},{"id":"c","n":"House down payment","ic":"🏠","t":60000,"s":0,"d":"2030-12"}]
    AS={"cash":8000,"emergency":5000,"stocks":6000,"gold":3000}
    mine=json.loads(json.dumps(DM));mine["income"][0]["a"]=4700
    P=lambda *ids:json.dumps([{"id":i,"name":n} for i,n in ids])
    CASES={
     "v1 (very first version) legacy key":{"cashflow":json.dumps({"currency":"EUR","income":DM["income"],"extra":DM["extra"],"passive":DM["passive"],"expenses":DM["expenses"],"giving":{"sadaqah":100,"zakatPaid":0},"assets":AS,"zakat":{"goldPrice":95}})},
     "v2 log in legacy key":{"cashflow":json.dumps({"v":2,"log":{"2026-10":DM},"assets":AS,"goals":GOALS,"zakat":{"goldPrice":95}})},
     "already flagged clean (worst case)":{"cashflow:profiles":P(("p","Me")),"cashflow:active":"p","cashflow:data:p":json.dumps({"v":2,"demoClean":1,"log":{"2026-10":DM},"assets":AS,"goals":GOALS,"zakat":{"goldPrice":95},"nwHist":{"2026-10":22000},"learn":{"done":{},"read":{}},"mt":{"log:2026-10":0},"del":{}})},
     "reordered keys, copied to 3 months":{"cashflow:profiles":P(("p","Me")),"cashflow:active":"p","cashflow:data:p":json.dumps({"log":{"2026-08":DMr,"2026-09":DM,"2026-10":DM},"assets":AS})},
     "two profiles both with sample":{"cashflow:profiles":P(("p","Me"),("q","Aisha")),"cashflow:active":"p","cashflow:data:p":json.dumps({"log":{"2026-10":DM},"assets":AS}),"cashflow:data:q":json.dumps({"log":{"2026-10":DM},"assets":AS,"goals":GOALS})},
    }
    for name, store in CASES.items():
        pg, errs = fresh(B, storage=store); pg.wait_for_timeout(900)
        st = pg.evaluate("({m:Object.keys(S.log).length,g:S.goals.length,nw:netWorth(),prog:stepState().filter(x=>x.done).length,gp:S.zakat.goldPrice})")
        others = pg.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('cashflow:data:')).map(k=>{const o=JSON.parse(LS.get(k));return Object.keys(o.log||{}).length+(o.goals||[]).length+(+o.assets?.cash||0)})")
        check(f"sample removed: {name}", st == {"m": 0, "g": 0, "nw": 0, "prog": 0, "gp": 0} and all(x == 0 for x in others) and not errs, (st, others, errs[:1]))
        pg.context.close()
    pg, errs = fresh(B, storage={"cashflow:profiles": P(("p", "Me")), "cashflow:active": "p", "cashflow:data:p": json.dumps({"log": {"2026-10": DM, "2026-09": mine}, "assets": {"cash": 8100, "emergency": 5000, "stocks": 6000, "gold": 3000}, "goals": GOALS + [{"id": "x", "n": "My car", "t": 9000, "s": 0}]})})
    r = pg.evaluate("({m:Object.keys(S.log),g:S.goals.map(x=>x.n),cash:S.assets.cash})")
    check("user's own edited data is never removed", r == {"m": ["2026-09"], "g": ["My car"], "cash": 8100}, r)
    pg.context.close()

    # ───────────────────── ROBUSTNESS ─────────────────────
    section("Robustness: corrupted & hostile data")
    for label, store in [
        ("invalid JSON in storage", {"cashflow:profiles": "[{\"id\":\"p\",\"name\":\"Me\"}]", "cashflow:active": "p", "cashflow:data:p": "{oops"}),
        ("profiles list corrupted", {"cashflow:profiles": "not json", "cashflow:data:x": "{}"}),
        ("wrong types everywhere", {"cashflow:profiles": "[{\"id\":\"p\",\"name\":\"Me\"}]", "cashflow:active": "p",
            "cashflow:data:p": json.dumps({"log": {"2026-01": {"income": [{"n": 5, "a": "abc"}], "expenses": "x", "sadaqah": "y"}}, "goals": [{"n": None, "t": "z", "s": None, "d": 7}], "port": [{"type": "rental", "v": "lots", "own": None}], "assets": None, "bs": {"liab": [{"v": "a", "p": None}]}, "currency": "XYZ"})}),
        ("script injection in names", {"cashflow:profiles": "[{\"id\":\"p\",\"name\":\"<img src=x onerror=window.HACK=1>\"}]", "cashflow:active": "p",
            "cashflow:data:p": json.dumps({"log": {"2026-01": {"income": [{"n": "<img src=x onerror=window.HACK=1>", "a": 1}], "expenses": [], "extra": [], "passive": []}}, "goals": [{"id": "g", "n": "<script>window.HACK=1</script>", "t": 1, "s": 0, "d": "2030-01"}], "port": [{"id": "a", "type": "app", "n": "<img src=x onerror=window.HACK=1>", "v": 1, "own": 100}], "learn": {"purpose": "<img src=x onerror=window.HACK=1>"}})}),
    ]:
        pg, errs = fresh(B, storage=store)
        for t in TABS: pg.evaluate(f"showTab('{t}')"); pg.wait_for_timeout(60)
        pg.evaluate("showTab('lg')"); pg.wait_for_timeout(100)
        check(f"{label}: app loads, no crash", not [e for e in errs if "console" not in e], errs[:2])
        check(f"{label}: no NaN/undefined on screen", not bad_text(pg), bad_text(pg))
        if "injection" in label: check("injected HTML never executes", not pg.evaluate("!!window.HACK"))
        pg.context.close()

    section("Robustness: random fuzzing (40 rounds)")
    pg, errs = fresh(B, storage={})
    random.seed(7)
    def rv(): return random.choice([0, -1, 1, 1e9, -1e9, 0.5, 1234, "", "12", None, 99999999])
    fails = []
    for i in range(40):
        s = {"log": {f"20{random.randint(20,30)}-{random.randint(1,12):02d}": {"income": [{"n": "a", "a": rv()}], "extra": [{"n": "b", "a": rv()}], "passive": [{"n": "c", "a": rv()}], "expenses": [{"n": "d", "a": rv()}], "sadaqah": rv(), "zakatPaid": rv()} for _ in range(random.randint(0, 6))},
             "assets": {"cash": rv(), "emergency": rv(), "stocks": rv(), "gold": rv()}, "zakat": {"goldPrice": rv()},
             "port": [{"id": f"p{j}", "type": random.choice(list("x") + ["plot", "rental", "app", "vehicle", "biz"]), "v": rv(), "own": rv(), "inc": rv(), "cost": rv(), "lo": rv(), "lp": rv(), "g": rv()} for j in range(random.randint(0, 5))],
             "goals": [{"id": f"g{j}", "n": "g", "t": rv(), "s": rv(), "d": random.choice(["", "2030-01", "1999-01", "x"])} for j in range(random.randint(0, 3))],
             "inv": [{"id": f"i{j}", "type": random.choice(["stock", "gold", "x"]), "tx": [{"k": random.choice(["buy", "sell", "val", "div", "zz"]), "amt": rv(), "u": rv(), "pct": rv(), "d": random.choice(["2026-01", "bad", None])} for _ in range(random.randint(0, 5))]} for j in range(random.randint(0, 3))], "coach": {"smoke": rv(), "subs": rv()},
             "proj": {"years": random.choice([1, 60, 0, -5, 999, "x"]), "incomeGrowth": rv(), "inflation": rv(), "stockReturn": rv(), "goldReturn": rv()},
             "alloc": {"emMonths": rv(), "stocks": rv(), "gold": rv(), "housing": rv(), "travel": rv(), "other": rv()}}
        pg.evaluate("d=>{S=migrate(d);ANIM=false;renderAll()}", s)
        for t in random.sample(TABS, 4): pg.evaluate(f"showTab('{t}')")
        b = bad_text(pg)
        if b or errs: fails.append((i, b, errs[:1])); errs.clear()
    check("40 random datasets render without crash or NaN", not fails, fails[:3])
    pg.context.close()

    section("Robustness: sync failures (fake Google Drive)")
    DRIVE = {}; MODE = {"m": "ok"}
    def handle(route):
        req = route.request; u = req.url
        if "gsi/client" in u:
            return route.fulfill(body="window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>setTimeout(()=>o.callback({access_token:'t',expires_in:3600}),5)}),revoke(){}}}}", content_type="text/javascript")
        if MODE["m"] == "500": return route.fulfill(status=500, body="err")
        if MODE["m"] == "401": return route.fulfill(status=401, body="expired")
        if MODE["m"] == "garbage" and "alt=media" in u: return route.fulfill(body="<html>not json", content_type="text/html")
        if "/about" in u: return route.fulfill(json={"user": {"emailAddress": "t@example.com"}})
        if "/upload/" in u and req.method == "POST":
            b2 = req.post_data; DRIVE["f"] = b2.split("\r\n\r\n")[2].rsplit("\r\n--", 1)[0]; return route.fulfill(json={"id": "f"})
        if "/upload/" in u and req.method == "PATCH": DRIVE["f"] = req.post_data; return route.fulfill(json={"id": "f"})
        if "alt=media" in u: return route.fulfill(body=DRIVE["f"], content_type="application/json")
        if "/drive/v3/files?" in u: return route.fulfill(json={"files": [{"id": k} for k in DRIVE]})
        route.continue_()
    ctx = B.new_context(); ctx.route(re.compile(r".*(googleapis|accounts\.google)\.com.*"), handle)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(300); unlock(pg); pg.evaluate("localStorage.setItem('cashflow:clientId','x.apps.googleusercontent.com')")
    pg.evaluate("connectGoogle()"); pg.wait_for_timeout(600)
    check("sync connects", pg.evaluate("SST") == "ok", pg.evaluate("SST"))
    MODE["m"] = "500"; pg.evaluate("S.assets.cash=111;change()"); pg.wait_for_timeout(2600)
    check("server error → 'sync failed', data still saved locally", pg.evaluate("SST") == "error" and json.loads(pg.evaluate("LS.get('cashflow:data:'+PID)"))["assets"]["cash"] == 111)
    MODE["m"] = "401"; pg.evaluate("syncNow()"); pg.wait_for_timeout(500)
    check("expired login → 'tap to sync', no crash", pg.evaluate("SST") == "signin")
    MODE["m"] = "ok"; pg.evaluate("getToken().then(syncNow)"); pg.wait_for_timeout(700)
    check("recovers after sign-in, local edit uploaded", pg.evaluate("SST") == "ok" and json.loads(DRIVE["f"])["assets"]["cash"] == 111)
    MODE["m"] = "garbage"; pg.evaluate("syncNow()"); pg.wait_for_timeout(500)
    check("garbage from server doesn't corrupt local data", pg.evaluate("S.assets.cash") == 111 and pg.evaluate("SST") in ("error", "ok"))
    MODE["m"] = "ok"
    ctx.set_offline(True); pg.evaluate("dispatchEvent(new Event('offline'))"); pg.evaluate("S.assets.gold=5;change()"); pg.wait_for_timeout(2600)
    check("offline → saved locally, status offline", pg.evaluate("SST") == "offline")
    ctx.set_offline(False); pg.evaluate("dispatchEvent(new Event('online'))"); pg.wait_for_timeout(800)
    check("back online → syncs automatically", pg.evaluate("SST") == "ok" and json.loads(DRIVE["f"])["assets"]["gold"] == 5)
    check("no errors during sync failures", not errs, errs[:3])
    ctx.close()

    # ───────────────────── PERFORMANCE ─────────────────────
    section("Performance: 15 years of data, 100 assets, 50 goals")
    pg, errs = fresh(B, storage={})
    t0 = time.time()
    pg.evaluate("""()=>{const d={log:{},port:[],goals:[]};for(let y=2012;y<2027;y++)for(let m=1;m<=12;m++)d.log[y+'-'+String(m).padStart(2,'0')]={income:[{n:'S',a:4000}],extra:[{n:'E',a:500}],passive:[{n:'P',a:300}],expenses:Array.from({length:12},(_,i)=>({n:'C'+i,a:100+i})),sadaqah:50,zakatPaid:0};
      for(let i=0;i<100;i++)d.port.push({id:'p'+i,type:['rental','app','plot','biz','shop'][i%5],n:'Asset '+i,v:10000+i,own:100,inc:100,cost:20,g:2});
      for(let i=0;i<50;i++)d.goals.push({id:'g'+i,n:'Goal '+i,t:1000,s:i*10,d:'2030-01'});S=migrate(d);saveLocal();renderAll()}""")
    times = pg.evaluate("""()=>{const t=[];for(let i=0;i<10;i++){const a=performance.now();ANIM=false;render();t.push(performance.now()-a)}return t.sort((a,b)=>a-b)[5]}""")
    check(f"one full re-render is fast ({times:.1f} ms median)", times < 120, times)
    tab_t = pg.evaluate("""()=>{const a=performance.now();for(const t of %s)showTab(t);return (performance.now()-a)/%d}""" % (json.dumps(TABS), len(TABS)))
    check(f"tab switch is fast ({tab_t:.1f} ms avg)", tab_t < 80, tab_t)
    pg.reload(); pg.wait_for_timeout(100); unlock(pg)
    load = pg.evaluate("performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd")
    check(f"page ready quickly with big data ({load:.0f} ms)", load < 1500, load)
    size = pg.evaluate("localStorage.getItem('cashflow:data:'+PID).length")
    check(f"storage size stays reasonable ({size/1024:.0f} KB)", size < 2_000_000, size)
    pg.evaluate("showTab('lg')")
    inp = pg.locator("#mEdit input[type=number]").first
    t0 = time.time(); inp.type("123456789", delay=0); typing = (time.time() - t0) * 1000
    check(f"typing stays responsive with big data ({typing:.0f} ms for 9 keys)", typing < 2500, typing)
    check("no errors with big data", not errs, errs[:2])
    pg.context.close()

    # ───────────────────── RESPONSIVE ─────────────────────
    section("Responsive: no horizontal scroll, 10 widths × 10 tabs × dialogs")
    issues = []
    for w, mob in [(320, 1), (360, 1), (390, 1), (430, 1), (768, 1), (820, 0), (900, 0), (1024, 0), (1280, 0), (1440, 0)]:
        pg, errs = fresh(B, w=w, h=800, mobile=bool(mob))
        pg.evaluate("S=migrate({});S.log[ck(2026,10)]={income:[{n:'Salary with a very long name for testing',a:123456789}],extra:[],passive:[],expenses:[{n:'Expense with a really long label',a:98765432}],sadaqah:0,zakatPaid:0};S.port=[{id:'a',type:'shop',n:'A very very long asset name that keeps going',v:999999999,own:100,inc:12345,cost:1}];renderAll()")
        for t in TABS:
            pg.evaluate(f"showTab('{t}')"); pg.wait_for_timeout(60)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            if sw > w: issues.append((w, t, sw))
        for d in ["setD", "syncD", "profD", "moreD", "lessonD", "atD", "playD", "invD"]:
            pg.evaluate(f"document.getElementById('{d}').showModal()"); pg.wait_for_timeout(40)
            if pg.evaluate(f"document.getElementById('{d}').scrollWidth>document.getElementById('{d}').clientWidth+1"): issues.append((w, d))
            pg.evaluate(f"document.getElementById('{d}').close()")
        if pg.evaluate("document.querySelector('.brand').getBoundingClientRect().right>document.querySelector('.acts').getBoundingClientRect().left+1"): issues.append((w, "header overlap"))
        if pg.evaluate("[...document.querySelectorAll('.acts .ibtn')].some(b=>b.getBoundingClientRect().height>46)"): issues.append((w, "header button wraps"))
        if errs: issues.append((w, "errors", errs[:1]))
        pg.context.close()
    check("layout never overflows, even with huge numbers and long names", not issues, issues[:5])

    section("Accessibility basics")
    pg, errs = fresh(B, storage={})
    unnamed = pg.evaluate("""()=>[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&!(b.textContent.trim()||b.getAttribute('aria-label')||b.title)).length""")
    check("every visible button has a name", unnamed == 0, unnamed)
    unl = pg.evaluate("""()=>[...document.querySelectorAll('input:not([type=hidden]):not([type=file]),select,textarea')].filter(i=>i.offsetParent&&!(i.labels?.length||i.getAttribute('aria-label')||i.placeholder)).length""")
    check("every visible input is labelled", unl == 0, unl)
    pg.context.close()
    B.close()

passed = sum(1 for r in RESULTS if r[1]); total = len(RESULTS)
print(f"\n{'='*50}\n{passed}/{total} passed" + ("  🎉" if passed == total else ""))
for n, ok, info in RESULTS:
    if not ok: print("  FAILED:", n, info)
srv.shutdown()
sys.exit(0 if passed == total else 1)
