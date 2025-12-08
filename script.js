import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, deleteUser, setPersistence, browserLocalPersistence, browserSessionPersistence, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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

        // 标签暂存
        let pendingTags = []; 

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
        if(savedEmail) document.getElementById('login-email').value = savedEmail;

        window.announce = (msg, type = 'normal') => {
            const el = document.getElementById('live-announcer');
            el.textContent = msg;
            if (msg.includes("成功") || msg.includes("已添加") || msg.includes("已删除") || msg.includes("自动填入")) playSound('success');
            else if (msg.includes("失败") || msg.includes("错误") || msg.includes("不足") || msg.includes("未找到")) playSound('error');
            setTimeout(() => el.textContent = '', 1000);
        };

        // --- Focus Trap ---
        function trapFocus(modalEl) {
            const focusableElementsString = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
            const focusableContent = modalEl.querySelectorAll(focusableElementsString);
            if (focusableContent.length === 0) return;
            const firstFocusableElement = focusableContent[0];
            const lastFocusableElement = focusableContent[focusableContent.length - 1];
            modalEl.addEventListener('keydown', function(e) {
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
        trapFocus(document.getElementById('modal-action'));
        trapFocus(document.getElementById('modal-qty'));
        trapFocus(document.getElementById('modal-unit'));
        trapFocus(document.getElementById('modal-zero'));
        trapFocus(document.getElementById('modal-confirm'));
        trapFocus(document.getElementById('modal-forgot'));

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
else if (screenId === 'screen-settings') currentScreen = 'settings';
            else if (screenId === 'screen-change-pwd') currentScreen = 'change-pwd';
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

        // --- Auth & Init ---
        onAuthStateChanged(auth, user => {
if (user) {
                // 优化朗读：优先显示昵称，并去除“点击展开菜单”冗余提示
const nickName = user.displayName || '未设置昵称';
                // 读取本地家庭名称
                const familyName = localStorage.getItem('family_name_cache') || '未设置家庭';
                const labelText = `当前账号：${nickName}，所属家庭：${familyName}，${user.email}`;
                document.getElementById('btn-account-menu').setAttribute('aria-label', labelText);
                document.getElementById('user-email-display').textContent = nickName;
                switchScreen('screen-home');
                setupDataListener(user.uid);
            } else {
                if(unsubscribeItems) unsubscribeItems();
                allItems = [];
                switchScreen('screen-login');
            }
        });

        // Login Handlers
        document.getElementById('login-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-login').click(); } });
        document.getElementById('btn-login').addEventListener('click', async () => {
            const e = document.getElementById('login-email').value; const p = document.getElementById('login-password').value;
            const autoLogin = document.getElementById('chk-auto-login').checked;
            const rememberEmail = document.getElementById('chk-remember-email').checked;
            if(rememberEmail) localStorage.setItem('savedEmail', e); else localStorage.removeItem('savedEmail');
            try {
                await setPersistence(auth, autoLogin ? browserLocalPersistence : browserSessionPersistence);
                await signInWithEmailAndPassword(auth, e, p);
            } catch(err) { announce("登录失败"); alert("登录失败：" + err.message); }
        });
        
        const btnAccount = document.getElementById('btn-account-menu');
        const menuAccount = document.getElementById('menu-account-dropdown');
