const { spawn } = require('child_process');
const http = require('http');

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
        this.eventListeners = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.id && this.callbacks.has(msg.id)) {
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) reject(msg.error);
                    else resolve(msg.result);
                } else if (msg.method) {
                    const listeners = this.eventListeners.get(msg.method) || [];
                    listeners.forEach(cb => cb(msg.params));
                }
            };
        });
    }

    on(method, callback) {
        if (!this.eventListeners.has(method)) {
            this.eventListeners.set(method, []);
        }
        this.eventListeners.get(method).push(callback);
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const reqId = this.id++;
            this.callbacks.set(reqId, { resolve, reject });
            this.ws.send(JSON.stringify({ id: reqId, method, params }));
        });
    }

    async eval(expr) {
        const res = await this.send('Runtime.evaluate', {
            expression: expr,
            awaitPromise: true,
            returnByValue: true
        });
        if (res.exceptionDetails) {
            console.error('Eval error for:', expr, res.exceptionDetails);
        }
        return res.result ? res.result.value : null;
    }
}

async function run() {
    console.log('Starting headless Chrome on port 9223...');
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--remote-debugging-port=9223',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9223',
        '--no-first-run',
        '--disable-gpu',
        'about:blank'
    ]);

    chrome.on('error', (err) => console.error('Failed to spawn Chrome:', err));

    let targets = null;
    for (let i = 0; i < 20; i++) {
        await wait(500);
        try {
            targets = await fetchJson('http://127.0.0.1:9223/json');
            if (targets && targets.length > 0) break;
        } catch (e) {
            // keep waiting
        }
    }

    if (!targets || targets.length === 0) {
        console.error('Could not get Chrome targets');
        chrome.kill();
        process.exit(1);
    }

    console.log('Chrome target acquired:', targets[0].webSocketDebuggerUrl);
    const client = new CDPClient(targets[0].webSocketDebuggerUrl);
    await client.connect();

    const errors = [];
    const logs = [];
    const networkErrors = [];

    client.on('Runtime.exceptionThrown', (params) => {
        const desc = params.exceptionDetails.exception 
            ? (params.exceptionDetails.exception.description || params.exceptionDetails.text)
            : params.exceptionDetails.text;
        const url = params.exceptionDetails.url;
        const line = params.exceptionDetails.lineNumber;
        const col = params.exceptionDetails.columnNumber;
        console.error(`[EXCEPTION] ${url}:${line}:${col} -> ${desc}`);
        errors.push({ type: 'EXCEPTION', url, line, col, desc });
    });

    client.on('Console.messageAdded', (params) => {
        const msg = params.message;
        if (msg.level === 'error') {
            console.error(`[CONSOLE ERROR] ${msg.url}:${msg.line} -> ${msg.text}`);
            errors.push({ type: 'CONSOLE_ERROR', url: msg.url, line: msg.line, text: msg.text });
        } else {
            logs.push(`[${msg.level}] ${msg.text}`);
        }
    });

    client.on('Network.responseReceived', (params) => {
        const { response } = params;
        if (response.status >= 400) {
            console.error(`[HTTP ${response.status}] ${response.url}`);
            networkErrors.push({ status: response.status, url: response.url });
        }
    });

    client.on('Network.loadingFailed', (params) => {
        console.error(`[NETWORK FAILED] ${params.errorText} for requestId ${params.requestId}`);
        networkErrors.push({ failed: true, error: params.errorText });
    });

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Console.enable');
    await client.send('Network.enable');

    console.log('Navigating to http://localhost:8000/demo/ ...');
    await client.send('Page.navigate', { url: 'http://localhost:8000/demo/' });

    // Wait for load
    await wait(3000);

    console.log('Testing page interactions...');

    // 1. Check title and active page
    const title = await client.eval('document.title');
    console.log('Document title:', title);

    const activePage = await client.eval('document.querySelector(".page-content.active")?.id');
    console.log('Active page initially:', activePage);

    // 2. Check loaded state of projects
    const projectOptions = await client.eval(`
        Array.from(document.querySelectorAll('#project-select option')).map(o => ({ value: o.value, text: o.text }))
    `);
    console.log('Project select options:', projectOptions);

    // 3. Navigate through each page via sidebar link
    const pages = ['page-dashboard', 'page-materials', 'page-projects', 'page-dvg', 'page-charts', 'page-admin'];
    for (const page of pages) {
        console.log(`\n--- Switching to page: ${page} ---`);
        await client.eval(`
            const link = document.querySelector('[data-page="${page}"]');
            if (link) {
                link.click();
            } else if (typeof switchPage === 'function') {
                switchPage('${page}');
            }
        `);
        await wait(1000);

        // Check if page element has active class
        const isCurrentActive = await client.eval(`document.getElementById('${page}')?.classList.contains('active')`);
        console.log(`Is ${page} active:`, isCurrentActive);
        
        if (page === 'page-materials') {
            console.log('Testing materials tabs...');
            // Tab 1: cat
            await client.eval(`document.querySelector('[data-tab="cat"]')?.click()`);
            await wait(600);
            // Tab 2: size
            await client.eval(`document.querySelector('[data-tab="size"]')?.click()`);
            await wait(600);
            const sizeRows = await client.eval(`document.querySelectorAll('#size-bom-tbody tr').length`);
            console.log('Size BOM table rows:', sizeRows);
            // Tab 3: day
            await client.eval(`document.querySelector('[data-tab="day"]')?.click()`);
            await wait(600);
            const dayRows = await client.eval(`document.querySelectorAll('#daily-receipts-tbody tr').length`);
            console.log('Daily receipts table rows:', dayRows);

            // Test Date Picker Modal
            console.log('Testing date picker modal...');
            await client.eval(`document.getElementById('btn-pick-date')?.click()`);
            await wait(500);
            const modalOpen = await client.eval(`document.getElementById('modal-date-picker')?.classList.contains('active')`);
            console.log('Date modal opened:', modalOpen);
            // Close date modal
            await client.eval(`document.querySelector('#modal-date-picker .modal-close')?.click()`);
            await wait(500);

            // Test Export Modal
            console.log('Testing export modal...');
            await client.eval(`document.getElementById('btn-open-export-modal')?.click()`);
            await wait(500);
            const exportOpen = await client.eval(`document.getElementById('modal-export-excel')?.classList.contains('active')`);
            console.log('Export modal opened:', exportOpen);
            // Close export modal
            await client.eval(`document.querySelector('#modal-export-excel .modal-close')?.click()`);
            await wait(500);
        }

        if (page === 'page-projects') {
            console.log('Testing projects page...');
            const pSummary = await client.eval(`document.getElementById('qlda-summary-total')?.innerText`);
            console.log('QLDA summary total text:', pSummary);
            const qldaRows = await client.eval(`document.querySelectorAll('#qlda-table-tbody tr').length`);
            console.log('QLDA table rows:', qldaRows);
        }

        if (page === 'page-admin') {
            console.log('Testing admin page...');
            const adminActive = await client.eval(`document.getElementById('page-admin')?.classList.contains('active')`);
            console.log('Admin page active:', adminActive);
        }
    }

    // Test sidebar collapse toggle
    console.log('\n--- Testing Sidebar Collapse ---');
    await client.eval(`document.getElementById('btn-collapse-sidebar')?.click()`);
    await wait(300);
    const sidebarCollapsed = await client.eval(`document.getElementById('sidebar')?.classList.contains('collapsed')`);
    console.log('Sidebar collapsed:', sidebarCollapsed);
    await client.eval(`document.getElementById('btn-collapse-sidebar')?.click()`);
    await wait(300);

    console.log('\n================ SUMMARY ================');
    console.log(`Total Runtime Exceptions: ${errors.filter(e => e.type === 'EXCEPTION').length}`);
    console.log(`Total Console Errors: ${errors.filter(e => e.type === 'CONSOLE_ERROR').length}`);
    console.log(`Total Network Errors: ${networkErrors.length}`);
    
    if (errors.length > 0) {
        console.log('\nDETAILS OF ERRORS:');
        console.log(JSON.stringify(errors, null, 2));
    }
    if (networkErrors.length > 0) {
        console.log('\nDETAILS OF NETWORK ERRORS:');
        console.log(JSON.stringify(networkErrors, null, 2));
    }

    chrome.kill();
    console.log('Finished testing.');
}

run().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
