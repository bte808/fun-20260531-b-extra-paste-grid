import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const targetUrl = process.env.PASTEGRID_URL || "http://localhost:5178/";
const chromePath =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const userDataDir = await mkdtemp(join(tmpdir(), "pastegrid-chrome-"));
let chrome;

try {
  const browserWs = await launchChrome();
  const cdp = await connectCdp(browserWs);
  const desktop = await runViewportCheck(cdp, {
    name: "desktop",
    width: 1280,
    height: 900,
    mobile: false
  });
  const mobile = await runViewportCheck(cdp, {
    name: "mobile",
    width: 390,
    height: 844,
    mobile: true
  });
  await cdp.close();

  if (!desktop.ok || !mobile.ok) {
    throw new Error(JSON.stringify({ desktop, mobile }, null, 2));
  }

  console.log(
    `browser ok: desktop rows=${desktop.rows}, mobile overflow=${mobile.overflow}, screenshots=${desktop.screenshot},${mobile.screenshot}`
  );
} finally {
  if (chrome && !chrome.killed) {
    chrome.kill("SIGTERM");
  }
  await rm(userDataDir, { recursive: true, force: true });
}

async function launchChrome() {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];

  chrome = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });
  chrome.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`Chrome exited with code ${code}`);
    }
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for Chrome DevTools")), 10000);
    chrome.stderr.on("data", (chunk) => {
      const text = String(chunk);
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    chrome.on("error", reject);
  });
}

function connectCdp(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const waiters = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    for (const waiter of [...waiters]) {
      const sameMethod = waiter.method === message.method;
      const sameSession = !waiter.sessionId || waiter.sessionId === message.sessionId;
      if (sameMethod && sameSession) {
        clearTimeout(waiter.timeout);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params || {});
      }
    }
  });

  const open = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return open.then(() => ({
    send(method, params = {}, sessionId) {
      const id = nextId++;
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      socket.send(JSON.stringify(payload));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    waitFor(method, sessionId, timeoutMs = 10000) {
      return new Promise((resolve, reject) => {
        const waiter = {
          method,
          sessionId,
          resolve,
          timeout: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error(`Timed out waiting for ${method}`));
          }, timeoutMs)
        };
        waiters.push(waiter);
      });
    },
    close() {
      socket.close();
    }
  }));
}

async function runViewportCheck(cdp, viewport) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true
  });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
      mobile: viewport.mobile
    },
    sessionId
  );

  const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
  await cdp.send("Page.navigate", { url: targetUrl }, sessionId);
  await loaded;

  const details = await evaluate(
    cdp,
    sessionId,
    `(async () => {
      const sample = document.querySelector('[data-sample="leads"]');
      sample.click();
      document.querySelector('[data-format="markdown"]').click();
      const cleanButton = document.querySelector('[data-testid="clean-button"]');
      const copyButton = document.querySelector('[data-testid="copy-button"]');
      const briefButton = document.querySelector('[data-testid="brief-button"]');
      const cleanRectBeforeScroll = cleanButton.getBoundingClientRect();
      if (${viewport.mobile ? "true" : "false"}) {
        briefButton.scrollIntoView({ block: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      briefButton.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const output = document.querySelector('[data-testid="output-text"]').value;
      const tableRows = document.querySelectorAll('#tableBody tr').length;
      const cleanRect = cleanButton.getBoundingClientRect();
      const copyRect = copyButton.getBoundingClientRect();
      const briefRect = briefButton.getBoundingClientRect();
      return {
        title: document.title,
        summary: document.querySelector('[data-testid="summary"]').textContent,
        rows: tableRows,
        outputHasMarkdown: output.includes('| Item | Email | Plan | Amount | Status |'),
        outputHasLead: output.includes('Acme Ops'),
        briefCopied: briefButton.textContent.includes('Copied'),
        overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        cleanInitiallyVisible: cleanRectBeforeScroll.top >= 0 && cleanRectBeforeScroll.bottom <= window.innerHeight,
        cleanVisible: cleanRect.top >= 0 && cleanRect.bottom <= window.innerHeight,
        copyVisible: copyRect.top >= 0 && copyRect.bottom <= window.innerHeight,
        briefVisible: briefRect.top >= 0 && briefRect.bottom <= window.innerHeight,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      };
    })()`
  );

  const screenshotResult = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    sessionId
  );
  const screenshot = join(tmpdir(), `pastegrid-${viewport.name}.png`);
  await writeFile(screenshot, Buffer.from(screenshotResult.data, "base64"));

  const ok =
    details.title.includes("PasteGrid") &&
    details.rows === 3 &&
    details.outputHasMarkdown &&
    details.outputHasLead &&
    details.briefCopied &&
    details.overflow <= 1 &&
    (viewport.mobile ? details.cleanInitiallyVisible && details.briefVisible : details.copyVisible);

  await cdp.send("Target.closeTarget", { targetId });
  return { ...details, ok, screenshot };
}

async function evaluate(cdp, sessionId, expression) {
  const response = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
  }
  return response.result.value;
}