// 菜单键盘导航：上下键切换，Tab键关闭
        menuAccount.addEventListener('keydown', (e) => {
            const buttons = Array.from(menuAccount.querySelectorAll('button'));
            const idx = buttons.indexOf(document.activeElement);

            if (e.key === 'Tab') {
                // 按下 Tab 时，允许默认行为（焦点移出），但在下一帧关闭菜单
                setTimeout(() => {
                    menuAccount.classList.add('hidden');
                    document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false');
                }, 0);
                return;
            }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); // 阻止页面滚动
                let nextIdx = 0;
                if (e.key === 'ArrowDown') nextIdx = (idx + 1) % buttons.length;
                if (e.key === 'ArrowUp') nextIdx = (idx - 1 + buttons.length) % buttons.length;
                buttons[nextIdx].focus();
            }
        });
        btnAccount.addEventListener('click', (e) => {
            e.stopPropagation(); playSound('click');
            menuAccount.classList.toggle('hidden');
            if(!menuAccount.classList.contains('hidden')) {
                document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'true');
                menuAccount.querySelector('button').focus();
            } else { document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false'); }
        });
        document.addEventListener('click', (e) => {
            if (!btnAccount.contains(e.target) && !menuAccount.contains(e.target)) {
                menuAccount.classList.add('hidden');
                document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false');
            }
        });
        document.getElementById('btn-logout').addEventListener('click', () => signOut(auth).then(() => announce("已退出")));
        document.getElementById('btn-clear-data').addEventListener('click', () => {
            menuAccount.classList.add('hidden');
            openGenericConfirm("确定清空数据？", async () => {
                const batch = writeBatch(db);
                const q = query(itemsRef, where("uid", "==", auth.currentUser.uid));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit(); announce("已清空");
            });
        });
        document.getElementById('btn-delete-account').addEventListener('click', () => {
            menuAccount.classList.add('hidden');
            openGenericConfirm("确定删除账号？", async () => {
                const batch = writeBatch(db);
                const q = query(itemsRef, where("uid", "==", auth.currentUser.uid));
                const snapshot = await getDocs(q);
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit(); await deleteUser(auth.currentUser);
            });
        });
        
        document.getElementById('btn-to-register').addEventListener('click', () => switchScreen('screen-register'));
        document.getElementById('btn-back-login').addEventListener('click', () => switchScreen('screen-login'));
        document.getElementById('btn-submit-reg').addEventListener('click', () => {
            const e = document.getElementById('reg-email').value; const p1 = document.getElementById('reg-pass').value; const p2 = document.getElementById('reg-pass-confirm').value;
            if (p1 !== p2 || p1.length < 6) { alert("密码问题"); return; }
            createUserWithEmailAndPassword(auth, e, p1).catch(err => alert(err.message));
        });
        document.getElementById('btn-forgot-pass').addEventListener('click', () => {
            document.getElementById('modal-forgot').classList.remove('hidden'); setTimeout(() => document.getElementById('title-forgot').focus(), 100);
        });
        document.getElementById('btn-cancel-forgot').addEventListener('click', () => document.getElementById('modal-forgot').classList.add('hidden'));
        document.getElementById('btn-send-reset').addEventListener('click', () => {
            const e = document.getElementById('forgot-email').value; if(!e) return;
            sendPasswordResetEmail(auth, e).then(() => { alert("已发送"); document.getElementById('modal-forgot').classList.add('hidden'); }).catch(err => alert(err.message));
        });

        // --- Data Logic ---
        function setupDataListener(uid) {
            if(unsubscribeItems) unsubscribeItems();
            const q = query(itemsRef, where("uid", "==", uid));
            unsubscribeItems = onSnapshot(q, snap => {
                let isFirstLoad = allItems.length === 0;
                snap.docChanges().forEach(change => {
                    const data = { id: change.doc.id, ...change.doc.data() };
                    if (!data.category) data.category = '其他杂项';
                    if (!data.tags) data.tags = [];

                    if (change.type === "added") {
                        if (isFirstLoad) allItems.push(data); else allItems.unshift(data); 
                    }
                    if (change.type === "modified") {
                        const idx = allItems.findIndex(i => i.id === data.id);
                        if (idx > -1) allItems[idx] = data;
                    }
                    if (change.type === "removed") {
                        allItems = allItems.filter(i => i.id !== data.id);
                    }
                });
                
                allItems.sort((a, b) => {
                    const timeA = a.updatedAt ? a.updatedAt.toMillis() : Date.now() + 10000;
                    const timeB = b.updatedAt ? b.updatedAt.toMillis() : Date.now() + 10000;
                    return timeB - timeA;
                });
                
                if (currentScreen === 'home') refreshHomeList();
                if (currentScreen === 'takeout') refreshTakeoutList();
                if (currentScreen === 'results') refreshResultsList();
            });
        }

        // --- List Renderers ---
        function refreshHomeList() { 
            const catSelect = document.getElementById('home-filter-cat');
            if (catSelect.value !== homeFilterCategory) { catSelect.value = homeFilterCategory; }
            renderList('home-list', homeFilterRoom, homeFilterCategory, allItems); 
        }

        function refreshTakeoutList() { 
            const catSelect = document.getElementById('takeout-filter-cat');
            if (catSelect.value !== takeoutFilterCategory) { catSelect.value = takeoutFilterCategory; }
            renderList('takeout-list', takeoutFilterRoom, takeoutFilterCategory, allItems); 
        }
        
        function refreshResultsList() {
            const term = document.getElementById('title-results').dataset.term || '';
            searchResults = allItems.filter(item => {
                const searchStr = `${item.name} ${item.location||''} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
                return searchStr.includes(term);
            });
            renderList('results-list', 'all', 'all', searchResults);
            updateStats(searchResults);
        }

        function renderList(containerId, filterRoom, filterCat, sourceArray) {
            const container = document.getElementById(containerId);
            const filtered = sourceArray.filter(item => {
                const roomMatch = filterRoom === 'all' || item.room === filterRoom;
                const catMatch = filterCat === 'all' || item.category === filterCat;
                return roomMatch && catMatch;
            });

            if (filtered.length === 0) {
                container.innerHTML = `<div class="p-4 text-center text-gray-500 font-bold empty-msg">没有找到物品</div>`; 
                return;
            }

            const emptyMsg = container.querySelector('.empty-msg') || container.querySelector('.text-center.text-gray-500');
            if (emptyMsg) emptyMsg.remove();

            const existingMap = new Map();
            container.querySelectorAll('.item-card').forEach(el => existingMap.set(el.dataset.id, el));
            existingMap.forEach((el, id) => { if (!filtered.find(i => i.id === id)) el.remove(); });

            filtered.forEach(item => {
                let card = existingMap.get(item.id);
let tagsHtml = '';
            if (item.tags && item.tags.length > 0) {
                tagsHtml = `<div class="mt-2 flex flex-wrap gap-1">` + 
                    item.tags.map(t => `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-sm font-bold rounded-full border border-blue-200">${t}</span>`).join('') +
                    `</div>`;
            }
            const tagsText = item.tags && item.tags.length > 0 ? `，标签：${item.tags.join('、')}` : '';

            // 新增：构建子数量显示文本
            let subText = '';
            if (item.subQuantity && parseFloat(item.subQuantity) !== 0) {
                subText = ` ${parseFloat(item.subQuantity)} <span class="text-sm text-gray-500">${item.subUnit || ''}</span>`;
            }

            const labelText = `${item.name}，分类：${item.category}，位于${item.room} ${item.location||''}，数量${item.quantity}${item.unit||'个'} ${item.subQuantity ? item.subQuantity + (item.subUnit||'') : ''}${tagsText}`;
                const htmlContent = `
                    <div class="flex flex-col gap-1 pointer-events-none">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="text-xl font-bold text-gray-900 item-name flex items-center gap-2">
                                    ${item.name}
                                    <span class="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-300">${item.category}</span>
                                </h3>
<p class="text-base text-gray-600 font-bold item-loc mt-1">${item.room} - ${item.location || '位置未填'}</p>
                            </div>
                            <div class="flex flex-col items-end">
                                <div class="text-3xl font-bold text-blue-700 item-qty whitespace-nowrap">${item.quantity} <span class="text-lg text-gray-500">${item.unit||'个'}</span></div>
                                <div class="text-xl font-bold text-blue-600 item-sub-qty whitespace-nowrap">${subText}</div>
                            </div>
                        </div>
                        ${tagsHtml}
                    </div>
                `;
                
                if (card) {
                    if (card.getAttribute('aria-label') !== labelText) {
                        card.innerHTML = htmlContent; card.setAttribute('aria-label', labelText);
                    }
                } else {
                    card = document.createElement('div');
                    card.className = "item-card bg-white p-4 rounded-lg shadow border-l-8 border-blue-500 cursor-pointer relative mb-3 transition-transform";
                    card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0'); card.dataset.id = item.id; card.setAttribute('aria-label', labelText); card.innerHTML = htmlContent;
                    const triggerMenu = () => openActionMenu(item);
                    card.addEventListener('click', triggerMenu);
                    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerMenu(); } });
                    container.appendChild(card);
                }
            });
            
            if (focusTargetId) {
                const target = container.querySelector(`[data-id="${focusTargetId}"]`);
                if (target) { target.focus(); focusTargetId = null; }
            }
        }

        function updateStats(items) {
            const statsContainer = document.getElementById('results-stats');
            if (items.length > 0) {
                const totals = {};
                items.forEach(item => { const u = item.unit || '个'; totals[u] = (totals[u] || 0) + item.quantity; });
                const summaryText = Object.entries(totals).map(([u, q]) => `${q} ${u}`).join('、');
                statsContainer.textContent = `共找到 ${items.length} 处。合计：${summaryText}`;
            } else {
                statsContainer.textContent = "未找到相关物品";
            }
        }

        // --- Filters ---
        document.getElementById('home-filter').addEventListener('change', (e) => { homeFilterRoom = e.target.value; refreshHomeList(); });
        document.getElementById('home-filter-cat').addEventListener('change', (e) => { homeFilterCategory = e.target.value; refreshHomeList(); });
        document.getElementById('takeout-filter').addEventListener('change', (e) => { takeoutFilterRoom = e.target.value; refreshTakeoutList(); });
        document.getElementById('takeout-filter-cat').addEventListener('change', (e) => { takeoutFilterCategory = e.target.value; refreshTakeoutList(); });

        // --- Search Logic ---
        const setupSearch = (inputId, btnId, clearBtnId, context) => {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(btnId);
            const clearBtn = document.getElementById(clearBtnId);
            const toggleClear = () => { if (input.value.length > 0) clearBtn.classList.remove('hidden'); else clearBtn.classList.add('hidden'); };
            input.addEventListener('input', toggleClear);
            clearBtn.addEventListener('click', () => { input.value = ''; toggleClear(); input.focus(); });
            const perform = () => {
                const term = input.value.trim().toLowerCase();
                if (!term) return;
                playSound('click');
                const title = document.getElementById('title-results');
                title.textContent = `搜索：${term}`;
                title.dataset.term = term;
                document.getElementById('btn-back-results').dataset.return = context;
                switchScreen('screen-results');
                refreshResultsList();
                announce(`搜索完成`);
            };
            btn.addEventListener('click', perform);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') perform(); });
        };
        setupSearch('home-search', 'btn-do-search', 'btn-clear-home-search', 'home');
        setupSearch('takeout-search', 'btn-do-search-takeout', 'btn-clear-takeout-search', 'takeout');
        document.getElementById('btn-back-results').addEventListener('click', (e) => {
            const ctx = e.target.dataset.return || 'home';
            document.getElementById('home-search').value = ''; document.getElementById('takeout-search').value = '';
            document.getElementById('btn-clear-home-search').classList.add('hidden'); document.getElementById('btn-clear-takeout-search').classList.add('hidden');
            switchScreen(ctx === 'takeout' ? 'screen-takeout' : 'screen-home');
        });

        // --- Tag Management Logic ---
        function addTag(tagText, containerId, inputId) {
            const cleanTag = tagText.trim();
            if(!cleanTag) return;
            if(pendingTags.includes(cleanTag)) {
                announce(`标签 ${cleanTag} 已存在`);
                return;
            }
            pendingTags.push(cleanTag);
            renderTags(containerId, inputId);
            document.getElementById(inputId).value = '';
            announce(`已添加标签 ${cleanTag}`);
        }

        function removeTag(tagText, containerId, inputId) {
            pendingTags = pendingTags.filter(t => t !== tagText);
            renderTags(containerId, inputId);
            announce(`已删除标签 ${tagText}`);
            document.getElementById(inputId).focus(); 
        }

        function renderTags(containerId, inputId) {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            pendingTags.forEach(tag => {
                const bubble = document.createElement('span');
                bubble.className = 'tag-bubble';
                bubble.innerHTML = `${tag} <span class="tag-remove" role="button" tabindex="0" aria-label="删除标签 ${tag}">×</span>`;
                const delBtn = bubble.querySelector('.tag-remove');
const delHandler = (e) => { 
                    e.preventDefault(); // 阻止表单提交
                    e.stopPropagation();
                    if(e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
                    removeTag(tag, containerId, inputId); 
                };
                delBtn.addEventListener('click', delHandler);
                delBtn.addEventListener('keydown', delHandler);
                container.appendChild(bubble);
            });
        }

        function setupTagInput(inputId, btnId, containerId) {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(btnId);
            const handler = () => addTag(input.value, containerId, inputId);
            btn.addEventListener('click', handler);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handler(); }
            });
        }
        setupTagInput('add-tags-input', 'btn-add-tag-trigger', 'add-tags-container');
        setupTagInput('edit-tags-input', 'btn-edit-tag-trigger', 'edit-tags-container');

        // --- Auto Inference ---
        function attemptInference(name) {
            if(!name) return;
            let predictedCat = null;
            let predictedTags = [];
            let predictedUnit = null;
            const historyMatch = allItems.find(i => i.name === name);
            if (historyMatch) {
                predictedCat = historyMatch.category;
                predictedTags = [...(historyMatch.tags || [])];
                predictedUnit = historyMatch.unit;
            } else {
                for (const [cat, keywords] of Object.entries(INFERENCE_RULES)) {
                    if (keywords.some(k => name.includes(k))) { predictedCat = cat; break; }
                }
                for (const [key, tags] of Object.entries(TAG_SUGGESTIONS)) {
                    if (name.includes(key)) { tags.forEach(t => { if(!predictedTags.includes(t)) predictedTags.push(t); }); }
                }
            }
            if (predictedCat) {
                document.getElementById('add-category').value = predictedCat;
                announce(`已自动选择分类：${predictedCat}`);
            }
            if (predictedTags.length > 0) {
                pendingTags = [...new Set([...pendingTags, ...predictedTags])];
                renderTags('add-tags-container', 'add-tags-input');
                announce(`已自动填入 ${predictedTags.length} 个标签`);
            }
            if (predictedUnit && !document.getElementById('add-unit').value) {
                document.getElementById('add-unit').value = predictedUnit;
            }
        }
        document.getElementById('add-name').addEventListener('blur', (e) => attemptInference(e.target.value.trim()));

        // --- Navigation Handlers ---
        document.getElementById('btn-nav-takeout').addEventListener('click', () => switchScreen('screen-takeout'));
        document.getElementById('btn-back-takeout').addEventListener('click', () => switchScreen('screen-home'));
        
        function updateAddQtyDisplay() {
            const btn = document.getElementById('btn-add-qty-trigger');
            btn.textContent = `当前选择：${pendingAddQty} (点击修改)`;
            btn.setAttribute('aria-label', `当前数量 ${pendingAddQty}，点击修改`);
        }

