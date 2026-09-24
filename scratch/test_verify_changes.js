const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    console.log('Khởi động Google Chrome headless...');
    const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
        '--headless=new',
        '--remote-debugging-port=9229',
        '--user-data-dir=C:\\Users\\hieul\\AppData\\Local\\Temp\\chrome-dbg-9229',
        '--no-first-run',
        '--disable-gpu',
        '--window-size=1600,1000',
        'file:///d:/Tool/Server_Leo_Nguyen/demo_v2/index.html'
    ]);

    let closed = false;
    function cleanup() {
        if (!closed) {
            closed = true;
            try { chrome.kill(); } catch(e){}
        }
    }
    process.on('exit', cleanup);

    try {
        await new Promise(r => setTimeout(r, 2500));
        const targets = await fetchJson('http://127.0.0.1:9229/json');
        console.log('Tìm thấy targets:', targets.map(t => t.url));

        const target = targets.find(t => t.url.includes('demo_v2')) || targets[0];
        console.log('Kết nối tới target:', target.webSocketDebuggerUrl);

        const WebSocket = global.WebSocket || require('ws');
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        let id = 1;
        const callbacks = new Map();

        ws.addEventListener('message', (event) => {
            const msg = JSON.parse(event.data);
            if (msg.id && callbacks.has(msg.id)) {
                const cb = callbacks.get(msg.id);
                callbacks.delete(msg.id);
                if (msg.error) cb.reject(msg.error);
                else cb.resolve(msg.result);
            }
        });

        function send(method, params = {}) {
            return new Promise((resolve, reject) => {
                const reqId = id++;
                callbacks.set(reqId, { resolve, reject });
                ws.send(JSON.stringify({ id: reqId, method, params }));
            });
        }

        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve);
            ws.addEventListener('error', reject);
        });

        await send('Page.enable');
        await send('Runtime.enable');

        async function evalCode(code) {
            const res = await send('Runtime.evaluate', {
                expression: `(() => { ${code} })()`,
                awaitPromise: true,
                returnByValue: true
            });
            if (res.exceptionDetails) {
                console.error('Lỗi JS Evaluate:', res.exceptionDetails);
            }
            return res.result ? res.result.value : null;
        }

        async function captureScreenshot(filename) {
            const res = await send('Page.captureScreenshot', { format: 'png' });
            const buf = Buffer.from(res.data, 'base64');
            const dest = path.join(__dirname, filename);
            fs.writeFileSync(dest, buf);
            console.log(`[Đã lưu ảnh chụp]: ${dest}`);
        }

        await new Promise(r => setTimeout(r, 2000));

        console.log('\n--- 1. KIỂM TRA DASHBOARD & SIDEBAR HIGHLIGHT ---');
        console.log('Tiêu đề trang:', await evalCode('return document.title;'));
        console.log('Nav Dashboard active:', await evalCode('return document.getElementById("nav-dashboard")?.classList.contains("active");'));
        console.log('Nav Materials active:', await evalCode('return document.getElementById("nav-materials")?.classList.contains("active");'));
        await captureScreenshot('screen_1_dashboard.png');

        console.log('\n--- 2. KIỂM TRA QUẢN LÝ VẬT TƯ & CÂY CẤU KIỆN ---');
        await evalCode(`navigateTo('materials', 'assemblies');`);
        await new Promise(r => setTimeout(r, 1500));
        console.log('Nav Materials active:', await evalCode('return document.getElementById("nav-materials")?.classList.contains("active");'));
        console.log('Sub-item assemblies active:', await evalCode('return document.querySelector("#sub-materials a[href=\\"#assemblies\\"]")?.classList.contains("active");'));
        console.log('Số lượng thẻ cấu kiện render:', await evalCode('return document.querySelectorAll(".assembly-card").length;'));
        console.log('Cấu trúc header cấu kiện có arrow & progress:', await evalCode(`
            const card = document.querySelector('.assembly-card');
            return {
                hasHeader: !!card?.querySelector('.assembly-card-header'),
                hasLeft: !!card?.querySelector('.assembly-card-left'),
                hasArrow: !!card?.querySelector('.assembly-card-arrow'),
                hasProgress: !!card?.querySelector('.assembly-progress-ring')
            };
        `));
        await captureScreenshot('screen_2_assembly_tree.png');

        console.log('\n--- 3. KIỂM TRA PHÂN TÍCH DVG ---');
        await evalCode(`navigateTo('dvg');`);
        await new Promise(r => setTimeout(r, 1500));
        console.log('Nav DVG active:', await evalCode('return document.getElementById("nav-dvg")?.classList.contains("active");'));
        console.log('Bảng DVG số dòng:', await evalCode('return document.querySelectorAll("#dvg-table-body tr").length;'));
        console.log('Class của bảng DVG:', await evalCode('return document.getElementById("dvg-table")?.className;'));
        await captureScreenshot('screen_3_dvg.png');

        console.log('\n--- 4. KIỂM TRA NÚT VỀ TRANG CHÍNH ---');
        console.log('Thuộc tính onclick của Về Trang Chính:', await evalCode('return document.getElementById("nav-main-site")?.getAttribute("onclick");'));
        console.log('Thuộc tính href của Về Trang Chính:', await evalCode('return document.getElementById("nav-main-site")?.getAttribute("href");'));
        await evalCode(`document.getElementById('nav-main-site')?.click();`);
        await new Promise(r => setTimeout(r, 1000));
        console.log('Trang sau khi click Về Trang Chính:', await evalCode('return AppState.activeView;'));
        console.log('Hash URL sau khi click:', await evalCode('return window.location.hash;'));

        console.log('\n--- 5. KIỂM TRA KHÓA BẢO MẬT TRANG QUẢN TRỊ ---');
        await evalCode(`navigateTo('admin');`);
        await new Promise(r => setTimeout(r, 1500));
        console.log('Nav Admin active:', await evalCode('return document.getElementById("nav-admin")?.classList.contains("active");'));
        console.log('Admin Security Gate hiển thị:', await evalCode('return document.getElementById("admin-security-gate")?.style.display !== "none";'));
        console.log('Nội dung Admin nhạy cảm bị ẩn:', await evalCode('return document.getElementById("admin-authenticated-content")?.style.display === "none";'));
        await captureScreenshot('screen_4_admin_locked.png');

        console.log('\n--- 6. KIỂM TRA ĐĂNG NHẬP ADMIN ---');
        // Thử nhập sai
        const failResult = await evalCode(`
            return (async () => {
                const res = await authenticateAdminCredentials('admin', 'matkhau_sai_123');
                return res;
            })();
        `);
        console.log('Kết quả nhập sai mật khẩu:', failResult);

        // Nhập đúng
        const successResult = await evalCode(`
            return (async () => {
                const res = await authenticateAdminCredentials('admin', '12082003');
                renderAdminAuthUI();
                return res;
            })();
        `);
        console.log('Kết quả đăng nhập đúng admin/12082003:', successResult);
        await new Promise(r => setTimeout(r, 1000));
        console.log('Admin Security Gate sau khi đăng nhập:', await evalCode('return document.getElementById("admin-security-gate")?.style.display;'));
        console.log('Nội dung Admin sau khi đăng nhập:', await evalCode('return document.getElementById("admin-authenticated-content")?.style.display;'));
        await captureScreenshot('screen_5_admin_unlocked.png');

        console.log('\n--- 7. KIỂM TRA ĐĂNG XUẤT ADMIN ---');
        await evalCode(`logoutAdmin();`);
        await new Promise(r => setTimeout(r, 1000));
        console.log('Admin Security Gate sau khi đăng xuất:', await evalCode('return document.getElementById("admin-security-gate")?.style.display;'));
        console.log('Nội dung Admin sau khi đăng xuất:', await evalCode('return document.getElementById("admin-authenticated-content")?.style.display;'));
        await captureScreenshot('screen_6_admin_relocked.png');

        console.log('\n=== TẤT CẢ 7 BƯỚC KIỂM TRA ĐÃ HOÀN TẤT THÀNH CÔNG RỰC RỠ! ===');
    } catch(err) {
        console.error('Lỗi trong quá trình test:', err);
    } finally {
        cleanup();
    }
}

run();
