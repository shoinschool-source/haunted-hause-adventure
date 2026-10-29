// --- Popup System for Room Guidance ---
let popupTimer = null;

function showNextRoomPopup(text) {
    let popupEl = document.getElementById('next-room-popup');
    if (!popupEl) {
        popupEl = document.createElement('div');
        popupEl.id = 'next-room-popup';
        document.body.appendChild(popupEl);
    }
    popupEl.innerText = text;
    popupEl.classList.add('show');
    popupEl.onclick = () => {
        popupEl.classList.remove('show');
        if (popupTimer) clearTimeout(popupTimer);
    };
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => { popupEl.classList.remove('show'); }, 3500);
}

// --- QR Generator Function ---
function generateQR() {
    const timeInput = document.getElementById('game-time');
    const qrImg = document.getElementById('qr-code');
    const timeDisplay = document.getElementById('time-display');
    const qrResult = document.getElementById('qr-result');

    if (!timeInput) return;
    const minutes = parseInt(timeInput.value, 10) || 10;
    const seconds = minutes * 60;
    const cleanUrl = window.location.href.split('?')[0];
    const gameUrl = `${cleanUrl}?time=${seconds}`;
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(gameUrl)}&bgcolor=141110&color=fef3c7`;
    
    if (qrImg) qrImg.src = qrApi;
    if (timeDisplay) timeDisplay.innerText = minutes;
    if (qrResult) qrResult.style.display = 'block';
}

// --- Game State Object ---
let state = {
    room: 0,
    flags: {
        isGhostGone: false,
        isCellarLit: false,
        isCageOpen: false,
        isIronKeyFallen: false,
        isVampireChasing: false
    },
    inventory: ["rock"],
    time: 600,
    running: true,
    cleared: false
};

let logEl, inputEl, imageEl;

// Update this object with your actual image paths once you have them
const imageMap = {
    "GAME_OVER": "assets/game_over.webp",
    "WIN": "assets/win.webp",
    "0-START": "assets/porch.webp",
    "1-NORMAL": "assets/foyer.webp",
    "1-CHASE": "assets/vampire.webp",
    "2-NORMAL": "assets/kitchen.webp",
    "3-NORMAL": "assets/bedroom.webp",
    "4-GHOST": "assets/library_ghost.webp",
    "4-CLEAR": "assets/library_clear.webp",
    "5-DARK": "assets/cellar_dark.webp",
    "5-LIT": "assets/cellar_lit.webp",
    "5-OPEN": "assets/cellar_open.webp",
    "6-NORMAL": "assets/garden.webp"
};

function getStateKey() {
    if (state.flags.isVampireChasing) return "1-CHASE";
    if (state.room === 0) return "0-START";
    if (state.room === 1) return "1-NORMAL";
    if (state.room === 2) return "2-NORMAL";
    if (state.room === 3) return "3-NORMAL";
    if (state.room === 4) return state.flags.isGhostGone ? "4-CLEAR" : "4-GHOST";
    if (state.room === 5) {
        if (state.flags.isCageOpen) return "5-OPEN";
        if (state.flags.isCellarLit) return "5-LIT";
        return "5-DARK";
    }
    if (state.room === 6) return "6-NORMAL";
    return "";
}

function preloadGameImages() {
    const cacheContainer = document.getElementById('image-cache');
    Object.values(imageMap).forEach(src => {
        const img = new Image();
        img.src = src;
        if (cacheContainer) {
            img.alt = "Cache Preload";
            img.onerror = () => { img.style.display = 'none'; };
            cacheContainer.appendChild(img);
        }
    });
}

function printLog(msg, clear = false) {
    if (!logEl) return;
    if (clear) logEl.innerHTML = '';
    const div = document.createElement('div');
    div.innerHTML = msg;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

function updateStatus() {
    const invEl = document.getElementById('inventory');
    if (invEl) {
        invEl.innerHTML = state.inventory.length 
            ? state.inventory.map(item => {
                let color = '#00FFFF';
                if (item === 'stick') color = '#fbbf24';
                if (item === 'iron key') color = '#ff3333';
                if (item === 'silver key') color = '#dddddd';
                return `<span style="color:${color}; font-weight:bold;">${item}</span>`;
            }).join(', ')
            : 'なし';
    }

    const stateKey = getStateKey();
    if (imageEl) {
        if (imageMap[stateKey]) {
            imageEl.src = imageMap[stateKey];
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }
}

// --- Map & Hint Handlers ---
function showMap() {
    const mapModal = document.getElementById('map-modal');
    if (!mapModal) return;
    const roomMap = { 0: 'map-r0', 1: 'map-r1', 2: 'map-r2', 3: 'map-r3', 4: 'map-r4', 5: 'map-r5', 6: 'map-r6' };

    Object.values(roomMap).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.borderColor = '#78350f';
            el.style.background = '#000';
            el.style.color = '#6b7280';
            el.innerHTML = el.innerHTML.replace('<br><span style="color:#fbbf24; font-size:11px;">★ 現在地</span>', '');
        }
    });
    const activeEl = document.getElementById(roomMap[state.room]);
    if (activeEl) {
        activeEl.style.borderColor = '#fbbf24';
        activeEl.style.background = '#261e19';
        activeEl.style.color = '#fff';
        activeEl.innerHTML += '<br><span style="color:#fbbf24; font-size:11px;">★ 現在地</span>';
    }
    mapModal.style.display = 'flex';
}
function closeMap() { document.getElementById('map-modal').style.display = 'none'; }

function showHint() {
    const hintModal = document.getElementById('hint-modal');
    const hintText = document.getElementById('hint-text');
    let msg = "";

    if (state.room === 0) msg = "石を使って窓を割りましょう。(use rock)";
    else if (state.room === 1 && !state.flags.isVampireChasing) msg = "kitchen, bedroom, library, cellarに行ってみましょう。(walk to cellar)";
    else if (state.room === 1 && state.flags.isVampireChasing) msg = "ガーデンに逃げてください！(walk to garden)";
    else if (state.room === 2 && !state.inventory.includes('salt')) msg = "塩を拾いましょう。(pick up salt)";
    else if (state.room === 3 && !state.inventory.includes('flashlight')) msg = "懐中電灯を拾いましょう。(pick up flashlight)";
    else if (state.room === 4 && !state.flags.isGhostGone) msg = "ゴーストに塩を投げましょう。(use salt)";
    else if (state.room === 4 && !state.inventory.includes('silver key')) msg = "鍵を拾いましょう。(pick up key)";
    else if (state.room === 5 && !state.flags.isCellarLit) msg = "懐中電灯を使って部屋を明るくしましょう。(use flashlight)";
    else if (state.room === 5 && !state.flags.isCageOpen) msg = "シルバーキーを使ってケージを開けましょう。(use key)";
    else if (state.room === 6 && !state.inventory.includes('stick')) msg = "犬が見つけた木の棒を拾いましょう。(pick up stick)";
    else if (state.room === 1 && state.inventory.includes('stick') && !state.inventory.includes('iron key')) msg = "木の棒を使って高いところにある鍵を落としましょう。(use stick)";
    else if (state.flags.isVampireChasing && state.room === 6) msg = "急いでアイアンキーを使ってゲートを開けましょう！(use key)";
    else msg = "周りを見て、色々な場所に行ってみましょう。";

    if (hintText && hintModal) {
        hintText.innerText = msg;
        hintModal.style.display = 'flex';
    }
}
function closeHint() { document.getElementById('hint-modal').style.display = 'none'; }

// --- Submit Command Logic ---
function submitCommand() {
    if (!inputEl) return;
    let rawCmd = inputEl.value.toLowerCase().trim();
    inputEl.value = '';
    if (!rawCmd || !state.running) return;

    printLog(`<br>> ${rawCmd}`);

    // Normalize command
    let cmd = rawCmd;
    cmd = cmd.replace("take", "pick up").replace("grab", "pick up").replace("get", "pick up");
    cmd = cmd.replace("go to", "walk to").replace("go", "walk to").replace("run to", "walk to");
    if (cmd === "use iron key" || cmd === "use silver key") cmd = "use key";

    // --- VAMPIRE CHASE OVERRIDE ---
    if (state.flags.isVampireChasing) {
        if (cmd === "use key") {
            if (state.inventory.includes("iron key")) {
                state.running = false;
                state.cleared = true;
                updateStatus();
                printLog("You unlock the gate! You and Max run outside into the sun. The vampire screams and stops. You are safe! YOU WIN!", true);
                document.getElementById('game-clear-overlay').style.display = 'flex';
            }
        } else {
            printLog("<span class='danger'>No time! The vampire is coming! Open the gate!</span>");
        }
        return;
    }

    // --- NORMAL GAME LOGIC ---
    if (cmd.includes("walk to")) {
        let target = -1;
        if (cmd.includes("hall") || cmd.includes("foyer")) target = 1;
        else if (cmd.includes("kitchen")) target = 2;
        else if (cmd.includes("bedroom")) target = 3;
        else if (cmd.includes("library")) target = 4;
        else if (cmd.includes("cellar")) target = 5;
        else if (cmd.includes("garden")) target = 6;

        if (state.room === 0) {
            printLog("The door is locked. You cannot walk in.");
            return;
        }

        if (target === 1) {
            state.room = 1;
            printLog("You are back in the hall. It is dark and cold. There is a tall picture on the wall. A heavy iron key is on top of it!", true);
        } else if (state.room === 1) { // Moving from Hub
            if (target === 2) { state.room = 2; printLog("You are in the kitchen. It is very dirty." + (!state.inventory.includes('salt') ? " There is a bowl of salt on the table." : ""), true); }
            else if (target === 3) { state.room = 3; printLog("You are in the bedroom. It is very dusty." + (!state.inventory.includes('flashlight') ? " There is a flashlight on the bed." : ""), true); }
            else if (target === 4) { state.room = 4; printLog(state.flags.isGhostGone ? "You are in the library. There is a silver key on the floor." : "You are in the library. A scary ghost is here!", true); }
            else if (target === 5) { state.room = 5; printLog(state.flags.isCellarLit ? (state.flags.isCageOpen ? "You are in the cellar. The cage is open. There is a secret door here." : "You are in the cellar. Max is in a cage! The cage is locked.") : "You are in the cellar. It is pitch black. You cannot see. You need a light.", true); }
            else { printLog("You cannot walk there from the hall."); }
        } else if (state.room === 5 && target === 6 && state.flags.isCageOpen) {
            state.room = 6;
            printLog("You open the door and go outside. You are in a dark garden. The iron gate is locked. Max smells the dirt. He digs a hole. He finds a long stick!", true);
        } else {
            printLog("You can only walk back to the hall from here.");
        }
        updateStatus();
        return;
    }

    // Interactive Commands
    if (state.room === 0 && cmd.includes("use rock")) {
        state.inventory = []; 
        state.room = 1;
        printLog("You break the window. You enter the house.<br><br>You are in the hall. It is dark and cold. There is a tall picture on the wall. A heavy iron key is on top of it!", true);
    } 
    else if (state.room === 1) {
        if (cmd === "pick up key" && !state.flags.isIronKeyFallen) {
            printLog("<span class='danger'>You are too short. You cannot reach the iron key.</span>");
        } else if (cmd === "use stick" && state.inventory.includes("stick")) {
            state.inventory.push("iron key");
            state.flags.isIronKeyFallen = true;
            printLog("You use the stick. The iron key falls! You have the key!<br><br><span class='danger'>Suddenly, a vampire runs down the stairs! He has big teeth! You and Max run to the garden!</span>", true);
            
            state.room = 6;
            state.flags.isVampireChasing = true;
            state.time = 20; // Trigger the 20-second final countdown override
            
            const timerEl = document.getElementById('timer');
            if (timerEl) {
                timerEl.style.color = '#ef4444';
                timerEl.style.fontWeight = 'bold';
            }
            
            setTimeout(() => {
                printLog("<span class='danger'>You are in the dark garden! The vampire is right behind you! The heavy gate is locked. You have 20 seconds!</span>");
            }, 2500);
        } else {
            printLog("I don't understand.");
        }
    }
    else if (state.room === 2 && cmd === "pick up salt" && !state.inventory.includes("salt")) {
        state.inventory.push("salt"); printLog("You have the salt. The table is empty.");
    }
    else if (state.room === 3 && cmd === "pick up flashlight" && !state.inventory.includes("flashlight")) {
        state.inventory.push("flashlight"); printLog("You have the flashlight. The bed is empty.");
    }
    else if (state.room === 4) {
        if (cmd === "use salt" && state.inventory.includes("salt") && !state.flags.isGhostGone) {
            state.flags.isGhostGone = true;
            printLog("You throw the salt at the ghost. The ghost screams and runs away! It drops a silver key.");
        } else if (cmd === "pick up key" && state.flags.isGhostGone && !state.inventory.includes("silver key")) {
            state.inventory.push("silver key");
            printLog("You have the silver key. The floor is empty.");
        } else if (cmd.includes("ghost") && !state.flags.isGhostGone) {
            printLog("<span class='danger'>The ghost blocks your way! You cannot pass. You need something to scare it.</span>");
        } else {
            printLog("I don't understand.");
        }
    }
    else if (state.room === 5) {
        if (cmd === "use flashlight" && state.inventory.includes("flashlight") && !state.flags.isCellarLit) {
            state.flags.isCellarLit = true;
            printLog("You turn on the flashlight. You can see now! Max is in a cage! The cage is locked.");
        } else if (cmd === "use key" && state.flags.isCellarLit && !state.flags.isCageOpen) {
            if (state.inventory.includes("silver key")) {
                state.flags.isCageOpen = true;
                printLog("You unlock the cage! Max jumps out. He scratches the wall. It is a secret door!");
            } else {
                printLog("<span class='danger'>The cage is locked. Max is crying. You need a key.</span>");
            }
        } else {
            printLog("I don't understand.");
        }
    }
    else if (state.room === 6) {
        if (cmd === "pick up stick" && !state.inventory.includes("stick")) {
            state.inventory.push("stick");
            printLog("You have the long stick. The hole is empty.");
        } else {
            printLog("I don't understand.");
        }
    }
    else {
        printLog("You cannot do that here.");
    }

    updateStatus();
}

function handleKeyPress(key) {
    if (!state.running) return;
    if (key === 'enter') submitCommand();
    else if (key === 'backspace') { if (inputEl) inputEl.value = inputEl.value.slice(0, -1); }
    else { if (inputEl) inputEl.value += key; }
}

// --- DOM Initialization Guard ---
document.addEventListener('DOMContentLoaded', () => {
    logEl = document.getElementById('game-log');
    inputEl = document.getElementById('cmd-input');
    imageEl = document.getElementById('scene-image');
    const adminPanel = document.getElementById('admin-panel');
    const gamePanel = document.getElementById('game-panel');
    const params = new URLSearchParams(window.location.search);
    const timeParam = parseInt(params.get('time'), 10);

    preloadGameImages();

    if (timeParam && !isNaN(timeParam) && timeParam > 0) {
        state.time = timeParam; 
        if (adminPanel) adminPanel.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'flex';
        updateStatus(); 
        printLog("Your dog, Max, ran into this scary house. You hear him crying. The door is locked. There is a rock here.");
    } else {
        if (adminPanel) adminPanel.style.display = 'block';
        if (gamePanel) gamePanel.style.display = 'none';
    }

    const kbContainer = document.getElementById('virtual-keyboard');
    if (kbContainer) {
        const onKeyTrigger = (e) => {
            const targetBtn = e.target.closest('.key');
            if (targetBtn) {
                e.preventDefault();
                const keyVal = targetBtn.getAttribute('data-key');
                if (keyVal) handleKeyPress(keyVal);
            }
        };
        kbContainer.addEventListener('touchstart', onKeyTrigger, { passive: false });
        kbContainer.addEventListener('click', onKeyTrigger);
    }
});

// --- Timer Interval ---
setInterval(() => {
    const params = new URLSearchParams(window.location.search);
    const hasTimeParam = params.has('time');

    if (!state.running || state.cleared || !hasTimeParam) return;
    
    state.time--;
    const m = String(Math.floor(state.time / 60)).padStart(2, '0');
    const s = String(state.time % 60).padStart(2, '0');
    const timerEl = document.getElementById('timer');
    
    if (timerEl) {
        timerEl.innerText = `タイマー: ${state.flags.isVampireChasing ? "00:" + s : m + ":" + s}`;
        if (state.time < 60 && state.time > 0) {
            timerEl.style.color = '#ef4444'; 
            timerEl.style.fontWeight = 'bold';
        }
    }
    
    if (state.time <= 0) {
        state.running = false;
        if (timerEl) timerEl.style.color = '#ef4444';
        
        if (imageEl && imageMap["GAME_OVER"]) {
            imageEl.src = imageMap["GAME_OVER"];
            imageEl.style.display = 'block';
        }
        
        printLog(state.flags.isVampireChasing ? "<span class='danger'>TIME IS UP! The vampire catches you. GAME OVER.</span>" : "<span class='danger'>TIME IS UP! You are trapped forever...</span>", true);
    }
}, 1000);

// --- Keyboard Listener ---
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitCommand();
    else if (e.key === 'Backspace') { if (inputEl) inputEl.value = inputEl.value.slice(0, -1); }
    else if (e.key.length === 1) { if (inputEl) inputEl.value += e.key; }
});