document.getElementById('btn-nav-add').addEventListener('click', () => { 
            switchScreen('screen-add'); 
            document.getElementById('add-name').focus(); 
            document.getElementById('add-quantity').value = 1;
            pendingTags = []; 
            renderTags('add-tags-container', 'add-tags-input');
        });
        document.getElementById('btn-back-add').addEventListener('click', () => switchScreen('screen-home'));
        document.getElementById('btn-nav-data').addEventListener('click', () => switchScreen('screen-data'));
        document.getElementById('btn-back-data').addEventListener('click', () => switchScreen('screen-home'));

        // 单位选择逻辑
        function openUnitPicker(targetId) {
            const grid = document.getElementById('unit-grid');
            grid.innerHTML = '';
            UNIT_LIST.forEach(u => {
                const btn = document.createElement('button');
                btn.className = "grid-btn";
                btn.textContent = u;
                btn.onclick = () => {
                    document.getElementById(targetId).value = u;
                    closeUnitModal();
                };
                grid.appendChild(btn);
            });
            document.getElementById('modal-unit').classList.remove('hidden');
            announce("请选择单位");
        }
        function closeUnitModal() { document.getElementById('modal-unit').classList.add('hidden'); }
        document.getElementById('btn-pick-unit-add').onclick = () => openUnitPicker('add-unit');
