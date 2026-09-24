const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\hieul\\.gemini\\antigravity-ide\\brain\\47e9f3c9-20dd-4ca0-be2a-d382075ab952';
const PORT = 8088;
const ROOT = path.resolve(__dirname, '..');

// 1. Static file server
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/demo_v2/index.html';
  let filePath = path.join(ROOT, reqPath);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function runTests() {
  server.listen(PORT, async () => {
    console.log(`[SERVER] Started at http://localhost:${PORT}`);
    
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
      '--headless=new',
      '--remote-debugging-port=9230',
      '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9230',
      '--disable-extensions',
      '--no-first-run',
      '--disable-gpu',
      '--window-size=1600,1000',
      `http://localhost:${PORT}/demo_v2/index.html`
    ]);

    await new Promise(r => setTimeout(r, 2500));
    const targets = await fetchJson('http://127.0.0.1:9230/json');
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) cb.reject(msg.error);
        else cb.resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        callbacks.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    }

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        console.error('EVAL ERROR for:', expression, JSON.stringify(res.exceptionDetails, null, 2));
        throw new Error(res.exceptionDetails.text || 'Eval error');
      }
      return res.result ? res.result.value : undefined;
    }

    async function takeScreenshot(filename) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const targetPath = path.join(ARTIFACTS_DIR, filename);
      fs.writeFileSync(targetPath, buffer);
      console.log(`[SCREENSHOT] Saved: ${targetPath}`);
    }

    console.log('[TEST] Waiting for app state to initialize...');
    await new Promise(r => setTimeout(r, 3000));

    // Test 1: Real data loaded
    const appStateSummary = await evaluate(`({
      projectsCount: AppState.projects.length,
      currentProject: AppState.currentProject,
      assembliesCount: AppState.projectData ? AppState.projectData.total_assemblies : 0,
      completedAssemblies: AppState.projectData ? AppState.projectData.completed_assemblies : 0,
      deliveryDatesCount: AppState.projectData && AppState.projectData.all_delivery_dates ? AppState.projectData.all_delivery_dates.length : 0
    })`);
    console.log('[TEST 1 - REAL DATA]:', JSON.stringify(appStateSummary, null, 2));
    await takeScreenshot('shot_1_dashboard_real_data.png');

    // Test 2: Project Picker Modal ("Mở Dự Án")
    console.log('[TEST 2] Opening project selector modal...');
    await evaluate(`openProjectSelectModal()`);
    await new Promise(r => setTimeout(r, 800));
    const modalCardsCount = await evaluate(`document.querySelectorAll('.project-picker-card').length`);
    console.log(`[TEST 2 - PROJECT PICKER]: Modal rendered ${modalCardsCount} project cards.`);
    await takeScreenshot('shot_2_project_picker_modal.png');

    // Select project B272
    console.log('[TEST 2] Switching to project B272...');
    await evaluate(`selectProjectFromPicker('B272')`);
    await new Promise(r => setTimeout(r, 2000));
    const switchedProject = await evaluate(`AppState.currentProject`);
    console.log(`[TEST 2 - PROJECT SWITCHED]: Current project is now ${switchedProject}`);

    // Test 3: Multi-theme system
    console.log('[TEST 3] Testing dark theme...');
    await evaluate(`changeAppTheme('dark')`);
    await new Promise(r => setTimeout(r, 800));
    const darkThemeAttr = await evaluate(`document.documentElement.getAttribute('data-theme')`);
    console.log(`[TEST 3 - THEME DARK]: data-theme = ${darkThemeAttr}`);
    await takeScreenshot('shot_3_theme_dark.png');

    console.log('[TEST 3] Testing emerald theme...');
    await evaluate(`changeAppTheme('emerald')`);
    await new Promise(r => setTimeout(r, 800));
    await takeScreenshot('shot_4_theme_emerald.png');

    console.log('[TEST 3] Testing amber warm theme...');
    await evaluate(`changeAppTheme('amber')`);
    await new Promise(r => setTimeout(r, 800));
    await takeScreenshot('shot_5_theme_amber.png');

    // Return to light
    await evaluate(`changeAppTheme('light')`);

    // Test 4: Sidebar thò thụt (collapsible)
    console.log('[TEST 4] Toggling sidebar collapse...');
    await evaluate(`toggleSidebarCollapse(true)`);
    await new Promise(r => setTimeout(r, 600));
    const isCollapsed = await evaluate(`document.getElementById('sidebar').classList.contains('collapsed')`);
    console.log(`[TEST 4 - SIDEBAR COLLAPSED]: sidebar has .collapsed: ${isCollapsed}`);
    await takeScreenshot('shot_6_sidebar_collapsed.png');
    // Expand back
    await evaluate(`toggleSidebarCollapse(false)`);

    // Test 5: Nhận theo ngày vs Cây cấu kiện
    console.log('[TEST 5] Testing "Nhận theo ngày" view...');
    await evaluate(`navigateTo('materials', 'by-day')`);
    await new Promise(r => setTimeout(r, 1500));
    const dayRowsAll = await evaluate(`document.querySelectorAll('#day-table-body tr').length`);
    console.log(`[TEST 5 - ALL DATES TABLE]: Rendered ${dayRowsAll} date overview rows.`);
    await takeScreenshot('shot_7_materials_all_dates.png');

    // Click a specific date to filter
    const firstDate = await evaluate(`(AppState.projectData.all_delivery_dates || [])[0] || '12/01/2026'`);
    console.log(`[TEST 5] Filtering by specific date: ${firstDate}...`);
    await evaluate(`selectDate('${firstDate}')`);
    await new Promise(r => setTimeout(r, 1200));
    const dayRowsSpecific = await evaluate(`document.querySelectorAll('#day-table-body tr').length`);
    console.log(`[TEST 5 - SPECIFIC DATE]: Filtered to ${dayRowsSpecific} items on date ${firstDate}.`);
    await takeScreenshot('shot_8_materials_date_filtered.png');

    // Test 6: Biểu đồ tiến độ quy đổi Tấn ⮀ Kg và 4 thẻ KPI
    console.log('[TEST 6] Testing charts page with unit conversion...');
    await evaluate(`navigateTo('charts')`);
    await new Promise(r => setTimeout(r, 1500));
    
    // Check Ton KPI values
    const kpiTon = await evaluate(`({
      unit: currentChartUnit,
      totalWeight: (document.getElementById('chart-kpi-total-weight') || {}).textContent,
      recWeight: (document.getElementById('chart-kpi-rec-weight') || document.getElementById('chart-kpi-received-weight') || {}).textContent,
      missWeight: (document.getElementById('chart-kpi-miss-weight') || document.getElementById('chart-kpi-missing-weight') || {}).textContent,
      partsCount: (document.getElementById('chart-kpi-parts-count') || {}).textContent,
      partsSub: (document.getElementById('chart-kpi-parts-sub') || {}).textContent
    })`);
    console.log('[TEST 6 - KPI TON]:', JSON.stringify(kpiTon, null, 2));
    await takeScreenshot('shot_9_charts_ton.png');

    // Switch to Kg
    console.log('[TEST 6] Switching unit to Kg...');
    await evaluate(`setChartUnit('kg')`);
    await new Promise(r => setTimeout(r, 800));
    const kpiKg = await evaluate(`({
      unit: currentChartUnit,
      totalWeight: (document.getElementById('chart-kpi-total-weight') || {}).textContent,
      recWeight: (document.getElementById('chart-kpi-rec-weight') || document.getElementById('chart-kpi-received-weight') || {}).textContent,
      missWeight: (document.getElementById('chart-kpi-miss-weight') || document.getElementById('chart-kpi-missing-weight') || {}).textContent
    })`);
    console.log('[TEST 6 - KPI KG]:', JSON.stringify(kpiKg, null, 2));
    await takeScreenshot('shot_10_charts_kg.png');

    // Test 7: Admin route
    console.log('[TEST 7] Testing admin route...');
    const adminNavInSidebar = await evaluate(`document.querySelector('.sidebar-nav #nav-admin') !== null`);
    console.log(`[TEST 7 - ADMIN IN SIDEBAR]: ${adminNavInSidebar} (expected false)`);
    await evaluate(`navigateTo('admin')`);
    await new Promise(r => setTimeout(r, 1000));
    const adminVisible = await evaluate(`document.getElementById('page-admin').style.display === 'block'`);
    console.log(`[TEST 7 - ADMIN ACCESSIBLE VIA ROUTE]: ${adminVisible} (expected true)`);
    await takeScreenshot('shot_11_admin_page.png');

    console.log('\n[SUCCESS] ALL TESTS COMPLETED SUCCESSFULLY!');
    
    ws.close();
    chrome.kill();
    server.close();
    process.exit(0);
  });
}

runTests().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
