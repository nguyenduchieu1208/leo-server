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
        '--remote-debugging-port=9229',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9229',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9229/json');
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
        } else if (msg.method === 'Runtime.exceptionThrown') {
            console.error('[EXCEPTION]', msg.params.exceptionDetails);
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
            console.error('Eval error:', res.exceptionDetails);
        }
        return res.result ? res.result.value : null;
    }

    console.log('--- Navigating to materials ---');
    await evalCode(`navigateTo('materials')`);
    await new Promise(r => setTimeout(r, 1000));

    console.log('size-table-body rows count:', await evalCode('return document.querySelectorAll("#size-table-body tr").length;'));
    console.log('size-table-body first row:', await evalCode('return document.querySelector("#size-table-body tr")?.innerText;'));

    console.log('--- Switching to Day tab ---');
    await evalCode(`
        const tabDay = document.getElementById('tab-day');
        if (tabDay) switchMaterialTab('day', tabDay);
    `);
    await new Promise(r => setTimeout(r, 1000));
    console.log('day-table-body rows count:', await evalCode('return document.querySelectorAll("#day-table-body tr").length;'));
    console.log('day-table-body first row:', await evalCode('return document.querySelector("#day-table-body tr")?.innerText;'));

    console.log('--- Navigating to projects ---');
    await evalCode(`navigateTo('projects')`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('project-grid cards count:', await evalCode('return document.querySelectorAll("#project-grid .project-card").length;'));
    console.log('project-grid first card title:', await evalCode('return document.querySelector("#project-grid .project-card h3")?.innerText;'));

    chrome.kill();
    process.exit(0);
}

run().catch(console.error);
