        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, deleteUser, updatePassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const profilesRef = collection(db, "profiles");
const familiesRef = collection(db, "families");

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

// --- Settings State ---
        let userProfile = { nickname: '', identity: '其他' };
        let userFamilies = []; 
        let currentFamilyId = null;
let isEditingFamily = false;
        const SYSTEM_ROOMS = ["客厅", "厨房", "卧室", "书房", "餐厅", "玄关", "卫生间", "洗衣房", "阳台"];
let currentFamilyRooms = []; // 当前家庭已拥有的房间
        let pendingSelectedDefaults = new Set(); // 用户正在勾选的预设房间
        
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
                document.getElementById('btn-account-menu').setAttribute('aria-label', `当前账号：${user.email}，点击展开菜单`);
                document.getElementById('user-email-display').textContent = user.email.split('@')[0];
                switchScreen('screen-home');
                setupDataListener(user.uid);
loadUserProfile(user);
loadUserFamilies(user);
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

                const labelText = `${item.name}，分类：${item.category}，位于${item.room} ${item.location||''}，数量${item.quantity}${item.unit||'个'}${tagsText}`;
                
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
                            <div class="text-3xl font-bold text-blue-700 item-qty whitespace-nowrap">${item.quantity} <span class="text-lg text-gray-500">${item.unit||'个'}</span></div>
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
            pendingAddQty = 1; 
            pendingTags = []; 
            renderTags('add-tags-container', 'add-tags-input');
            updateAddQtyDisplay(); 
        });
        
        document.getElementById('btn-back-add').addEventListener('click', () => switchScreen('screen-home'));
        document.getElementById('btn-nav-data').addEventListener('click', () => switchScreen('screen-data'));

// --- Settings Navigation ---
        document.getElementById('btn-open-settings').addEventListener('click', () => {
            document.getElementById('menu-account-dropdown').classList.add('hidden');
            switchScreen('screen-settings');
            // 默认打开第一个标签
            switchSettingsTab('tab-profile');
            announce("进入账户与家庭管理");
        });

        document.getElementById('btn-back-settings').addEventListener('click', () => switchScreen('screen-home'));

function switchSettingsTab(tabId) {
            ['profile', 'family', 'rooms'].forEach(k => {
                const pid = `panel-${k}`;
                const bid = `tab-${k}`;
                document.getElementById(pid).classList.add('hidden');
                const btn = document.getElementById(bid);
                btn.setAttribute('aria-selected', 'false');
                btn.setAttribute('tabindex', '-1'); 
                btn.classList.remove('border-b-4', 'border-blue-800', 'text-blue-800');
                btn.classList.add('text-gray-600');
            });
            
            const key = tabId.replace('tab-', '');
            document.getElementById(`panel-${key}`).classList.remove('hidden');
            const activeBtn = document.getElementById(tabId);
            activeBtn.setAttribute('aria-selected', 'true');
            activeBtn.setAttribute('tabindex', '0'); 
            activeBtn.classList.add('border-b-4', 'border-blue-800', 'text-blue-800');
            activeBtn.classList.remove('text-gray-600');
        }

const tabIds = ['tab-profile', 'tab-family', 'tab-rooms'];
        
        // 绑定键盘事件
        tabIds.forEach((id, index) => {
            const el = document.getElementById(id);
            if(!el) return;

            // 初始化TabIndex
            el.setAttribute('tabindex', index === 0 ? '0' : '-1');

            el.addEventListener('click', () => {
                switchSettingsTab(id);
                el.focus(); 
            });

            el.addEventListener('keydown', (e) => {
                let newIndex = -1;
                // 只处理左右方向键
                if (e.key === 'ArrowRight') {
                    newIndex = (index + 1) % tabIds.length;
                } else if (e.key === 'ArrowLeft') {
                    newIndex = (index - 1 + tabIds.length) % tabIds.length;
                }
                
                if (newIndex !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    const targetId = tabIds[newIndex];
                    const targetEl = document.getElementById(targetId);
                    
                    // 重置所有tab的焦点状态
                    tabIds.forEach(tid => {
                        const t = document.getElementById(tid);
                        if(t) t.setAttribute('tabindex', '-1');
                    });
                    
                    // 激活目标tab
                    targetEl.setAttribute('tabindex', '0');
                    targetEl.focus();
                    targetEl.click();
                }
            });
        });

