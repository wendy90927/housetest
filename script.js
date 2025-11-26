import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, deleteUser, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, doc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Config
const firebaseConfig = {
    apiKey: "AIzaSyC3rxfvajIswJADfzJD0lphVra99vka7nE",
    authDomain: "household-item-management.firebaseapp.com",
    projectId: "household-item-management",
    storageBucket: "household-item-management.firebasestorage.app",
    messagingSenderId: "1042289941268",
    appId: "1:1042289941268:web:2d77a3a9fb2cf666ed0001"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const itemsRef = collection(db, "items");

// --- 工具函数：防崩溃绑定 (核心修复) ---
// 这个函数确保即使某个按钮ID写错了，也不会导致整个程序瘫痪
function safeBind(id, event, handler) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(event, handler);
    } else {
        console.warn(`[SafeBind] 警告：找不到元素 ID "${id}"，跳过绑定。`);
    }
}

// --- Audio Engine ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    
    if (type === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, now);
        gainNode.gain.setValueAtTime(0.1, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'error') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(150, now);
        gainNode.gain.setValueAtTime(0.2, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'click') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, now);
        gainNode.gain.setValueAtTime(0.05, now); gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    }
}

window.announce = (msg, type = 'normal') => {
    const el = document.getElementById('live-announcer');
    if(el) {
        el.textContent = msg;
        if (msg.includes("成功") || msg.includes("已添加") || msg.includes("已删除") || msg.includes("保存")) playSound('success');
        else if (msg.includes("失败") || msg.includes("错误") || msg.includes("不足")) playSound('error');
        setTimeout(() => el.textContent = '', 1000);
    }
};

// --- ★★★ 登录/注册逻辑 (移到最前，确保优先加载) ★★★ ---