document.getElementById('btn-pick-sub-unit-add').onclick = () => openUnitPicker('add-sub-unit');
        document.getElementById('btn-pick-unit-edit').onclick = () => openUnitPicker('edit-unit');

        // 新增物品提交逻辑 (修复版)
        document.getElementById('form-add').addEventListener('submit', async (e) => {
            e.preventDefault();
const name = document.getElementById('add-name').value.trim();
            if(!name) return;
            
            const mainQ = parseFloat(document.getElementById('add-quantity').value) || 0;
            const subQ = parseFloat(document.getElementById('add-sub-quantity').value) || 0;
            const subU = document.getElementById('add-sub-unit').value.trim();

            try {
                await addDoc(itemsRef, {
                    name: name,
                    category: document.getElementById('add-category').value,
                    tags: pendingTags,
                    unit: document.getElementById('add-unit').value,
room: document.getElementById('add-room').value,
                    location: document.getElementById('add-location').value,
                    quantity: mainQ,
                    subQuantity: subQ,
uid: auth.currentUser.uid, 
                    updatedAt: serverTimestamp() 
                });
                announce(`已添加 ${name}`);
                
                // 重置表单
                document.getElementById('form-add').reset();
                pendingTags = []; 
                renderTags('add-tags-container', 'add-tags-input');
                document.getElementById('add-quantity').value = 1;
                document.getElementById('add-name').focus();
            } catch(err) {
                announce("添加失败");
                console.error(err);
            }
        });

        // --- Helper: Modals ---
        function closeModals() {
            document.querySelectorAll('[id^="modal-"]').forEach(el => el.classList.add('hidden'));
            document.getElementById('menu-account-dropdown').classList.add('hidden');
            document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false');
        }
        window.closeModals = closeModals; // Expose globally
        window.closeUnitModal = closeUnitModal; 

        function openGenericConfirm(msg, onConfirm) {
            document.getElementById('confirm-text').textContent = msg;
            document.getElementById('modal-confirm').classList.remove('hidden');
            const btnOk = document.getElementById('btn-confirm-ok');
            // 移除旧监听器，防止重复触发
            const newBtn = btnOk.cloneNode(true);
            btnOk.parentNode.replaceChild(newBtn, btnOk);
            newBtn.addEventListener('click', onConfirm);
            newBtn.focus();
        }
        window.openGenericConfirm = openGenericConfirm;

        // --- Action Menu Logic ---
        function openActionMenu(item) {
            currentActionItem = item;
            document.getElementById('action-desc').textContent = `${item.name} (当前: ${item.quantity}${item.unit||'个'})`;
            document.getElementById('modal-action').classList.remove('hidden');
            document.getElementById('btn-act-put').focus();
        }
        // 公开给 renderList 调用
