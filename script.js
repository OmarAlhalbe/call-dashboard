// --- API Setup ---
const API_BASE = "";

async function saveRecordsToServer(parsedData, filesToUpload) {
    const formData = new FormData();
    filesToUpload.forEach(file => {
        formData.append('files', file);
    });
    formData.append('parsedData', JSON.stringify(parsedData));
    const response = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error("Upload failed");
    return await response.json();
}

async function getAllRecords() {
    try {
        const response = await fetch(`${API_BASE}/api/data`);
        if (!response.ok) throw new Error("Network error");
        return await response.json();
    } catch (e) {
        console.error(e);
        return [];
    }
}

async function clearDatabase() {
    const response = await fetch(`${API_BASE}/api/clear`, { method: 'POST' });
    if (!response.ok) throw new Error("Clear failed");
}

// --- Main Application Logic ---

let allData = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Initializing Dashboard...");
        console.log("App Initialized successfully.");

        // Check which page we are on
        const isUnfollowedPage = window.location.pathname.includes('unfollowed.html');
        const isRejectedPage = window.location.pathname.includes('rejected.html');

        if (isUnfollowedPage) {
            await loadUnfollowedPageAndRender();
        } else if (isRejectedPage) {
            await loadRejectedPageAndRender();
        } else {
            await loadDataAndRender();
        }
    } catch (e) {
        console.error("DB Initialization Failed", e);
        alert(`فشل تهيئة قاعدة البيانات المحلية.\nالخطأ: ${e.message || e}`);
    }
});


// ---- Handling File Upload (Multiple Files) ----
let pendingFilesData = [];

document.getElementById('csvUpload').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    pendingFilesData = [];
    const uploadTime = Date.now();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const detectedBranch = extractBranchName(file.name) || "";
        pendingFilesData.push({
            file: file,
            detectedBranch: detectedBranch,
            selectedBranch: detectedBranch,
            selectedSector: "تاجير السيارات", // Default to Car Rental as per common usage
            uploadTime: uploadTime
        });
    }

    showMappingModal();
    e.target.value = '';
});

