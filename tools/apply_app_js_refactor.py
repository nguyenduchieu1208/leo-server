# -*- coding: utf-8 -*-
"""
Script to refactor and synchronize QLDA Dashboard and Tab 2 within frontend/app.js
- Keeps Tab DVG & Đơn vị giao 100% intact
- Synchronizes all charts (Line chart, BTP doughnut/bar, Gantt) with QLDA filter bar
- Enables immediate data jump ('nhảy số liệu') upon changing Hạng mục or any filter
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

def main():
    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. Update window.switchTab to redirect dashboard to qlda charts
    old_switch_tab = """    // Hàm chuyển Tab linh hoạt từ bất kỳ nút nào
    window.switchTab = function(tabName) {"""

    new_switch_tab = """    // Hàm chuyển Tab linh hoạt từ bất kỳ nút nào
    window.switchTab = function(tabName) {
        if (tabName === 'dashboard') {
            window.switchTab('qlda');
            if (typeof window.switchQldaSubtab === 'function') {
                window.switchQldaSubtab('charts');
            }
            return;
        }"""

    if old_switch_tab in code:
        code = code.replace(old_switch_tab, new_switch_tab, 1)
        print("1. Updated window.switchTab")
    else:
        print("1. WARN: old_switch_tab not found")

    # 2. Add window.switchQldaSubtab right after window.switchTab
    old_switch_tab_end = """        if (tabName === 'qlda') initOrRenderQlda();
        if (tabName === 'dashboard') initOrRenderDashboard();
    };"""

    new_switch_tab_end = """        if (tabName === 'qlda') initOrRenderQlda();
        if (tabName === 'dashboard') initOrRenderDashboard();
    };

    // Hàm chuyển đổi Sub-tab trong Tiến Độ Công Đoạn: Ma Trận vs Biểu Đồ
    window.switchQldaSubtab = function(subtabName) {
        const btnMatrix = document.getElementById('btn-qlda-subtab-matrix');
        const btnCharts = document.getElementById('btn-qlda-subtab-charts');
        const paneMatrix = document.getElementById('qlda-pane-matrix');
        const paneCharts = document.getElementById('qlda-pane-charts');

        if (!paneMatrix || !paneCharts) return;

        if (subtabName === 'charts') {
            qldaState.activeSubtab = 'charts';
            paneMatrix.classList.add('hidden');
            paneCharts.classList.remove('hidden');

            if (btnCharts) {
                btnCharts.className = 'qlda-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-purple-800';
            }
            if (btnMatrix) {
                btnMatrix.className = 'qlda-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }

            // Đồng bộ dữ liệu QLDA sang dashboardState nếu cần
            if (!dashboardState.currentProjectData && qldaState.currentProjectData) {
                dashboardState.currentProjectId = qldaState.currentProjectId;
                dashboardState.currentProjectData = qldaState.currentProjectData;
            }
            if (!dashboardState.isInitialized) {
                setupDashboardEventListeners();
                dashboardState.isInitialized = true;
            }

            const items = qldaState.filteredItems || (qldaState.currentProjectData ? qldaState.currentProjectData.items : []);
            renderDashboardAll(items);
        } else {
            qldaState.activeSubtab = 'matrix';
            paneCharts.classList.add('hidden');
            paneMatrix.classList.remove('hidden');

            if (btnMatrix) {
                btnMatrix.className = 'qlda-subtab-btn active flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer bg-white text-emerald-800';
            }
            if (btnCharts) {
                btnCharts.className = 'qlda-subtab-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-white/60';
            }
        }
        if (window.lucide) lucide.createIcons();
    };"""

    if old_switch_tab_end in code:
        code = code.replace(old_switch_tab_end, new_switch_tab_end, 1)
        print("2. Added window.switchQldaSubtab")
    else:
        print("2. WARN: old_switch_tab_end not found")

    # 3. Update loadQldaProject to sync dashboardState and populate months
    target_load_end = """        renderQldaDashboard();
        filterQldaItems();
    } catch (err) {"""

    replacement_load_end = """        // Đồng bộ với Dashboard Tiến Độ Công Đoạn
        dashboardState.currentProjectId = projectId;
        dashboardState.currentProjectData = data;
        if (!dashboardState.isInitialized) {
            setupDashboardEventListeners();
            dashboardState.isInitialized = true;
        }
        populateDashboardMonths(data.items || []);

        renderQldaDashboard();
        filterQldaItems();
    } catch (err) {"""

    if target_load_end in code:
        code = code.replace(target_load_end, replacement_load_end, 1)
        print("3. Updated loadQldaProject with sync & months")
    else:
        print("3. WARN: target_load_end not found")

    # 4. In filterQldaItems: update subview count badge & scope label, and call renderDashboardAll(filtered)
    old_filter_end = """    renderQldaActiveFilterTags();
    renderQldaDashboard(filtered); // Đồng bộ 7 thẻ KPI nhảy tự động theo danh sách cấu kiện đã lọc
    renderQldaTable();
}"""

    new_filter_end = """    // Cập nhật số lượng hiển thị trên Sub-tab và Nhãn phạm vi đang lọc
    const badgeSub = document.getElementById('qlda-badge-subview-count');
    if (badgeSub) badgeSub.textContent = `${filtered.length.toLocaleString()} CK`;
    const scopeLabel = document.getElementById('qlda-current-scope-label');
    if (scopeLabel) {
        let label = hm === 'all' ? 'Tất cả hạng mục' : hm;
        if (pg !== 'all') label += ` • Tổ ${pg}`;
        if (st !== 'all') label += ` • ${st}`;
        scopeLabel.textContent = label;
    }

    renderQldaActiveFilterTags();
    renderQldaDashboard(filtered); // Đồng bộ 7 thẻ KPI nhảy tự động theo danh sách cấu kiện đã lọc
    renderQldaTable();
    renderDashboardAll(filtered); // Đồng bộ toàn bộ biểu đồ Line, BTP, Gantt nhảy tự động theo hạng mục & bộ lọc
}"""

    if old_filter_end in code:
        code = code.replace(old_filter_end, new_filter_end, 1)
        print("4. Updated filterQldaItems to update badge, scope and trigger renderDashboardAll(filtered)")
    else:
        print("4. WARN: old_filter_end not found")

    # 5. In setupQldaEventListeners: Add Sub-tab listeners
    old_setup_end = """    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeQldaAssemblyDetail();
        }
    });
}"""

    new_setup_end = """    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeQldaAssemblyDetail();
        }
    });

    // 14. Sự kiện chuyển Sub-tab giữa Ma Trận Tiến Độ Chi Tiết và Biểu Đồ Tiến Độ Công Đoạn
    const btnSubMatrix = document.getElementById('btn-qlda-subtab-matrix');
    if (btnSubMatrix) {
        btnSubMatrix.addEventListener('click', () => window.switchQldaSubtab('matrix'));
    }
    const btnSubCharts = document.getElementById('btn-qlda-subtab-charts');
    if (btnSubCharts) {
        btnSubCharts.addEventListener('click', () => window.switchQldaSubtab('charts'));
    }
}"""

    if old_setup_end in code:
        code = code.replace(old_setup_end, new_setup_end, 1)
        print("5. Added Sub-tab click listeners to setupQldaEventListeners")
    else:
        print("5. WARN: old_setup_end not found")

    # 6. Replace populateDashboardDropdowns with populateDashboardMonths
    old_populate = """// Nạp các Dropdown Tháng, Hạng Mục, Tổ
