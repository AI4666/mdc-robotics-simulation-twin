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
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Find all buttons
  const buttons = await page.$$eval('#robot-cards-container button', btns => btns.map(b => ({
    text: b.textContent.trim(),
    className: b.className,
    parentCard: b.closest('.robot-card')?.id
  })));
  console.log('Buttons found inside cards:', JSON.stringify(buttons, null, 2));

  // Click .btn-open-rover-ctrl on AMR-01
  console.log('Clicking AMR-01 .btn-open-rover-ctrl...');
  const btn1 = await page.$('#robot-card-AMR-01 .btn-open-rover-ctrl');
  if (btn1) {
    await btn1.click();
    await new Promise(r => setTimeout(r, 500));
    const display1 = await page.$eval('#rover-dashboard-modal', el => ({
      display: el.style.display,
      computedDisplay: window.getComputedStyle(el).display,
      rect: el.getBoundingClientRect()
    }));
    console.log('AMR-01 btn click result:', JSON.stringify(display1));
    await page.screenshot({ path: 'amr01_btn_clicked.png' });
  } else {
    console.log('btn1 not found!');
  }

  // Click close button
  await page.click('#btn-close-rover-modal');
  await new Promise(r => setTimeout(r, 300));

  // Click .btn-open-rover-ctrl on AMR-02
  console.log('Clicking AMR-02 .btn-open-rover-ctrl...');
  const btn2 = await page.$('#robot-card-AMR-02 .btn-open-rover-ctrl');
  if (btn2) {
    await btn2.click();
    await new Promise(r => setTimeout(r, 500));
    const display2 = await page.$eval('#rover-dashboard-modal', el => ({
      display: el.style.display,
      computedDisplay: window.getComputedStyle(el).display,
      title: document.getElementById('rover-header-title')?.textContent
    }));
    console.log('AMR-02 btn click result:', JSON.stringify(display2));
    await page.screenshot({ path: 'amr02_btn_clicked.png' });
  }

  await browser.close();
})();