function showMappingModal() {
    const modal = document.getElementById('mappingModal');
    const listBody = document.getElementById('mappingList');
    listBody.innerHTML = "";

    // Get existing branches and sectors for dropdowns
    const existingBranches = [...new Set(allData.map(row => row['branch']).filter(b => b))];
    const existingSectors = [...new Set(allData.map(row => row['sector']).filter(s => s))];
    if (!existingSectors.includes("تاجير السيارات")) existingSectors.push("تاجير السيارات");
    if (!existingSectors.includes("الاستقدام")) existingSectors.push("الاستقدام");

    pendingFilesData.forEach((item, index) => {
        const tr = document.createElement('tr');
        
        // Sector Options
        let sectorOptionsHtml = "";
        existingSectors.forEach(s => {
            sectorOptionsHtml += `<option value="${s}" ${item.selectedSector === s ? 'selected' : ''}>${s}</option>`;
        });
        sectorOptionsHtml += `<option value="NEW_SECTOR">➕ إضافة قطاع جديد...</option>`;

        // Branch Selector Cell
        let optionsHtml = `<option value="">-- اختر الفرع --</option>`;
        existingBranches.forEach(b => {
            optionsHtml += `<option value="${b}" ${item.detectedBranch === b ? 'selected' : ''}>${b}</option>`;
        });
        optionsHtml += `<option value="NEW_BRANCH">➕ إضافة فرع جديد...</option>`;

        tr.innerHTML = `
            <td>${item.file.name}</td>
            <td>
                <div class="branch-select-container">
                    <select class="sector-select" data-index="${index}" onchange="handleMappingSectorChange(this, ${index})">
                        ${sectorOptionsHtml}
                    </select>
                    <input type="text" class="new-sector-input hidden" data-index="${index}" placeholder="اسم القطاع الجديد..." 
                        oninput="handleNewSectorInput(this, ${index})">
                </div>
            </td>
            <td>
                <div class="branch-select-container">
                    <select class="branch-select" data-index="${index}" onchange="handleMappingBranchChange(this, ${index})">
                        ${optionsHtml}
                    </select>
                    <input type="text" class="new-branch-input hidden" data-index="${index}" placeholder="اسم الفرع الجديد..." 
                        oninput="handleNewBranchInput(this, ${index})">
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });

    modal.classList.remove('hidden');
}

window.handleMappingSectorChange = function(select, index) {
    const val = select.value;
    const input = select.parentElement.querySelector('.new-sector-input');
    
    if (val === "NEW_SECTOR") {
        input.classList.remove('hidden');
        pendingFilesData[index].selectedSector = "";
    } else {
        input.classList.add('hidden');
        pendingFilesData[index].selectedSector = val;
    }
};

window.handleNewSectorInput = function(input, index) {
    pendingFilesData[index].selectedSector = input.value.trim();
};

window.handleMappingBranchChange = function(select, index) {
    const val = select.value;
    const input = select.parentElement.querySelector('.new-branch-input');
    
    if (val === "NEW_BRANCH") {
        input.classList.remove('hidden');
        pendingFilesData[index].selectedBranch = "";
    } else {
        input.classList.add('hidden');
        pendingFilesData[index].selectedBranch = val;
    }
};

window.handleNewBranchInput = function(input, index) {
    pendingFilesData[index].selectedBranch = input.value.trim();
};

document.getElementById('cancelMappingBtn').addEventListener('click', () => {
    document.getElementById('mappingModal').classList.add('hidden');
    pendingFilesData = [];
});

document.getElementById('confirmMappingBtn').addEventListener('click', async () => {
    // Validate all have branches and sectors
    const missing = pendingFilesData.some(f => !f.selectedBranch || !f.selectedSector);
    if (missing) {
        alert("يرجى تحديد أو إدخال (قطاع وفرع) لكل الملفات المرفوعة.");
        return;
    }

    const modal = document.getElementById('mappingModal');
    modal.classList.add('hidden');

    let allParsedData = [];
    const uploadTime = pendingFilesData[0].uploadTime;
    let filesToUpload = [];

    for (const item of pendingFilesData) {
        try {
            const parsedData = await parseCSVFile(item.file, item.selectedBranch, item.selectedSector);
            parsedData.forEach(r => {
                r.sourceFile = item.file.name;
                r.uploadTime = uploadTime;
            });
            allParsedData = allParsedData.concat(parsedData);
            filesToUpload.push(item.file);
        } catch (error) {
            console.error(`Error parsing ${item.file.name}:`, error);
        }
    }

    if (allParsedData.length > 0) {
        await saveRecordsToServer(allParsedData, filesToUpload);
        await loadDataAndRender();
        alert("تم رفع ودمج البيانات بنجاح!");
    } else {
        alert("لم يتم العثور على أي بيانات صحيحة لرفعها.");
    }
    pendingFilesData = [];
});

// Helper Function: Extract branch name from filename
function extractBranchName(filename) {
    // Remove extension
    const baseName = filename.replace(/\.[^/.]+$/, "");

    // Pattern 1: Look for "فرع X" or "فرع_X"
    const match1 = baseName.match(/فرع[\s_]*([^\s_]+)/i);
    if (match1 && match1[1]) return match1[1];

    // Pattern 2: Look for "X_مكالمات" or "X المكالمات"
    const match2 = baseName.match(/([^\s_]+)[\s_]*مكالمات/i);
    if (match2 && match2[1]) return match2[1];

    // Default to the whole filename minus extension if no pattern matches, but prompting is safer.
    return null;
}

// Helper Function: Parse CSV with Promise
function parseCSVFile(file, branchName, sectorName) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                const data = results.data;
                const validData = [];

                data.forEach(row => {
                    // Check logic based on previously required fields
                    if (row['Date Time'] && row['From Number']) {
                        row['branch'] = branchName; // Attach branch
                        row['sector'] = sectorName; // Attach sector
                        validData.push(row);
                    }
                });

                resolve(validData);
            },
            error: function (err) {
                reject(err);
            }
        });
    });
}
// ---- End File Upload ----
document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (confirm("هل أنت متأكد أنك تريد حذف كل البيانات المحلية؟")) {
        await clearDatabase();
        allData = [];
        renderDashboard(allData);
        alert("تم مسح البيانات.");
    }
});

// Filter Event
document.getElementById('applyFilterBtn').addEventListener('click', () => {
    renderDashboard(allData);
});

// Sector Filter Event
const sectorFilterEl = document.getElementById('sectorFilter');
if (sectorFilterEl) {
    sectorFilterEl.addEventListener('change', () => {
        // When sector changes, we need to refresh the branch list and re-render
        loadDataAndRender(); 
    });
}

// Branch Filter Event
const branchFilterEl = document.getElementById('branchFilter');
if (branchFilterEl) {
    branchFilterEl.addEventListener('change', () => {
        renderDashboard(allData);
    });
}

// Redirect to unfollowed page with filters
const viewUnfollowedBtn = document.getElementById('viewUnfollowedBtn');
if (viewUnfollowedBtn) {
    viewUnfollowedBtn.addEventListener('click', () => {
        const sectorVal = document.getElementById('sectorFilter').value;
        const branchVal = document.getElementById('branchFilter').value;
        const startDateVal = document.getElementById('dateFrom').value;
        const endDateVal = document.getElementById('dateTo').value;

        let url = 'unfollowed.html?';
        const params = new URLSearchParams();
        if (sectorVal) params.append('sector', sectorVal);
        if (branchVal) params.append('branch', branchVal);
        if (startDateVal) params.append('start', startDateVal);
        if (endDateVal) params.append('end', endDateVal);

        window.location.href = url + params.toString();
    });
}

// Redirect to rejected page with filters
const viewRejectedBtn = document.getElementById('viewRejectedBtn');
if (viewRejectedBtn) {
    viewRejectedBtn.addEventListener('click', () => {
        const sectorVal = document.getElementById('sectorFilter').value;
        const branchVal = document.getElementById('branchFilter').value;
        const startDateVal = document.getElementById('dateFrom').value;
        const endDateVal = document.getElementById('dateTo').value;

        let url = 'rejected.html?';
        const params = new URLSearchParams();
        if (sectorVal) params.append('sector', sectorVal);
        if (branchVal) params.append('branch', branchVal);
        if (startDateVal) params.append('start', startDateVal);
        if (endDateVal) params.append('end', endDateVal);

        window.location.href = url + params.toString();
    });
}

// Load data from DB and process
async function loadDataAndRender() {
    allData = await getAllRecords();

    const params = new URLSearchParams(window.location.search);
    const urlSector = params.get('sector');
    const urlBranch = params.get('branch');
    const urlStart = params.get('start');
    const urlEnd = params.get('end');

    // Sort logic by "Date Time"
    allData.sort((a, b) => {
        return new Date(a['Date Time']) - new Date(b['Date Time']);
    });

    if (allData.length > 0) {
        // Find last registered call 
        const lastCall = allData[allData.length - 1];
        document.getElementById('lastCallDisplay').innerText = lastCall['Date Time'];

        // Auto-set Date Filters to bounds if empty
        const startInput = document.getElementById('dateFrom');
        const endInput = document.getElementById('dateTo');

        if (urlStart) startInput.value = urlStart;
        if (urlEnd) endInput.value = urlEnd;

        if (!startInput.value && !endInput.value) {
            // "Date Time" format: 2/1/2026 12:35 PM usually. Need to parse manually or handle JS date parsing
            const firstDateObj = new Date(allData[0]['Date Time']);
            const lastDateObj = new Date(allData[allData.length - 1]['Date Time']);

            // Format YYYY-MM-DD for input[type=date]
            startInput.value = firstDateObj.toISOString().split('T')[0];
            endInput.value = lastDateObj.toISOString().split('T')[0];
        }

        // Populate Sector Dropdown
        const sectorFilter = document.getElementById('sectorFilter');
        const currentSectorSelection = urlSector !== null ? urlSector : sectorFilter.value;
        const uniqueSectors = [...new Set(allData.map(row => row['sector']).filter(s => s))];

        sectorFilter.innerHTML = '<option value="">كل القطاعات</option>';
        uniqueSectors.forEach(sector => {
            const option = document.createElement('option');
            option.value = sector;
            option.textContent = sector;
            sectorFilter.appendChild(option);
        });

        // Restore selection
        if (uniqueSectors.includes(currentSectorSelection)) {
            sectorFilter.value = currentSectorSelection;
        }

        // Populate Branch Dropdown (Filtered by Sector)
        const branchFilter = document.getElementById('branchFilter');
        const currentBranchSelection = urlBranch !== null ? urlBranch : branchFilter.value;
        
        let dataForBranches = allData;
        if (sectorFilter.value) {
            dataForBranches = allData.filter(row => row['sector'] === sectorFilter.value);
        }
        
        const uniqueBranches = [...new Set(dataForBranches.map(row => row['branch']).filter(b => b))];

        branchFilter.innerHTML = '<option value="">كل الفروع</option>';
        uniqueBranches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch;
            option.textContent = branch;
            branchFilter.appendChild(option);
        });

        // Restore selection if it still exists in the filtered list
        if (uniqueBranches.includes(currentBranchSelection)) {
            branchFilter.value = currentBranchSelection;
        }

    } else {
        document.getElementById('lastCallDisplay').innerText = "--";
        document.getElementById('sectorFilter').innerHTML = '<option value="">كل القطاعات</option>';
        document.getElementById('branchFilter').innerHTML = '<option value="">كل الفروع</option>';
    }

    renderDashboard(allData);
}

// Format duration "00h 04m 05s" to boolean: connected?
function isConnected(durationStr) {
    if (!durationStr) return false;
    return !durationStr.includes("00h 00m 00s");
}

function calculateMetrics(filteredData) {
    let stats = {
        totalCalls: 0, incoming: 0, answered: 0, missed: 0, rejected: 0, outgoing: 0, connected: 0,
        unreg_total: 0, unreg_incoming: 0, unreg_answered: 0, unreg_missed: 0, unreg_rejected: 0, unreg_outgoing: 0, unreg_connected: 0,
        uniqueNumbers: new Set(),
        unregUniqueNumbers: new Set()
    };

    filteredData.forEach(row => {
        stats.totalCalls++;
        const isUnknown = (row['Name'] === 'Unknown' || row['Name'] === '');
        const type = row['Type'];
        const dur = row['Duration'];
        const custNum = row['To Number'];

        stats.uniqueNumbers.add(custNum);
        if (isUnknown) {
            stats.unreg_total++;
            stats.unregUniqueNumbers.add(custNum);
        }

        if (type === 'Incoming' || type === 'Missed' || type === 'Rejected' || type === 'Canceled') {
            stats.incoming++;
            if (isUnknown) stats.unreg_incoming++;

            if (type === 'Incoming') {
                stats.answered++;
                if (isUnknown) stats.unreg_answered++;
            } else if (type === 'Missed') {
                stats.missed++;
                if (isUnknown) stats.unreg_missed++;
            } else if (type === 'Rejected' || type === 'Canceled') {
                stats.rejected++;
                if (isUnknown) stats.unreg_rejected++;
            }
        } else if (type === 'Outgoing') {
            stats.outgoing++;
            if (isUnknown) stats.unreg_outgoing++;
        }

        if (isConnected(dur)) {
            stats.connected++;
            if (isUnknown) stats.unreg_connected++;
        }
    });

    // OPTIMIZED Unfollowed calculation: O(N + M) using Hash Map
    stats.unfollowed = [];
    const unregMissed = filteredData.filter(r =>
        (r['Name'] === 'Unknown' || r['Name'] === '') && (r['Type'] === 'Missed' || r['Type'] === 'Rejected')
    );
    const outgoingAll = filteredData.filter(r => r['Type'] === 'Outgoing');

    // 1. Create a map of latest outgoing call per number
    const latestOutgoingMap = new Map();
    outgoingAll.forEach(out => {
        const num = out['To Number'];
        const time = new Date(out['Date Time']).getTime();
        if (!latestOutgoingMap.has(num) || time > latestOutgoingMap.get(num)) {
            latestOutgoingMap.set(num, time);
        }
    });

    // 2. Check each missed call against the latest outgoing call for that number
    unregMissed.forEach(miss => {
        const missTime = new Date(miss['Date Time']).getTime();
        const latestFollowUpTime = latestOutgoingMap.get(miss['To Number']);
        
        // If no follow-up exists, or the latest follow-up was BEFORE this missed call, it's unfollowed
        if (!latestFollowUpTime || latestFollowUpTime <= missTime) {
            stats.unfollowed.push(miss);
        }
    });

    return stats;
}

function renderDashboard(dataArray) {
    // 1. FILTER DATA BY DATES & BRANCH
    const startDateVal = document.getElementById('dateFrom').value;
    const endDateVal = document.getElementById('dateTo').value;
    const sectorVal = document.getElementById('sectorFilter').value;
    const branchVal = document.getElementById('branchFilter').value;

    const filteredData = dataArray.filter(row => {
        if (sectorVal && row['sector'] !== sectorVal) return false;
        if (branchVal && row['branch'] !== branchVal) return false;
        if (!startDateVal && !endDateVal) return true;
        const rowDate = new Date(row['Date Time']);
        if (startDateVal) {
            const sd = new Date(startDateVal); sd.setHours(0,0,0,0);
            if (rowDate < sd) return false;
        }
        if (endDateVal) {
            const ed = new Date(endDateVal); ed.setHours(23,59,59,999);
            if (rowDate > ed) return false;
        }
        return true;
    });

    // 2. COMPUTE METRICS using the new helper
    const s = calculateMetrics(filteredData);

    // Populate Left Column DOM
    document.getElementById('all_total').innerText = s.totalCalls;
    document.getElementById('all_incoming').innerText = s.incoming;
    document.getElementById('all_answered').innerText = s.answered;
    document.getElementById('all_missed').innerText = s.missed;
    document.getElementById('all_rejected').innerText = s.rejected;
    document.getElementById('all_outgoing').innerText = s.outgoing;
    document.getElementById('all_connected').innerText = s.connected;
    document.getElementById('all_new_numbers').innerText = s.uniqueNumbers.size;

    // Populate Right Column DOM
    document.getElementById('unreg_total').innerText = s.unreg_total;
    document.getElementById('unreg_incoming').innerText = s.unreg_incoming;
    document.getElementById('unreg_answered').innerText = s.unreg_answered;
    document.getElementById('unreg_outgoing').innerText = s.unreg_outgoing;
    document.getElementById('unreg_missed').innerText = s.unreg_missed;
    document.getElementById('unreg_rejected').innerText = s.unreg_rejected;
    document.getElementById('unreg_connected').innerText = s.unreg_connected;
    document.getElementById('unreg_new_numbers').innerText = s.unregUniqueNumbers.size;

    // 3. PERCENTAGES
    const perc_answer = s.incoming ? Math.round((s.answered / s.incoming) * 100) : 0;
    const perc_miss = s.incoming ? Math.round((s.missed / s.incoming) * 100) : 0;
    const perc_rej = s.incoming ? Math.round((s.rejected / s.incoming) * 100) : 0;
    const perc_new = s.incoming ? Math.round((s.uniqueNumbers.size / s.incoming) * 100) : 0;

    document.getElementById('perc_answered').innerText = `${perc_answer}%`;
    document.getElementById('perc_missed').innerText = `${perc_miss}%`;
    document.getElementById('perc_rejected').innerText = `${perc_rej}%`;
    document.getElementById('perc_new').innerText = `${perc_new}%`;

    // 4. UNFOLLOWED MISSED CALLS
    const unfollowedCalls = s.unfollowed;
    const unfollowedTotal = unfollowedCalls.length;
    document.getElementById('unfollowed_count').innerText = unfollowedTotal;
    const unfollowed_perc = s.incoming ? Math.round((unfollowedTotal / s.incoming) * 100) : 0;
    document.getElementById('unfollowed_perc').innerText = `${unfollowed_perc}%`;

    // Process Shifts
    let shift1Counts = 0, shift2Counts = 0, shift3Counts = 0;
    let dailyMap = {};

    unfollowedCalls.forEach(call => {
        const dt = new Date(call['Date Time']);
        const h = dt.getHours();
        const dateStr = dt.toISOString().split('T')[0]; // YYYY-MM-DD

        let shiftName = "";
        let shiftKey = "";

        // Shift 1: 8AM(8) - 4PM(15:59)
        // Shift 2: 4PM(16) - 12AM(23:59)
        // Shift 3: 12AM(0) - 8AM(7:59)
        if (h >= 8 && h < 16) {
            shift1Counts++;
            shiftName = "الشفت الأول 8ص - 4م";
            shiftKey = "s1";
        } else if (h >= 16) {
            shift2Counts++;
            shiftName = "الشفت الثاني 4م - 12ص";
            shiftKey = "s2";
        } else {
            shift3Counts++;
            shiftName = "الشفت الثالث 12ص - 8ص";
            shiftKey = "s3";
        }

        if (!dailyMap[dateStr]) {
            dailyMap[dateStr] = { s1: 0, s2: 0, s3: 0 };
        }
        dailyMap[dateStr][shiftKey]++;
    });

    // Render Shift Totals
    const tbodyShifts = document.getElementById('shift_totals_body');
    tbodyShifts.innerHTML = "";
    const shiftData = [
        { name: "الشفت الأول 8ص - 4م . 1", count: shift1Counts },
        { name: "الشفت الثاني 4م - 12ص . 2", count: shift2Counts },
        { name: "الشفت الثالث 12ص - 8ص . 3", count: shift3Counts }
    ];

    shiftData.forEach(sd => {
        const perc = unfollowedTotal ? Math.round((sd.count / unfollowedTotal) * 100) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${sd.name}</td>
            <td>${sd.count}</td>
            <td>${perc}%</td>
        `;
        tbodyShifts.appendChild(tr);
    });

    // Render Daily Breakdown
    const tbodyDaily = document.getElementById('daily_breakdown_body');
    tbodyDaily.innerHTML = "";

    // Sort dates
    const sortedDates = Object.keys(dailyMap).sort();

    sortedDates.forEach(date => {
        const tr1 = document.createElement('tr');
        tr1.innerHTML = `
            <td rowspan="3"><strong>${date}</strong></td>
            <td>الإجمالي 1 . الشفت الأول 8ص</td>
            <td>${dailyMap[date].s1}</td>
        `;
        const tr2 = document.createElement('tr');
        tr2.innerHTML = `
            <td>الإجمالي 2 . الشفت الثاني 4م</td>
            <td>${dailyMap[date].s2}</td>
        `;
        const tr3 = document.createElement('tr');
        tr3.innerHTML = `
            <td>الإجمالي 3 . الشفت الثالث 12ص</td>
            <td>${dailyMap[date].s3}</td>
        `;
        tbodyDaily.appendChild(tr1);
        tbodyDaily.appendChild(tr2);
        tbodyDaily.appendChild(tr3);
    });

    // --- Rejected Calls Times Logic ---
    const rejectedCalls = filteredData.filter(r => r['Type'] === 'Rejected' || r['Type'] === 'Canceled');
    const rejectedTotal = rejectedCalls.length;
    
    const rejectedCountEl = document.getElementById('rejected_time_count');
    if (rejectedCountEl) {
        rejectedCountEl.innerText = rejectedTotal;
        const rejected_perc = s.incoming ? Math.round((rejectedTotal / s.incoming) * 100) : 0;
        document.getElementById('rejected_time_perc').innerText = `${rejected_perc}%`;

        let rShift1 = 0, rShift2 = 0, rShift3 = 0;
        let rDailyMap = {};

        rejectedCalls.forEach(call => {
            const dt = new Date(call['Date Time']);
            const h = dt.getHours();
            const dateStr = dt.toISOString().split('T')[0];

            let shiftKey = "";

            if (h >= 8 && h < 16) {
                rShift1++;
                shiftKey = "s1";
            } else if (h >= 16) {
                rShift2++;
                shiftKey = "s2";
            } else {
                rShift3++;
                shiftKey = "s3";
            }

            if (!rDailyMap[dateStr]) {
                rDailyMap[dateStr] = { s1: 0, s2: 0, s3: 0 };
            }
            rDailyMap[dateStr][shiftKey]++;
        });

        const tbodyRShifts = document.getElementById('rejected_shift_totals_body');
        if (tbodyRShifts) {
            tbodyRShifts.innerHTML = "";
            const rShiftData = [
                { name: "الشفت الأول 8ص - 4م . 1", count: rShift1 },
                { name: "الشفت الثاني 4م - 12ص . 2", count: rShift2 },
                { name: "الشفت الثالث 12ص - 8ص . 3", count: rShift3 }
            ];

            rShiftData.forEach(sd => {
                const perc = rejectedTotal ? Math.round((sd.count / rejectedTotal) * 100) : 0;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${sd.name}</td>
                    <td>${sd.count}</td>
                    <td>${perc}%</td>
                `;
                tbodyRShifts.appendChild(tr);
            });
        }

        const tbodyRDaily = document.getElementById('rejected_daily_breakdown_body');
        if (tbodyRDaily) {
            tbodyRDaily.innerHTML = "";
            const sortedRDates = Object.keys(rDailyMap).sort();

            sortedRDates.forEach(date => {
                const tr1 = document.createElement('tr');
                tr1.innerHTML = `
                    <td rowspan="3"><strong>${date}</strong></td>
                    <td>الإجمالي 1 . الشفت الأول 8ص</td>
                    <td>${rDailyMap[date].s1}</td>
                `;
                const tr2 = document.createElement('tr');
                tr2.innerHTML = `
                    <td>الإجمالي 2 . الشفت الثاني 4م</td>
                    <td>${rDailyMap[date].s2}</td>
                `;
                const tr3 = document.createElement('tr');
                tr3.innerHTML = `
                    <td>الإجمالي 3 . الشفت الثالث 12ص</td>
                    <td>${rDailyMap[date].s3}</td>
                `;
                tbodyRDaily.appendChild(tr1);
                tbodyRDaily.appendChild(tr2);
                tbodyRDaily.appendChild(tr3);
            });
        }
    }

    // 5. BRANCH COMPARISON TABLE
    const tbodyBranches = document.getElementById('branches_comparison_body');
    if (tbodyBranches) {
        tbodyBranches.innerHTML = "";

        let branchStats = {};
        const sectorVal = document.getElementById('sectorFilter').value;

        const dateFilteredOnly = dataArray.filter(row => {
            if (sectorVal && row['sector'] !== sectorVal) return false;
            if (!startDateVal && !endDateVal) return true;
            const rowDate = new Date(row['Date Time']);
            if (startDateVal) {
                const sd = new Date(startDateVal); sd.setHours(0, 0, 0, 0);
                if (rowDate < sd) return false;
            }
            if (endDateVal) {
                const ed = new Date(endDateVal); ed.setHours(23, 59, 59, 999);
                if (rowDate > ed) return false;
            }
            return true;
        });

        // Split for follow-up check (Missed and Rejected)
        const missedUnreg = dateFilteredOnly.filter(row =>
            (row['Name'] === 'Unknown' || row['Name'] === '') && (row['Type'] === 'Missed' || row['Type'] === 'Rejected')
        );
        const outgoingAll = dateFilteredOnly.filter(row => row['Type'] === 'Outgoing');

        dateFilteredOnly.forEach(row => {
            const b = row['branch'] || "غير محدد";
            if (!branchStats[b]) {
                branchStats[b] = { total: 0, incoming: 0, answered: 0, missed: 0, rejected: 0, outgoing: 0, connected: 0, unfollowed: 0 };
            }

            branchStats[b].total++;
            const type = row['Type'];
            const dur = row['Duration'];

            if (type === 'Incoming' || type === 'Missed' || type === 'Rejected' || type === 'Canceled') {
                branchStats[b].incoming++;
                if (type === 'Incoming') branchStats[b].answered++;
                else if (type === 'Missed') branchStats[b].missed++;
                else if (type === 'Rejected' || type === 'Canceled') branchStats[b].rejected++;
            } else if (type === 'Outgoing') {
                branchStats[b].outgoing++;
            }

            if (isConnected(dur)) {
                branchStats[b].connected++;
            }
        });

        // OPTIMIZED Calculate Unfollowed per branch (Branch-Specific) - O(N + M)
        const branchOutgoingMap = new Map();
        outgoingAll.forEach(out => {
            const b = out['branch'] || "غير محدد";
            const num = out['To Number'];
            const key = `${b}_${num}`;
            const time = new Date(out['Date Time']).getTime();
            if (!branchOutgoingMap.has(key) || time > branchOutgoingMap.get(key)) {
                branchOutgoingMap.set(key, time);
            }
        });

        missedUnreg.forEach(missRecord => {
            const b = missRecord['branch'] || "غير محدد";
            const num = missRecord['To Number'];
            const key = `${b}_${num}`;
            const missTime = new Date(missRecord['Date Time']).getTime();
            const latestFollowUpTime = branchOutgoingMap.get(key);

            // If no follow-up in this branch, or it was before the missed call
            if (!latestFollowUpTime || latestFollowUpTime <= missTime) {
                if (branchStats[b]) {
                    branchStats[b].unfollowed++;
                }
            }
        });

        Object.keys(branchStats).forEach(bName => {
            const bs = branchStats[bName];
            const unfollowedPerc = bs.incoming ? Math.round((bs.unfollowed / bs.incoming) * 100) : 0;

            // Find sector for this branch (from allData or records in this filtered set)
            const sectorForBranch = dateFilteredOnly.find(r => (r['branch'] || "غير محدد") === bName)?.sector || "غير محدد";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${bName}</strong></td>
                <td>${sectorForBranch}</td>
                <td class="col-total">${bs.total}</td>
                <td class="col-incoming">${bs.incoming}</td>
                <td class="col-answered text-green">${bs.answered}</td>
                <td class="col-missed text-red">${bs.missed}</td>
                <td class="col-rejected text-orange">${bs.rejected}</td>
                <td class="col-outgoing">${bs.outgoing}</td>
                <td class="col-connected text-blue">${bs.connected}</td>
                <td class="col-unfollowed text-red" style="font-weight:800;">
                    ${bs.unfollowed}
                    <span style="font-size: 0.75rem; font-weight: 400; margin-right: 4px; opacity: 0.8;">(${unfollowedPerc}%)</span>
                </td>
            `;
            tbodyBranches.appendChild(tr);
        });

        // Initialize column toggles
        document.querySelectorAll('.col-toggle').forEach(checkbox => {
            const colClass = checkbox.dataset.col;
            // Apply initial state
            document.querySelectorAll(`.${colClass}`).forEach(el => {
                if (checkbox.checked) el.classList.remove('hidden-col');
                else el.classList.add('hidden-col');
            });

            checkbox.onchange = () => {
                const isChecked = checkbox.checked;
                document.querySelectorAll(`.${colClass}`).forEach(el => {
                    if (isChecked) el.classList.remove('hidden-col');
                    else el.classList.add('hidden-col');
                });
            };
        });
    }

    renderUploadHistory(dataArray);
}

function renderUploadHistory(dataArray) {
    const tbodyHistory = document.getElementById('upload_history_body');
    if (!tbodyHistory) return;
    tbodyHistory.innerHTML = "";

    // Group data by (sourceFile, uploadTime)
    let historyMap = {};
    dataArray.forEach(row => {
        const file = row.sourceFile || "ملف قديم";
        const time = row.uploadTime || 0;
        const branch = row.branch || "غير محدد";
        const key = `${file}_${time}`;

        if (!historyMap[key]) {
            historyMap[key] = { file, time, branches: new Set(), sectors: new Set() };
        }
        historyMap[key].branches.add(branch);
        historyMap[key].sectors.add(row.sector || "تاجير السيارات");
    });

    // Convert map to array and sort by time desc
    const sortedHistory = Object.values(historyMap).sort((a, b) => b.time - a.time);

    sortedHistory.forEach(item => {
        const tr = document.createElement('tr');
        const dateStr = item.time === 0 ? "غير معروف" : new Date(item.time).toLocaleString('ar-EG');
        const branchesStr = Array.from(item.branches).join(', ');
        const sectorsStr = Array.from(item.sectors).join(', ');

        tr.innerHTML = `
            <td>${item.file}</td>
            <td>${sectorsStr}</td>
            <td>${branchesStr}</td>
            <td>${dateStr}</td>
            <td>
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="primary-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; background: var(--color-orange);" 
                        onclick="openEditBranchModal('${item.file}', ${item.time}, '${branchesStr}', '${sectorsStr}')">
                        تعديل الاسم
                    </button>
                    <button class="danger-btn" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" 
                        onclick="deleteByUpload('${item.file}', ${item.time})">
                        حذف
                    </button>
                </div>
            </td>
        `;
        tbodyHistory.appendChild(tr);
    });
}

// --- Edit Branch Logic ---
let currentEditBatch = { file: "", time: "" };

window.openEditBranchModal = function(filename, uploadTime, currentBranch, currentSector) {
    currentEditBatch = { file: filename, time: uploadTime };
    const modal = document.getElementById('editBranchModal');
    
    const selectSector = document.getElementById('editSectorSelect');
    const newInputSector = document.getElementById('editSectorNewInput');
    
    const selectBranch = document.getElementById('editBranchSelect');
    const newInputBranch = document.getElementById('editBranchNewInput');
    
    const infoText = document.getElementById('editFileInfoText');

    infoText.innerText = `الملف: ${filename}\nالقطاع: ${currentSector} | الفرع: ${currentBranch}`;
    newInputSector.classList.add('hidden');
    newInputBranch.classList.add('hidden');
    newInputSector.value = "";
    newInputBranch.value = "";

    // Populate Sectors
    const existingSectors = [...new Set(allData.map(row => row['sector']).filter(s => s))];
    if (!existingSectors.includes("تاجير السيارات")) existingSectors.push("تاجير السيارات");
    if (!existingSectors.includes("الاستقدام")) existingSectors.push("الاستقدام");
    
    let sectorOptions = `<option value="">-- اختر قطاعاً --</option>`;
    existingSectors.forEach(s => {
        sectorOptions += `<option value="${s}" ${s === currentSector ? 'selected' : ''}>${s}</option>`;
    });
    sectorOptions += `<option value="NEW_SECTOR">➕ قطاع جديد...</option>`;
    selectSector.innerHTML = sectorOptions;

    // Populate Branches (Initial based on currentSector)
    updateEditBranchOptions(currentSector, currentBranch);

    modal.classList.remove('hidden');
};

function updateEditBranchOptions(sector, currentBranch) {
    const selectBranch = document.getElementById('editBranchSelect');
    const branches = [...new Set(allData.filter(r => r.sector === sector).map(r => r.branch).filter(b => b))];
    
    let branchOptions = `<option value="">-- اختر فرعاً --</option>`;
    branches.forEach(b => {
        branchOptions += `<option value="${b}" ${b === currentBranch ? 'selected' : ''}>${b}</option>`;
    });
    branchOptions += `<option value="NEW_BRANCH">➕ فرع جديد...</option>`;
    selectBranch.innerHTML = branchOptions;
}

document.getElementById('editSectorSelect').addEventListener('change', (e) => {
    const sectorInput = document.getElementById('editSectorNewInput');
    if (e.target.value === "NEW_SECTOR") {
        sectorInput.classList.remove('hidden');
        updateEditBranchOptions("", ""); // Clear branches
    } else {
        sectorInput.classList.add('hidden');
        updateEditBranchOptions(e.target.value, "");
    }
});

document.getElementById('editBranchSelect').addEventListener('change', (e) => {
    const branchInput = document.getElementById('editBranchNewInput');
    if (e.target.value === "NEW_BRANCH") {
        branchInput.classList.remove('hidden');
    } else {
        branchInput.classList.add('hidden');
    }
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
    document.getElementById('editBranchModal').classList.add('hidden');
});

document.getElementById('confirmEditBtn').addEventListener('click', async () => {
    const selectSector = document.getElementById('editSectorSelect');
    const newInputSector = document.getElementById('editSectorNewInput');
    const selectBranch = document.getElementById('editBranchSelect');
    const newInputBranch = document.getElementById('editBranchNewInput');

    let newSectorName = selectSector.value;
    if (newSectorName === "NEW_SECTOR") newSectorName = newInputSector.value.trim();

    let newBranchName = selectBranch.value;
    if (newBranchName === "NEW_BRANCH") newBranchName = newInputBranch.value.trim();

    if (!newSectorName || !newBranchName) {
        alert("يرجى اختيار أو إدخال اسم القطاع والفرع.");
        return;
    }

    try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = async () => {
            const allRecords = request.result;
            const recordsToUpdate = allRecords.filter(r =>
                (r.sourceFile === currentEditBatch.file && r.uploadTime === currentEditBatch.time)
            );

            // Start a new transaction for updating
            const updateTxn = db.transaction([STORE_NAME], "readwrite");
            const updateStore = updateTxn.objectStore(STORE_NAME);

            recordsToUpdate.forEach(r => {
                r.sector = newSectorName;
                r.branch = newBranchName;
                // Re-generate ID because branch & sector (implicitly) affect uniqueness here
                const uniqueId = `${r['branch']}_${r['Date Time']}_${r['From Number']}_${r['To Number']}_${r['Duration']}_${r['Type']}_${r.uploadTime}`;
                const oldId = r.id;
                r.id = uniqueId;
                
                if (oldId !== uniqueId) {
                    updateStore.delete(oldId);
                }
                updateStore.put(r);
            });

            updateTxn.oncomplete = async () => {
                document.getElementById('editBranchModal').classList.add('hidden');
                alert("تم تحديث البيانات بنجاح.");
                await loadDataAndRender();
            };
        };
    } catch (err) {
        console.error("Update failed", err);
        alert("حدث خطأ أثناء التحديث.");
    }
});


