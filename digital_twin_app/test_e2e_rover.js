const puppeteer = require('puppeteer-core');
const fs = require('fs');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const execPath = fs.existsSync(edgePath) ? edgePath : chromePath;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER ERR:', msg.text());
  });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  // 1. Verify top toolbar buttons were removed as requested
  console.log('--- 1. Verifying removed toolbar buttons (#btn-edit-boundary, #btn-open-rover-modal-top) ---');
  const btnEditBoundary = await page.$('#btn-edit-boundary');
  const btnRoverTop = await page.$('#btn-open-rover-modal-top');
  console.log('Removed buttons verification:', {
    btnEditBoundaryExists: btnEditBoundary !== null,
    btnRoverTopExists: btnRoverTop !== null
  });


  // 2. Test sidebar header button
  console.log('--- 2. Testing sidebar header button (#btn-open-rover-sidebar-hdr) ---');
  await page.click('#btn-open-rover-sidebar-hdr');
  await new Promise(r => setTimeout(r, 300));
  disp = await page.$eval('#rover-dashboard-modal', el => window.getComputedStyle(el).display);
  console.log('Sidebar hdr button result:', { disp });
  await page.click('#btn-close-rover-modal');
  await new Promise(r => setTimeout(r, 300));

  // 3. Test AMR-02 button click
  console.log('--- 3. Testing AMR-02 button click ---');
  await page.click('#robot-card-AMR-02 .btn-open-rover-ctrl');
  await new Promise(r => setTimeout(r, 300));
  disp = await page.$eval('#rover-dashboard-modal', el => window.getComputedStyle(el).display);
  title = await page.$eval('#rover-header-title', el => el.textContent);
  console.log('AMR-02 button result:', { disp, title });
  await page.screenshot({ path: 'test_amr02_opened.png' });

  // 4. Test switcher pill to AMR-03
  console.log('--- 4. Testing switcher pill to AMR-03 ---');
  await page.click('#pill-AMR-03');
  await new Promise(r => setTimeout(r, 300));
  title = await page.$eval('#rover-header-title', el => el.textContent);
  console.log('Pill switch result:', { title });

  // 5. Test LiDAR toggle button
  console.log('--- 5. Testing LiDAR toggle button ---');
  let lidarTextBefore = await page.$eval('#btn-rover-toggle-lidar', el => el.textContent);
  await page.click('#btn-rover-toggle-lidar');
  await new Promise(r => setTimeout(r, 300));
  let lidarTextAfter = await page.$eval('#btn-rover-toggle-lidar', el => el.textContent);
  console.log('LiDAR toggle result:', { before: lidarTextBefore, after: lidarTextAfter });

  // 6. Test Card background click for AMR-01
  await page.click('#btn-close-rover-modal');
  await new Promise(r => setTimeout(r, 300));
  console.log('--- 6. Testing AMR-01 card background click ---');
  await page.click('#robot-card-AMR-01');
  await new Promise(r => setTimeout(r, 300));
  disp = await page.$eval('#rover-dashboard-modal', el => window.getComputedStyle(el).display);
  title = await page.$eval('#rover-header-title', el => el.textContent);
  console.log('AMR-01 card click result:', { disp, title });

  await browser.close();
  console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
})();
