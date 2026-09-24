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
        '--remote-debugging-port=9230',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9230',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/demo/'
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const targets = await fetchJson('http://127.0.0.1:9230/json');
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
            const desc = d.exception ? d.exception.description : d.text;
            console.error('\n🔴 [RUNTIME EXCEPTION]', desc, `at ${d.url}:${d.lineNumber}:${d.columnNumber}`);
            runtimeExceptions.push({ desc, url: d.url, line: d.lineNumber, col: d.columnNumber });
        } else if (msg.method === 'Runtime.consoleAPICalled') {
            const args = (msg.params.args || []).map(a => a.value || a.description || JSON.stringify(a)).join(' ');
            if (msg.params.type === 'error') {
                console.error('🔴 [CONSOLE ERROR]', args);
                consoleErrors.push(args);
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

    console.log('=== TEST 1: DATE SELECTION & DAILY RECEIPTS ===');
    await evalCode(`navigateTo('materials')`);
    await new Promise(r => setTimeout(r, 500));

    // Get available dates
    const dates = await evalCode('return AppState.projectData?.all_delivery_dates || []');
    console.log('Available dates count:', dates.length, 'First 3 dates:', dates.slice(0, 3));

    if (dates.length > 0) {
        const testDate = dates[0];
        console.log(`Selecting date: ${testDate}...`);
        await evalCode(`selectDate('${testDate}')`);
        await new Promise(r => setTimeout(r, 500));

        // Switch to day tab
        await evalCode(`
            const tabDay = document.getElementById('tab-day');
            if (tabDay) switchMaterialTab('day', tabDay);
        `);
        await new Promise(r => setTimeout(r, 500));

        const dayRowsCount = await evalCode('return document.querySelectorAll("#day-table-body tr").length');
        console.log(`day-table-body rows count for ${testDate}:`, dayRowsCount);
        const dayRowText = await evalCode('return document.querySelector("#day-table-body tr")?.innerText?.slice(0, 100)');
        console.log('First row in daily receipts:', dayRowText);
    }

    console.log('\n=== TEST 2: SWITCHING PROJECTS IN MATERIALS ===');
    const projects = await evalCode('return AppState.projects.map(p => p.project_id || p.file_name)');
    console.log('Available BOM projects:', projects);
    if (projects.length > 1) {
        const nextProj = projects[1];
        console.log(`Switching BOM project to ${nextProj}...`);
        await evalCode(`
            const sel = document.getElementById('mat-select-project');
            if (sel) {
                sel.value = '${nextProj}';
                sel.dispatchEvent(new Event('change'));
            }
        `);
        await new Promise(r => setTimeout(r, 1500));
        console.log('Current project after switch:', await evalCode('return AppState.currentProject'));
        console.log('Size table rows after switch:', await evalCode('return document.querySelectorAll("#size-table-body tr").length'));
    }

    console.log('\n=== TEST 3: QLDA MODAL DETAIL ===');
    await evalCode(`navigateTo('projects')`);
    await new Promise(r => setTimeout(r, 1000));
    const firstQldaProj = await evalCode('return AppState.currentQldaProject');
    console.log('Opening QLDA modal for project:', firstQldaProj);
    await evalCode(`openQldaModal('${firstQldaProj}')`);
    await new Promise(r => setTimeout(r, 800));
    console.log('QLDA modal table rows count:', await evalCode('return document.querySelectorAll("#qlda-modal-body tbody tr").length'));
    console.log('QLDA modal first row:', await evalCode('return document.querySelector("#qlda-modal-body tbody tr")?.innerText?.slice(0, 100)'));
    await evalCode(`closeQldaModal()`);

    console.log('\n=== TEST 4: CHARTS IN DASHBOARD ===');
    await evalCode(`navigateTo('dashboard')`);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Donut chart instance exists:', await evalCode('return !!chartDonutInstance'));
    console.log('Line chart instance exists:', await evalCode('return !!chartLineInstance'));
    console.log('DVG chart instance exists:', await evalCode('return !!chartDvgInstance'));
    console.log('Compare chart instance exists:', await evalCode('return !!chartCompareInstance'));

    console.log('\n=== TEST 5: ALL SIDEBAR NAVIGATION CLICKS ===');
    const navItems = ['dashboard', 'materials', 'projects', 'dvg', 'charts', 'admin'];
    for (const item of navItems) {
        console.log(`Clicking nav item: ${item}...`);
        await evalCode(`navigateTo('${item}')`);
        await new Promise(r => setTimeout(r, 300));
        const visiblePage = await evalCode(`
            const visible = Array.from(document.querySelectorAll('.page-view')).filter(el => el.style.display !== 'none');
            return visible.map(el => el.id);
        `);
        console.log(`Visible pages for ${item}:`, visiblePage);
    }

    console.log('\n=== SUMMARY OF TESTS ===');
    console.log('Runtime exceptions:', runtimeExceptions.length);
    console.log('Console errors:', consoleErrors.length);
    if (runtimeExceptions.length > 0) {
        console.log('Exceptions detail:', JSON.stringify(runtimeExceptions, null, 2));
    }
    if (consoleErrors.length > 0) {
        console.log('Console errors detail:', JSON.stringify(consoleErrors, null, 2));
    }

    chrome.kill();
    process.exit(0);
}

run().catch(console.error);