// 登录
safeBind('login-password', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-login').click(); } });
safeBind('btn-login', 'click', async () => {
    const e = document.getElementById('login-email').value; 
    const p = document.getElementById('login-password').value;
    const autoLogin = document.getElementById('chk-auto-login').checked;
    const rememberEmail = document.getElementById('chk-remember-email').checked;
    if(rememberEmail) localStorage.setItem('savedEmail', e); else localStorage.removeItem('savedEmail');
    try {
        await setPersistence(auth, autoLogin ? browserLocalPersistence : browserSessionPersistence);
        await signInWithEmailAndPassword(auth, e, p);
    } catch(err) { announce("登录失败"); alert("登录失败：" + err.message); }
});

// 注册
safeBind('btn-to-register', 'click', () => switchScreen('screen-register'));
safeBind('btn-back-login', 'click', () => switchScreen('screen-login'));
safeBind('btn-submit-reg', 'click', () => {
    const e = document.getElementById('reg-email').value; 
    const p1 = document.getElementById('reg-pass').value; 
    const p2 = document.getElementById('reg-pass-confirm').value;
    if (p1 !== p2 || p1.length < 6) { alert("密码不一致或太短"); return; }
    createUserWithEmailAndPassword(auth, e, p1).catch(err => alert(err.message));
});

// 找回密码
safeBind('btn-forgot-pass', 'click', () => {
    document.getElementById('modal-forgot').classList.remove('hidden'); 
    setTimeout(() => {
        const title = document.getElementById('title-forgot');
        if(title) title.focus();
    }, 100);
});
safeBind('btn-cancel-forgot', 'click', () => document.getElementById('modal-forgot').classList.add('hidden'));
safeBind('btn-send-reset', 'click', () => {
    const e = document.getElementById('forgot-email').value; if(!e) return;
    sendPasswordResetEmail(auth, e).then(() => { alert("已发送"); document.getElementById('modal-forgot').classList.add('hidden'); }).catch(err => alert(err.message));
});

// 账户菜单
const btnAccount = document.getElementById('btn-account-menu');
const menuAccount = document.getElementById('menu-account-dropdown');
if(btnAccount && menuAccount) {
    btnAccount.addEventListener('click', (e) => {
        e.stopPropagation(); playSound('click');
        menuAccount.classList.toggle('hidden');
        if(!menuAccount.classList.contains('hidden')) {
            btnAccount.setAttribute('aria-expanded', 'true');
            const firstBtn = menuAccount.querySelector('button');
            if(firstBtn) firstBtn.focus();
        } else { btnAccount.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('click', (e) => {
        if (!btnAccount.contains(e.target) && !menuAccount.contains(e.target)) {
            menuAccount.classList.add('hidden');
            btnAccount.setAttribute('aria-expanded', 'false');
        }
    });
}

safeBind('btn-logout', 'click', () => signOut(auth).then(() => announce("已退出")));
safeBind('btn-clear-data', 'click', () => {
    menuAccount.classList.add('hidden');
    openGenericConfirm("确定清空数据？", async () => {
        const batch = writeBatch(db);
        const q = query(itemsRef, where("uid", "==", auth.currentUser.uid));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit(); announce("已清空");
    });
});
safeBind('btn-delete-account', 'click', () => {
    menuAccount.classList.add('hidden');
    openGenericConfirm("确定删除账号？", async () => {
        const batch = writeBatch(db);
        const q = query(itemsRef, where("uid", "==", auth.currentUser.uid));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit(); await deleteUser(auth.currentUser);
    });
});

// --- Data Model (家庭/房间) ---
const DEFAULT_FAMILIES = [
    { id: 'f1', name: '家庭1', location: '默认', rooms: ['客厅', '厨房', '卧室', '书房', '餐厅', '玄关', '卫生间', '洗衣房'] }
];

let FAMILY_DATA;
try {
    FAMILY_DATA = JSON.parse(localStorage.getItem('family_data_v3') || JSON.stringify(DEFAULT_FAMILIES));
} catch (e) {
    FAMILY_DATA = JSON.parse(JSON.stringify(DEFAULT_FAMILIES));
}

let currentFamilyId = localStorage.getItem('current_family_id') || 'f1';
if (!FAMILY_DATA.find(f => f.id === currentFamilyId)) currentFamilyId = FAMILY_DATA[0].id;

function saveFamilyData() {
    localStorage.setItem('family_data_v3', JSON.stringify(FAMILY_DATA));
    localStorage.setItem('current_family_id', currentFamilyId);
    updateGlobalRoomSelects();
}

function getCurrentRooms() {
    const fam = FAMILY_DATA.find(f => f.id === currentFamilyId);
    return fam ? fam.rooms : [];
}

// --- State ---
let allItems = [];
let currentActionItem = null;
let pendingAddQty = 1;
let currentScreen = 'login';
let homeFilterRoom = 'all';
let homeFilterCategory = 'all'; 
let takeoutFilterRoom = 'all';
let takeoutFilterCategory = 'all'; 
let unsubscribeItems = null;
let previousScreen = 'home';
let focusTargetId = null; 
let searchResults = [];
let pendingTags = []; 
let roomToDelete = null;
let editingFamilyId = null;

// 自动推断规则
const INFERENCE_RULES = {
    '食品饮料': ['奶', '水', '茶', '酒', '饮料', '饼', '糖', '巧克力', '可乐', '雪碧', '汁', '咖啡', '燕麦'],
    '烹饪调料': ['油', '盐', '酱', '醋', '米', '面粉', '调料', '鸡精', '味精', '糖', '花椒', '八角'],
    '居家日用': ['纸', '洗衣', '清洁', '剂', '刷', '垃圾袋', '毛巾', '皂', '洗洁精', '柔顺剂'],
    '个人护理': ['洗发', '沐浴', '牙膏', '牙刷', '面霜', '乳液', '口红', '粉底', '卫生巾', '棉', '防晒', '卸妆', '药', '维C', '钙片'],
    '文具工具': ['笔', '本', '胶', '剪刀', '电池', '螺丝', '刀', '尺', '胶带'],
    '电子数码': ['线', '充电', '耳机', '鼠标', '键盘', 'U盘', '手机', '平板']
};

const TAG_SUGGESTIONS = {
    '奶': ['饮品', '早餐'], '水': ['饮品', '囤货'], '纸': ['日用', '消耗品'],
    '洗发': ['洗护'], '沐浴': ['洗护'], '牙膏': ['洗护'], '面霜': ['护肤'],
    '口红': ['彩妆'], '感冒': ['药品'], '维': ['保健品']
};

// --- Unit Presets ---
let UNIT_LIST = ["个", "包", "箱", "瓶", "袋", "条", "块", "只", "支", "把", "张", "双", "套", "组", "对", "本", "册", "罐", "桶", "壶", "杯", "斤", "公斤", "升", "毫升"];
const savedUnits = JSON.parse(localStorage.getItem('custom_units') || '[]');
UNIT_LIST = [...new Set([...UNIT_LIST, ...savedUnits])];

function learnNewUnit(unit) {
    if(!unit) return;
    if(!UNIT_LIST.includes(unit)) {
        UNIT_LIST.push(unit);
        localStorage.setItem('custom_units', JSON.stringify(UNIT_LIST));
    }
}

const savedEmail = localStorage.getItem('savedEmail');
if(savedEmail) {
    const el = document.getElementById('login-email');
    if(el) el.value = savedEmail;
}

// --- Screen Switcher ---
function switchScreen(screenId) {
    if (screenId === 'screen-edit') {
        if (currentScreen === 'home' || currentScreen === 'takeout') previousScreen = currentScreen;
        else if (currentScreen === 'results') previousScreen = document.getElementById('btn-back-results').dataset.return || 'home';
    }

    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(screenId);
    if (!target) { console.error("Screen not found:", screenId); return; } 
    target.classList.remove('hidden');
    
    if (screenId === 'screen-home') currentScreen = 'home';
    else if (screenId === 'screen-takeout') currentScreen = 'takeout';
    else if (screenId === 'screen-results') currentScreen = 'results';
    else if (screenId === 'screen-edit') currentScreen = 'edit';
    else if (screenId === 'screen-add') currentScreen = 'add';
    else if (screenId === 'screen-settings') {
        currentScreen = 'settings';
        refreshSettingsUI();
    }
    else if (screenId === 'screen-room-list-delete') currentScreen = 'room-list-delete';
    else currentScreen = 'other';
    
    if (!focusTargetId) {
        setTimeout(() => {
            const h1 = target.querySelector('h1');
            if (h1) h1.focus();
        }, 100);
    }

    if(screenId === 'screen-home') refreshHomeList();
    if(screenId === 'screen-takeout') refreshTakeoutList();
}

// --- Global Room Update ---
function updateGlobalRoomSelects() {
    const selects = ['add-room', 'edit-room', 'home-filter', 'takeout-filter'];
    const rooms = getCurrentRooms();
    
    selects.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        const currentVal = el.value;
        let html = '';
        if (id.includes('filter')) html += `<option value="all">全部房间</option>`;
        rooms.forEach(r => { html += `<option value="${r}">${r}</option>`; });
        el.innerHTML = html;
        if(currentVal && rooms.includes(currentVal)) el.value = currentVal;
    });
}
updateGlobalRoomSelects();

// --- ★★★ 账户设置 - 核心逻辑 ★★★ ---

const btnOpenSettings = document.getElementById('btn-open-settings');
function openSettingsAction() {
    const menu = document.getElementById('menu-account-dropdown');
    if(menu) menu.classList.add('hidden');
    
    switchScreen('screen-settings');
    
    if (auth.currentUser) {
        const display = document.getElementById('settings-email-display');
        if(display) display.textContent = auth.currentUser.email;
        
        const savedName = localStorage.getItem('user_nickname');
        const nameInput = document.getElementById('profile-username');
        if(nameInput) nameInput.value = savedName || auth.currentUser.email;
    }
    switchTab('profile');
}

if(btnOpenSettings) {
    btnOpenSettings.addEventListener('click', (e) => { e.stopPropagation(); openSettingsAction(); });
    btnOpenSettings.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSettingsAction(); }
    });
}