function populateDashboardDropdowns() {
    const data = dashboardState.currentProjectData;
    if (!data) return;

    const items = data.items || [];

    // 1. Quét tất cả các Tháng/Năm có dữ liệu sản lượng gá, hàn hoặc hạn giao hàng WO
    const monthSet = new Set();
    items.forEach(it => {
        ['ga_lap', 'han', 'to_hop_thu', 'nghiem_thu', 'ban_giao'].forEach(stg => {
            const dStr = it[stg]?.ngay;
            if (dStr) {
                const parts = dStr.split('/');
                if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
            }
        });
        if (it.ngay_giao_wo) {
            const parts = it.ngay_giao_wo.split('/');
            if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
        }
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return (yA * 100 + mA) - (yB * 100 + mB);
    });

    const monthSelect = document.getElementById('dash-select-month');
    if (monthSelect) {
        monthSelect.innerHTML = '';
        if (sortedMonths.length > 1) {
            const optAll = document.createElement('option');
            optAll.value = 'all';
            optAll.textContent = '📅 Toàn bộ các tháng dự án';
            monthSelect.appendChild(optAll);
        }

        sortedMonths.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = `📅 Tháng ${m}`;
            monthSelect.appendChild(opt);
        });

        // Mặc định chọn tháng có sản lượng gần nhất hoặc tháng đầu tiên
        if (sortedMonths.length > 0) {
            // Tìm tháng có nhiều cấu kiện gá/hàn nhất
            let bestMonth = sortedMonths[sortedMonths.length - 1];
            for (let m of sortedMonths) {
                const count = items.filter(it => (it.ga_lap?.ngay || '').includes(m) || (it.han?.ngay || '').includes(m)).length;
                if (count > 0) {
                    bestMonth = m;
                    break;
                }
            }
            dashboardState.selectedMonth = bestMonth;
            monthSelect.value = bestMonth;
        } else {
            dashboardState.selectedMonth = 'all';
        }
    }

    // 2. Hạng Mục
    const hmSelect = document.getElementById('dash-select-hangmuc');
    if (hmSelect) {
        hmSelect.innerHTML = '<option value="all">📂 Tất cả hạng mục</option>';
        (data.hang_mucs || []).forEach(hm => {
            const opt = document.createElement('option');
            opt.value = hm;
            opt.textContent = hm;
            hmSelect.appendChild(opt);
        });
        hmSelect.value = 'all';
        dashboardState.selectedHangMuc = 'all';
    }

    // 3. Tổ Phân Giao
    const pgSelect = document.getElementById('dash-select-phangiao');
    if (pgSelect) {
        pgSelect.innerHTML = '<option value="all">👥 Tất cả tổ phân giao</option>';
        (data.phan_giaos || []).forEach(pg => {
            const opt = document.createElement('option');
            opt.value = pg;
            opt.textContent = `Tổ ${pg}`;
            pgSelect.appendChild(opt);
        });
        pgSelect.value = 'all';
        dashboardState.selectedPhanGiao = 'all';
    }
}"""

    new_populate = """// Nạp danh sách các Tháng có sản lượng vào bộ lọc biểu đồ Line
