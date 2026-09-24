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
        '--remote-debugging-port=9224',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9224',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9224/json');
    console.log('Targets:', targets.map(t => ({ title: t.title, url: t.url })));

    // Find the demo page target
    const target = targets.find(t => t.url.includes('demo')) || targets[0];
    console.log('Selected target:', target.url, target.webSocketDebuggerUrl);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            const cb = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            console.error('[EXCEPTION]', JSON.stringify(msg.params.exceptionDetails));
        } else if (msg.method === 'Console.messageAdded') {
            const m = msg.params.message;
            console.log(`[CONSOLE ${m.level.toUpperCase()}] ${m.text}`);
        } else if (msg.method === 'Network.responseReceived') {
            if (msg.params.response.status >= 400) {
                console.error(`[HTTP ${msg.params.response.status}] ${msg.params.response.url}`);
            }
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

    console.log('Reloading page...');
    await send('Page.reload');

    await new Promise(r => setTimeout(r, 4000));

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

    console.log('--- Page State ---');
    console.log('URL:', await evalCode('return window.location.href;'));
    console.log('Title:', await evalCode('return document.title;'));
    console.log('Sidebar exists:', await evalCode('return !!document.getElementById("sidebar");'));
    console.log('Projects count:', await evalCode('return document.querySelectorAll("#project-select option").length;'));
    console.log('Current project:', await evalCode('return document.getElementById("project-select")?.value;'));
    console.log('Active page:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    // Check dashboard KPI values
    console.log('KPI BOM Total:', await evalCode('return document.getElementById("kpi-bom-total")?.innerText;'));
    console.log('KPI BOM Received:', await evalCode('return document.getElementById("kpi-bom-received")?.innerText;'));
    console.log('KPI QLDA Total:', await evalCode('return document.getElementById("kpi-qlda-total")?.innerText;'));

    // Test clicking navigation
    console.log('\n--- Switching to Materials Page ---');
    await evalCode(`
        const link = document.querySelector('[data-page="page-materials"]');
        if (link) link.click();
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page now:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    console.log('\n--- Switching Materials Tabs ---');
    // Tab size
    await evalCode(`document.querySelector('[data-tab="size"]')?.click();`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Size BOM table rows:', await evalCode('return document.querySelectorAll("#size-bom-tbody tr").length;'));
    console.log('First size row:', await evalCode('return document.querySelector("#size-bom-tbody tr")?.innerText;'));

    // Tab day
    await evalCode(`document.querySelector('[data-tab="day"]')?.click();`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Daily receipts table rows:', await evalCode('return document.querySelectorAll("#daily-receipts-tbody tr").length;'));
    console.log('First daily row:', await evalCode('return document.querySelector("#daily-receipts-tbody tr")?.innerText;'));

    // Test Date Picker
    console.log('\n--- Testing Date Picker ---');
    await evalCode(`document.getElementById('btn-pick-date')?.click();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Date modal open:', await evalCode('return document.getElementById("modal-date-picker")?.classList.contains("active");'));
    console.log('Quick dates available:', await evalCode('return Array.from(document.querySelectorAll("#quick-date-chips .date-chip")).map(c => c.innerText);'));

    // Click first date chip
    await evalCode(`
        const chip = document.querySelector('#quick-date-chips .date-chip');
        if (chip) chip.click();
    `);
    await new Promise(r => setTimeout(r, 500));
    console.log('Date modal closed after select:', await evalCode('return !document.getElementById("modal-date-picker")?.classList.contains("active");'));
    console.log('Active date label:', await evalCode('return document.getElementById("active-date-label")?.innerText;'));

    // Test Export Modal
    console.log('\n--- Testing Export Modal ---');
    await evalCode(`document.getElementById('btn-open-export-modal')?.click();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Export modal open:', await evalCode('return document.getElementById("modal-export-excel")?.classList.contains("active");'));
    // Close export modal
    await evalCode(`document.querySelector("#modal-export-excel .modal-close")?.click();`);
    await new Promise(r => setTimeout(r, 500));
    console.log('Export modal closed:', await evalCode('return !document.getElementById("modal-export-excel")?.classList.contains("active");'));

    // Test QLDA Page
    console.log('\n--- Testing QLDA Page ---');
    await evalCode(`
        const link = document.querySelector('[data-page="page-projects"]');
        if (link) link.click();
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page now:', await evalCode('return document.querySelector(".page-content.active")?.id;'));
    console.log('QLDA project select value:', await evalCode('return document.getElementById("qlda-project-select")?.value;'));
    console.log('QLDA table rows:', await evalCode('return document.querySelectorAll("#qlda-table-tbody tr").length;'));

    // Test Admin Page
    console.log('\n--- Testing Admin Page ---');
    await evalCode(`
        const link = document.querySelector('[data-page="page-admin"]');
        if (link) link.click();
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page now:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    // Test Charts Page
    console.log('\n--- Testing Charts Page ---');
    await evalCode(`
        const link = document.querySelector('[data-page="page-charts"]');
        if (link) link.click();
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Active page now:', await evalCode('return document.querySelector(".page-content.active")?.id;'));

    console.log('\n--- Test Done ---');
    chrome.kill();
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
