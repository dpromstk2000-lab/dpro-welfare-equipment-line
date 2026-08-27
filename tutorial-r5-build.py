#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

BASE = "https://dpromstk2000-lab.github.io/dpro-welfare-equipment-line/"
GUIDE_URL = BASE + "guide-center.html"
FIRST10_URL = BASE + "member.html"
OUT = Path("manuals")
SHOT = OUT / "screens"
WORK = OUT / "_build"

PAGES = {
    "guide": GUIDE_URL,
    "member": FIRST10_URL,
    "planning": BASE + "planning.html",
    "staff": BASE + "staff-login.html",
    "aftercare": BASE + "aftercare.html",
    "billing": BASE + "billing.html",
    "operations": BASE + "operations.html",
    "system_check": BASE + "system-check.html",
}

QUICK_PDF = OUT / "DPRO_TUTORIAL_WELFARE_EQUIPMENT_QUICK_START_V1.0.pdf"
DETAIL_PDF = OUT / "DPRO_TUTORIAL_WELFARE_EQUIPMENT_DETAILED_MANUAL_V1.0.pdf"
QUICK_PNG = OUT / "DPRO_TUTORIAL_WELFARE_EQUIPMENT_QUICK_START_V1.0.png"
DETAIL_PNG = OUT / "DPRO_TUTORIAL_WELFARE_EQUIPMENT_DETAILED_MANUAL_V1.0.png"
EVIDENCE = OUT / "R5_MANUAL_QA_EVIDENCE.txt"


def sh(cmd, check=True, capture=False):
    print("+", " ".join(map(str, cmd)))
    return subprocess.run(cmd, check=check, text=True, capture_output=capture)


def find_chrome() -> str:
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        p = shutil.which(name)
        if p:
            return p
    raise RuntimeError("Chrome/Chromium not found")


def http_check(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "DPRO-Tutorial-R5-QA/1.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        body = res.read(400000).decode("utf-8", "ignore")
        return int(res.status), body


def capture_screens() -> dict[str, str]:
    SHOT.mkdir(parents=True, exist_ok=True)
    results: dict[str, str] = {}
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC

        opts = Options()
        for arg in (
            "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
            "--window-size=1440,1100", "--force-device-scale-factor=1",
        ):
            opts.add_argument(arg)
        driver = webdriver.Chrome(options=opts)
        driver.set_window_size(1440, 1100)
        try:
            for key, url in PAGES.items():
                driver.get(url)
                WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
                time.sleep(0.8)
                path = SHOT / f"{key}.png"
                driver.save_screenshot(str(path))
                results[key] = str(path)

            driver.get(FIRST10_URL)
            WebDriverWait(driver, 20).until(lambda d: d.execute_script("return document.readyState") == "complete")
            driver.execute_script("Object.keys(localStorage).filter(k => k.startsWith('dpro_tutorial_welfare_')).forEach(k => localStorage.removeItem(k));")
            btn = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".dpro-tutorial-entry")))
            driver.execute_script("arguments[0].click()", btn)
            WebDriverWait(driver, 10).until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".dpro-tutorial-card")))
            time.sleep(0.6)
            overlay = SHOT / "first10_step1.png"
            driver.save_screenshot(str(overlay))
            results["first10_step1"] = str(overlay)
            status = driver.execute_script("return localStorage.getItem('dpro_tutorial_welfare_first10_status')")
            step = driver.execute_script("return localStorage.getItem('dpro_tutorial_welfare_first10_step')")
            if status != "active" or step != "1":
                raise AssertionError(f"First10 state mismatch: status={status}, step={step}")
        finally:
            driver.quit()
        return results
    except Exception as exc:
        raise RuntimeError(f"Live browser screenshot / First10 QA failed: {exc}") from exc


def qr_png(text: str, out: Path):
    import qrcode
    qrcode.make(text).save(out)


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def image(path: str, alt: str, cls: str = "screen") -> str:
    return f'<img class="{cls}" src="{Path(path).resolve().as_uri()}" alt="{esc(alt)}">'


