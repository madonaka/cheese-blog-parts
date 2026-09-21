# -*- coding: utf-8 -*-
"""묶음 HTML 이 실제로 도는지 헤드리스로 찍어 본다."""
import os, subprocess, tempfile, shutil

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "out"))
html = os.path.join(OUT, "gyeongseong-sheets.html")
png = os.path.join(OUT, "page-check.png")
udd = tempfile.mkdtemp(prefix="chrome-page-")
uri = "file:///" + html.replace("\\", "/").replace(" ", "%20")
r = subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--user-data-dir=" + udd,
                    "--window-size=1400,3200", "--virtual-time-budget=9000",
                    "--screenshot=" + png, uri], capture_output=True, timeout=240)
shutil.rmtree(udd, ignore_errors=True)
print(("찍음 %.0f KB" % (os.path.getsize(png) / 1024)) if os.path.exists(png)
      else "실패 " + r.stderr.decode("utf-8", "ignore")[:300])