function populateDashboardMonths(items) {
    const monthSelect = document.getElementById('dash-select-month');
    if (!monthSelect) return;

    const list = items || (dashboardState.currentProjectData ? dashboardState.currentProjectData.items : []) || [];
    const monthSet = new Set();
    list.forEach(it => {
        ['ga_lap', 'han', 'to_hop_thu', 'nghiem_thu', 'ban_giao'].forEach(stg => {
            const dStr = it[stg]?.ngay;
            if (dStr) {
                const parts = dStr.split('/');
                if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
            }
        });
        if (it.ngay_giao_wo) {
            const parts = it.ngay_giao_wo.split('/');
            if (parts.length === 3) monthSet.add(`${parts[1]}/${parts[2]}`);
        }
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return (yA * 100 + mA) - (yB * 100 + mB);
    });

    monthSelect.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '📅 Toàn bộ các tháng dự án';
    monthSelect.appendChild(optAll);

    sortedMonths.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `📅 Tháng ${m}`;
        monthSelect.appendChild(opt);
    });

    if (dashboardState.selectedMonth && (dashboardState.selectedMonth === 'all' || sortedMonths.includes(dashboardState.selectedMonth))) {
        monthSelect.value = dashboardState.selectedMonth;
    } else if (sortedMonths.length > 0) {
        dashboardState.selectedMonth = sortedMonths[sortedMonths.length - 1];
        monthSelect.value = dashboardState.selectedMonth;
    } else {
        dashboardState.selectedMonth = 'all';
        monthSelect.value = 'all';
    }
}
function populateDashboardDropdowns() {
    populateDashboardMonths(dashboardState.currentProjectData?.items || []);
}"""

    if old_populate in code:
        code = code.replace(old_populate, new_populate, 1)
        print("6. Updated populateDashboardMonths")
    else:
        print("6. WARN: old_populate not found")

    # 7. Update renderDashboardAll to accept customItems
    old_render_all = """// Vẽ toàn bộ các thành phần của Dashboard