// 保存用户名
safeBind('btn-save-username', 'click', () => {
    const newName = document.getElementById('profile-username').value.trim();
    if(newName) {
        localStorage.setItem('user_nickname', newName);
        announce("用户名已保存");
    }
});

// 选项卡逻辑 (方向键)
window.switchTab = function(tabName) {
    const tabs = ['profile', 'family', 'rooms'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const panel = document.getElementById(`panel-${t}`);
        if(!btn || !panel) return;

        if (t === tabName) {
            btn.setAttribute('aria-selected', 'true');
            btn.setAttribute('tabindex', '0');
            panel.classList.remove('hidden');
            btn.classList.add('text-blue-600', 'border-blue-600', 'bg-blue-50');
            btn.classList.remove('text-gray-500', 'border-transparent');
            btn.focus();
        } else {
            btn.setAttribute('aria-selected', 'false');
            btn.setAttribute('tabindex', '-1');
            panel.classList.add('hidden');
            btn.classList.remove('text-blue-600', 'border-blue-600', 'bg-blue-50');
            btn.classList.add('text-gray-500', 'border-transparent');
        }
    });
}

const tabList = document.querySelector('[role="tablist"]');
if(tabList) {
    tabList.addEventListener('keydown', (e) => {
        const tabs = ['profile', 'family', 'rooms'];
        const currentTab = document.querySelector('.tab-btn[aria-selected="true"]');
        if(!currentTab) return;
        const currentId = currentTab.id.replace('tab-btn-', '');
        let idx = tabs.indexOf(currentId);
        if (e.key === 'ArrowRight') {
            idx = (idx + 1) % tabs.length;
            switchTab(tabs[idx]);
        } else if (e.key === 'ArrowLeft') {
            idx = (idx - 1 + tabs.length) % tabs.length;
            switchTab(tabs[idx]);
        }
    });
}
safeBind('tab-btn-profile', 'click', () => switchTab('profile'));
safeBind('tab-btn-family', 'click', () => switchTab('family'));
safeBind('tab-btn-rooms', 'click', () => switchTab('rooms'));
safeBind('btn-back-settings', 'click', () => switchScreen('screen-home'));