async function deleteByUpload(filename, uploadTime) {
    if (!confirm(`هل أنت متأكد من حذف كل البيانات المستوردة من الملف "${filename}"؟`)) return;

    try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = async () => {
            const allRecords = request.result;
            const recordsToDelete = allRecords.filter(r =>
                (r.sourceFile === filename && r.uploadTime === uploadTime)
            );

            if (recordsToDelete.length === 0) {
                alert("لم يتم العثور على سجلات لحذفها.");
                return;
            }

            const deleteTransaction = db.transaction([STORE_NAME], "readwrite");
            const deleteStore = deleteTransaction.objectStore(STORE_NAME);

            recordsToDelete.forEach(r => {
                deleteStore.delete(r.id);
            });

            deleteTransaction.oncomplete = async () => {
                alert("تم حذف بيانات الملف بنجاح.");
                await loadDataAndRender();
            };
        };
    } catch (err) {
        console.error("Delete failed", err);
        alert("حدث خطأ أثناء حذف الملف.");
    }
}


// --- Logic for unfollowed.html ---
async function loadUnfollowedPageAndRender() {
    allData = await getAllRecords();
    allData.sort((a, b) => new Date(a['Date Time']) - new Date(b['Date Time']));

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const sectorVal = params.get('sector');
    const branchVal = params.get('branch');
    const startDateVal = params.get('start');
    const endDateVal = params.get('end');

    // Set Header filter text
    let filterText = "الفلاتر: ";
    if (sectorVal || branchVal || startDateVal || endDateVal) {
        const sl = sectorVal ? `القطاع: ${sectorVal} | ` : '';
        const bl = branchVal ? `الفرع: ${branchVal} | ` : '';
        const dl1 = startDateVal ? `من: ${startDateVal} | ` : '';
        const dl2 = endDateVal ? `إلى: ${endDateVal} ` : '';
        filterText += sl + bl + dl1 + dl2;
    } else {
        filterText += "كل البيانات (بدون فلترة)";
    }
    const filterEl = document.getElementById('filterDetails');
    if (filterEl) filterEl.innerText = filterText;

    // Update back button to include params
    const backBtn = document.querySelector('a[href^="index.html"]');
    if (backBtn && window.location.search) {
        backBtn.href = `index.html${window.location.search}`;
    }

    // Filter matching logic from renderDashboard
    const filteredData = allData.filter(row => {
        if (sectorVal && row['sector'] !== sectorVal) return false;
        if (branchVal && row['branch'] !== branchVal) return false;
        if (!startDateVal && !endDateVal) return true;
        const rowDate = new Date(row['Date Time']);
        if (startDateVal) {
            const sd = new Date(startDateVal); sd.setHours(0, 0, 0, 0);
            if (rowDate < sd) return false;
        }
        if (endDateVal) {
            const ed = new Date(endDateVal); ed.setHours(23, 59, 59, 999);
            if (rowDate > ed) return false;
        }
        return true;
    });

    let unfollowedCalls = [];

    const unregMissedRecords = filteredData.filter(row =>
        (row['Name'] === 'Unknown' || row['Name'] === '') &&
        (row['Type'] === 'Missed' || row['Type'] === 'Rejected')
    );

    const unregOutgoingRecords = filteredData.filter(row => row['Type'] === 'Outgoing');

    // OPTIMIZED Fast look-up using Map - O(N + M)
    const latestOutgoingMap = new Map();
    unregOutgoingRecords.forEach(out => {
        const num = out['To Number'];
        const time = new Date(out['Date Time']).getTime();
        if (!latestOutgoingMap.has(num) || time > latestOutgoingMap.get(num)) {
            latestOutgoingMap.set(num, time);
        }
    });

    unregMissedRecords.forEach(missRecord => {
        const missTime = new Date(missRecord['Date Time']).getTime();
        const num = missRecord['To Number'];
        const latestFollowUpTime = latestOutgoingMap.get(num);

        // If no follow-up, or follow-up was before the missed call
        if (!latestFollowUpTime || latestFollowUpTime <= missTime) {
            unfollowedCalls.push(missRecord);
        }
    });

    // Handle View Mode Selector
    const modeSelect = document.getElementById('viewModeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            renderUnfollowedContent(unfollowedCalls, modeSelect.value);
        });
        // Initial render
        renderUnfollowedContent(unfollowedCalls, modeSelect.value);
    } else {
        renderUnfollowedContent(unfollowedCalls, 'grouped');
    }

    // Handle Export to Excel
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (unfollowedCalls.length === 0) {
                alert("لا توجد بيانات لتصديرها.");
                return;
            }
            exportToExcel(unfollowedCalls);
        };
    }
}