window.openActionMenu = openActionMenu;

        function handleActionClick(isPut) {
            const item = currentActionItem;
            const factor = isPut ? 1 : -1;
            const actionName = isPut ? "放入" : "取出";

            if (!item.subUnit) {
                openQtyPicker(`${actionName}数量 (${item.unit||'个'})`, (m) => handleUpdate(m * factor, 0));
                return;
            }

            const m = document.getElementById('modal-confirm');
            document.getElementById('title-confirm').textContent = `请选择${actionName}单位`;
            document.getElementById('confirm-text').textContent = `该物品包含主单位（${item.unit}）和子单位（${item.subUnit}），请选择要${actionName}哪种？`;
            
            const btnMain = document.getElementById('btn-confirm-ok');
            const btnSub = document.getElementById('btn-confirm-cancel');
            
            // 临时修改按钮文本
            btnMain.textContent = `按 ${item.unit} ${actionName}`;
            btnSub.textContent = `按 ${item.subUnit} ${actionName}`;
            
            // 备份并修改样式
            const originalSubClass = btnSub.className;
            btnSub.className = "flex-1 p-4 bg-blue-600 text-white rounded-xl font-bold text-lg shadow";

            const cleanup = () => {
                m.classList.add('hidden');
                btnMain.textContent = "确认执行";
                btnSub.textContent = "取消";
                btnSub.className = originalSubClass;
            };

            const newBtnMain = btnMain.cloneNode(true);
            const newBtnSub = btnSub.cloneNode(true);
            btnMain.parentNode.replaceChild(newBtnMain, btnMain);
            btnSub.parentNode.replaceChild(newBtnSub, btnSub);

            newBtnMain.onclick = () => {
                cleanup();
                openQtyPicker(`${actionName}${item.unit}`, (val) => handleUpdate(val * factor, 0));
            };

            newBtnSub.onclick = () => {
                cleanup();
                openQtyPicker(`${actionName}${item.subUnit}`, (val) => handleUpdate(0, val * factor));
            };

            m.classList.remove('hidden');
            newBtnMain.focus();
        }

        document.getElementById('btn-act-put').onclick = () => handleActionClick(true);
        document.getElementById('btn-act-take').onclick = () => handleActionClick(false);
        document.getElementById('btn-act-edit').onclick = () => {
            closeModals();
            switchScreen('screen-edit');
            
            // 回显数据 (Step 6)
            const item = currentActionItem;
            document.getElementById('edit-name').value = item.name;
            const catSelect = document.getElementById('edit-category');
            catSelect.value = item.category || '其他杂项';
            
            document.getElementById('edit-room').value = item.room;
            document.getElementById('edit-location').value = item.location;
            document.getElementById('edit-unit').value = item.unit || '个';
            
            // 回显主数量和子数量
            document.getElementById('edit-quantity').value = item.quantity;
            document.getElementById('edit-sub-quantity').value = item.subQuantity || '';
            document.getElementById('edit-sub-unit').value = item.subUnit || '';

            pendingTags = [...(item.tags || [])];
            renderTags('edit-tags-container', 'edit-tags-input');
        };

        document.getElementById('btn-act-del').onclick = () => {
            openGenericConfirm(`确定删除 ${currentActionItem.name} 吗？`, async () => {
                await deleteDoc(doc(db, "items", currentActionItem.id));
                announce("已删除"); closeModals();
            });
        };

        // --- Edit Form Submit (Step 7) ---
        document.getElementById('form-edit').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newQty = parseFloat(document.getElementById('edit-quantity').value);
            const newSubQty = parseFloat(document.getElementById('edit-sub-quantity').value) || 0;
            const newSubUnit = document.getElementById('edit-sub-unit').value.trim();

            try {
                await updateDoc(doc(db, "items", currentActionItem.id), {
                    name: document.getElementById('edit-name').value.trim(),
                    category: document.getElementById('edit-category').value,
                    tags: pendingTags,
                    unit: document.getElementById('edit-unit').value,
                    room: document.getElementById('edit-room').value,
                    location: document.getElementById('edit-location').value,
                    quantity: newQty,
                    subQuantity: newSubQty,
                    subUnit: newSubUnit,
                    updatedAt: serverTimestamp()
                });
                announce("修改成功"); 
                switchScreen(previousScreen);
            } catch(err) { announce("修改失败"); console.error(err); }
        });
        document.getElementById('btn-cancel-edit-form').addEventListener('click', () => switchScreen(previousScreen));

        // --- Quantity Picker Logic (Step 8) ---
        let qtyCallback = null;
        function openQtyPicker(title, cb) {
            playSound('click'); qtyCallback = cb;
            document.getElementById('qty-title').textContent = title;
            document.getElementById('modal-action').classList.add('hidden'); document.getElementById('modal-qty').classList.remove('hidden');
            
            // 显示当前单位
            const unitLabel = currentActionItem ? (currentActionItem.unit || '个') : '个';
            const subUnitLabel = currentActionItem ? (currentActionItem.subUnit || '') : '';
            document.getElementById('qty-display-unit').textContent = unitLabel;
            document.getElementById('qty-display-sub-unit').textContent = subUnitLabel;

            const inputMain = document.getElementById('qty-custom-input'); 
            const inputSub = document.getElementById('qty-sub-input');
            const confirm = document.getElementById('btn-qty-confirm'); 
            const trigger = document.getElementById('qty-custom-trigger');
            const group = document.getElementById('qty-input-group');

            // 重置状态
            inputMain.value = ''; inputSub.value = ''; 
            inputMain.disabled = true; inputSub.disabled = true; 
            confirm.disabled = true; 
            
            group.classList.add('opacity-50', 'pointer-events-none');
            group.setAttribute('aria-hidden', 'true');
            
            trigger.classList.remove('hidden');
            trigger.setAttribute('tabindex', '0');

            // 渲染快捷按钮 (仅针对主数量)
            const grid = document.getElementById('qty-grid');
            grid.innerHTML = '';
            [1, 2, 3, 4, 5].forEach(n => {
                const btn = document.createElement('button');
                btn.className = "grid-btn";
                btn.textContent = n;
                btn.onclick = () => submitQty(n, 0); // 快捷键只改变主数量
                grid.appendChild(btn);
            });
            
            // 聚焦
            setTimeout(() => { 
                if(grid.firstChild) grid.firstChild.focus(); 
                announce("请选择数量"); 
            }, 100);
        }
        window.openQtyPicker = openQtyPicker; // Expose global
        window.closeQtyModal = () => document.getElementById('modal-qty').classList.add('hidden');

        // 自定义输入激活
        const customTrigger = document.getElementById('qty-custom-trigger');
        function activateInput() {
            const inputMain = document.getElementById('qty-custom-input'); 
            const inputSub = document.getElementById('qty-sub-input');
            const confirm = document.getElementById('btn-qty-confirm'); 
            const trigger = document.getElementById('qty-custom-trigger');
            const group = document.getElementById('qty-input-group');

            trigger.setAttribute('tabindex', '-1'); 
            trigger.classList.add('hidden'); // 隐藏触发器

            group.classList.remove('opacity-50', 'pointer-events-none');
            group.setAttribute('aria-hidden', 'false');

            inputMain.disabled = false; 
            inputSub.disabled = false; 
            confirm.disabled = false; 
            
            inputMain.focus(); 
            announce("请输入数量");
        }
        customTrigger.addEventListener('click', activateInput);
        customTrigger.addEventListener('keydown', (e) => { if(e.key === 'Enter') activateInput(); });

        document.getElementById('qty-custom-input').addEventListener('keydown', (e) => { 
            if(e.key === 'Enter' || e.keyCode === 13) { 
                e.preventDefault(); e.stopPropagation(); 
                document.getElementById('qty-sub-input').focus(); 
            } 
        });
        document.getElementById('qty-sub-input').addEventListener('keydown', (e) => { 
            if(e.key === 'Enter' || e.keyCode === 13) { 
                e.preventDefault(); e.stopPropagation(); 
                document.getElementById('btn-qty-confirm').click();
            } 
        });

        document.getElementById('btn-qty-confirm').addEventListener('click', () => { 
            const mainVal = parseFloat(document.getElementById('qty-custom-input').value) || 0;
            const subVal = parseFloat(document.getElementById('qty-sub-input').value) || 0;
            submitQty(mainVal, subVal); 
        });
        
        function submitQty(mainVal, subVal = 0) { 
            if (mainVal <= 0 && subVal <= 0) { announce("数量无效"); return; } 
            if (qtyCallback) qtyCallback(mainVal, subVal); 
            document.getElementById('modal-qty').classList.add('hidden');
            
            if (currentScreen === 'add') {
                document.getElementById('btn-add-qty-trigger').focus();
            } else {
                closeModals();
            }
        }

        // --- Update Logic (Step 9) ---
        async function handleUpdate(changeMain, changeSub = 0) {
            if (!currentActionItem) return;
            const newQty = currentActionItem.quantity + changeMain;
            // 只有当主数量变为0且确实有主数量变动时，才触发“归零确认”
            if (newQty === 0 && changeMain !== 0) { openZeroConfirm(); return; }
            if (newQty < 0) { announce("库存不足"); return; }
            await execUpdate(changeMain, changeSub);
        }

        async function execUpdate(changeMain, changeSub = 0) {
            focusTargetId = currentActionItem.id;
            try {
                await updateDoc(doc(db, "items", currentActionItem.id), { 
                    quantity: increment(changeMain), 
                    subQuantity: increment(changeSub),
                    updatedAt: serverTimestamp() 
                });
                announce("更新成功"); closeModals();
            } catch(e) { announce("失败"); }
        }

        function openZeroConfirm() {
            const m = document.getElementById('modal-zero');
            m.classList.remove('hidden');
            document.getElementById('btn-zero-keep').onclick = async () => { 
                m.classList.add('hidden'); 
                // 保留模式：只清空主数量（设为0），子数量不动？
                // 为了简化，我们只更新主数量使其归零。
                // 此时 currentActionItem.quantity + changeMain = 0.
                // 所以 changeMain = -currentActionItem.quantity
                await execUpdate(-currentActionItem.quantity, 0); 
            };
            document.getElementById('btn-zero-del').onclick = async () => { m.classList.add('hidden'); await deleteDoc(doc(db, "items", currentActionItem.id)); announce("已删除"); };
            document.getElementById('btn-zero-cancel').onclick = () => { m.classList.add('hidden'); };
            setTimeout(() => document.getElementById('btn-zero-keep').focus(), 100);
        }