function renderDashboardAll() {
    const data = dashboardState.currentProjectData;
    if (!data) return;

    renderDashboardKPIsAndLineChart();
    renderDashboardBtpSection();
    renderDashboardGantt();
}"""

    new_render_all = """// Vẽ toàn bộ các thành phần của Dashboard (Nhảy tự động theo hạng mục & danh sách cấu kiện đã lọc)
function renderDashboardAll(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    renderDashboardKPIsAndLineChart(items);
    renderDashboardBtpSection(items);
    renderDashboardGantt(items);
}"""

    if old_render_all in code:
        code = code.replace(old_render_all, new_render_all, 1)
        print("7. Updated renderDashboardAll to accept customItems")
    else:
        print("7. WARN: old_render_all not found")

    # 8. Update renderDashboardKPIsAndLineChart to accept items and use filtered scope
    old_line_start = """// PHẦN 1: TÍNH TOÁN KPI & VẼ BIỂU ĐỒ LINE SO SÁNH THỰC TẾ / KẾ HOẠCH GÁ & HÀN THEO NGÀY
function renderDashboardKPIsAndLineChart() {
    const data = dashboardState.currentProjectData;
    if (!data) return;

    const raw = data.items || [];
    const selHm = dashboardState.selectedHangMuc;
    const selPg = dashboardState.selectedPhanGiao;
    const selMonth = dashboardState.selectedMonth;

    // 1. Lọc theo Hạng mục và Tổ
    let items = raw.filter(it => {
        if (selHm !== 'all' && it.hang_muc !== selHm) return false;
        if (selPg !== 'all' && it.phan_giao !== selPg) return false;
        return true;
    });"""

    new_line_start = """// PHẦN 1: TÍNH TOÁN KPI & VẼ BIỂU ĐỒ LINE SO SÁNH THỰC TẾ / KẾ HOẠCH GÁ & HÀN THEO NGÀY
function renderDashboardKPIsAndLineChart(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    let items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    const selMonth = dashboardState.selectedMonth || 'all';"""

    if old_line_start in code:
        code = code.replace(old_line_start, new_line_start, 1)
        print("8. Updated renderDashboardKPIsAndLineChart header")
    else:
        print("8. WARN: old_line_start not found")

    # 9. Update dayLabels sorting in renderDashboardKPIsAndLineChart to chronological
    old_sort_dates = """        dayLabels = Array.from(allDates).sort();
        if (dayLabels.length === 0) {
            dayLabels = ['01', '05', '10', '15', '20', '25', '30'];
        }"""

    new_sort_dates = """        dayLabels = Array.from(allDates).sort((a, b) => {
            const [dA, mA] = a.split('/').map(Number);
            const [dB, mB] = b.split('/').map(Number);
            return (mA * 100 + dA) - (mB * 100 + dB);
        });
        if (dayLabels.length === 0) {
            dayLabels = ['01', '05', '10', '15', '20', '25', '30'];
        }"""

    if old_sort_dates in code:
        code = code.replace(old_sort_dates, new_sort_dates, 1)
        print("9. Updated chronological sorting for dayLabels")
    else:
        print("9. WARN: old_sort_dates not found")

    # 10. Update elBgRate in renderDashboardKPIsAndLineChart to use items
    old_bg_rate = """    const bgRateTotal = data.kpis?.ban_giao?.rate || 0;
    const elBgRate = document.getElementById('dash-kpi-bg-rate');
    if (elBgRate) elBgRate.textContent = `${bgRateTotal}% Bàn Giao`;
    const elBgBar = document.getElementById('dash-kpi-bg-bar');
    if (elBgBar) elBgBar.style.width = `${Math.min(100, bgRateTotal)}%`;"""

    new_bg_rate = """    const totalFilteredWeightKg = items.reduce((sum, it) => sum + (it.tweight || 0), 0);
    const bgRateTotal = totalFilteredWeightKg > 0 ? Math.round((totalMonthBgTons * 1000 / totalFilteredWeightKg) * 100) : (data.kpis?.ban_giao?.rate || 0);
    const elBgRate = document.getElementById('dash-kpi-bg-rate');
    if (elBgRate) elBgRate.textContent = `${bgRateTotal}% Bàn Giao`;
    const elBgBar = document.getElementById('dash-kpi-bg-bar');
    if (elBgBar) elBgBar.style.width = `${Math.min(100, bgRateTotal)}%`;"""

    if old_bg_rate in code:
        code = code.replace(old_bg_rate, new_bg_rate, 1)
        print("10. Updated bgRateTotal in Line Chart KPI")
    else:
        print("10. WARN: old_bg_rate not found")

    # 11. Update renderDashboardBtpSection to accept customItems
    old_btp_start = """// PHẦN 2: TÌNH TRẠNG NHẬN BÁN THÀNH PHẨM (BTP)
function renderDashboardBtpSection() {
    const data = dashboardState.currentProjectData;
    if (!data) return;

    const items = data.items || [];"""

    new_btp_start = """// PHẦN 2: TÌNH TRẠNG NHẬN BÁN THÀNH PHẨM (BTP)
function renderDashboardBtpSection(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const items = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);"""

    if old_btp_start in code:
        code = code.replace(old_btp_start, new_btp_start, 1)
        print("11. Updated renderDashboardBtpSection header")
    else:
        print("11. WARN: old_btp_start not found")

    # 12. Update renderDashboardBtpTable call in renderDashboardBtpSection
    old_btp_table_call = """    // 3. Đổ Danh Sách BTP
    renderDashboardBtpTable();
}

// Bảng chi tiết tình trạng nhận BTP của cấu kiện
function renderDashboardBtpTable() {
    const data = dashboardState.currentProjectData;
    if (!data) return;

    const tbody = document.getElementById('dash-btp-table-tbody');
    if (!tbody) return;

    const raw = data.items || [];"""

    new_btp_table_call = """    // 3. Đổ Danh Sách BTP
    renderDashboardBtpTable(items);
}

// Bảng chi tiết tình trạng nhận BTP của cấu kiện
function renderDashboardBtpTable(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    if (!data) return;

    const tbody = document.getElementById('dash-btp-table-tbody');
    if (!tbody) return;

    const raw = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);"""

    if old_btp_table_call in code:
        code = code.replace(old_btp_table_call, new_btp_table_call, 1)
        print("12. Updated renderDashboardBtpTable to accept customItems")
    else:
        print("12. WARN: old_btp_table_call not found")

    # 13. Update renderDashboardGantt to accept customItems and use them
    old_gantt_start = """// PHẦN 3: BIỂU ĐỒ GRANT TIẾN ĐỘ (GANTT TIMELINE CHART)
function renderDashboardGantt() {
    const data = dashboardState.currentProjectData;
    const container = document.getElementById('dash-gantt-container');
    if (!data || !container) return;

    const raw = data.items || [];
    const q = (dashboardState.ganttSearchQuery || '').toLowerCase().trim();
    const stageFilter = dashboardState.ganttFilterStage;
    const selHm = dashboardState.selectedHangMuc;
    const selPg = dashboardState.selectedPhanGiao;

    // 1. Lọc cấu kiện
    let items = raw.filter(it => {
        if (selHm !== 'all' && it.hang_muc !== selHm) return false;
        if (selPg !== 'all' && it.phan_giao !== selPg) return false;
        if (stageFilter === 'ga' && (!it.ga_lap?.sl)) return false;"""

    new_gantt_start = """// PHẦN 3: BIỂU ĐỒ GRANT TIẾN ĐỘ (GANTT TIMELINE CHART)
function renderDashboardGantt(customItems = null) {
    const data = qldaState.currentProjectData || dashboardState.currentProjectData;
    const container = document.getElementById('dash-gantt-container');
    if (!data || !container) return;

    const raw = customItems !== null ? customItems : (qldaState.filteredItems || data.items || []);
    const q = (dashboardState.ganttSearchQuery || '').toLowerCase().trim();
    const stageFilter = dashboardState.ganttFilterStage;

    // 1. Lọc cấu kiện
    let items = raw.filter(it => {
        if (stageFilter === 'ga' && (!it.ga_lap?.sl)) return false;"""

    if old_gantt_start in code:
        code = code.replace(old_gantt_start, new_gantt_start, 1)
        print("13. Updated renderDashboardGantt header and item filtering")
    else:
        print("13. WARN: old_gantt_start not found")

    # 14. Update listeners in setupDashboardEventListeners to re-render with current items
    old_listeners = """    // 2. Thay đổi Tháng/Năm
    const monthSelect = document.getElementById('dash-select-month');
    if (monthSelect) {
        monthSelect.addEventListener('change', (e) => {
            dashboardState.selectedMonth = e.target.value;
            renderDashboardKPIsAndLineChart();
        });
    }

    // 3. Thay đổi Hạng mục
    const hmSelect = document.getElementById('dash-select-hangmuc');
    if (hmSelect) {
        hmSelect.addEventListener('change', (e) => {
            dashboardState.selectedHangMuc = e.target.value;
            renderDashboardAll();
        });
    }

    // 4. Thay đổi Tổ phân giao
    const pgSelect = document.getElementById('dash-select-phangiao');
    if (pgSelect) {
        pgSelect.addEventListener('change', (e) => {
            dashboardState.selectedPhanGiao = e.target.value;
            renderDashboardAll();
        });
    }"""

    new_listeners = """    // 2. Thay đổi Tháng/Năm
    const monthSelect = document.getElementById('dash-select-month');
    if (monthSelect) {
        monthSelect.addEventListener('change', (e) => {
            dashboardState.selectedMonth = e.target.value;
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
    }"""

    if old_listeners in code:
        code = code.replace(old_listeners, new_listeners, 1)
        print("14. Updated month listener in setupDashboardEventListeners")
    else:
        print("14. WARN: old_listeners not found")

    # 15. Update chart mode listeners (S-curve vs Daily) and target tons
    old_mode_target = """        btnScurve.addEventListener('click', () => {
            dashboardState.chartMode = 'scurve';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart();
        });

        btnDaily.addEventListener('click', () => {
            dashboardState.chartMode = 'daily';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart();
        });
    }

    // 6. Áp dụng mục tiêu kế hoạch
    const btnApplyTarget = document.getElementById('dash-btn-apply-target');
    const inputTarget = document.getElementById('dash-input-target-tons');
    if (btnApplyTarget && inputTarget) {
        btnApplyTarget.addEventListener('click', () => {
            const val = parseFloat(inputTarget.value) || 50;
            dashboardState.targetTons = val;
            renderDashboardKPIsAndLineChart();
        });
        inputTarget.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseFloat(inputTarget.value) || 50;
                dashboardState.targetTons = val;
                renderDashboardKPIsAndLineChart();
            }
        });
    }"""

    new_mode_target = """        btnScurve.addEventListener('click', () => {
            dashboardState.chartMode = 'scurve';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });

        btnDaily.addEventListener('click', () => {
            dashboardState.chartMode = 'daily';
            btnDaily.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center bg-purple-600 text-white shadow-2xs';
            btnScurve.className = 'flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer text-center text-slate-300 hover:text-white';
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
    }

    // 6. Áp dụng mục tiêu kế hoạch
    const btnApplyTarget = document.getElementById('dash-btn-apply-target');
    const inputTarget = document.getElementById('dash-input-target-tons');
    if (btnApplyTarget && inputTarget) {
        btnApplyTarget.addEventListener('click', () => {
            const val = parseFloat(inputTarget.value) || 50;
            dashboardState.targetTons = val;
            renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
        });
        inputTarget.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = parseFloat(inputTarget.value) || 50;
                dashboardState.targetTons = val;
                renderDashboardKPIsAndLineChart(qldaState.filteredItems || qldaState.rawItems);
            }
        });
    }"""

    if old_mode_target in code:
        code = code.replace(old_mode_target, new_mode_target, 1)
        print("15. Updated mode and target listeners in setupDashboardEventListeners")
    else:
        print("15. WARN: old_mode_target not found")

    # 16. Update Gantt and BTP listeners in setupDashboardEventListeners
    old_gantt_btp_listeners = """        inputBtpSearch.addEventListener('input', (e) => {
            clearTimeout(btpTimeout);
            const val = e.target.value;
            btpTimeout = setTimeout(() => {
                dashboardState.btpSearchQuery = val;
                renderDashboardBtpTable();
            }, 200);
        });
    }

    // 9. Tìm kiếm & Lọc Gantt
    const inputGanttSearch = document.getElementById('dash-gantt-search');
    if (inputGanttSearch) {
        let ganttTimeout = null;
        inputGanttSearch.addEventListener('input', (e) => {
            clearTimeout(ganttTimeout);
            const val = e.target.value;
            ganttTimeout = setTimeout(() => {
                dashboardState.ganttSearchQuery = val;
                renderDashboardGantt();
            }, 200);
        });
    }

    const selectGanttStage = document.getElementById('dash-gantt-filter-stage');
    if (selectGanttStage) {
        selectGanttStage.addEventListener('change', (e) => {
            dashboardState.ganttFilterStage = e.target.value;
            renderDashboardGantt();
        });
    }"""

    new_gantt_btp_listeners = """        inputBtpSearch.addEventListener('input', (e) => {
            clearTimeout(btpTimeout);
            const val = e.target.value;
            btpTimeout = setTimeout(() => {
                dashboardState.btpSearchQuery = val;
                renderDashboardBtpTable(qldaState.filteredItems || qldaState.rawItems);
            }, 200);
        });
    }

    // 9. Tìm kiếm & Lọc Gantt
    const inputGanttSearch = document.getElementById('dash-gantt-search');
    if (inputGanttSearch) {
        let ganttTimeout = null;
        inputGanttSearch.addEventListener('input', (e) => {
            clearTimeout(ganttTimeout);
            const val = e.target.value;
            ganttTimeout = setTimeout(() => {
                dashboardState.ganttSearchQuery = val;
                renderDashboardGantt(qldaState.filteredItems || qldaState.rawItems);
            }, 200);
        });
    }

    const selectGanttStage = document.getElementById('dash-gantt-filter-stage');
    if (selectGanttStage) {
        selectGanttStage.addEventListener('change', (e) => {
            dashboardState.ganttFilterStage = e.target.value;
            renderDashboardGantt(qldaState.filteredItems || qldaState.rawItems);
        });
    }"""

    if old_gantt_btp_listeners in code:
        code = code.replace(old_gantt_btp_listeners, new_gantt_btp_listeners, 1)
        print("16. Updated Gantt and BTP listeners in setupDashboardEventListeners")
    else:
        print("16. WARN: old_gantt_btp_listeners not found")

    with open('frontend/app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print("\n[SUCCESS] frontend/app.js successfully refactored and updated!")

if __name__ == '__main__':
    main()