function exportToExcel(calls) {
    // Prepare data for Excel
    const data = calls.map((c, i) => ({
        "#": i + 1,
        "رقم العميل": c['To Number'],
        "وقت المكالمة": c['Date Time'],
        "الفرع": c['branch'] || "غير محدد",
        "القطاع": c['sector'] || "غير محدد",
        "الشفت": getShiftName(c['Date Time'])
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths (optional but helpful)
    const wscols = [
        {wch: 5},
        {wch: 20},
        {wch: 25},
        {wch: 20},
        {wch: 20},
        {wch: 25}
    ];
    ws['!cols'] = wscols;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأرقام غير المتابعة");
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.getHours() + "-" + now.getMinutes();
    
    // Save file
    XLSX.writeFile(wb, `الأرقام_غير_المتابعة_${dateStr}_${timeStr}.xlsx`);
}

function renderUnfollowedContent(calls, mode) {
    const tbody = document.getElementById('unfollowed_numbers_body');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد أرقام غير متابعة</td></tr>';
        return;
    }

    if (mode === 'all') {
        // Show every single missed call
        calls.forEach((call, index) => {
            appendUnfollowedRow(tbody, call, index + 1);
        });
    } else if (mode === 'unique') {
        // Show only the latest unique numbers
        const uniqueMap = new Map();
        calls.forEach(call => uniqueMap.set(call['To Number'], call));
        const uniqueList = Array.from(uniqueMap.values());
        uniqueList.forEach((call, index) => {
            appendUnfollowedRow(tbody, call, index + 1);
        });
    } else {
        // Grouped (Default)
        const groups = {};
        calls.forEach(call => {
            const num = call['To Number'];
            if (!groups[num]) groups[num] = [];
            groups[num].push(call);
        });

        Object.keys(groups).forEach((num, index) => {
            const groupCalls = groups[num];
            const mainCall = groupCalls[groupCalls.length - 1]; // Use latest call as main
            const count = groupCalls.length;

            appendGroupedRow(tbody, mainCall, index + 1, count, groupCalls);
        });
    }
}

// --- REJECTED PAGE LOGIC ---
async function loadRejectedPageAndRender() {
    allData = await getAllRecords();
    allData.sort((a, b) => new Date(a['Date Time']) - new Date(b['Date Time']));

    // Parse URL params
    const params = new URLSearchParams(window.location.search);
    const sectorVal = params.get('sector');
    const branchVal = params.get('branch');
    const startDateVal = params.get('start');
    const endDateVal = params.get('end');

    // Set Header filter text
    let filterText = "الفلاتر: ";
    if (sectorVal || branchVal || startDateVal || endDateVal) {
        const sl = sectorVal ? `القطاع: ${sectorVal} | ` : '';
        const bl = branchVal ? `الفرع: ${branchVal} | ` : '';
        const dl1 = startDateVal ? `من: ${startDateVal} | ` : '';
        const dl2 = endDateVal ? `إلى: ${endDateVal} ` : '';
        filterText += sl + bl + dl1 + dl2;
    } else {
        filterText += "كل البيانات (بدون فلترة)";
    }
    const filterEl = document.getElementById('filterDetails');
    if (filterEl) filterEl.innerText = filterText;

    // Update back button to include params
    const backBtn = document.querySelector('a[href^="index.html"]');
    if (backBtn && window.location.search) {
        backBtn.href = `index.html${window.location.search}`;
    }

    const filteredData = allData.filter(row => {
        if (sectorVal && row['sector'] !== sectorVal) return false;
        if (branchVal && row['branch'] !== branchVal) return false;
        if (!startDateVal && !endDateVal) return true;
        const rowDate = new Date(row['Date Time']);
        if (startDateVal) {
            const sd = new Date(startDateVal); sd.setHours(0, 0, 0, 0);
            if (rowDate < sd) return false;
        }
        if (endDateVal) {
            const ed = new Date(endDateVal); ed.setHours(23, 59, 59, 999);
            if (rowDate > ed) return false;
        }
        return true;
    });

    const rejectedCalls = filteredData.filter(row => 
        row['Type'] === 'Rejected' || row['Type'] === 'Canceled'
    );

    // Handle View Mode Selector
    const modeSelect = document.getElementById('viewModeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            renderRejectedContent(rejectedCalls, modeSelect.value);
        });
        // Initial render
        renderRejectedContent(rejectedCalls, modeSelect.value);
    } else {
        renderRejectedContent(rejectedCalls, 'grouped');
    }

    // Handle Export to Excel
    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
            if (rejectedCalls.length === 0) {
                alert("لا توجد بيانات لتصديرها.");
                return;
            }
            exportToExcelRejected(rejectedCalls);
        };
    }
}

