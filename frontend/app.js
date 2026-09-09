/**
 * Frontend Application Logic for AMECC Materials Tracker - Super Fast & Light Theme Edition
 * Tối ưu hóa hiệu năng đỉnh cao:
 * 1. Phân trang tải luân phiên (Virtual Batch Rendering / Infinite Scroll)
 * 2. Tải lười (Lazy-render) chi tiết BTP: Chỉ vẽ bảng khi bấm mở cấu kiện
 * 3. Tải lười các Tab (Chỉ vẽ Timeline hoặc Shape khi người dùng bấm vào tab đó)
 * 4. Sử dụng Inline SVG siêu nhẹ thay cho việc quét toàn trang với Lucide
 */

const SVG_ICONS = {
    chevronRight: `<svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    chevronDown: `<svg class="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    check: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    clock: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    x: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    alertTriangle: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
};

let state = {
    projects: [],
    currentProject: null,
    projectData: null,
    selectedSheet: 'all',
    selectedDate: 'all',
    selectedStatus: 'all',
    searchQuery: '',
    isAdmin: false,
    expandedAssemblies: new Set(),
    // Performance pagination
    visibleCount: 35,
    filteredAssemblies: [],
    activeTab: 'tree',
    scrollObserver: null
};

// Hàm chuyển đổi định dạng hiển thị sang Ngày/Tháng/Năm (DD/MM/YYYY)
function formatDateDisplay(dStr) {
    if (!dStr || dStr === 'all') return dStr;
    const s = String(dStr).trim();
    const mISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (mISO) {
        const [, y, mo, d] = mISO;
        return `${d.padStart(2, '0')}/${mo.padStart(2, '0')}/${y}`;
    }
    return s;
}

// Hàm tính khóa sắp xếp theo thời gian chính xác
function parseDateSortKey(dStr) {
    if (!dStr || dStr === 'all') return 0;
    const s = String(dStr).trim();
    const mVN = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mVN) {
        return new Date(parseInt(mVN[3]), parseInt(mVN[2]) - 1, parseInt(mVN[1])).getTime();
    }
    const mISO = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (mISO) {
        return new Date(parseInt(mISO[1]), parseInt(mISO[2]) - 1, parseInt(mISO[3])).getTime();
    }
    return new Date(s).getTime() || 0;
}

document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    await loadServerInfo();
    setInterval(loadServerInfo, 15000); // Giãn tần suất polling để không gây nghẽn mạng
    
    await loadProjectsList();
    setupEventListeners();
});

// 1. Tải thông tin mạng LAN & Public Link & Phân quyền Admin
async function loadServerInfo() {
    try {
        const res = await fetch('/api/info');
        const info = await res.json();
        state.isAdmin = info.is_admin || false;
        
        const ipText = document.getElementById('lan-ip-text');
        if (ipText) {
            ipText.textContent = info.lan_url;
            ipText.dataset.url = info.lan_url;
        }

        const tunnelText = document.getElementById('tunnel-url-text');
        if (tunnelText) {
            if (info.public_url) {
                tunnelText.textContent = info.public_url;
                tunnelText.dataset.url = info.public_url;
                tunnelText.className = "text-indigo-700 font-mono font-bold select-all";
            } else {
                tunnelText.textContent = "Đang khởi tạo...";
            }
        }

        const btnReload = document.getElementById('btn-reload-data');
        if (btnReload) {
            if (state.isAdmin) {
                btnReload.classList.remove('hidden');
                btnReload.classList.add('flex');
            } else {
                btnReload.classList.add('hidden');
                btnReload.classList.remove('flex');
            }
        }

        const btnUpload = document.getElementById('btn-upload-excel');
        if (btnUpload) {
            if (state.isAdmin) {
                btnUpload.classList.remove('hidden');
                btnUpload.classList.add('flex');
            } else {
                btnUpload.classList.add('hidden');
                btnUpload.classList.remove('flex');
            }
        }
    } catch (e) {
        console.error("Lỗi lấy thông tin server:", e);
    }
}

