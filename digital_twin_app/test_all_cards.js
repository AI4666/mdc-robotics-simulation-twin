const fs = require('fs');
const puppeteer = require('puppeteer-core');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const execPath = fs.existsSync(edgePath) ? edgePath : (fs.existsSync(chromePath) ? chromePath : null);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    defaultViewport: { width: 1400, height: 900 }
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Test HUM-01 click
  console.log('--- Testing HUM-01 click ---');
  await page.click('#robot-card-HUM-01');
  await new Promise(r => setTimeout(r, 400));
  let g1Display = await page.$eval('#g1-dashboard-modal', el => el.style.display);
  console.log('g1 modal display:', g1Display);
  await page.click('#btn-close-g1-modal');
  await new Promise(r => setTimeout(r, 400));

  // Test UAV-01 click
  console.log('--- Testing UAV-01 click ---');
  await page.click('#robot-card-UAV-01');
  await new Promise(r => setTimeout(r, 400));
  let droneDisplay = await page.$eval('#drone-dashboard-modal', el => el.style.display);
  console.log('drone modal display:', droneDisplay);
  await page.click('#btn-close-drone-modal');
  await new Promise(r => setTimeout(r, 400));

  // Test AMR-01 card click
  console.log('--- Testing AMR-01 click ---');
  await page.click('#robot-card-AMR-01');
  await new Promise(r => setTimeout(r, 400));
  let roverDisplay = await page.$eval('#rover-dashboard-modal', el => el.style.display);
  console.log('rover modal display after AMR-01 click:', roverDisplay);
  await page.click('#btn-close-rover-modal');
  await new Promise(r => setTimeout(r, 400));

  // Test AMR-02 card click
  console.log('--- Testing AMR-02 click ---');
  await page.click('#robot-card-AMR-02');
  await new Promise(r => setTimeout(r, 400));
  roverDisplay = await page.$eval('#rover-dashboard-modal', el => el.style.display);
  let roverTitle = await page.$eval('#rover-header-title', el => el.textContent);
  console.log('rover modal display after AMR-02 click:', roverDisplay, 'title:', roverTitle);
  await page.click('#btn-close-rover-modal');
  await new Promise(r => setTimeout(r, 400));

  // Test AMR-03 card click
  console.log('--- Testing AMR-03 click ---');
  await page.click('#robot-card-AMR-03');
  await new Promise(r => setTimeout(r, 400));
  roverDisplay = await page.$eval('#rover-dashboard-modal', el => el.style.display);
  roverTitle = await page.$eval('#rover-header-title', el => el.textContent);
  console.log('rover modal display after AMR-03 click:', roverDisplay, 'title:', roverTitle);

  await browser.close();
})();