function renderRejectedContent(calls, mode) {
    const tbody = document.getElementById('rejected_numbers_body');
    if (!tbody) return;
    tbody.innerHTML = "";

    if (calls.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">لا توجد مكالمات مرفوضة</td></tr>';
        return;
    }

    if (mode === 'all') {
        calls.forEach((call, index) => {
            appendUnfollowedRow(tbody, call, index + 1);
        });
    } else if (mode === 'unique') {
        const uniqueMap = new Map();
        calls.forEach(call => uniqueMap.set(call['To Number'], call));
        const uniqueList = Array.from(uniqueMap.values());
        uniqueList.forEach((call, index) => {
            appendUnfollowedRow(tbody, call, index + 1);
        });
    } else {
        // Grouped (Default)
        const groups = {};
        calls.forEach(call => {
            const num = call['To Number'];
            if (!groups[num]) groups[num] = [];
            groups[num].push(call);
        });

        Object.keys(groups).forEach((num, index) => {
            const groupCalls = groups[num];
            const mainCall = groupCalls[groupCalls.length - 1]; // Use latest call as main
            const count = groupCalls.length;

            appendGroupedRow(tbody, mainCall, index + 1, count, groupCalls);
        });
    }
}

function exportToExcelRejected(calls) {
    // Prepare data for Excel
    const data = calls.map((c, i) => ({
        "#": i + 1,
        "رقم العميل": c['To Number'],
        "وقت المكالمة": c['Date Time'],
        "الفرع": c['branch'] || "غير محدد",
        "القطاع": c['sector'] || "غير محدد",
        "الشفت": getShiftName(c['Date Time'])
    }));

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    const wscols = [
        {wch: 5},
        {wch: 20},
        {wch: 25},
        {wch: 20},
        {wch: 20},
        {wch: 25}
    ];
    ws['!cols'] = wscols;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المكالمات المرفوضة");
    
    // Generate filename with current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.getHours() + "-" + now.getMinutes();
    
    // Save file
    XLSX.writeFile(wb, `تفاصيل_المكالمات_المرفوضة_${dateStr}_${timeStr}.xlsx`);
}