// --- 家庭管理逻辑 ---
function refreshSettingsUI() {
    const famSelect = document.getElementById('settings-family-select');
    const roomFamSelect = document.getElementById('settings-room-family-select');
    
    if(!famSelect || !roomFamSelect) return;

    const generateOpts = () => FAMILY_DATA.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    const html = generateOpts();
    famSelect.innerHTML = html;
    roomFamSelect.innerHTML = html;
    
    // 恢复之前选中的家庭
    if (FAMILY_DATA.find(f => f.id === currentFamilyId)) {
        famSelect.value = currentFamilyId;
        roomFamSelect.value = currentFamilyId;
    }
}

// 1. 新建家庭
safeBind('btn-new-family', 'click', () => {
    document.getElementById('modal-family-new').classList.remove('hidden');
    document.getElementById('input-new-family-name').value = '';
    document.getElementById('input-new-family-loc').value = '';
    setTimeout(() => document.getElementById('title-family-new').focus(), 100);
});

safeBind('btn-confirm-new-family', 'click', () => {
    const name = document.getElementById('input-new-family-name').value.trim();
    const loc = document.getElementById('input-new-family-loc').value.trim();
    if(!name) { announce("请输入家庭名称"); return; }
    
    const newId = 'f' + Date.now();
    FAMILY_DATA.push({ id: newId, name: name, location: loc, rooms: ['客厅', '卧室'] });
    currentFamilyId = newId; // 切换到新家
    saveFamilyData();
    refreshSettingsUI();
    document.getElementById('modal-family-new').classList.add('hidden');
    announce(`已创建并切换到 ${name}`);
});

// 2. 编辑家庭
safeBind('btn-edit-family', 'click', () => {
    const famId = document.getElementById('settings-family-select').value;
    const fam = FAMILY_DATA.find(f => f.id === famId);
    if(!fam) return;
    
    document.getElementById('modal-family-edit').classList.remove('hidden');
    document.getElementById('input-edit-family-name').value = fam.name;
    document.getElementById('input-edit-family-loc').value = fam.location || '';
    setTimeout(() => document.getElementById('title-family-edit').focus(), 100);
});

safeBind('btn-confirm-edit-family', 'click', () => {
    const famId = document.getElementById('settings-family-select').value;
    const fam = FAMILY_DATA.find(f => f.id === famId);
    if(fam) {
        fam.name = document.getElementById('input-edit-family-name').value.trim();
        fam.location = document.getElementById('input-edit-family-loc').value.trim();
        saveFamilyData();
        refreshSettingsUI();
        document.getElementById('modal-family-edit').classList.add('hidden');
        announce("修改已保存");
    }
});

// 3. 删除家庭
safeBind('btn-delete-family', 'click', () => {
    const famId = document.getElementById('settings-family-select').value;
    if (FAMILY_DATA.length <= 1) { announce("至少保留一个家庭"); return; }
    
    const fam = FAMILY_DATA.find(f => f.id === famId);
    if(confirm(`确定删除家庭“${fam.name}”吗？此操作不可恢复。`)) {
        FAMILY_DATA = FAMILY_DATA.filter(f => f.id !== famId);
        currentFamilyId = FAMILY_DATA[0].id;
        saveFamilyData();
        refreshSettingsUI();
        announce("已删除");
    }
});

// --- 房间管理逻辑 ---
safeBind('settings-room-family-select', 'change', (e) => {
    // 切换房间管理视角
});