// 2. Tải danh sách file dự án
async function loadProjectsList() {
    const select = document.getElementById('select-project');
    try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        state.projects = data.projects || [];
        
        select.innerHTML = '';
        if (state.projects.length === 0) {
            select.innerHTML = '<option value="">Không tìm thấy file Excel nào trong thư mục Data</option>';
            return;
        }

        state.projects.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.file_path;
            opt.textContent = `${p.display_name || p.project_id} (${(p.size_bytes / 1024 / 1024).toFixed(1)} MB)`;
            select.appendChild(opt);
        });

        if (state.projects.length > 0) {
            select.value = state.projects[0].file_path;
            await loadProjectData(state.projects[0].file_path);
        }
    } catch (e) {
        select.innerHTML = '<option value="">Lỗi nạp danh sách file</option>';
        console.error(e);
    }
}

// 3. Tải chi tiết dữ liệu dự án
async function loadProjectData(filePath, forceReload = false) {
    const container = document.getElementById('assemblies-container');
    container.innerHTML = `
        <div class="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <div class="inline-block animate-spin text-blue-600 mb-3">
                <i data-lucide="loader-2" class="w-8 h-8"></i>
            </div>
            <p class="text-slate-600 text-sm font-medium">Đang tải và nạp dữ liệu từ RAM...</p>
        </div>
    `;
    lucide.createIcons();

    try {
        const url = `/api/project-data?file_path=${encodeURIComponent(filePath)}${forceReload ? '&force_reload=true' : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        
        state.projectData = await res.json();
        state.expandedAssemblies.clear();
        state.selectedDate = 'all';
        state.selectedSheet = 'all';
        state.visibleCount = 35;
        
        renderSheetSelector();
        renderDatePills();
        updateKPIs();
        applyFiltersAndRender(true);
        
        // Cập nhật số lượng cảnh báo Shape trên Badge
        const shapeTabBadge = document.getElementById('shape-tab-badge');
        if (shapeTabBadge) {
            shapeTabBadge.textContent = state.projectData.total_shape_issues || 0;
        }

        // Tải nội dung tab tương ứng nếu đang mở Tab 2 hoặc 3
        if (state.activeTab === 'timeline') renderDailyTimeline();
        if (state.activeTab === 'shape') renderShapeWarnings();

    } catch (e) {
        container.innerHTML = `
            <div class="p-8 text-center bg-red-50 border border-red-200 rounded-2xl text-red-800">
                <i data-lucide="alert-circle" class="w-10 h-10 mx-auto mb-2 text-red-600"></i>
                <h3 class="font-bold text-base">Lỗi khi đọc file Excel</h3>
                <p class="text-xs text-red-600 mt-1">${e.message}</p>
            </div>
        `;
        lucide.createIcons();
    }
}

// 4. Cập nhật các thẻ KPI
function updateKPIs() {
    if (!state.projectData) return;
    const data = state.projectData;
    
    const kpiTotal = document.getElementById('kpi-total-assy');
    const kpiCompleted = document.getElementById('kpi-completed-assy');
    const kpiPartial = document.getElementById('kpi-partial-assy');
    const kpiShape = document.getElementById('kpi-shape-issues');

    if (kpiTotal) kpiTotal.textContent = data.total_assemblies || 0;
    if (kpiCompleted) kpiCompleted.textContent = data.completed_assemblies || 0;
    if (kpiPartial) kpiPartial.textContent = data.partial_assemblies || 0;
    if (kpiShape) kpiShape.textContent = data.total_shape_issues || 0;
}

// Hiển thị danh sách dropdown chọn Sheet
function renderSheetSelector() {
    const selectSheet = document.getElementById('select-sheet');
    if (!selectSheet || !state.projectData) return;

    selectSheet.innerHTML = '<option value="all">📂 Tất cả hạng mục (Sheets)</option>';
    const bomSheets = state.projectData.bom_sheets || [];
    bomSheets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = `Hạng mục: ${s}`;
        selectSheet.appendChild(opt);
    });
}

// 5. Hiển thị các nút chọn Ngày nhận (Sắp xếp theo Ngày/Tháng/Năm DD/MM/YYYY)
function renderDatePills() {
    const container = document.getElementById('date-pills-container');
    if (!container || !state.projectData) return;
    
    const rawDates = state.projectData.all_delivery_dates || [];
    const sortedDates = [...rawDates].sort((a, b) => parseDateSortKey(a) - parseDateSortKey(b));
    
    container.innerHTML = `
        <button data-date="all" class="date-pill active px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-xs transition cursor-pointer">
            Tất cả ngày
        </button>
    `;

    sortedDates.forEach(d => {
        const btn = document.createElement('button');
        btn.dataset.date = d;
        btn.className = "date-pill px-3 py-1 rounded-lg text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300 transition font-mono cursor-pointer";
        btn.textContent = formatDateDisplay(d);
        container.appendChild(btn);
    });

    container.querySelectorAll('.date-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.date-pill').forEach(b => {
                b.classList.remove('active', 'bg-blue-600', 'text-white');
                b.classList.add('bg-slate-200', 'text-slate-700');
            });
            btn.classList.add('active', 'bg-blue-600', 'text-white');
            btn.classList.remove('bg-slate-200', 'text-slate-700');
            
            state.selectedDate = btn.dataset.date;
            applyFiltersAndRender(true);
            if (state.activeTab === 'timeline') renderDailyTimeline();
        });
    });
}

// 6. Áp dụng bộ lọc và kích hoạt vẽ danh sách
function applyFiltersAndRender(resetPagination = true) {
    if (!state.projectData) return;
    let assemblies = state.projectData.assemblies || [];

    // Lọc theo Hạng mục (Sheet)
    if (state.selectedSheet && state.selectedSheet !== 'all') {
        assemblies = assemblies.filter(a => a.sheet === state.selectedSheet);
    }

    // Lọc theo Tìm kiếm
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        assemblies = assemblies.filter(a => {
            if (a.assembly_no.toLowerCase().includes(q) || a.dwg.toLowerCase().includes(q) || a.size.toLowerCase().includes(q)) return true;
            return a.parts.some(p => p.part_no.toLowerCase().includes(q) || p.part_cut.toLowerCase().includes(q) || p.size.toLowerCase().includes(q));
        });
    }

    // Lọc theo trạng thái
    if (state.selectedStatus !== 'all') {
        if (state.selectedStatus === 'shape_issue') {
            assemblies = assemblies.filter(a => a.has_shape_issue);
        } else {
            assemblies = assemblies.filter(a => a.status === state.selectedStatus);
        }
    }

    // Lọc theo Ngày nhận
    if (state.selectedDate !== 'all') {
        assemblies = assemblies.filter(a => {
            return a.daily_received && a.daily_received[state.selectedDate] > 0;
        });
    }

    state.filteredAssemblies = assemblies;
    if (resetPagination) {
        state.visibleCount = 35;
    }

    const countElem = document.getElementById('filtered-assy-count');
    if (countElem) countElem.textContent = assemblies.length;

    renderAssemblies();
}

// 7. Tạo HTML chi tiết bảng BTP con (Chỉ tạo khi người dùng bấm mở thẻ)
function buildPartsTableHtml(assy) {
    if (!assy.parts || assy.parts.length === 0) {
        return `<p class="p-4 text-xs text-slate-400 italic">Không có chi tiết BTP con nào.</p>`;
    }

    return `
        <div class="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-2xs">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-bold text-[11px]">
                        <th class="py-2 px-3">Mã BTP (Chi tiết)</th>
                        <th class="py-2 px-3">Chủng Loại</th>
                        <th class="py-2 px-3">Quy Cách (Size)</th>
                        <th class="py-2 px-3 text-right">Chiều Dài (mm)</th>
                        <th class="py-2 px-3 text-right">SL Thiết Kế</th>
                        <th class="py-2 px-3 text-right">Đã Nhận</th>
                        <th class="py-2 px-3 text-right">Còn Thiếu</th>
                        <th class="py-2 px-3">Tiến Độ Theo Ngày</th>
                        <th class="py-2 px-3">Trạng Thái / Shape</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                    ${assy.parts.map(p => {
                        const sa = p.shape_analysis || {};
                        let chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-bold">Khác</span>';
                        if (p.chung_loai.toUpperCase() === 'PLATE') {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-plate font-bold">PLATE</span>';
                        } else if (sa.is_shape) {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-shape font-bold">SHAPE</span>';
                        } else if (p.chung_loai.toUpperCase().includes('PUR')) {
                            chungLoaiBadge = '<span class="px-2 py-0.5 rounded text-[10px] badge-purchasing font-bold">PURCHASING</span>';
                        }

                        const dateKeys = Object.keys(p.dates_received || {}).sort((a, b) => parseDateSortKey(a) - parseDateSortKey(b));
                        let datesHtml = '';
                        if (dateKeys.length > 0) {
                            datesHtml = dateKeys.map(d => {
                                const isHighlight = state.selectedDate === d;
                                return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono mr-1 mb-1 font-bold ${isHighlight ? 'bg-blue-600 text-white' : 'bg-slate-100 text-blue-700 border border-slate-300'}">${formatDateDisplay(d)}: <strong>${p.dates_received[d]}</strong></span>`;
                            }).join('');
                        } else {
                            datesHtml = '<span class="text-slate-400 italic">Chưa có ngày</span>';
                        }

                        let shapeNotice = '';
                        if (sa.has_length_issue) {
                            shapeNotice = `
                                <div class="text-[11px] text-orange-900 bg-orange-50 border border-orange-200 rounded-md p-1.5 mt-1 font-medium">
                                    <span class="font-bold text-orange-700">⚠️ Lưu ý Shape:</span> ${sa.message}
                                </div>
                            `;
                        }

                        const isDone = p.is_fully_received;
                        return `
                            <tr class="hover:bg-slate-50/80 transition ${isDone ? 'bg-emerald-50/40' : ''}">
                                <td class="py-2 px-3 font-bold text-slate-900 font-mono">${p.display_name}</td>
                                <td class="py-2 px-3">${chungLoaiBadge}</td>
                                <td class="py-2 px-3 font-mono text-slate-700">${p.size}</td>
                                <td class="py-2 px-3 text-right font-mono font-medium">${p.length || '-'}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold">${p.tqty}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold text-blue-600">${p.da_nhan}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold ${p.con_thieu > 0 ? 'text-red-600' : 'text-slate-400'}">${p.con_thieu}</td>
                                <td class="py-2 px-3">${datesHtml}</td>
                                <td class="py-2 px-3">
                                    ${isDone 
                                        ? '<span class="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">Đã đủ</span>'
                                        : (p.da_nhan > 0 
                                            ? '<span class="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-200">Đang về</span>'
                                            : '<span class="inline-flex items-center gap-1 text-[11px] text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded border border-red-200">Chưa có</span>'
                                          )
                                    }
                                    ${shapeNotice}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// 8. Hiển thị Cây Cấu kiện & BTP con (Tab 1 - Phân trang Batch Rendering siêu nhanh)
function renderAssemblies() {
    const container = document.getElementById('assemblies-container');
    if (!state.projectData || !container) return;

    if (state.scrollObserver) {
        state.scrollObserver.disconnect();
        state.scrollObserver = null;
    }

    const assemblies = state.filteredAssemblies;

    if (assemblies.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="inbox" class="w-10 h-10 mx-auto mb-2 text-slate-400"></i>
                <p class="font-medium">Không có cấu kiện nào phù hợp với bộ lọc hiện tại.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Chỉ render danh sách visibleCount đầu tiên
    const visibleAssemblies = assemblies.slice(0, state.visibleCount);
    
    let htmlBuffer = visibleAssemblies.map(assy => {
        const isExpanded = state.expandedAssemblies.has(assy.id);
        const displayRate = assy.completion_rate;
        const displayReceivedParts = assy.received_parts_count;
        
        let dayNote = '';
        if (state.selectedDate !== 'all') {
            const qtyOnDay = assy.daily_received[state.selectedDate] || 0;
            dayNote = `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-xs border border-blue-200">Nhận ngày ${formatDateDisplay(state.selectedDate)}: ${qtyOnDay} cái</span>`;
        }

        let statusBadge = '';
        if (assy.status === 'completed') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">${SVG_ICONS.check} Đủ 100%</span>`;
        } else if (assy.status === 'partial') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">${SVG_ICONS.clock} Đang về</span>`;
        } else {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1">${SVG_ICONS.x} Chưa có BTP</span>`;
        }

        let shapeWarningBadge = '';
        if (assy.has_shape_issue) {
            shapeWarningBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-300 flex items-center gap-1" title="Vướng mắc phôi cắt thép hình Shape">${SVG_ICONS.alertTriangle} Vướng Thép Hình (${assy.shape_issues_count})</span>`;
        }

        const chevron = isExpanded ? SVG_ICONS.chevronDown : SVG_ICONS.chevronRight;
        const detailsContent = isExpanded ? buildPartsTableHtml(assy) : '';

        return `
            <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:border-slate-300 transition" id="card-${assy.id}">
                <!-- Assembly Header Row -->
                <div class="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none assy-header bg-white hover:bg-slate-50/80 transition" data-id="${assy.id}">
                    <div class="flex items-center space-x-3">
                        <button class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition chevron-btn pointer-events-none">
                            <span class="chevron-icon">${chevron}</span>
                        </button>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="text-base font-extrabold text-slate-900 tracking-wide">${assy.assembly_no}</span>
                                <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold">${assy.dwg}</span>
                                <span class="text-xs text-slate-500 font-mono">${assy.size}</span>
                            </div>
                            <p class="text-xs text-slate-500 mt-0.5 font-medium">Sheet: <span class="text-blue-700 font-mono font-semibold">${assy.sheet}</span> • Gồm <strong class="text-slate-900">${assy.total_parts_count}</strong> BTP con</p>
                        </div>
                    </div>

                    <div class="flex items-center flex-wrap gap-3">
                        ${dayNote}
                        ${shapeWarningBadge}
                        ${statusBadge}

                        <div class="w-28 sm:w-36 flex flex-col items-end gap-1">
                            <div class="flex justify-between w-full text-[11px] font-bold">
                                <span class="text-slate-500">${displayReceivedParts}/${assy.total_parts_count} BTP</span>
                                <span class="${displayRate === 100 ? 'text-emerald-600' : 'text-blue-600'}">${displayRate}%</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                <div class="progress-bar-fill h-full rounded-full ${displayRate === 100 ? 'bg-emerald-500' : 'bg-blue-600'}" style="width: ${displayRate}%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Child BTP Table (Lazy-rendered) -->
                <div class="assy-details border-t border-slate-200 bg-slate-50/50 p-4 ${isExpanded ? '' : 'hidden'}" id="details-${assy.id}" ${isExpanded ? 'data-rendered="true"' : ''}>
                    ${detailsContent}
                </div>
            </div>
        `;
    }).join('');

    // Nếu còn cấu kiện chưa hiển thị, thêm thanh cuộn tự động / nút tải thêm
    if (state.visibleCount < assemblies.length) {
        const remaining = assemblies.length - state.visibleCount;
        htmlBuffer += `
            <div id="infinite-scroll-trigger" class="py-6 text-center">
                <button id="btn-load-more" class="px-6 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 shadow-xs transition cursor-pointer">
                    ⚡ Đang hiển thị ${state.visibleCount}/${assemblies.length} cấu kiện • Bấm hoặc cuộn xuống để xem thêm ${Math.min(remaining, 50)} cấu kiện
                </button>
            </div>
        `;
    }

    container.innerHTML = htmlBuffer;

    // Gắn sự kiện Click mở/đóng từng cấu kiện
    container.querySelectorAll('.assy-header').forEach(header => {
        header.addEventListener('click', function(e) {
            const id = this.dataset.id;
            const details = document.getElementById(`details-${id}`);
            const icon = this.querySelector('.chevron-icon');
            if (!details) return;

            const isCurrentlyHidden = details.classList.contains('hidden');
            if (isCurrentlyHidden) {
                state.expandedAssemblies.add(id);
                // Nếu chưa từng render nội dung table thì tạo ngay lúc này
                if (!details.dataset.rendered) {
                    const targetAssy = state.filteredAssemblies.find(a => a.id === id);
                    if (targetAssy) {
                        details.innerHTML = buildPartsTableHtml(targetAssy);
                        details.dataset.rendered = "true";
                    }
                }
                details.classList.remove('hidden');
                if (icon) icon.innerHTML = SVG_ICONS.chevronDown;
            } else {
                state.expandedAssemblies.delete(id);
                details.classList.add('hidden');
                if (icon) icon.innerHTML = SVG_ICONS.chevronRight;
            }
        });
    });

    // Cài đặt Nút Tải thêm & Cuộn vô tận (Infinite Scroll)
    const trigger = document.getElementById('infinite-scroll-trigger');
    if (trigger) {
        const btnMore = document.getElementById('btn-load-more');
        const loadNextBatch = () => {
            state.visibleCount += 50;
            renderAssemblies();
        };

        if (btnMore) btnMore.addEventListener('click', loadNextBatch);

        // Tự động load tiếp khi cuộn tới cuối trang
        if ('IntersectionObserver' in window) {
            state.scrollObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    loadNextBatch();
                }
            }, { rootMargin: '200px' });
            state.scrollObserver.observe(trigger);
        }
    }
}