function appendUnfollowedRow(tbody, call, rowIndex) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td style="color: var(--text-muted);">${rowIndex}</td>
        <td style="font-weight:bold; font-size:1.1rem; color:var(--text-main);" dir="ltr">${call['To Number']}</td>
        <td style="color:var(--color-red);" dir="ltr">${call['Date Time']}</td>
        <td>${call['branch'] || "غير محدد"}</td>
        <td>${call['sector'] || "غير محدد"}</td>
        <td>${getShiftName(call['Date Time'])}</td>
    `;
    tbody.appendChild(tr);
}

function appendGroupedRow(tbody, call, rowIndex, count, allGroupCalls) {
    const tr = document.createElement('tr');
    tr.className = "clickable-row";
    const hasMore = count > 1;

    tr.innerHTML = `
        <td style="color: var(--text-muted);">${rowIndex}</td>
        <td style="font-weight:bold; font-size:1.1rem; color:var(--text-main);" dir="ltr">
            <span class="${hasMore ? 'expand-icon' : ''}">${call['To Number']}</span>
            ${hasMore ? `<span class="badge-count">${count} مرات</span>` : ''}
        </td>
        <td style="color:var(--color-red);" dir="ltr">${call['Date Time']}</td>
        <td>${call['branch'] || "غير محدد"}</td>
        <td>${call['sector'] || "غير محدد"}</td>
        <td>${getShiftName(call['Date Time'])}</td>
    `;

    tbody.appendChild(tr);

    if (hasMore) {
        // Create the hidden sub-table row
        const subTr = document.createElement('tr');
        subTr.className = "sub-table-row";

        let innerRowsHtml = "";
        allGroupCalls.forEach(c => {
            innerRowsHtml += `
                <tr>
                    <td>${c['Date Time']}</td>
                    <td>${c['branch'] || "غير محدد"}</td>
                    <td>${c['sector'] || "غير محدد"}</td>
                    <td>${getShiftName(c['Date Time'])}</td>
                </tr>
            `;
        });

        subTr.innerHTML = `
            <td colspan="5">
                <div class="sub-table-container">
                    <table class="inner-table">
                        <thead>
                            <tr>
                                <th>وقت الاتصال</th>
                                <th>الفرع</th>
                                <th>القطاع</th>
                                <th>الشفت</th>
                            </tr>
                        </thead>
                        <tbody>${innerRowsHtml}</tbody>
                    </table>
                </div>
            </td>
        `;
        tbody.appendChild(subTr);

        // Click to toggle
        tr.onclick = () => {
            subTr.classList.toggle('open');
            tr.classList.toggle('open');
        };
    }
}

function getShiftName(dateTimeStr) {
    const dt = new Date(dateTimeStr);
    const h = dt.getHours();
    if (h >= 8 && h < 16) return "الشفت الأول 8ص - 4م";
    if (h >= 16) return "الشفت الثاني 4م - 12ص";
    return "الشفت الثالث 12ص - 8ص";
}

// --- Monthly Comparison Logic ---
document.getElementById('runComparisonBtn')?.addEventListener('click', () => {
    const m1 = document.getElementById('monthOne').value;
    const m2 = document.getElementById('monthTwo').value;

    if (!m1 || !m2) {
        alert("يرجى اختيار الشهرين للمقارنة.");
        return;
    }

    const sectorVal = document.getElementById('sectorFilter').value;

    const dataM1 = allData.filter(row => {
        if (sectorVal && row['sector'] !== sectorVal) return false;
        const d = new Date(row['Date Time']);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === m1;
    });

    const dataM2 = allData.filter(row => {
        if (sectorVal && row['sector'] !== sectorVal) return false;
        const d = new Date(row['Date Time']);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthStr === m2;
    });

    const stats1 = calculateMetrics(dataM1);
    const stats2 = calculateMetrics(dataM2);

    renderComparison(stats1, stats2, m1, m2);
});

function renderComparison(s1, s2, label1, label2) {
    const container = document.getElementById('comparisonResults');
    const body = document.getElementById('comparisonBody');
    document.getElementById('labelMonthOne').innerText = label1;
    document.getElementById('labelMonthTwo').innerText = label2;

    const rows = [
        { name: "إجمالي المكالمات", v1: s1.totalCalls, v2: s2.totalCalls, better: "higher" },
        { name: "المكالمات الواردة", v1: s1.incoming, v2: s2.incoming, better: "higher" },
        { name: "المكالمات الصادرة", v1: s1.outgoing, v2: s2.outgoing, better: "higher" },
        { name: "المكالمات التي تم الرد عليها", v1: s1.answered, v2: s2.answered, better: "higher" },
        { name: "المكالمات الفائتة", v1: s1.missed, v2: s2.missed, better: "lower" },
        { name: "المكالمات المرفوضة", v1: s1.rejected, v2: s2.rejected, better: "lower" },
        { name: "الأرقام الجديدة", v1: s1.uniqueNumbers.size, v2: s2.uniqueNumbers.size, better: "higher" },
        { name: "المكالمات غير المتابعة", v1: s1.unfollowed.length, v2: s2.unfollowed.length, better: "lower" }
    ];

    let html = "";
    rows.forEach(r => {
        const delta = r.v2 - r.v1;
        const perc = r.v1 ? Math.round((delta / r.v1) * 100) : (r.v2 ? 100 : 0);
        
        let growthClass = "";
        let indicator = "";
        
        if (delta > 0) {
            growthClass = r.better === "higher" ? "growth-positive" : "growth-negative";
            indicator = "↑";
        } else if (delta < 0) {
            growthClass = r.better === "lower" ? "growth-positive" : "growth-negative";
            indicator = "↓";
        }

        html += `
            <tr>
                <td style="font-weight:bold;">${r.name}</td>
                <td>${r.v1}</td>
                <td>${r.v2}</td>
                <td class="${growthClass}">${indicator} ${Math.abs(perc)}%</td>
                <td class="${growthClass}">${delta > 0 ? '+' : ''}${delta}</td>
            </tr>
        `;
    });

    body.innerHTML = html;
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
}