// 新增房间
safeBind('btn-room-add-open', 'click', () => {
    document.getElementById('modal-room-add').classList.remove('hidden');
    document.getElementById('input-new-room-name').value = '';
    setTimeout(() => document.getElementById('title-room-add').focus(), 100);
});

safeBind('btn-confirm-add-room', 'click', () => {
    const name = document.getElementById('input-new-room-name').value.trim();
    const famId = document.getElementById('settings-room-family-select').value;
    const fam = FAMILY_DATA.find(f => f.id === famId);
    
    if(name && fam && !fam.rooms.includes(name)) {
        fam.rooms.push(name);
        saveFamilyData();
        document.getElementById('modal-room-add').classList.add('hidden');
        announce(`已添加房间 ${name}`);
    } else if (fam && fam.rooms.includes(name)) {
        announce("房间已存在");
    }
});

// 删除房间 (独立页面)
safeBind('btn-room-delete-open', 'click', () => {
    const famId = document.getElementById('settings-room-family-select').value;
    const fam = FAMILY_DATA.find(f => f.id === famId);
    if(!fam) return;
    
    switchScreen('screen-room-list-delete');
    const container = document.getElementById('container-room-delete-list');
    container.innerHTML = '';
    
    fam.rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room-del-item';
        div.innerHTML = `
            <span class="text-lg font-bold">${room}</span>
            <button class="room-del-btn" aria-label="删除 ${room}">删除</button>
        `;
        div.querySelector('button').addEventListener('click', () => {
            if(confirm(`确定删除 ${fam.name} 的房间“${room}”吗？`)) {
                fam.rooms = fam.rooms.filter(r => r !== room);
                saveFamilyData();
                div.remove(); // 实时移除
                announce(`已删除 ${room}`);
            }
        });
        container.appendChild(div);
    });
    setTimeout(() => document.getElementById('title-room-list-delete').focus(), 100);
});

safeBind('btn-back-room-list', 'click', () => {
    switchScreen('screen-settings');
    switchTab('rooms');
});

// 模态框通用取消按钮
safeBind('btn-cancel-new-family', 'click', () => document.getElementById('modal-family-new').classList.add('hidden'));
safeBind('btn-cancel-edit-family', 'click', () => document.getElementById('modal-family-edit').classList.add('hidden'));
safeBind('btn-cancel-add-room', 'click', () => document.getElementById('modal-room-add').classList.add('hidden'));


// --- Auth & Init ---
onAuthStateChanged(auth, user => {
    if (user) {
        const menuBtn = document.getElementById('btn-account-menu');
        if(menuBtn) menuBtn.setAttribute('aria-label', `当前账号：${user.email}，点击展开菜单`);
        const emailDisplay = document.getElementById('user-email-display');
        if(emailDisplay) emailDisplay.textContent = user.email.split('@')[0];
        
        switchScreen('screen-home');
        setupDataListener(user.uid);
    } else {
        if(unsubscribeItems) unsubscribeItems();
        allItems = [];
        switchScreen('screen-login');
    }
});

// --- Focus Trap ---
function safeTrapFocus(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const focusableElementsString = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableContent = el.querySelectorAll(focusableElementsString);
    if (focusableContent.length === 0) return;
    const firstFocusableElement = focusableContent[0];
    const lastFocusableElement = focusableContent[focusableContent.length - 1];
    el.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey) { 
                if (document.activeElement === firstFocusableElement) {
                    e.preventDefault(); lastFocusableElement.focus();
                }
            } else { 
                if (document.activeElement === lastFocusableElement) {
                    e.preventDefault(); firstFocusableElement.focus();
                }
            }
        }
    });
}
safeTrapFocus('modal-action');
safeTrapFocus('modal-qty');
safeTrapFocus('modal-unit');
safeTrapFocus('modal-zero');
safeTrapFocus('modal-confirm');
safeTrapFocus('modal-forgot');
safeTrapFocus('modal-family-new');
safeTrapFocus('modal-family-edit');
safeTrapFocus('modal-room-add');