// 9. Hiển thị Bảng nhận hàng theo ngày (Tab 2 - Sắp xếp theo Ngày/Tháng/Năm)
function renderDailyTimeline() {
    const container = document.getElementById('daily-matrix-container');
    if (!state.projectData || !container) return;

    const daily = state.projectData.daily_delivery || {};
    const sortedDates = Object.keys(daily).sort((a, b) => parseDateSortKey(b) - parseDateSortKey(a));

    if (sortedDates.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="calendar-x" class="w-10 h-10 mx-auto mb-2 text-slate-400"></i>
                <p class="font-medium">Chưa có dữ liệu các cột ngày nhận trong sheet BTP của file này.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    sortedDates.forEach(d_str => {
        if (state.selectedDate !== 'all' && state.selectedDate !== d_str) return;

        const dData = daily[d_str];
        const card = document.createElement('div');
        card.className = "bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5 shadow-xs";
        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-slate-200 pb-3">
                <div class="flex items-center gap-2.5">
                    <span class="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <i data-lucide="calendar" class="w-5 h-5"></i>
                    </span>
                    <div>
                        <h3 class="text-base font-extrabold text-slate-900">${formatDateDisplay(d_str)}</h3>
                        <p class="text-xs text-slate-500 font-medium">Ảnh hưởng đến <strong class="text-slate-800">${dData.assemblies_affected.length}</strong> cấu kiện</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-xl font-extrabold text-blue-600 font-mono">${dData.total_qty}</span>
                    <span class="text-xs text-slate-500 font-medium block">Tổng chi tiết nhận</span>
                </div>
            </div>

            <div class="flex flex-wrap gap-1.5 py-1">
                <span class="text-xs text-slate-500 font-bold mr-1">Cấu kiện nhận chi tiết:</span>
                ${dData.assemblies_affected.map(a => `<span class="px-2 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-xs font-bold border border-slate-200">${a}</span>`).join('')}
            </div>

            <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                            <th class="py-2 px-3">Cấu Kiện</th>
                            <th class="py-2 px-3">Bản Vẽ</th>
                            <th class="py-2 px-3">Mã BTP (Chi tiết)</th>
                            <th class="py-2 px-3">Quy Cách (Size)</th>
                            <th class="py-2 px-3">Chủng Loại</th>
                            <th class="py-2 px-3 text-right">SL Nhận Vào Ngày</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${dData.parts_list.map(p => `
                            <tr class="hover:bg-slate-50">
                                <td class="py-2 px-3 font-bold text-slate-900 font-mono">${p.assembly_no}</td>
                                <td class="py-2 px-3 font-mono text-slate-600">${p.dwg}</td>
                                <td class="py-2 px-3 font-mono text-blue-700 font-bold">${p.part_name}</td>
                                <td class="py-2 px-3 font-mono text-slate-700">${p.size}</td>
                                <td class="py-2 px-3">${p.chung_loai}</td>
                                <td class="py-2 px-3 text-right font-mono font-bold text-blue-600">${p.qty_received}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

// 10. Hiển thị Danh Sách Cảnh Báo Thép Hình (Tab 3)
function renderShapeWarnings() {
    const container = document.getElementById('shape-warnings-container');
    if (!state.projectData || !container) return;

    const warnings = state.projectData.shape_warnings || [];
    if (warnings.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 bg-white border border-slate-200 rounded-2xl text-slate-500 shadow-xs">
                <i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-2 text-emerald-500"></i>
                <p class="font-medium text-slate-700">Tuyệt vời! Không có cảnh báo vướng mắc chiều dài phôi cắt Thép hình (Shape).</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    container.innerHTML = `
        <div class="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div class="p-4 bg-orange-50/80 border-b border-orange-200 flex items-center justify-between">
                <div class="flex items-center gap-2 text-orange-950 font-bold text-sm">
                    <i data-lucide="alert-triangle" class="w-4 h-4 text-orange-600"></i>
                    <span>Danh Sách Chi Tiết Thép Hình Chưa Nhận Do Chiều Dài Cắt (${warnings.length} chi tiết)</span>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold uppercase text-[11px]">
                            <th class="py-2.5 px-3">Cấu Kiện</th>
                            <th class="py-2.5 px-3">Mã BTP (Chi tiết)</th>
                            <th class="py-2.5 px-3">Quy Cách (Size)</th>
                            <th class="py-2.5 px-3 text-right">Dài TK (mm)</th>
                            <th class="py-2.5 px-3 text-right">SL Cần</th>
                            <th class="py-2.5 px-3">Mã Phôi Cắt (Cutting No)</th>
                            <th class="py-2.5 px-3 text-right">SL Phôi</th>
                            <th class="py-2.5 px-3">Nguyên Nhân / Cảnh Báo</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        ${warnings.map(w => `
                            <tr class="hover:bg-orange-50/40">
                                <td class="py-2.5 px-3 font-mono font-bold text-slate-900">${w.assembly_no}</td>
                                <td class="py-2.5 px-3 font-mono font-bold text-blue-700">${w.part_name}</td>
                                <td class="py-2.5 px-3 font-mono">${w.size}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-orange-700">${w.design_length || '-'}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold">${w.tqty}</td>
                                <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${w.cutting_no || '-'}</td>
                                <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-700">${w.qty_cutting || '-'}</td>
                                <td class="py-2.5 px-3 text-orange-900 font-medium">${w.message}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// 11. Đăng ký sự kiện tương tác
function setupEventListeners() {
    // Đổi File Dự Án
    const selectProject = document.getElementById('select-project');
    if (selectProject) {
        selectProject.addEventListener('change', (e) => {
            if (e.target.value) {
                loadProjectData(e.target.value);
            }
        });
    }

    // Đổi Hạng Mục (Sheet)
    const selectSheet = document.getElementById('select-sheet');
    if (selectSheet) {
        selectSheet.addEventListener('change', (e) => {
            state.selectedSheet = e.target.value;
            const badge = document.getElementById('export-scope-badge');
            if (badge) {
                badge.textContent = state.selectedSheet === 'all' 
                    ? 'Tất cả các sheet' 
                    : `Hạng mục: ${state.selectedSheet}`;
            }
            applyFiltersAndRender(true);
        });
    }

    // Đổi Trạng Thái
    const selectStatus = document.getElementById('select-status');
    if (selectStatus) {
        selectStatus.addEventListener('change', (e) => {
            state.selectedStatus = e.target.value;
            applyFiltersAndRender(true);
        });
    }

    // Tìm kiếm với Debounce 250ms
    let searchTimeout = null;
    const inputSearch = document.getElementById('input-search');
    if (inputSearch) {
        inputSearch.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.searchQuery = e.target.value.trim();
                applyFiltersAndRender(true);
            }, 250);
        });
    }

    // Nút Tải lên file Excel mới (Dành cho cả Cloud & Local)
    const btnUpload = document.getElementById('btn-upload-excel');
    const fileInput = document.getElementById('excel-file-input');
    if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const formData = new FormData();
            formData.append('file', file);

            const originalText = btnUpload.innerHTML;
            btnUpload.disabled = true;
            btnUpload.innerHTML = `<span>⏳ Đang tải lên...</span>`;

            try {
                const res = await fetch('/api/upload-excel', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.detail || "Lỗi tải lên");

                alert(`🎉 ${result.message}`);
                await loadProjectsList();
            } catch (err) {
                alert(`❌ Lỗi tải lên: ${err.message}`);
            } finally {
                btnUpload.disabled = false;
                btnUpload.innerHTML = originalText;
                fileInput.value = '';
                lucide.createIcons();
            }
        });
    }

    // Nút Làm mới (Chủ máy)
    const btnReload = document.getElementById('btn-reload-data');
    if (btnReload) {
        btnReload.addEventListener('click', async () => {
            const curFile = document.getElementById('select-project').value;
            if (curFile) {
                try {
                    await fetch('/api/clear-cache', { method: 'POST' });
                    await loadProjectData(curFile, true);
                    alert("Đã làm mới và nạp lại toàn bộ dữ liệu dự án từ ổ cứng vào RAM thành công!");
                } catch (err) {
                    alert("Lỗi khi làm mới: " + err.message);
                }
            }
        });
    }

    // Xuất file Excel
    function handleExport(mode) {
        const curFile = document.getElementById('select-project').value;
        if (!curFile) {
            alert("Vui lòng chọn một file dự án trước khi xuất Excel!");
            return;
        }

        const btn = mode === 'missing' 
            ? document.getElementById('btn-export-missing') 
            : document.getElementById('btn-export-full');

        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1"></i> Đang tạo file Excel...`;
            lucide.createIcons();
        }

        const targetSheetParam = state.selectedSheet && state.selectedSheet !== 'all' 
            ? `&target_sheet=${encodeURIComponent(state.selectedSheet)}` 
            : '';

        const exportUrl = `/api/export-excel?file_path=${encodeURIComponent(curFile)}&mode=${mode}${targetSheetParam}`;
        window.location.href = exportUrl;

        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                lucide.createIcons();
            }
        }, 2500);
    }

    const btnExportMissing = document.getElementById('btn-export-missing');
    if (btnExportMissing) {
        btnExportMissing.addEventListener('click', () => handleExport('missing'));
    }

    const btnExportFull = document.getElementById('btn-export-full');
    if (btnExportFull) {
        btnExportFull.addEventListener('click', () => handleExport('full'));
    }

    // Copy link Wi-Fi / LAN
    const btnCopyIp = document.getElementById('btn-copy-ip');
    if (btnCopyIp) {
        btnCopyIp.addEventListener('click', () => {
            const url = document.getElementById('lan-ip-text').dataset.url || window.location.origin;
            navigator.clipboard.writeText(url).then(() => {
                alert(`Đã sao chép link mạng Wi-Fi:\n${url}\n\nĐồng nghiệp trong cùng mạng Wi-Fi có thể truy cập ngay!`);
            });
        });
    }

    // Copy link Mạng ngoài / 4G
    const btnCopyTunnel = document.getElementById('btn-copy-tunnel');
    if (btnCopyTunnel) {
        btnCopyTunnel.addEventListener('click', () => {
            const url = document.getElementById('tunnel-url-text').dataset.url;
            if (url) {
                navigator.clipboard.writeText(url).then(() => {
                    alert(`Đã sao chép link mạng ngoài (Cố định vĩnh viễn):\n${url}\n\nNgười dùng ở xa, dùng 4G hoặc ở nhà đều truy cập được!`);
                });
            } else {
                alert("Đường link mạng ngoài đang khởi tạo, bạn vui lòng đợi vài giây nhé!");
            }
        });
    }

    // Chuyển Tab (Tải lười theo yêu cầu)
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.nav-tab').forEach(t => {
                t.classList.remove('active', 'text-blue-600', 'border-blue-600');
                t.classList.add('text-slate-500', 'border-transparent');
            });
            tab.classList.add('active', 'text-blue-600', 'border-blue-600');
            tab.classList.remove('text-slate-500', 'border-transparent');

            const tabName = tab.dataset.tab;
            state.activeTab = tabName;

            document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
            const targetPane = document.getElementById(`tab-${tabName}-content`);
            if (targetPane) targetPane.classList.remove('hidden');

            if (tabName === 'timeline') renderDailyTimeline();
            if (tabName === 'shape') renderShapeWarnings();
        });
    });

    // Mở rộng tất cả các cấu kiện đang hiển thị
    const btnExpandAll = document.getElementById('btn-expand-all');
    if (btnExpandAll) {
        btnExpandAll.addEventListener('click', () => {
            const visibleAssemblies = state.filteredAssemblies.slice(0, state.visibleCount);
            visibleAssemblies.forEach(a => {
                state.expandedAssemblies.add(a.id);
                const details = document.getElementById(`details-${a.id}`);
                const card = document.getElementById(`card-${a.id}`);
                if (details) {
                    if (!details.dataset.rendered) {
                        details.innerHTML = buildPartsTableHtml(a);
                        details.dataset.rendered = "true";
                    }
                    details.classList.remove('hidden');
                }
                if (card) {
                    const icon = card.querySelector('.chevron-icon');
                    if (icon) icon.innerHTML = SVG_ICONS.chevronDown;
                }
            });
        });
    }

    // Thu gọn tất cả
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    if (btnCollapseAll) {
        btnCollapseAll.addEventListener('click', () => {
            state.expandedAssemblies.clear();
            document.querySelectorAll('.assy-details').forEach(d => d.classList.add('hidden'));
            document.querySelectorAll('.chevron-icon').forEach(icon => icon.innerHTML = SVG_ICONS.chevronRight);
        });
    }
}