function renderProfileUI() {
            document.getElementById('set-nickname').value = userProfile.nickname;
            
            // 身份回显逻辑
            const select = document.getElementById('set-identity-select');
            const customBox = document.getElementById('box-identity-custom');
            const customInput = document.getElementById('set-identity-custom');
            const standardOptions = ['爸爸', '妈妈', '儿子', '女儿', '老人'];

            if (standardOptions.includes(userProfile.identity)) {
                select.value = userProfile.identity;
                customBox.classList.add('hidden');
                customInput.value = '';
            } else {
                select.value = '自定义';
                customBox.classList.remove('hidden');
                customInput.value = userProfile.identity;
            }
        }

// 监听身份下拉框变化
        document.getElementById('set-identity-select').addEventListener('change', (e) => {
            const box = document.getElementById('box-identity-custom');
            if (e.target.value === '自定义') {
                box.classList.remove('hidden');
                document.getElementById('set-identity-custom').focus();
            } else {
                box.classList.add('hidden');
            }
        });

// 监听修改密码按钮 (打开弹窗)
        const btnPassModal = document.getElementById('btn-open-password-modal');
        if (btnPassModal) {
            btnPassModal.addEventListener('click', () => {
                const m = document.getElementById('modal-change-pass');
                m.classList.remove('hidden');
                document.getElementById('input-new-pass').value = '';
                document.getElementById('input-confirm-pass').value = '';
                setTimeout(() => document.getElementById('title-change-pass').focus(), 100);
            });
        }

        // 密码弹窗：取消
        const btnPassCancel = document.getElementById('btn-pass-cancel');
        if (btnPassCancel) {
            btnPassCancel.addEventListener('click', () => {
                document.getElementById('modal-change-pass').classList.add('hidden');
                if(btnPassModal) btnPassModal.focus(); // 焦点归位
                announce("已取消修改密码");
            });
        }

        // 密码弹窗：确定
        const btnPassSave = document.getElementById('btn-pass-save');
        if (btnPassSave) {
            btnPassSave.addEventListener('click', async () => {
                const p1 = document.getElementById('input-new-pass').value;
                const p2 = document.getElementById('input-confirm-pass').value;
                
                if (p1.length < 6) { announce("密码太短，至少6位"); return; }
                if (p1 !== p2) { announce("两次密码不一致"); return; }
                
                try {
                    await updatePassword(auth.currentUser, p1);
                    announce("密码修改成功");
                    document.getElementById('modal-change-pass').classList.add('hidden');
                    if(btnPassModal) btnPassModal.focus();
                } catch (e) {
                    console.error(e);
                    announce("修改失败，可能需要重新登录");
                }
            });
        }

        // 监听保存按钮
        document.getElementById('btn-save-profile').addEventListener('click', async () => {
            const nick = document.getElementById('set-nickname').value.trim();
            const selectVal = document.getElementById('set-identity-select').value;
            let finalIdentity = selectVal;
            
            if (selectVal === '自定义') {
                finalIdentity = document.getElementById('set-identity-custom').value.trim();
                if (!finalIdentity) {
                    announce("请输入自定义身份");
                    document.getElementById('set-identity-custom').focus();
                    return;
                }
            }

            try {
                await setDoc(doc(db, "profiles", auth.currentUser.uid), {
                    nickname: nick || auth.currentUser.email,
                    identity: finalIdentity,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                announce("个人资料已保存");
            } catch (e) {
                console.error(e);
                announce("资料保存失败");
                return;
            }
});

        // 监听取消按钮
        document.getElementById('btn-profile-cancel').addEventListener('click', () => {
             switchScreen('screen-home');
             announce("已取消");
        });

        document.getElementById('tab-profile').addEventListener('click', renderProfileUI);

// --- Family Logic ---
        let unsubscribeFamilies = null;

        function loadUserFamilies(user) {
            if (unsubscribeFamilies) unsubscribeFamilies();
            // 查询当前用户创建的家庭
            const q = query(familiesRef, where("uid", "==", user.uid));
            unsubscribeFamilies = onSnapshot(q, (snapshot) => {
                userFamilies = [];
                snapshot.forEach(doc => {
                    userFamilies.push({ id: doc.id, ...doc.data() });
                });
                renderFamilyOptions();
            });
        }

        function renderFamilyOptions() {
            // 同时更新“家庭管理”和“房间管理”两个面板的下拉框
            const selects = ['manage-family-select', 'room-family-select'];
            
            selects.forEach(id => {
                const el = document.getElementById(id);
                if(!el) return;
                const savedVal = el.value || currentFamilyId;
                el.innerHTML = '';
                
                if (userFamilies.length === 0) {
                    const opt = document.createElement('option');
                    opt.textContent = "暂无家庭，请新建";
                    el.appendChild(opt);
                    el.disabled = true;
                } else {
                    el.disabled = false;
                    userFamilies.forEach(fam => {
                        const opt = document.createElement('option');
                        opt.value = fam.id;
                        opt.textContent = fam.name;
                        el.appendChild(opt);
                    });
                    
                    // 尝试保持选中状态
                    if (savedVal && userFamilies.find(f => f.id === savedVal)) {
                        el.value = savedVal;
                    } else {
                        el.value = userFamilies[0].id;
                    }
                }
            });

            // 更新当前选中的ID全局变量
            const activeSelect = document.getElementById('manage-family-select');
            if (activeSelect && !activeSelect.disabled) {
                currentFamilyId = activeSelect.value;
            } else {
                currentFamilyId = null;
            }
        }

        // 下拉框变化时同步 ID
        document.getElementById('manage-family-select').addEventListener('change', (e) => {
            currentFamilyId = e.target.value;
            // 同步到房间管理的下拉框
            document.getElementById('room-family-select').value = currentFamilyId;
        });

        // UI 辅助：显示/隐藏表单
        function toggleFamilyForm(show, mode = 'new') {
            const box = document.getElementById('box-family-form');
            if (show) {
                box.classList.remove('hidden');
                document.getElementById('title-family-form').textContent = mode === 'new' ? "新建家庭" : "编辑家庭";
                document.getElementById('input-fam-name').focus();
            } else {
                box.classList.add('hidden');
                document.getElementById('btn-fam-new').focus(); // 焦点归位
            }
        }

        // 按钮：新建家庭
        document.getElementById('btn-fam-new').addEventListener('click', () => {
            isEditingFamily = false;
            document.getElementById('input-fam-name').value = '';
            document.getElementById('input-fam-loc').value = '';
            toggleFamilyForm(true, 'new');
        });

        // 按钮：编辑家庭
        document.getElementById('btn-fam-edit').addEventListener('click', () => {
            if (!currentFamilyId) { announce("没有可编辑的家庭"); return; }
            const fam = userFamilies.find(f => f.id === currentFamilyId);
            if (fam) {
                isEditingFamily = true;
                document.getElementById('input-fam-name').value = fam.name;
                document.getElementById('input-fam-loc').value = fam.location || '';
                toggleFamilyForm(true, 'edit');
            }
        });

        // 按钮：保存家庭 (新增或更新)
        document.getElementById('btn-fam-save').addEventListener('click', async () => {
            const name = document.getElementById('input-fam-name').value.trim();
            const loc = document.getElementById('input-fam-loc').value.trim();
            if (!name) { announce("家庭名称不能为空"); return; }

            try {
                if (isEditingFamily && currentFamilyId) {
                    await updateDoc(doc(db, "families", currentFamilyId), {
                        name: name,
                        location: loc,
                        updatedAt: serverTimestamp()
                    });
                    announce("家庭信息已更新");
                } else {
                    const docRef = await addDoc(familiesRef, {
                        name: name,
                        location: loc,
                        uid: auth.currentUser.uid,
                        createdAt: serverTimestamp()
                    });
                    currentFamilyId = docRef.id; // 选中新家庭
                    announce("新家庭已创建");
                }
                toggleFamilyForm(false);
            } catch (e) {
                console.error(e);
                announce("保存失败");
            }
        });

        // 按钮：取消
        document.getElementById('btn-fam-cancel').addEventListener('click', () => toggleFamilyForm(false));

        // 按钮：删除家庭
        document.getElementById('btn-fam-del').addEventListener('click', () => {
            if (!currentFamilyId) return;
            const fam = userFamilies.find(f => f.id === currentFamilyId);
            openGenericConfirm(`确定删除家庭“${fam.name}”吗？这不会删除里面的物品。`, async () => {
                try {
                    await deleteDoc(doc(db, "families", currentFamilyId));
                    announce("家庭已删除");
                    closeModals(); // 关闭确认弹窗
                    // 逻辑上需要重置选中状态，loadUserFamilies 会自动处理
                } catch(e) {
                    announce("删除失败");
                }
            });
        });

// --- Room Management Logic ---
        
        // 切换到房间面板时：加载数据
        document.getElementById('tab-rooms').addEventListener('click', async () => {
            if (!currentFamilyId) {
                document.getElementById('list-managed-rooms').innerHTML = '<p class="text-gray-500 p-2">请先在“家庭管理”中选择或新建一个家庭。</p>';
                document.getElementById('preset-room-list').innerHTML = '';
                return;
            }
            
            // 获取最新家庭数据中的房间列表
            const famDoc = await getDoc(doc(db, "families", currentFamilyId));
            if (famDoc.exists()) {
                currentFamilyRooms = famDoc.data().rooms || [];
            } else {
                currentFamilyRooms = [];
            }
            
            renderManagedRooms();
            renderPresetKeyboardList();
        });

        // 渲染已有的房间 (删除功能)
        function renderManagedRooms() {
            const container = document.getElementById('list-managed-rooms');
            container.innerHTML = '';
            
            if (currentFamilyRooms.length === 0) {
                container.innerHTML = '<p class="col-span-2 text-gray-500 italic">该家庭暂无房间，请在上方添加。</p>';
                return;
            }

            currentFamilyRooms.forEach(room => {
                const btn = document.createElement('button');
                btn.className = "flex justify-between items-center p-3 bg-white border border-gray-300 rounded shadow-sm hover:bg-red-50 focus:ring-2 focus:ring-red-500 text-left";
                btn.innerHTML = `<span class="font-bold">${room}</span><span class="text-red-600 text-sm">删除</span>`;
                btn.setAttribute('aria-label', `${room}，点击删除`);
                
                btn.addEventListener('click', () => {
                    openGenericConfirm(`确定删除房间“${room}”吗？`, async () => {
                        currentFamilyRooms = currentFamilyRooms.filter(r => r !== room);
                        await saveRoomsToFirestore();
                    });
                });
                container.appendChild(btn);
            });
        }

        // 渲染预设房间列表 (自定义键盘交互)
        function renderPresetKeyboardList() {
            const container = document.getElementById('preset-room-list');
            container.innerHTML = '';
            pendingSelectedDefaults.clear(); // 重置选择

            // 过滤出还没添加的系统房间
            const availableDefaults = SYSTEM_ROOMS.filter(r => !currentFamilyRooms.includes(r));
            
            if (availableDefaults.length === 0) {
                container.innerHTML = '<div class="p-2 text-gray-500">所有预设房间均已添加。</div>';
                return;
            }

            availableDefaults.forEach((room, index) => {
                const div = document.createElement('div');
                div.className = "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-blue-50 border border-transparent";
                // 使用 role=option 让读屏识别为选项
                div.setAttribute('role', 'option');
                div.setAttribute('aria-selected', 'false');
                div.setAttribute('tabindex', index === 0 ? '0' : '-1'); // 只有第一个可聚焦
                div.dataset.room = room;
                
                div.innerHTML = `
                    <div class="w-5 h-5 border-2 border-gray-400 rounded flex items-center justify-center chk-box"></div>
                    <span class="text-lg">${room}</span>
                `;

                // 点击事件
                div.addEventListener('click', () => togglePresetSelection(div));
                
                // 键盘事件 (上下键移动，空格选中)
                div.addEventListener('keydown', (e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        togglePresetSelection(div);
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        moveFocus(div, 'next');
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        moveFocus(div, 'prev');
                    }
                });

                container.appendChild(div);
            });
        }

        function togglePresetSelection(el) {
            const room = el.dataset.room;
            const chk = el.querySelector('.chk-box');
            
            if (pendingSelectedDefaults.has(room)) {
                pendingSelectedDefaults.delete(room);
                el.setAttribute('aria-selected', 'false');
                el.classList.remove('bg-blue-100', 'border-blue-300');
                chk.innerHTML = '';
                chk.classList.remove('bg-blue-600', 'border-blue-600');
                chk.classList.add('border-gray-400');
                announce(`取消选中 ${room}`);
            } else {
                pendingSelectedDefaults.add(room);
                el.setAttribute('aria-selected', 'true');
                el.classList.add('bg-blue-100', 'border-blue-300');
                chk.innerHTML = '<span class="text-white text-xs">✓</span>';
                chk.classList.remove('border-gray-400');
                chk.classList.add('bg-blue-600', 'border-blue-600');
                announce(`已选中 ${room}`);
            }
        }

        function moveFocus(currentEl, dir) {
            const sibling = dir === 'next' ? currentEl.nextElementSibling : currentEl.previousElementSibling;
            if (sibling && sibling.getAttribute('role') === 'option') {
                currentEl.setAttribute('tabindex', '-1');
                sibling.setAttribute('tabindex', '0');
                sibling.focus();
            }
        }

// 按钮：添加自定义房间
        document.getElementById('btn-add-custom-room').addEventListener('click', async () => {
            const input = document.getElementById('input-custom-room');
            const name = input.value.trim();
            if (!name) return;
            
            if (currentFamilyRooms.includes(name)) {
                announce("该房间已存在");
                return;
            }
            
            currentFamilyRooms.push(name);
            await saveRoomsToFirestore();
            input.value = '';
            announce(`已添加房间 ${name}`);
        });

        // 按钮：保存房间设置 (主要是保存那些勾选的预设房间)
        document.getElementById('btn-save-rooms').addEventListener('click', async () => {
            if (pendingSelectedDefaults.size === 0) {
                announce("未选择任何新房间");
                return;
            }
            
            pendingSelectedDefaults.forEach(r => {
                if (!currentFamilyRooms.includes(r)) currentFamilyRooms.push(r);
            });
            
            await saveRoomsToFirestore();
            announce(`成功添加 ${pendingSelectedDefaults.size} 个预设房间`);
            pendingSelectedDefaults.clear();
        });

        async function saveRoomsToFirestore() {
            if (!currentFamilyId) return;
            try {
                await updateDoc(doc(db, "families", currentFamilyId), {
                    rooms: currentFamilyRooms,
                    updatedAt: serverTimestamp()
                });
                renderManagedRooms(); // 刷新列表
                renderPresetKeyboardList(); // 刷新预设列表（已添加的会消失）
            } catch (e) {
                console.error(e);
                announce("保存房间失败");
            }
        }
        
        // 当家庭下拉框在“房间管理”面板被改变时，刷新数据
        document.getElementById('room-family-select').addEventListener('change', (e) => {
             // 上面的 change 事件已经更新了 currentFamilyId
             // 这里手动触发 tab 点击事件来刷新数据
             document.getElementById('tab-rooms').click();
        });

        document.getElementById('btn-back-data').addEventListener('click', () => switchScreen('screen-home'));
        
        document.getElementById('btn-add-qty-trigger').addEventListener('click', () => {
            openQtyPicker("初始数量", (val) => {
                pendingAddQty = val;
                updateAddQtyDisplay();
            });
        });

        // 修改: 提交后不跳转，重置表单并聚焦 Name 输入框
        document.getElementById('form-add').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-name').value.trim();
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
                document.getElementById('form-add').reset();
                pendingAddQty = 1;
                pendingTags = [];
                renderTags('add-tags-container', 'add-tags-input');
                updateAddQtyDisplay();
                document.getElementById('add-name').focus();
            } catch(err) {
                announce("添加失败");
                console.error(err);
            }
        });

        document.getElementById('btn-cancel-add').addEventListener('click', () => {
            switchScreen('screen-home');
            announce("已取消");
        });

        function cancelEdit() {
            playSound('click');
            if(currentActionItem) focusTargetId = currentActionItem.id;
            switchScreen('screen-' + previousScreen);
        }
        document.getElementById('btn-back-edit').addEventListener('click', cancelEdit);
        document.getElementById('btn-cancel-edit-form').addEventListener('click', cancelEdit);

        // Unit Picker
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
        document.getElementById('btn-pick-unit-add').addEventListener('click', () => openUnitPicker('add-unit'));
        document.getElementById('btn-pick-unit-edit').addEventListener('click', () => openUnitPicker('edit-unit'));

        // Edit Execution
        document.getElementById('form-edit').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newQty = parseInt(document.getElementById('edit-quantity').value);
            const unitVal = document.getElementById('edit-unit').value;
            learnNewUnit(unitVal);
            if (newQty === 0) { openZeroConfirmEdit(newQty); return; }
            await executeEdit(newQty);
        });

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
            const m = document.getElementById('modal-zero'); playSound('error'); m.classList.remove('hidden'); setTimeout(() => document.getElementById('title-zero').focus(), 100);
            document.getElementById('btn-zero-keep').onclick = async () => { m.classList.add('hidden'); await executeEdit(0); };
            document.getElementById('btn-zero-del').onclick = async () => { m.classList.add('hidden'); await execDelete(); switchScreen('screen-' + previousScreen); };
            document.getElementById('btn-zero-cancel').onclick = () => { m.classList.add('hidden'); announce("已取消"); };
        }

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

        // Qty Picker (Fixed Focus Logic)
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
        const customTrigger = document.getElementById('qty-custom-trigger');
        function activateInput() {
            const input = document.getElementById('qty-custom-input'); const confirm = document.getElementById('btn-qty-confirm'); const trigger = document.getElementById('qty-custom-trigger');
            trigger.setAttribute('tabindex', '-1'); input.disabled = false; input.focus(); confirm.disabled = false; confirm.classList.remove('opacity-50'); confirm.setAttribute('tabindex', '0'); announce("请输入数字");
        }
        customTrigger.addEventListener('click', activateInput);
        customTrigger.addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); activateInput(); } });
        document.getElementById('qty-custom-input').addEventListener('keydown', (e) => { if(e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); e.stopPropagation(); submitQty(parseInt(e.target.value)); } });
        document.getElementById('btn-qty-confirm').addEventListener('click', () => { submitQty(parseInt(document.getElementById('qty-custom-input').value)); });
        
        function submitQty(val) { 
            if (!val || val <= 0) { announce("无效数量"); return; } 
            if (qtyCallback) qtyCallback(val); 
            document.getElementById('modal-qty').classList.add('hidden');
            
            // 修复焦点 BUG 2: 在新增界面，焦点归还给触发器，而不是走通用的 closeModals
            if (currentScreen === 'add') {
                document.getElementById('btn-add-qty-trigger').focus();
            } else {
                closeModals();
            }
        }
        
        function closeQtyModal() { 
            document.getElementById('modal-qty').classList.add('hidden'); 
            // 修复焦点 BUG 2: 取消时同样处理
            if (currentScreen === 'add') {
                document.getElementById('btn-add-qty-trigger').focus();
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
        document.getElementById('btn-confirm-ok').addEventListener('click', () => { if(confirmCallback) confirmCallback(); document.getElementById('modal-confirm').classList.add('hidden'); });
        document.getElementById('btn-confirm-cancel').addEventListener('click', () => closeModals());
        async function execDelete() { try { await deleteDoc(doc(db, "items", currentActionItem.id)); announce("已删除"); closeModals(); } catch(e) { announce("删除失败"); } }

        // Export/Import
        document.getElementById('btn-export').addEventListener('click', () => {
            let csvContent = "\uFEFF物品名称,分类,标签,房间,具体位置,数量,单位\n"; 
            allItems.forEach(item => { 
                const tagsStr = (item.tags || []).join(';');
                csvContent += `${item.name},${item.category},${tagsStr},${item.room},${item.location || ''},${item.quantity},${item.unit||'个'}\n`; 
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `物品备份_${new Date().toISOString().slice(0,10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); announce("导出成功");
        });
        document.getElementById('btn-download-template').addEventListener('click', () => {
            const csvContent = "\uFEFF物品名称(必填),分类,标签(用分号隔开),房间(必填),具体位置,数量(数字),单位\n大米,食品饮料,粮食;主食,厨房,米桶,1,袋\n洗发水,个人护理,洗护;日常,卫生间,架子,1,瓶"; 
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `导入模板.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); announce("模板下载成功");
        });
        document.getElementById('btn-trigger-upload').addEventListener('click', () => document.getElementById('file-upload').click());
        document.getElementById('file-upload').addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
            reader.onload = async (e) => {
                const text = e.target.result; const rows = text.split('\n'); let count = 0;
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i].trim(); if (!row) continue; const cols = row.split(','); if (cols.length < 1) continue; const name = cols[0]?.trim(); if(!name) continue;
                    
                    const cat = cols[1]?.trim() || '其他杂项';
                    const tagStr = cols[2]?.trim() || '';
                    const tags = tagStr ? tagStr.split(';').map(t => t.trim()).filter(t=>t) : [];

                    await addDoc(itemsRef, { 
                        name: name, 
                        category: cat,
                        tags: tags,
                        room: cols[3]?.trim() || '客厅', 
                        location: cols[4]?.trim() || '', 
                        quantity: parseInt(cols[5]) || 1, 
                        unit: cols[6]?.trim() || '个', 
                        uid: auth.currentUser.uid, 
                        updatedAt: serverTimestamp() 
                    }); count++;
                } announce(`导入 ${count} 个物品`); switchScreen('screen-home');
            }; reader.readAsText(file);
        });

        // Global Keydown
        window.addEventListener('keydown', (e) => {
            if(e.key === 'Escape') {
                if (currentScreen === 'edit') return; 
                const menu = document.getElementById('menu-account-dropdown');
                if (!menu.classList.contains('hidden')) { e.preventDefault(); menu.classList.add('hidden'); document.getElementById('btn-account-menu').setAttribute('aria-expanded', 'false'); document.getElementById('btn-account-menu').focus(); return; }
                const modals = document.querySelectorAll('[id^="modal-"]:not(.hidden)'); if (modals.length > 0) { e.preventDefault(); closeModals(); document.getElementById('modal-qty').classList.add('hidden'); document.getElementById('modal-unit').classList.add('hidden'); return; }
                if (currentScreen !== 'home' && currentScreen !== 'login') { 
                    document.getElementById('home-search').value = ''; document.getElementById('takeout-search').value = '';
                    document.getElementById('btn-clear-home-search').classList.add('hidden'); document.getElementById('btn-clear-takeout-search').classList.add('hidden');
                    e.preventDefault(); switchScreen('screen-home'); 
                }
            }
        });