// --- Navigation Handlers (Add, Edit, Data) ---
safeBind('btn-nav-takeout', 'click', () => switchScreen('screen-takeout'));
safeBind('btn-back-takeout', 'click', () => switchScreen('screen-home'));
safeBind('btn-nav-add', 'click', () => { 
    switchScreen('screen-add'); 
    const nameInput = document.getElementById('add-name');
    if(nameInput) nameInput.focus();
    pendingAddQty = 1; 
    pendingTags = []; 
    renderTags('add-tags-container', 'add-tags-input');
    updateAddQtyDisplay(); 
});
safeBind('btn-back-add', 'click', () => switchScreen('screen-home'));
safeBind('btn-nav-data', 'click', () => switchScreen('screen-data'));
safeBind('btn-back-data', 'click', () => switchScreen('screen-home'));

function updateAddQtyDisplay() {
    const btn = document.getElementById('btn-add-qty-trigger');
    if(btn) {
        btn.textContent = `当前选择：${pendingAddQty} (点击修改)`;
        btn.setAttribute('aria-label', `当前数量 ${pendingAddQty}，点击修改`);
    }
}

safeBind('btn-add-qty-trigger', 'click', () => {
    openQtyPicker("初始数量", (val) => {
        pendingAddQty = val;
        updateAddQtyDisplay();
    });
});

// Add Form Submit
const formAdd = document.getElementById('form-add');
if(formAdd) {
    formAdd.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('add-name');
        const name = nameInput.value.trim();
        if(!name) return;
        try {
            await addDoc(itemsRef, {
                name: name,
                category: document.getElementById('add-category').value,
                tags: pendingTags,
                unit: document.getElementById('add-unit').value,
                room: document.getElementById('add-room').value,
                location: document.getElementById('add-location').value,
                quantity: pendingAddQty,
                uid: auth.currentUser.uid,
                updatedAt: serverTimestamp()
            });
            announce("添加成功");
            formAdd.reset();
            pendingAddQty = 1;
            pendingTags = [];
            renderTags('add-tags-container', 'add-tags-input');
            updateAddQtyDisplay();
            nameInput.focus();
        } catch(err) {
            announce("添加失败");
            console.error(err);
        }
    });
}
safeBind('btn-cancel-add', 'click', () => { switchScreen('screen-home'); announce("已取消"); });

// Edit Logic
function cancelEdit() {
    playSound('click');
    if(currentActionItem) focusTargetId = currentActionItem.id;
    switchScreen('screen-' + previousScreen);
}
safeBind('btn-back-edit', 'click', cancelEdit);
safeBind('btn-cancel-edit-form', 'click', cancelEdit);

const formEdit = document.getElementById('form-edit');
if(formEdit) {
    formEdit.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newQty = parseInt(document.getElementById('edit-quantity').value);
        const unitVal = document.getElementById('edit-unit').value;
        learnNewUnit(unitVal);
        if (newQty === 0) { openZeroConfirmEdit(newQty); return; }
        await executeEdit(newQty);
    });
}

async function executeEdit(newQty) {
    focusTargetId = currentActionItem.id; 
    try {
        await updateDoc(doc(db, "items", currentActionItem.id), {
            name: document.getElementById('edit-name').value,
            category: document.getElementById('edit-category').value, 
            tags: pendingTags, 
            room: document.getElementById('edit-room').value,
            location: document.getElementById('edit-location').value,
            unit: document.getElementById('edit-unit').value,
            quantity: newQty,
            updatedAt: serverTimestamp()
        });
        announce("修改成功");
        switchScreen('screen-' + previousScreen);
    } catch(e) { announce("失败"); }
}

function openZeroConfirmEdit(newQty) {
    const m = document.getElementById('modal-zero'); playSound('error'); m.classList.remove('hidden'); 
    setTimeout(() => document.getElementById('title-zero').focus(), 100);
    
    document.getElementById('btn-zero-keep').onclick = async () => { m.classList.add('hidden'); await executeEdit(0); };
    document.getElementById('btn-zero-del').onclick = async () => { m.classList.add('hidden'); await execDelete(); switchScreen('screen-' + previousScreen); };
    document.getElementById('btn-zero-cancel').onclick = () => { m.classList.add('hidden'); announce("已取消"); };
}

