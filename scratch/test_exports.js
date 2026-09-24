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
        '--remote-debugging-port=9231',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9231',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9231/json');
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    let id = 1;
    const callbacks = new Map();
    const runtimeExceptions = [];
    const consoleErrors = [];

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && callbacks.has(msg.id)) {
            const cb = callbacks.get(msg.id);
            callbacks.delete(msg.id);
            if (msg.error) cb.reject(msg.error);
            else cb.resolve(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            console.error('\n🔴 [RUNTIME EXCEPTION]', d.text, d.exception ? d.exception.description : '');
            runtimeExceptions.push(d);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
            const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            console.error('🔴 [CONSOLE ERROR]', args);
            consoleErrors.push(args);
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

    await new Promise(r => setTimeout(r, 4000));

    async function evalCode(code) {
        const res = await send('Runtime.evaluate', {
            expression: `(() => { ${code} })()`,
            awaitPromise: true,
            returnByValue: true
        });
        if (res.exceptionDetails) {
            console.error('Eval error in:', code, res.exceptionDetails);
        }
        return res.result ? res.result.value : null;
    }

    console.log('Testing Export functions...');
    console.log('typeof exportSizeTable:', await evalCode('return typeof exportSizeTable'));
    console.log('typeof exportDailyReceiptsExcel:', await evalCode('return typeof exportDailyReceiptsExcel'));
    console.log('typeof exportQldaExcel:', await evalCode('return typeof exportQldaExcel'));
    console.log('typeof openExportModal:', await evalCode('return typeof openExportModal'));

    // Test calling exportSizeTable without crash
    console.log('Calling exportSizeTable (should trigger download or open url)...');
    await evalCode(`
        try {
            exportSizeTable();
        } catch(e) {
            console.error(e);
        }
    `);
    await new Promise(r => setTimeout(r, 1000));

    // Test calling exportQldaExcel without crash
    console.log('Calling exportQldaExcel...');
    await evalCode(`
        try {
            exportQldaExcel();
        } catch(e) {
            console.error(e);
        }
    `);
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n--- Export verification done ---');
    console.log('Exceptions count:', runtimeExceptions.length);
    console.log('Console errors count:', consoleErrors.length);

    chrome.kill();
    process.exit(0);
}

run().catch(console.error);