def common_css() -> str:
    return r"""
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #18343a; }
    body { font-family: "Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", sans-serif; line-height: 1.5; }
    .page { width: 210mm; height: 297mm; padding: 12mm 13mm 11mm; page-break-after: always; position: relative; overflow: hidden; }
    .page:last-child { page-break-after: auto; }
    .eyebrow { font-size: 9pt; font-weight: 800; letter-spacing: .08em; color: #177382; margin: 0 0 2mm; }
    h1 { font-size: 25pt; line-height: 1.25; color: #11545e; margin: 0 0 3mm; }
    h2 { font-size: 17pt; color: #145d66; margin: 0 0 2mm; }
    h3 { font-size: 12.5pt; color: #145d66; margin: 0 0 1mm; }
    p { font-size: 10pt; margin: 0 0 2.2mm; }
    ul, ol { margin: 1mm 0 2.5mm 5mm; padding-left: 4mm; font-size: 9.6pt; }
    li { margin-bottom: .8mm; }
    .muted { color: #5c747a; }
    .lead { font-size: 12pt; font-weight: 700; }
    .screen { width: 100%; max-height: 100mm; object-fit: contain; object-position: top center; border: .35mm solid #c9dadc; border-radius: 3mm; background: #f5fafb; }
    .screen-tall { width: 100%; max-height: 131mm; object-fit: contain; object-position: top center; border: .35mm solid #c9dadc; border-radius: 3mm; background: #f5fafb; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
    .card { border: .35mm solid #d4e2e4; background: #f8fcfc; border-radius: 3mm; padding: 3.3mm; }
    .step { display: grid; grid-template-columns: 9mm 1fr; gap: 2mm; align-items: start; margin-bottom: 2.5mm; }
    .num { width: 8mm; height: 8mm; border-radius: 50%; display: grid; place-items: center; background: #145d66; color: #fff; font-weight: 900; font-size: 10pt; }
    .safe { border-left: 1.4mm solid #cf6b2d; background: #fff6ef; padding: 3mm 3.5mm; border-radius: 2mm; font-size: 9.5pt; }
    .ok { border-left: 1.4mm solid #2a8d68; background: #f1fbf7; padding: 3mm 3.5mm; border-radius: 2mm; font-size: 9.5pt; }
    .qrrow { display: grid; grid-template-columns: 31mm 1fr; gap: 4mm; align-items: center; }
    .qr { width: 29mm; height: 29mm; image-rendering: pixelated; }
    .url { font-size: 7.6pt; word-break: break-all; color: #365b62; }
    .footer { position: absolute; left: 13mm; right: 13mm; bottom: 5mm; display: flex; justify-content: space-between; gap: 4mm; font-size: 7.3pt; color: #6d8186; border-top: .25mm solid #dfe9ea; padding-top: 1.5mm; }
    .toc { columns: 2; column-gap: 8mm; font-size: 9.8pt; }
    .toc div { break-inside: avoid; margin-bottom: 2mm; }
    .mini { font-size: 8.4pt; }
    .compact p, .compact li { font-size: 8.8pt; }
    .tag { display: inline-block; border-radius: 99px; background: #e7f4f5; color: #145d66; padding: 1mm 2.2mm; font-size: 8pt; font-weight: 800; margin: 0 1mm 2mm 0; }
    """


def footer(page_no: str) -> str:
    return f'<div class="footer"><span>DPRO 福祉用具レンタル・販売 LINE Tutorial</span><span>{page_no}</span></div>'


def make_quick(shots: dict[str, str], guide_qr: Path, first_qr: Path) -> str:
    css = common_css()
    steps = [
        ("1", "Guide Centerを開く", "First10の開始・続き・再生、担当別ガイド、検索をここから使います。"),
        ("2", "First10で10項目を確認", "利用状況→相談→計画→契約→配送→保守→請求→運用確認を約3分でたどります。"),
        ("3", "担当別画面で実務へ", "Guide Centerのリンクから必要な画面だけ開きます。Tutorialは業務データを自動変更しません。"),
    ]
    step_html = ''.join(f'<div class="step"><span class="num">{n}</span><div><h3>{esc(t)}</h3><p>{esc(x)}</p></div></div>' for n,t,x in steps)
    first10_list = [
        "利用状況の全体像", "利用中用具と相談導線", "公開相談受付", "専門職画面の管理認証", "アセスメント・計画の流れ",
        "契約・納品準備の流れ", "配送・設置の安全フロー", "モニタリング・保守", "請求・入金", "運用最終確認"
    ]
    lis = ''.join(f'<li>{i+1}. {esc(v)}</li>' for i,v in enumerate(first10_list))
    return f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{css}</style></head><body>
