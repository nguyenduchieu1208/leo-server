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
        '--remote-debugging-port=9226',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9226',
        '--no-first-run',
        '--disable-gpu',
        'about:blank'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9226/json');
    const target = targets[0];
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
            const d = msg.params.exceptionDetails;
            console.error('[EXCEPTION]', d.text, d.exception ? d.exception.description : '', `${d.url}:${d.lineNumber}:${d.columnNumber}`);
        } else if (msg.method === 'Runtime.consoleAPICalled') {
            const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            console.log(`[CONSOLE ${msg.params.type}] ${args}`);
        } else if (msg.method === 'Network.requestWillBeSent') {
            console.log(`[REQ] ${msg.params.request.method} ${msg.params.request.url}`);
        } else if (msg.method === 'Network.responseReceived') {
            const res = msg.params.response;
            console.log(`[RESP ${res.status}] ${res.url}`);
        } else if (msg.method === 'Network.loadingFailed') {
            console.error(`[NET FAIL] ${msg.params.errorText} for url:`, msg.params.requestId);
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

    console.log('Navigating to http://localhost:8000/demo/ ...');
    const navResult = await send('Page.navigate', { url: 'http://localhost:8000/demo/' });
    console.log('Page.navigate result:', navResult);

    await new Promise(r => setTimeout(r, 6000));

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

    console.log('\n--- Checking Document ---');
    console.log('URL:', await evalCode('return window.location.href;'));
    console.log('ReadyState:', await evalCode('return document.readyState;'));
    console.log('Body HTML snippet:', await evalCode('return document.body ? document.body.innerHTML.slice(0, 300) : "NO BODY";'));

    chrome.kill();
    process.exit(0);
}

run().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