// Unit Picker Logic
let unitTargetInput = null;
const unitGrid = document.getElementById('unit-grid');
function initUnitGrid() {
    unitGrid.innerHTML = '';
    UNIT_LIST.forEach(u => {
        const btn = document.createElement('button');
        btn.className = 'grid-btn'; btn.textContent = u;
        btn.addEventListener('click', () => {
            if(unitTargetInput) { unitTargetInput.value = u; announce(`已选择 ${u}`); unitTargetInput.focus(); }
            closeUnitModal();
        });
        unitGrid.appendChild(btn);
    });
}
window.openUnitPicker = (inputId) => {
    playSound('click'); unitTargetInput = document.getElementById(inputId); initUnitGrid(); 
    document.getElementById('modal-unit').classList.remove('hidden'); document.getElementById('unit-title').focus();
};
window.closeUnitModal = () => { document.getElementById('modal-unit').classList.add('hidden'); if(unitTargetInput) unitTargetInput.focus(); };
safeBind('btn-pick-unit-add', 'click', () => openUnitPicker('add-unit'));
safeBind('btn-pick-unit-edit', 'click', () => openUnitPicker('edit-unit'));
safeBind('btn-unit-cancel', 'click', closeUnitModal);

// Action Menu
function openActionMenu(item) {
    playSound('click');
    const freshItem = allItems.find(i => i.id === item.id) || item;
    currentActionItem = freshItem;
    const modal = document.getElementById('modal-action');
    document.getElementById('action-title').textContent = `管理：${freshItem.name}`;
    document.getElementById('action-desc').textContent = `分类：${freshItem.category} | 剩余：${freshItem.quantity} ${freshItem.unit||'个'}`;
    const btnPut = document.getElementById('btn-act-put');
    if (currentScreen === 'takeout') btnPut.classList.add('hidden'); else btnPut.classList.remove('hidden'); 
    modal.classList.remove('hidden');
    setTimeout(() => { const v = modal.querySelectorAll('button:not(.hidden)'); if(v.length > 0) v[0].focus(); }, 100);
}
document.getElementById('action-buttons-container').addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const act = btn.dataset.action;
    if (act === 'put') openQtyPicker("放入数量", (n) => handleUpdate(n));
    if (act === 'take') openQtyPicker("取出数量", (n) => handleUpdate(-n));
    if (act === 'delete') openGenericConfirm(`确定删除 ${currentActionItem.name} 吗？`, execDelete);
    if (act === 'edit') openEditScreen(currentActionItem);
});
safeBind('btn-act-cancel', 'click', closeModals);

function openEditScreen(item) {
    document.getElementById('modal-action').classList.add('hidden');
    switchScreen('screen-edit');
    document.getElementById('edit-name').value = item.name;
    const catSelect = document.getElementById('edit-category');
    catSelect.value = item.category || '其他杂项';
    if(catSelect.value === '') catSelect.value = '其他杂项';

    document.getElementById('edit-room').value = item.room;
    document.getElementById('edit-location').value = item.location;
    document.getElementById('edit-unit').value = item.unit || '个';
    document.getElementById('edit-quantity').value = item.quantity;
    pendingTags = [...(item.tags || [])];
    renderTags('edit-tags-container', 'edit-tags-input');
}

// Qty Picker
let qtyCallback = null;
const qtyGrid = document.getElementById('qty-grid');
qtyGrid.innerHTML = '';
for(let i=1; i<=10; i++) {
    const btn = document.createElement('button'); btn.className = 'grid-btn'; btn.textContent = i;
    const handler = (e) => { if(e.type === 'keydown' && e.key !== 'Enter') return; e.preventDefault(); e.stopPropagation(); submitQty(i); };
    btn.addEventListener('click', handler); btn.addEventListener('keydown', handler); qtyGrid.appendChild(btn);
}
function openQtyPicker(title, cb) {
    playSound('click'); qtyCallback = cb;
    document.getElementById('qty-title').textContent = title;
    document.getElementById('modal-action').classList.add('hidden'); document.getElementById('modal-qty').classList.remove('hidden');
    const input = document.getElementById('qty-custom-input'); const confirm = document.getElementById('btn-qty-confirm'); const trigger = document.getElementById('qty-custom-trigger');
    input.value = ''; input.disabled = true; confirm.disabled = true; confirm.classList.add('opacity-50'); confirm.setAttribute('tabindex', '-1'); trigger.setAttribute('tabindex', '0');
    setTimeout(() => { qtyGrid.firstChild.focus(); announce("请选择数量"); }, 100);
}
safeBind('qty-custom-trigger', 'click', () => {
    const input = document.getElementById('qty-custom-input'); const confirm = document.getElementById('btn-qty-confirm'); const trigger = document.getElementById('qty-custom-trigger');
    trigger.setAttribute('tabindex', '-1'); input.disabled = false; input.focus(); confirm.disabled = false; confirm.classList.remove('opacity-50'); confirm.setAttribute('tabindex', '0'); announce("请输入数字");
});
safeBind('btn-qty-confirm', 'click', () => submitQty(parseInt(document.getElementById('qty-custom-input').value)));
safeBind('btn-qty-cancel', 'click', closeQtyModal);