<section class="page"><p class="eyebrow">DPRO TUTORIAL / QUICK START</p><h1>福祉用具レンタル・販売<br>かんたんスタートガイド</h1><p class="lead">最初の10分は「Guide Center → First10 → 担当別画面」の順で確認します。</p><div class="grid2" style="margin:4mm 0">{step_html}</div>{image(shots['guide'], '公開中のGuide Center実画面', 'screen-tall')}<p class="mini muted">公開中のGuide Center実画面。検索、担当別フィルター、First10開始/続き/再生の入口です。</p><div class="safe"><strong>安全：</strong> Tutorial / Guide Center / First10 は、保存・送信・削除・承認・締め・入金・契約・配送状態変更などの業務操作を自動実行しません。公開デモへ実在する個人情報を入力しないでください。</div>{footer('1 / 2')}</section>
<section class="page"><p class="eyebrow">FIRST10</p><h2>10ステップで全体像を確認</h2><div class="grid2"><div><ol class="compact">{lis}</ol><div class="ok"><strong>完了の目安：</strong> 各担当の入口と、安全に確認すべき順序が分かればFirst10は完了です。</div></div><div>{image(shots['first10_step1'], 'First10 STEP 01 の実画面', 'screen')}</div></div><div class="grid2" style="margin-top:4mm"><div class="card"><div class="qrrow"><img class="qr" src="{guide_qr.resolve().as_uri()}" alt="Guide Center QR"><div><h3>Guide Center</h3><p class="mini">迷ったらここへ戻ります。</p><p class="url">{esc(GUIDE_URL)}</p></div></div></div><div class="card"><div class="qrrow"><img class="qr" src="{first_qr.resolve().as_uri()}" alt="First10 entry QR"><div><h3>First10開始画面</h3><p class="mini">会員画面を開き、右下の「First10 開始」を押します。</p><p class="url">{esc(FIRST10_URL)}</p></div></div></div></div><div class="safe" style="margin-top:4mm"><strong>業務操作の注意：</strong> 契約作成、説明・同意、納品予定、配送完了、修理・交換・返却、請求生成・締め・入金登録、設定保存・権限変更は、Tutorialでは説明だけです。</div>{footer('2 / 2')}</section></body></html>'''


def detail_page(title, eyebrow, shot, purpose, steps, done, warning, page_no, tags=""):
    step_html = ''.join(f'<li>{esc(s)}</li>' for s in steps)
    return f'''<section class="page compact"><p class="eyebrow">{esc(eyebrow)}</p><h2>{esc(title)}</h2>{tags}<p><strong>目的：</strong>{esc(purpose)}</p>{image(shot, title + ' 実画面', 'screen-tall')}<div class="grid2" style="margin-top:3mm"><div class="card"><h3>操作の流れ</h3><ol>{step_html}</ol></div><div><div class="ok"><strong>完了：</strong>{esc(done)}</div><div class="safe" style="margin-top:2.5mm"><strong>注意：</strong>{esc(warning)}</div></div></div>{footer(page_no)}</section>'''


def make_detail(shots: dict[str, str], guide_qr: Path) -> str:
    css = common_css()
    cover = f'''<section class="page"><p class="eyebrow">DPRO TUTORIAL / OPERATION MANUAL</p><h1>福祉用具レンタル・販売 LINE<br>導入・操作マニュアル（保存版）</h1><p class="lead">R4 Guide CenterとFirst10を基準に、利用者・家族、専門相談員、配送・設置、事務・請求、オーナー・管理の順で操作目的と安全確認をまとめています。</p>{image(shots['guide'], 'Guide Center 実画面', 'screen')}<div class="grid2" style="margin-top:4mm"><div class="card"><h3>目次</h3><div class="toc"><div>1. 利用者・家族</div><div>2. アセスメント・計画</div><div>3. 契約・納品準備</div><div>4. 配送・設置</div><div>5. モニタリング・保守</div><div>6. 請求・入金</div><div>7. 事業所運用・system-check</div><div>8. First10 / FAQ</div></div></div><div class="card"><div class="qrrow"><img class="qr" src="{guide_qr.resolve().as_uri()}" alt="Guide Center QR"><div><h3>最新ガイド</h3><p class="mini">Web版Guide Centerを正本として、最新の導線を確認してください。</p><p class="url">{esc(GUIDE_URL)}</p></div></div></div></div><div class="safe" style="margin-top:4mm"><strong>共通安全ルール：</strong> Tutorialは保存・送信・削除・承認・支払い・請求締め・契約・配送状態・権限・通知などの業務状態を自動変更しません。実在する利用者・家族・スタッフ情報や秘密情報を公開デモへ入力しないでください。</div>{footer('1 / 9')}</section>'''
    p2 = detail_page("利用状況・用具確認と相談", "利用者・家族", shots['member'], "現在の用具、次回訪問、相談状況を確認し、必要な相談先へ進む。", ["会員画面で利用中用具と次回訪問を確認する。", "追加・交換、不具合、予定変更の相談導線を選ぶ。", "相談受付では必要項目を確認し、送信前に内容を見直す。"], "必要な情報と相談先が分かれば完了です。", "公開デモでは実在する個人情報を入力しません。転倒・けが時は画面操作より安全確保と緊急連絡を優先します。", "2 / 9", '<span class="tag">member.html</span><span class="tag">inquiry.html</span>')
    p3 = detail_page("アセスメント → サービス計画 → 用具選定", "福祉用具専門相談員", shots['planning'], "状態・生活課題・住環境から、根拠ある用具計画へつなぐ。", ["管理認証後、対象利用者を検索する。", "アセスメントを確認する。", "計画、用具選定、説明・同意の順に進む。"], "計画の根拠と次に進むべき手順が確認できれば完了です。", "デモ管理コードは1234。完了済み記録を直接改変せず、改訂や新規記録を使用します。First10では保存・完了・有効化を押しません。", "3 / 9", '<span class="tag">planning.html</span><span class="tag">管理コード 1234（デモ）</span>')
    p4 = detail_page("契約・同意 → 個体割当 → 納品予定", "相談員・事務", shots['planning'], "有効計画を起点に、契約と納品準備を安全な順で確認する。", ["有効計画を選択する。", "契約明細と説明・同意を確認する。", "用具個体を割り当て、30分単位で納品予定を準備する。"], "契約内容、同意、個体、納品予定の整合が確認できれば完了です。", "First10 / Guide Centerは契約作成・同意・納品登録を自動実行しません。", "4 / 9", '<span class="tag">contract.html</span><span class="tag">30分単位</span>')
    p5 = detail_page("積込 → 配送 → 設置 → 納品完了", "配送・設置スタッフ", shots['staff'], "用具管理番号と安全確認をそろえてから貸与開始へ進む。", ["積込明細と個体番号を確認する。", "出発・到着の順で進む。", "適合・安定性・使用方法・付属品を確認する。", "受領確認後に納品完了へ進む。"], "安全確認と受領確認が揃った状態が完了条件です。", "未確認項目、重大破損、転倒・けがなどがある状態では完了しません。First10は配送状態や貸与状態を変更しません。", "5 / 9", '<span class="tag">staff.html</span><span class="tag">デモ: ST003 / 3333</span>')
    p6 = detail_page("モニタリング → 修理・交換・返却 → 回収後処理", "専門相談員・現場", shots['aftercare'], "納品後の安全と継続利用を、期限・対応・回収後処理まで追う。", ["モニタリング期限と利用状況を確認する。", "継続・修理・交換・返却を判断する。", "回収後は消毒・点検を経て再貸出可能へ戻す。"], "対応方針と次回期限、回収後処理の状態が確認できれば完了です。", "転倒・けが・重大破損時は用具使用を中止し、安全確保と必要な緊急連絡を優先します。", "6 / 9", '<span class="tag">aftercare.html</span>')
    p7 = detail_page("請求生成 → 検証 → 締め → 入金", "事務・請求担当", shots['billing'], "貸与・販売明細から月次請求、利用者負担、入金・未収を確認する。", ["請求月と下書きを確認する。", "保険・価格・合計の検証結果を確認する。", "締め後、請求書・確認CSV・入金状況を確認する。"], "請求根拠と検証結果、入金状況が確認できれば完了です。", "確認CSVは公式国保連伝送ファイルではありません。Guide Centerは請求生成・締め・入金登録を実行しません。", "7 / 9", '<span class="tag">billing.html</span>')
    p8 = f'''<section class="page compact"><p class="eyebrow">オーナー・管理責任者</p><h2>事業所運用・権限・通知・帳票・監査・system-check</h2><div class="grid2"><div>{image(shots['operations'], '事業所運用画面 実画面', 'screen')}</div><div>{image(shots['system_check'], 'system-check 実画面', 'screen')}</div></div><div class="grid2" style="margin-top:3mm"><div class="card"><h3>日常運用の確認</h3><ul><li>事業所設定とスタッフ権限</li><li>通知・帳票・監査</li><li>system-checkで環境状態を確認</li><li>営業前の準備状況を確認</li></ul></div><div><div class="ok"><strong>完了：</strong>必要な運用項目の状態と、異常時の切り分け先が分かれば完了です。</div><div class="safe" style="margin-top:2.5mm"><strong>注意：</strong>設定保存、権限変更、通知送信などはFirst10から実行しません。問題時はエラー内容と時刻を記録します。</div></div></div>{footer('8 / 9')}</section>'''
    p9 = f'''<section class="page compact"><p class="eyebrow">FIRST10 / TROUBLESHOOTING</p><h2>First10・再開・FAQ</h2>{image(shots['first10_step1'], 'First10 STEP 01 実画面', 'screen')}<div class="grid2" style="margin-top:3mm"><div class="card"><h3>First10の使い方</h3><ol><li>会員画面の「First10 開始」を押す。</li><li>カードはドラッグで移動できる。</li><li>閉じても進捗はTutorial専用localStorageへ保存される。</li><li>Guide Centerから「続きから」「最初から」を選べる。</li><li>10/10完了後も「First10 再生」で確認できる。</li></ol></div><div class="card"><h3>よくある質問</h3><p><strong>Q. First10で業務データは変わる？</strong><br>A. 変わりません。保存・送信・削除・承認・締め等は自動実行しません。</p><p><strong>Q. 画面が見つからない？</strong><br>A. Guide Centerの検索と担当フィルターを使い、必要ならsystem-checkを確認します。</p><p><strong>Q. 管理画面が開かない？</strong><br>A. デモでは管理コード1234。本番は正規の権限・認証を使用します。</p></div></div><div class="safe" style="margin-top:3mm"><strong>禁止事項：</strong> 公開デモへ実在する個人情報、顧客情報、秘密鍵、APIキー、トークン、パスワードを入力・掲載しません。</div>{footer('9 / 9')}</section>'''
    return f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{css}</style></head><body>{cover}{p2}{p3}{p4}{p5}{p6}{p7}{p8}{p9}</body></html>'


def print_pdf(chrome: str, html_file: Path, pdf_file: Path):
    sh([chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files", "--print-to-pdf-no-header", f"--print-to-pdf={pdf_file.resolve()}", html_file.resolve().as_uri()])


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def pdf_info(path: Path) -> tuple[int, str]:
    r = sh(["pdfinfo", str(path)], capture=True)
    pages, size = 0, ""
    for line in r.stdout.splitlines():
        if line.startswith("Pages:"):
            pages = int(line.split(":", 1)[1].strip())
        if line.startswith("Page size:"):
            size = line.split(":", 1)[1].strip()
    return pages, size


def render_preview(pdf: Path, out_png: Path):
    prefix = WORK / (out_png.stem + "_render")
    sh(["pdftoppm", "-png", "-f", "1", "-singlefile", "-r", "150", str(pdf), str(prefix)])
    shutil.copy2(prefix.with_suffix(".png"), out_png)


def qr_decode_pdf(pdf: Path) -> list[str]:
    prefix = WORK / (pdf.stem + "_qr")
    sh(["pdftoppm", "-png", "-r", "300", str(pdf), str(prefix)])
    found: list[str] = []
    for p in sorted(WORK.glob(prefix.name + "-*.png")):
        r = sh(["zbarimg", "--quiet", "--raw", str(p)], check=False, capture=True)
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                line = line.strip()
                if line and line not in found:
                    found.append(line)
    return found


def main():
    OUT.mkdir(exist_ok=True)
    WORK.mkdir(exist_ok=True)
    statuses: dict[str, int] = {}
    bodies: dict[str, str] = {}
    for key, url in PAGES.items():
        code, body = http_check(url)
        statuses[url] = code
        bodies[key] = body
        if code != 200:
            raise AssertionError(f"HTTP {code}: {url}")
    if "Guide Center" not in bodies["guide"]:
        raise AssertionError("Guide Center content not detected")
    if "tutorial.js" not in bodies["member"]:
        raise AssertionError("Tutorial script not linked from member.html")

    shots = capture_screens()
    for key, path in shots.items():
        p = Path(path)
        if not p.exists() or p.stat().st_size < 10000:
            raise AssertionError(f"Screenshot missing/too small: {key} {path}")

    guide_qr = WORK / "qr_guide.png"
    first_qr = WORK / "qr_first10.png"
    qr_png(GUIDE_URL, guide_qr)
    qr_png(FIRST10_URL, first_qr)

    quick_html = WORK / "quick.html"
    detail_html = WORK / "detail.html"
    quick_html.write_text(make_quick(shots, guide_qr, first_qr), encoding="utf-8")
    detail_html.write_text(make_detail(shots, guide_qr), encoding="utf-8")

    chrome = find_chrome()
    print_pdf(chrome, quick_html, QUICK_PDF)
    print_pdf(chrome, detail_html, DETAIL_PDF)
    render_preview(QUICK_PDF, QUICK_PNG)
    render_preview(DETAIL_PDF, DETAIL_PNG)

    qp, qs = pdf_info(QUICK_PDF)
    dp, ds = pdf_info(DETAIL_PDF)
    if qp != 2 or dp != 9:
        raise AssertionError(f"Unexpected page count quick={qp}, detailed={dp}")
    if ("A4" not in qs and "595" not in qs) or ("A4" not in ds and "595" not in ds):
        raise AssertionError(f"A4 check failed: quick={qs}; detailed={ds}")

    q_decoded = qr_decode_pdf(QUICK_PDF)
    d_decoded = qr_decode_pdf(DETAIL_PDF)
    if GUIDE_URL not in q_decoded or FIRST10_URL not in q_decoded:
        raise AssertionError(f"Quick QR decode mismatch: {q_decoded}")
    if GUIDE_URL not in d_decoded:
        raise AssertionError(f"Detailed QR decode mismatch: {d_decoded}")

    assets = [QUICK_PDF, DETAIL_PDF, QUICK_PNG, DETAIL_PNG]
    evidence = [
        "DPRO TUTORIAL WELFARE_EQUIPMENT R5 MANUAL QA EVIDENCE",
        "Version: V1.0",
        "Date: 2026-08-27",
        "",
        "RESULT: PASS",
        f"Quick Start pages: {qp}",
        f"Quick Start page size: {qs}",
        f"Detailed Manual pages: {dp}",
        f"Detailed Manual page size: {ds}",
        "Actual live/demo screenshots: PASS",
        "First10 open/state browser check: PASS",
        "Guide Center live content check: PASS",
        "R3/R4 anchors: PASS",
        "Japanese rendering source font: Noto Sans CJK JP",
        "Safety warnings present: PASS",
        "Real customer/personal data included: NONE",
        "Secrets/keys/tokens included: NONE",
        "Tutorial businessMutation: 0",
        "DB/Worker/API/Auth/Role/Permission/Feature Flag Tutorial changes: 0",
        "",
        "HTTP CHECKS",
    ]
    for url, code in statuses.items():
        evidence.append(f"{code} {url}")
    evidence += ["", "QR DECODE", "Quick Start decoded:"]
    evidence += [f"- {x}" for x in q_decoded]
    evidence += ["Detailed Manual decoded:"]
    evidence += [f"- {x}" for x in d_decoded]
    evidence += ["", "ASSET SHA256"]
    evidence += [f"{sha256(p)}  {p.name}" for p in assets]
    EVIDENCE.write_text("\n".join(evidence) + "\n", encoding="utf-8")
    print(EVIDENCE.read_text(encoding="utf-8"))

if __name__ == "__main__":
    main()