// --- Settings & Tabs Logic ---
        document.getElementById('btn-settings').addEventListener('click', () => {
            document.getElementById('menu-account-dropdown').classList.add('hidden');
            document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false');
            switchScreen('screen-settings');
// 默认加载个人资料
            // 回显昵称和家庭名称
document.getElementById('set-nickname').value = auth.currentUser.displayName || '';
            document.getElementById('set-family-name').value = localStorage.getItem('family_name_cache') || '';
        });

        document.getElementById('btn-back-settings').addEventListener('click', () => switchScreen('screen-home'));

        // Tab 切换核心逻辑 (支持箭头键)
        const tabs = [document.getElementById('tab-profile'), document.getElementById('tab-rooms')];
        const panels = [document.getElementById('panel-profile'), document.getElementById('panel-rooms')];

        function activateTab(index) {
            tabs.forEach((tab, i) => {
                const isSelected = (i === index);
                tab.setAttribute('aria-selected', isSelected);
                tab.setAttribute('tabindex', isSelected ? '0' : '-1');
                // 样式切换
                if(isSelected) {
                    tab.classList.add('border-blue-600', 'text-blue-800', 'bg-blue-50');
                    tab.classList.remove('border-transparent', 'text-gray-600');
                } else {
                    tab.classList.remove('border-blue-600', 'text-blue-800', 'bg-blue-50');
                    tab.classList.add('border-transparent', 'text-gray-600');
                }
                
                if(isSelected) {
                    panels[i].classList.remove('hidden');
                } else {
                    panels[i].classList.add('hidden');
                }
            });
            tabs[index].focus();
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => activateTab(index));
            tab.addEventListener('keydown', (e) => {
                let newIndex = index;
                if (e.key === 'ArrowRight') {
                    newIndex = (index + 1) % tabs.length;
                    e.preventDefault();
                    activateTab(newIndex);
                } else if (e.key === 'ArrowLeft') {
                    newIndex = (index - 1 + tabs.length) % tabs.length;
                    e.preventDefault();
                    activateTab(newIndex);
                }
            });
        });

// 个人资料保存
        document.getElementById('form-profile').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nick = document.getElementById('set-nickname').value.trim();
const familyName = document.getElementById('set-family-name').value.trim();
            localStorage.setItem('family_name_cache', familyName);
try {
                await updateProfile(auth.currentUser, { displayName: nick });
            } catch (err) {
                announce("保存失败，请重试");
                console.error(err);
                return;
            }

            // 更新本地界面显示
            const currentUser = auth.currentUser;
