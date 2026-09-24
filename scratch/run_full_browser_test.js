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
        '--remote-debugging-port=9227',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9227',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9227/json');
    console.log('Targets:', targets.map(t => ({ type: t.type, title: t.title, url: t.url })));

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
                console.log(`[CONSOLE ${msg.params.type}]`, args);
                consoleLogs.push(args);
            }
        } else if (msg.method === 'Network.responseReceived') {
            const res = msg.params.response;
            if (res.status >= 400) {
                console.error(`🔴 [HTTP ${res.status}] ${res.url}`);
                failedRequests.push({ status: res.status, url: res.url });
            }
        } else if (msg.method === 'Network.loadingFailed') {
            console.error(`🔴 [NET FAIL] ${msg.params.errorText} for url:`, msg.params.requestId);
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

    console.log('\n================ PAGE LOADED STATE ================');
    console.log('URL:', await evalCode('return window.location.href;'));
    console.log('Title:', await evalCode('return document.title;'));
    console.log('typeof AppState:', await evalCode('return typeof AppState;'));
    console.log('Projects count:', await evalCode('return document.querySelectorAll("#project-select option").length;'));
    console.log('Current project:', await evalCode('return document.getElementById("project-select")?.value;'));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));
    console.log('KPI BOM Total:', await evalCode('return document.getElementById("kpi-bom-total")?.innerText;'));
    console.log('KPI BOM Received:', await evalCode('return document.getElementById("kpi-bom-received")?.innerText;'));
    console.log('KPI QLDA Total:', await evalCode('return document.getElementById("kpi-qlda-total")?.innerText;'));

    // Test Navigation: Materials
    console.log('\n================ TEST MATERIALS PAGE ================');
    await evalCode(`switchPage('page-materials');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    // Check Hang muc table
    console.log('Category table rows:', await evalCode('return document.querySelectorAll("#cat-bom-tbody tr").length;'));

    // Switch to Size tab
    console.log('\nTesting Size Tab:');
    await evalCode(`switchMaterialTab('size');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Size BOM table rows:', await evalCode('return document.querySelectorAll("#size-bom-tbody tr").length;'));
    console.log('First size row text:', await evalCode('return document.querySelector("#size-bom-tbody tr")?.innerText?.slice(0, 100);'));

    // Switch to Day tab
    console.log('\nTesting Day Tab:');
    await evalCode(`switchMaterialTab('day');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Daily receipts table rows:', await evalCode('return document.querySelectorAll("#daily-receipts-tbody tr").length;'));
    console.log('First day row text:', await evalCode('return document.querySelector("#daily-receipts-tbody tr")?.innerText?.slice(0, 100);'));

    // Test Date Picker Modal
    console.log('\nTesting Date Picker Modal:');
    await evalCode(`openDatePickerModal();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Date modal active:', await evalCode('return document.getElementById("modal-date-picker")?.classList.contains("active");'));
    console.log('Date chips count:', await evalCode('return document.querySelectorAll("#quick-date-chips .date-chip").length;'));
    await evalCode(`closeDatePickerModal();`);
    await new Promise(r => setTimeout(r, 300));

    // Test Export Excel Modal
    console.log('\nTesting Export Excel Modal:');
    await evalCode(`openExportModal();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Export modal active:', await evalCode('return document.getElementById("modal-export-excel")?.classList.contains("active");'));
    await evalCode(`closeExportModal();`);
    await new Promise(r => setTimeout(r, 300));

    // Test Navigation: Projects (QLDA)
    console.log('\n================ TEST PROJECTS (QLDA) PAGE ================');
    await evalCode(`switchPage('page-projects');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));
    console.log('QLDA project select value:', await evalCode('return document.getElementById("qlda-project-select")?.value;'));
    console.log('QLDA table rows count:', await evalCode('return document.querySelectorAll("#qlda-table-tbody tr").length;'));
    console.log('QLDA first row text:', await evalCode('return document.querySelector("#qlda-table-tbody tr")?.innerText?.slice(0, 100);'));

    // Test Navigation: Admin Page
    console.log('\n================ TEST ADMIN PAGE ================');
    await evalCode(`switchPage('page-admin');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    // Test Navigation: Charts Page
    console.log('\n================ TEST CHARTS PAGE ================');
    await evalCode(`switchPage('page-charts');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    // Test Navigation: DVG Page
    console.log('\n================ TEST DVG PAGE ================');
    await evalCode(`switchPage('page-dvg');`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    console.log('\n================ TEST RESULTS SUMMARY ================');
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