function submitQty(val) { 
    if (!val || val <= 0) { announce("无效数量"); return; } 
    if (qtyCallback) qtyCallback(val); 
    document.getElementById('modal-qty').classList.add('hidden');
    if (currentScreen === 'add') {
        const t = document.getElementById('btn-add-qty-trigger'); if(t) t.focus();
    } else {
        closeModals();
    }
}
function closeQtyModal() { 
    document.getElementById('modal-qty').classList.add('hidden'); 
    if (currentScreen === 'add') {
        const t = document.getElementById('btn-add-qty-trigger'); if(t) t.focus();
    } else {
        closeModals(); 
    }
}

window.closeModals = () => {
    document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
    const containerId = (currentScreen === 'results') ? 'results-list' : (currentScreen === 'takeout' ? 'takeout-list' : 'home-list');
    const container = document.getElementById(containerId);
    if (currentActionItem && currentActionItem.id) {
        const target = container.querySelector(`.item-card[data-id="${currentActionItem.id}"]`);
        if (target) { target.focus(); return; }
    }
    const first = container.querySelector('.item-card');
    if (first) first.focus();
};

async function handleUpdate(change) {
    if (!currentActionItem) return;
    const newQty = currentActionItem.quantity + change;
    if (newQty === 0) { openZeroConfirm(); return; }
    if (newQty < 0) { announce("库存不足"); return; }
    await execUpdate(change);
}
async function execUpdate(change) {
    focusTargetId = currentActionItem.id;
    try {
        await updateDoc(doc(db, "items", currentActionItem.id), { quantity: increment(change), updatedAt: serverTimestamp() });
        announce("更新成功"); closeModals();
    } catch(e) { announce("失败"); }
}
function openZeroConfirm() {
    const m = document.getElementById('modal-zero'); playSound('error'); m.classList.remove('hidden'); setTimeout(() => document.getElementById('title-zero').focus(), 100);
    document.getElementById('btn-zero-keep').onclick = async () => { m.classList.add('hidden'); await execUpdate(-currentActionItem.quantity); };
    document.getElementById('btn-zero-del').onclick = async () => { m.classList.add('hidden'); await execDelete(); };
    document.getElementById('btn-zero-cancel').onclick = () => { m.classList.add('hidden'); announce("已取消"); closeModals(); };
}
let confirmCallback = null;
function openGenericConfirm(msg, cb) {
    document.getElementById('modal-action').classList.add('hidden'); const m = document.getElementById('modal-confirm'); playSound('error');
    m.classList.remove('hidden'); document.getElementById('confirm-text').textContent = msg; confirmCallback = cb; setTimeout(() => document.getElementById('title-confirm').focus(), 100);
}
safeBind('btn-confirm-ok', 'click', () => { if(confirmCallback) confirmCallback(); document.getElementById('modal-confirm').classList.add('hidden'); });
safeBind('btn-confirm-cancel', 'click', closeModals);
async function execDelete() { try { await deleteDoc(doc(db, "items", currentActionItem.id)); announce("已删除"); closeModals(); } catch(e) { announce("删除失败"); } }

// Search
setupSearch('home-search', 'btn-do-search', 'btn-clear-home-search', 'home');
setupSearch('takeout-search', 'btn-do-search-takeout', 'btn-clear-takeout-search', 'takeout');
safeBind('btn-back-results', 'click', (e) => {
    const ctx = e.target.dataset.return || 'home';
    document.getElementById('home-search').value = ''; document.getElementById('takeout-search').value = '';
    document.getElementById('btn-clear-home-search').classList.add('hidden'); document.getElementById('btn-clear-takeout-search').classList.add('hidden');
    switchScreen(ctx === 'takeout' ? 'screen-takeout' : 'screen-home');
});

// Tags
setupTagInput('add-tags-input', 'btn-add-tag-trigger', 'add-tags-container');
setupTagInput('edit-tags-input', 'btn-edit-tag-trigger', 'edit-tags-container');
document.getElementById('add-name').addEventListener('blur', (e) => attemptInference(e.target.value.trim()));