if (currentUser) {
                const labelText = `当前账号：${nick}，所属家庭：${familyName}，${currentUser.email}`;
                document.getElementById('btn-account-menu').setAttribute('aria-label', labelText);
                document.getElementById('user-email-display').textContent = nick;
            }

            announce(`设置已保存，昵称更新为 ${nick}`);
            switchScreen('screen-home');
        });

        // 取消按钮逻辑
        document.getElementById('btn-cancel-profile').addEventListener('click', () => {
            announce("已取消");
            switchScreen('screen-home');
        });

        document.getElementById('btn-cancel-pwd').addEventListener('click', () => {
            announce("已取消");
            switchScreen('screen-settings');
        });

        // 修改密码跳转
        document.getElementById('btn-to-change-pwd').addEventListener('click', () => switchScreen('screen-change-pwd'));
        document.getElementById('btn-back-pwd').addEventListener('click', () => switchScreen('screen-settings'));
        
        // 修改密码逻辑 (需要 Firebase EmailAuthCredential re-auth，这里先做基础结构)
        document.getElementById('form-change-pwd').addEventListener('submit', (e) => {
            e.preventDefault();
            const p1 = document.getElementById('pwd-new').value;
            const p2 = document.getElementById('pwd-confirm').value;
            if(p1 !== p2) { announce("两次密码不一致"); return; }
            if(p1.length < 6) { announce("密码太短"); return; }
            // 真实修改密码需要 updatePassword(user, newPassword)
            // 但通常需要先重新认证。这里先留接口。
            alert("为了安全，修改密码功能将在下个版本完善重新认证逻辑。");
        });

// Global Keydown (ESC Logic Optimized)
        window.addEventListener('keydown', (e) => {
            if(e.key === 'Escape') {
                // 1. 优先处理弹窗 (单位选择、数量选择、操作菜单等)
                // 必须阻止默认行为，防止浏览器停止页面加载等
                
                // 单位选择框 (特殊处理，需要归还焦点)
                if (!document.getElementById('modal-unit').classList.contains('hidden')) {
                    e.preventDefault(); closeUnitModal(); return;
                }
                
                // 数量选择框
                if (!document.getElementById('modal-qty').classList.contains('hidden')) {
                    e.preventDefault(); closeQtyModal(); return;
                }

                // 其他通用模态框 (Confirm, Action, Zero, Forgot)
                const visibleModals = document.querySelectorAll('[id^="modal-"]:not(.hidden)');
                if (visibleModals.length > 0) {
                    e.preventDefault(); closeModals(); return;
                }

                // 账户菜单
                const menu = document.getElementById('menu-account-dropdown');
                if (!menu.classList.contains('hidden')) {
                    e.preventDefault(); 
                    menu.classList.add('hidden'); 
                    document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false'); 
                    document.getElementById('btn-account-menu').focus(); 
                    return; 
                }

                // 2. 页面层级返回逻辑
                // 编辑页 -> 返回上一页
                if (currentScreen === 'edit') {
                    // 编辑页通常有专门的“取消”按钮处理逻辑，这里简单处理为返回
                    // 但为了防止数据丢失误触，建议不做操作，或者模拟点击“取消”
                    // 这里为了方便，我们模拟点击“返回”
                    e.preventDefault(); document.getElementById('btn-back-edit').click(); return;
                }

                // 二级设置页 (改密、加房间、删房间) -> 返回 设置页
                if (['screen-change-pwd', 'screen-room-add', 'screen-room-delete'].includes(currentScreen)) {
                    e.preventDefault(); switchScreen('screen-settings'); return;
                }

                // 一级功能页 (设置、新增、取出、数据、结果) -> 返回 首页
                if (['screen-settings', 'screen-add', 'screen-takeout', 'screen-data', 'screen-results'].includes(currentScreen)) {
                    e.preventDefault(); switchScreen('screen-home'); return;
                }

                // 搜索框清理
                if (currentScreen === 'home' || currentScreen === 'takeout') {
                    const searchInput = currentScreen === 'home' ? document.getElementById('home-search') : document.getElementById('takeout-search');
                    if (document.activeElement === searchInput && searchInput.value !== '') {
                        e.preventDefault(); searchInput.value = ''; announce("已清除搜索"); return;
                    }
                }
            }
        });
// --- Room Management (Accessible Fix) ---
        
