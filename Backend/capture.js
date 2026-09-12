import puppeteer from "puppeteer";

let browser = null;
let warmPage = null;

const TAILWIND_UTILS = `
.rounded-2xl { border-radius: 1rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-full { border-radius: 9999px; }
.overflow-hidden { overflow: hidden; }
.relative { position: relative; }
.absolute { position: absolute; }
.inset-0 { top:0;right:0;bottom:0;left:0; }
.flex { display: flex; }
.inline-flex { display: inline-flex; }
.grid { display: grid; }
.hidden { display: none; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }
.flex-col { flex-direction: column; }
.flex-1 { flex: 1 1 0%; }
.flex-shrink-0 { flex-shrink: 0; }
.w-full { width: 100%; }
.h-full { height: 100%; }
.text-white { color: #fff; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-left { text-align: left; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.text-2xl { font-size: 1.5rem; line-height: 2rem; }
.font-bold { font-weight: 700; }
.font-black { font-weight: 900; }
.font-semibold { font-weight: 600; }
.font-medium { font-weight: 500; }
.uppercase { text-transform: uppercase; }
.tracking-wide { letter-spacing: 0.025em; }
.tracking-wider { letter-spacing: 0.05em; }
.leading-none { line-height: 1; }
.leading-tight { line-height: 1.25; }
.leading-snug { line-height: 1.375; }
.truncate { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.opacity-50 { opacity: 0.5; }
.opacity-60 { opacity: 0.6; }
.opacity-70 { opacity: 0.7; }
.opacity-80 { opacity: 0.8; }
.opacity-90 { opacity: 0.9; }
.p-1 { padding: 0.25rem; }
.p-2 { padding: 0.5rem; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
.pt-1 { padding-top: 0.25rem; }
.pt-2 { padding-top: 0.5rem; }
.pt-3 { padding-top: 0.75rem; }
.pb-1 { padding-bottom: 0.25rem; }
.pb-2 { padding-bottom: 0.5rem; }
.pb-3 { padding-bottom: 0.75rem; }
.mb-1 { margin-bottom: 0.25rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mt-1 { margin-top: 0.25rem; }
.mt-2 { margin-top: 0.5rem; }
.ml-1 { margin-left: 0.25rem; }
.ml-2 { margin-left: 0.5rem; }
.mr-1 { margin-right: 0.25rem; }
.mr-2 { margin-right: 0.5rem; }
.mx-auto { margin-left: auto; margin-right: auto; }
.space-x-1 > * + * { margin-left: 0.25rem; }
.space-x-2 > * + * { margin-left: 0.5rem; }
.border { border-width: 1px; }
.border-0 { border-width: 0; }
.pointer-events-none { pointer-events: none; }
.select-none { user-select: none; }
.cursor-pointer { cursor: pointer; }
.whitespace-nowrap { white-space: nowrap; }
.object-cover { object-fit: cover; }
.object-contain { object-fit: contain; }
.z-10 { z-index: 10; }
.blur-md { filter: blur(12px); }
.blur-sm { filter: blur(4px); }
`;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  const opts = {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  browser = await puppeteer.launch(opts);
  return browser;
}

export async function captureCardHtml(html, width = 375) {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 3 });
    const fullHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #141414; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; width: ${width}px; overflow: hidden; }
  #card { display: inline-block; width: 100%; }
  #card > * { margin-bottom: 0 !important; }
  img { max-width: 100%; }
  ${TAILWIND_UTILS}
</style>
</head><body>
<div id="card">${html}</div>
</body></html>`;

    await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 8000 });
    await page.waitForSelector("#card", { timeout: 3000 });

    const card = await page.$("#card");
    const screenshot = await card.screenshot({ type: "png" });
    return screenshot;
  } finally {
    await page.close();
  }
}

export async function warmupBrowser() {
  try {
    await getBrowser();
    console.log("[capture] Chromium browser warmed up");
  } catch (e) {
    console.error("[capture] Failed to warmup browser:", e.message);
  }
}
