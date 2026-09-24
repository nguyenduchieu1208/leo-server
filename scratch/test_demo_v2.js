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
        '--remote-debugging-port=9240',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9240',
        '--disable-extensions',
        '--no-first-run',
        '--disable-gpu',
        'http://localhost:8000/'
    ]);

    await new Promise(r => setTimeout(r, 2500));
    const targets = await fetchJson('http://127.0.0.1:9240/json');
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

    await new Promise(r => ws.onopen = r);
    await send('Runtime.enable');
    await send('Page.enable');

    console.log('=== WAITING FOR APP TO LOAD ===');
    await new Promise(r => setTimeout(r, 2000));

    async function evalCode(expression) {
        const res = await send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            console.error('Eval error in:', expression, res.exceptionDetails);
        }
        return res.result ? res.result.value : null;
    }

    console.log('=== TEST 1: MATERIALS MONTH DROPDOWN & DATE PILLS ===');
    await evalCode("switchPage('materials')");
    await new Promise(r => setTimeout(r, 1200));

    const monthOptions = await evalCode(`
        Array.from(document.querySelectorAll('#mat-select-month option')).map(o => ({ value: o.value, text: o.textContent.trim() }))
    `);
    console.log('Month dropdown options count:', monthOptions.length);
    console.log('First 5 months:', monthOptions.slice(0, 5));

    const datePills = await evalCode(`
        Array.from(document.querySelectorAll('#date-pills-container .date-pill')).map(p => p.textContent.trim())
    `);
    console.log('Date pills count:', datePills.length);
    console.log('First 6 date pills:', datePills.slice(0, 6));

    console.log('=== TEST 2: SWITCHING MONTH FILTER ===');
    if (monthOptions.length > 1) {
        const targetMonth = monthOptions[1].value;
        console.log('Selecting month:', targetMonth, monthOptions[1].text);
        await evalCode(`
            document.getElementById('mat-select-month').value = '${targetMonth}';
            onMonthFilterChange('${targetMonth}');
        `);
        await new Promise(r => setTimeout(r, 800));
        const filteredPills = await evalCode(`
            Array.from(document.querySelectorAll('#date-pills-container .date-pill')).map(p => p.textContent.trim())
        `);
        console.log('Filtered date pills count:', filteredPills.length);
        console.log('Filtered date pills sample:', filteredPills.slice(0, 5));
    }

    console.log('=== TEST 3: TAB NHẬN THEO NGÀY ===');
    await evalCode("switchMaterialTab('day', document.getElementById('tab-day'))");
    await new Promise(r => setTimeout(r, 800));
    const dailyRows = await evalCode(`
        Array.from(document.querySelectorAll('#day-table-body tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()).join(' | ')
        )
    `);
    console.log('Daily receipts rows count:', dailyRows.length);
    console.log('First 3 daily receipts rows:\n', dailyRows.slice(0, 3).join('\n'));

    console.log('=== TEST 4: DVG ANALYSIS PAGE & A290 PROJECT ===');
    await evalCode("switchPage('dvg')");
    await new Promise(r => setTimeout(r, 500));
    const dvgProjects = await evalCode(`
        Array.from(document.querySelectorAll('#dvg-select-project option')).map(o => ({ value: o.value, text: o.textContent.trim() }))
    `);
    console.log('DVG Projects count:', dvgProjects.length);
    console.log('First 5 DVG projects:', dvgProjects.slice(0, 5));

    console.log('Switching DVG project to A290...');
    await evalCode(`
        document.getElementById('dvg-select-project').value = 'A290';
        changeDvgProject('A290');
    `);
    await new Promise(r => setTimeout(r, 800));

    const dvgRows = await evalCode(`
        Array.from(document.querySelectorAll('#dvg-table-body tr')).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()).join(' | ')
        )
    `);
    console.log('DVG table rows for A290 count:', dvgRows.length);
    console.log('DVG table rows:\n', dvgRows.join('\n'));

    console.log('Testing Chart type toggle buttons in DVG (bar, line, doughnut)...');
    await evalCode("setDvgChartType('line')");
    await new Promise(r => setTimeout(r, 200));
    await evalCode("setDvgChartType('doughnut')");
    await new Promise(r => setTimeout(r, 200));
    await evalCode("setDvgChartType('bar')");
    await new Promise(r => setTimeout(r, 200));

    console.log('=== TEST 5: CHARTS PAGE & PROJECT SELECTOR ===');
    await evalCode("switchPage('charts')");
    await new Promise(r => setTimeout(r, 800));
    const chartProjects = await evalCode(`
        Array.from(document.querySelectorAll('#chart-select-project option')).map(o => ({ value: o.value, text: o.textContent.trim() }))
    `);
    console.log('Chart projects count:', chartProjects.length);
    console.log('Switching Chart project to A290...');
    await evalCode(`
        document.getElementById('chart-select-project').value = 'A290';
        onChartProjectChange();
    `);
    await new Promise(r => setTimeout(r, 1200));

    const lineChartLabels = await evalCode(`
        chartChartsLineInstance ? chartChartsLineInstance.data.labels.slice(0, 5) : []
    `);
    console.log('Line chart first 5 labels (dates DD/MM/YYYY):', lineChartLabels);

    console.log('\n=== SUMMARY OF TESTS ===');
    console.log('Runtime exceptions:', runtimeExceptions.length);
    console.log('Console errors:', consoleErrors.length);
    if (runtimeExceptions.length > 0) {
        console.log('Exceptions detail:', JSON.stringify(runtimeExceptions, null, 2));
    }
    if (consoleErrors.length > 0) {
        console.log('Errors detail:', JSON.stringify(consoleErrors, null, 2));
    }

    try { ws.close(); } catch(e) {}
    try { chrome.kill(); } catch(e) {}
    process.exit(0);
}

run().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