// 渲染无障碍房间列表 (解决双重焦点问题)
        function renderAccessibleRoomList(containerId, rooms, type) {
            const container = document.getElementById(containerId);
            container.innerHTML = '';
            
            if (rooms.length === 0) {
                container.innerHTML = '<p class="text-gray-500 font-bold">暂无内容</p>';
                return;
            }

            // 帮助提示（只读一次，辅助屏幕阅读器用户了解操作方式）
            const hintId = `hint-${containerId}`;
            if (!document.getElementById(hintId)) {
                const hint = document.createElement('div');
                hint.id = hintId;
                hint.className = 'sr-only';
                hint.textContent = '使用上下光标键选择房间，空格键选中或取消。';
                container.parentElement.insertBefore(hint, container);
            }

            rooms.forEach((room, index) => {
                // Label 容器
                const label = document.createElement('label');
                label.className = "relative flex items-center justify-between p-4 border-2 border-gray-300 rounded-lg bg-white shadow-sm hover:bg-gray-50 mb-3 cursor-pointer transition-colors";
                
                // 视觉文本 (aria-hidden，避免重复朗读，只依赖 input 的 aria-label)
                const span = document.createElement('span');
                span.className = "text-xl font-bold text-gray-800";
                span.textContent = room;
                span.setAttribute('aria-hidden', 'true');
                
                // 原生 Input 覆盖层
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.value = room;
                input.className = "absolute inset-0 w-full h-full opacity-0 cursor-pointer";
                input.setAttribute('aria-label', room); // 读屏只读这一句，例如“阳台 复选框 未选中”

                // 交互核心：Roving Tabindex (游走焦点)
                // 只有列表的第一个元素(或当前聚焦元素)可被 Tab 聚焦，其余为 -1
                // 这样 Tab 键按一次就会进入列表，再按一次就会离开列表
                input.tabIndex = (index === 0) ? 0 : -1;

                // 选中状态的视觉反馈指示器 (aria-hidden)
                const indicator = document.createElement('span');
                indicator.className = "text-blue-600 font-bold opacity-0 transition-opacity";
                indicator.textContent = "已选";
                indicator.setAttribute('aria-hidden', 'true');

                // 视觉同步：因为 input 透明，我们手动给 label 加高亮圈，模拟焦点样式
                input.addEventListener('focus', () => {
                    label.classList.add('ring-4', 'ring-orange-500', 'ring-offset-2');
                });
                input.addEventListener('blur', () => {
                    label.classList.remove('ring-4', 'ring-orange-500', 'ring-offset-2');
                });

                // 状态联动
                input.addEventListener('change', () => {
                    if(input.checked) {
                        label.classList.add('border-green-500', 'bg-green-50');
                        label.classList.remove('border-gray-300', 'bg-white');
                        indicator.classList.remove('opacity-0');
                        announce(`已选中 ${room}`);
                    } else {
                        label.classList.remove('border-green-500', 'bg-green-50');
                        label.classList.add('border-gray-300', 'bg-white');
                        indicator.classList.add('opacity-0');
                        announce(`取消选中 ${room}`);
                    }
                });

                // 键盘导航 (上下键切换焦点)
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault(); // 阻止浏览器滚动
                        const allInputs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
                        const currentIndex = allInputs.indexOf(e.target);
                        let nextIndex;

                        if (e.key === 'ArrowDown') {
                            nextIndex = (currentIndex + 1) % allInputs.length;
                        } else {
                            nextIndex = (currentIndex - 1 + allInputs.length) % allInputs.length;
                        }

                        // 移动 tabindex：旧的设为 -1，新的设为 0 并聚焦
                        allInputs[currentIndex].tabIndex = -1;
                        allInputs[nextIndex].tabIndex = 0;
                        allInputs[nextIndex].focus();
                    }
                });

                label.appendChild(span);
                label.appendChild(indicator);
                label.appendChild(input);
                container.appendChild(label);
            });
        }

        // 房间推荐数据
        const ROOM_RECOMMENDATIONS = ["阳台", "储物间", "衣帽间", "车库", "地下室", "客房", "婴儿房", "阁楼", "办公室", "健身房"];

        // 进入新增房间页面
        document.getElementById('btn-to-add-room').addEventListener('click', () => {
            switchScreen('screen-room-add');
            // 排除已存在的房间
            const existingRooms = Array.from(new Set(allItems.map(i => i.room).filter(r => r)));
            const suggestions = ROOM_RECOMMENDATIONS.filter(r => !existingRooms.includes(r));
            renderAccessibleRoomList('list-room-recommend', suggestions, 'add');
            document.getElementById('input-custom-room').value = '';
        });

        document.getElementById('btn-back-room-add').addEventListener('click', () => switchScreen('screen-settings'));
        document.getElementById('btn-cancel-room-add').addEventListener('click', () => switchScreen('screen-settings'));

        // 保存新增房间 (批量)
        document.getElementById('btn-save-room-add').addEventListener('click', async () => {
            const container = document.getElementById('list-room-recommend');
            const selected = Array.from(container.querySelectorAll('input:checked')).map(i => i.value);
            const custom = document.getElementById('input-custom-room').value.trim();
            
            if (custom) selected.push(custom);

            if (selected.length === 0) { announce("未选择任何房间"); return; }

            // 注意：因为房间是物品的一个属性，我们不需要专门创建“房间”集合。
            // 这里我们只需要提示用户成功即可，因为“房间”在物品管理系统中是作为 Filter 存在的。
            // 或者，如果你有专门的房间配置存储，请在这里执行写入。
            // 目前的逻辑是：只要物品使用了该房间，它就存在。
            // 为了让用户感觉“添加成功”，我们可以创建一个占位物品，或者只是提示。
            // 既然是“物品管家”，通常不需要空房间。但为了用户体验，我们可以提示。
            
            // 如果你想把新房间存入本地存储供下拉菜单使用：
            // (此处简化处理，假设房间列表是动态从物品生成的。如果需要持久化空房间，需要数据库支持)
            // 暂时逻辑：提示添加成功，并跳回。实际使用中，用户在添加物品时输入该房间名即可。
            
            announce(`已添加 ${selected.join('、')}`);
            switchScreen('screen-settings');
        });

        // 进入删除房间页面
        document.getElementById('btn-to-delete-room').addEventListener('click', () => {
            switchScreen('screen-room-delete');
            const existingRooms = Array.from(new Set(allItems.map(i => i.room).filter(r => r)));
            renderAccessibleRoomList('list-room-existing', existingRooms, 'delete');
        });

        document.getElementById('btn-back-room-del').addEventListener('click', () => switchScreen('screen-settings'));
        document.getElementById('btn-cancel-room-del').addEventListener('click', () => switchScreen('screen-settings'));

        // 确认删除房间
        document.getElementById('btn-confirm-del-room').addEventListener('click', () => {
            const container = document.getElementById('list-room-existing');
            const selected = Array.from(container.querySelectorAll('input:checked')).map(i => i.value);
            
            if (selected.length === 0) { announce("未选择房间"); return; }

            openGenericConfirm(`确定删除 ${selected.length} 个房间吗？这些房间内的物品将被标记为“未知位置”。`, async () => {
                // 批量更新数据库
                const batch = writeBatch(db);
                let updateCount = 0;
                
                // 找到所有在这些房间里的物品
                // Firestore 不支持 huge array 'in' query (max 10), so we loop logic or separate queries.
                // 简单起见，我们在内存中筛选 allItems (因为已经订阅了)
                const itemsToUpdate = allItems.filter(item => selected.includes(item.room));
                
                itemsToUpdate.forEach(item => {
                    const ref = doc(db, "items", item.id);
                    batch.update(ref, { room: "位置未知" });
                    updateCount++;
                });

                if (updateCount > 0) {
                    await batch.commit();
                    announce(`已删除房间，${updateCount} 个物品位置被重置`);
                } else {
                    announce("房间已删除（无关联物品）");
                }
                switchScreen('screen-settings');
            });
        });