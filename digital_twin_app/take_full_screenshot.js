const fs = require('fs');
const puppeteer = require('puppeteer-core');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const execPath = fs.existsSync(edgePath) ? edgePath : (fs.existsSync(chromePath) ? chromePath : null);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'full_page_load.png' });
  await browser.close();
})();
