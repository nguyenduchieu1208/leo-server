const { spawn } = require('child_process');
const http = require('http');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--remote-debugging-port=9228',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9228',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9228/json');
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    console.log('Connecting to Page target:', pageTarget.url, pageTarget.webSocketDebuggerUrl);

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();

    const runtimeExceptions = [];
    const consoleErrors = [];
    const consoleLogs = [];
    const failedRequests = [];

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            const cb = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            const desc = d.exception ? d.exception.description : d.text;
            console.error('\n🔴 [RUNTIME EXCEPTION]', desc, `at ${d.url}:${d.lineNumber}:${d.columnNumber}`);
            runtimeExceptions.push({ desc, url: d.url, line: d.lineNumber, col: d.columnNumber });
        } else if (msg.method === 'Runtime.consoleAPICalled') {
            const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            if (msg.params.type === 'error') {
                console.error('🔴 [CONSOLE ERROR]', args);
                consoleErrors.push(args);
            } else if (msg.params.type === 'warning') {
                console.warn('🟡 [CONSOLE WARN]', args);
            } else {
                consoleLogs.push(args);
            }
        } else if (msg.method === 'Network.responseReceived') {
            const res = msg.params.response;
            if (res.status >= 400) {
                console.error(`🔴 [HTTP ${res.status}] ${res.url}`);
                failedRequests.push({ status: res.status, url: res.url });
            }
        } else if (msg.method === 'Network.loadingFailed') {
            console.error(`🔴 [NET FAIL] ${msg.params.errorText} for id:`, msg.params.requestId);
            failedRequests.push({ failed: true, error: msg.params.errorText });
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
    await send('Console.enable');
    await send('Network.enable');

    console.log('Waiting 5s for page to load and run scripts...');
    await new Promise(r => setTimeout(r, 5000));

    async function evalCode(code) {
        const res = await send('Runtime.evaluate', {
            expression: `(() => { ${code} })()`,
            awaitPromise: true,
            returnByValue: true
        });
        if (res.exceptionDetails) {
            console.error('Eval error:', res.exceptionDetails);
        }
        return res.result ? res.result.value : null;
    }

    console.log('\n================ 1. PAGE LOADED STATE ================');
    console.log('URL:', await evalCode('return window.location.href;'));
    console.log('Title:', await evalCode('return document.title;'));
    console.log('AppState.isServerOnline:', await evalCode('return AppState.isServerOnline;'));
    console.log('AppState.projects length:', await evalCode('return AppState.projects.length;'));
    console.log('AppState.currentProject:', await evalCode('return AppState.currentProject;'));
    console.log('AppState.qldaProjects length:', await evalCode('return AppState.qldaProjects.length;'));
    console.log('AppState.currentQldaProject:', await evalCode('return AppState.currentQldaProject;'));
    console.log('Active view:', await evalCode('return AppState.activeView;'));

    // Check KPI elements
    console.log('kpi-total:', await evalCode('return document.getElementById("kpi-total")?.innerText;'));
    console.log('kpi-completed:', await evalCode('return document.getElementById("kpi-completed")?.innerText;'));
    console.log('kpi-missing:', await evalCode('return document.getElementById("kpi-missing")?.innerText;'));

    // Test Navigation: Materials
    console.log('\n================ 2. TEST MATERIALS VIEW ================');
    await evalCode(`navigateTo('materials');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active view now:', await evalCode('return AppState.activeView;'));
    console.log('page-materials display:', await evalCode('return document.getElementById("page-materials")?.style.display;'));
    console.log('Hang muc select options:', await evalCode('return document.querySelectorAll("#mat-select-sheet option").length;'));
    console.log('Current material tab:', await evalCode('return currentMaterialTab;'));
    console.log('Size table rows:', await evalCode('return document.querySelectorAll("#size-summary-tbody tr").length;'));
    console.log('First size row:', await evalCode('return document.querySelector("#size-summary-tbody tr")?.innerText?.slice(0, 100);'));

    // Switch to Assemblies (Tree) Tab
    console.log('\nTesting Assemblies (Tree) Tab:');
    await evalCode(`
        const tabTree = document.getElementById('tab-tree');
        if (tabTree) switchMaterialTab('tree', tabTree);
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Assemblies cards rendered:', await evalCode('return document.querySelectorAll(".assembly-card").length;'));

    // Switch to By-Day Tab
    console.log('\nTesting By-Day Tab:');
    await evalCode(`
        const tabDay = document.getElementById('tab-day');
        if (tabDay) switchMaterialTab('day', tabDay);
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Daily rows rendered:', await evalCode('return document.querySelectorAll("#daily-receipts-tbody tr").length;'));

    // Test Date Modal
    console.log('\nTesting Date Modal:');
    await evalCode(`openDateModal();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Date modal open:', await evalCode('return document.getElementById("modal-date-picker")?.classList.contains("open");'));
    console.log('Date badges count:', await evalCode('return document.querySelectorAll("#date-modal-grid .date-badge-item").length;'));
    await evalCode(`closeDateModal();`);
    await new Promise(r => setTimeout(r, 300));
    console.log('Date modal closed:', await evalCode('return !document.getElementById("modal-date-picker")?.classList.contains("open");'));

    // Test Export Excel Modal
    console.log('\nTesting Export Excel Modal:');
    await evalCode(`openExportModal();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Export modal open:', await evalCode('return document.getElementById("modal-export-excel")?.classList.contains("open");'));
    await evalCode(`closeExportModal();`);
    await new Promise(r => setTimeout(r, 300));
    console.log('Export modal closed:', await evalCode('return !document.getElementById("modal-export-excel")?.classList.contains("open");'));

    // Test Navigation: Projects (QLDA)
    console.log('\n================ 3. TEST PROJECTS (QLDA) VIEW ================');
    await evalCode(`navigateTo('projects');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active view now:', await evalCode('return AppState.activeView;'));
    console.log('page-projects display:', await evalCode('return document.getElementById("page-projects")?.style.display;'));
    console.log('QLDA table rows:', await evalCode('return document.querySelectorAll("#qlda-table-body tr").length;'));
    console.log('QLDA first row:', await evalCode('return document.querySelector("#qlda-table-body tr")?.innerText?.slice(0, 100);'));

    // Test QLDA Detail Modal
    console.log('\nTesting QLDA Detail Modal:');
    await evalCode(`openQldaModal('A290');`);
    await new Promise(r => setTimeout(r, 500));
    console.log('QLDA modal open:', await evalCode('return document.getElementById("qlda-modal")?.classList.contains("open");'));
    await evalCode(`closeQldaModal();`);
    await new Promise(r => setTimeout(r, 300));
    console.log('QLDA modal closed:', await evalCode('return !document.getElementById("qlda-modal")?.classList.contains("open");'));

    // Test Navigation: DVG View
    console.log('\n================ 4. TEST DVG VIEW ================');
    await evalCode(`navigateTo('dvg');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active view now:', await evalCode('return AppState.activeView;'));
    console.log('page-dvg display:', await evalCode('return document.getElementById("page-dvg")?.style.display;'));

    // Test Navigation: Charts View
    console.log('\n================ 5. TEST CHARTS VIEW ================');
    await evalCode(`navigateTo('charts');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active view now:', await evalCode('return AppState.activeView;'));
    console.log('page-charts display:', await evalCode('return document.getElementById("page-charts")?.style.display;'));

    // Test Navigation: Admin View
    console.log('\n================ 6. TEST ADMIN VIEW ================');
    await evalCode(`navigateTo('admin');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active view now:', await evalCode('return AppState.activeView;'));
    console.log('page-admin display:', await evalCode('return document.getElementById("page-admin")?.style.display;'));

    // Test Sidebar Collapse
    console.log('\n================ 7. TEST SIDEBAR COLLAPSE ================');
    await evalCode(`toggleSidebarCollapse();`);
    await new Promise(r => setTimeout(r, 300));
    console.log('Sidebar is collapsed:', await evalCode('return document.getElementById("sidebar")?.classList.contains("collapsed");'));
    await evalCode(`toggleSidebarCollapse();`);
    await new Promise(r => setTimeout(r, 300));
    console.log('Sidebar restored:', await evalCode('return !document.getElementById("sidebar")?.classList.contains("collapsed");'));

    console.log('\n================ SUMMARY ================');
    console.log('Runtime Exceptions count:', runtimeExceptions.length);
    console.log('Console Errors count:', consoleErrors.length);
    console.log('Failed Requests count:', failedRequests.length);

    if (runtimeExceptions.length > 0) {
        console.log('\nRuntime Exceptions:', JSON.stringify(runtimeExceptions, null, 2));
    }
    if (consoleErrors.length > 0) {
        console.log('\nConsole Errors:', JSON.stringify(consoleErrors, null, 2));
    }
    if (failedRequests.length > 0) {
        console.log('\nFailed Requests:', JSON.stringify(failedRequests, null, 2));
    }

    chrome.kill();
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
