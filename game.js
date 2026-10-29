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
    room: -1, // Start at intro cutscene
    introStep: 1,
    flags: {
        isGhostGone: false,
        isCellarLit: false,
        isCageOpen: false,
        isIronKeyFallen: false,
        isVampireAppearing: false,
        isVampireChasing: false,
        isWindowBreaking: false
    },
    inventory: ["rock"],
    time: 600,
    running: true,
    cleared: false,
    isCutscene: true // Block input during intro
};

// UI State
let uiState = {
    activeVerb: null,
    activeItem: null
};

let logEl, imageEl, targetRowEl, inventoryContainerEl, navRowEl;

const imageMap = {
    "GAME_OVER": "assets/game_over.webp",
    "WIN": "assets/win.webp",
    "-1-INTRO1": "assets/intro_1.webp",
    "-1-INTRO2": "assets/intro_2.webp",
    "-1-INTRO3": "assets/intro_3.webp",
    "0-START": "assets/porch.webp",
    "0-BREAKING": "assets/window_broken.webp",
    "1-NORMAL": "assets/foyer.webp",
    "1-CHASE": "assets/vampire.webp",
    "2-NORMAL": "assets/kitchen.webp",
    "3-NORMAL": "assets/bedroom.webp",
    "4-GHOST": "assets/library_ghost.webp",
    "4-CLEAR": "assets/library_clear.webp",
    "5-DARK": "assets/cellar_dark.webp",
    "5-LIT": "assets/cellar_lit.webp",
    "5-OPEN": "assets/cellar_open.webp",
    "6-NORMAL": "assets/garden.webp",
    "6-CHASE": "assets/garden_chase.webp"
};

const roomNames = {
    1: "Hall",
    2: "Kitchen",
    3: "Bedroom",
    4: "Library",
    5: "Cellar",
    6: "Garden"
};

function getStateKey() {
    if (state.room === -1) return `-1-INTRO${state.introStep}`;
    if (state.flags.isVampireAppearing) return "1-CHASE"; 
    if (state.flags.isVampireChasing) return "6-CHASE"; 
    if (state.flags.isWindowBreaking) return "0-BREAKING"; 
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

// --- Interactive UI Renderers ---

function updateStatus() {
    // 1. Render Inventory
    if (inventoryContainerEl) {
        if (state.inventory.length === 0) {
            inventoryContainerEl.innerHTML = '<span style="color:#6b7280; font-size:14px; font-style:italic;">Inventory empty</span>';
        } else {
            inventoryContainerEl.innerHTML = state.inventory.map(item => {
                let color = '#00FFFF';
                if (item === 'stick') color = '#fbbf24';
                if (item === 'iron key') color = '#ff3333';
                if (item === 'silver key') color = '#dddddd';
                
                const isSelected = uiState.activeItem === item ? 'selected' : '';
                return `<div class="inventory-item ${isSelected}" data-item="${item}" style="color:${isSelected ? '#fff' : color};">
                            ${item}
                        </div>`;
            }).join('');
        }
    }

    // 2. Render Scene Image
    const stateKey = getStateKey();
    if (imageEl) {
        if (imageMap[stateKey]) {
            imageEl.src = imageMap[stateKey];
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }
    
    // 3. Render Navigation Bar & Target Confirmations
    renderNavRow();
    renderTargetRow();
}

function renderNavRow() {
    if (!navRowEl || state.isCutscene) return;

    if (state.flags.isVampireChasing) {
        navRowEl.innerHTML = `<span style="color:#ef4444; font-weight:bold; font-size: 15px; padding: 6px;">ESCAPE! HURRY!</span>`;
        return;
    }

    let html = "";
    const createBtn = (roomId, name, isActive) => {
        const activeClass = isActive ? "active-path" : "";
        const clickAttr = isActive ? `onclick="executeCommand('walk to ${name.toLowerCase()}', ${roomId})"` : "";
        return `<button class="nav-btn ${activeClass}" ${clickAttr}>Go to ${name}</button>`;
    };

    if (state.room === -1 || state.room === 0) {
        html += `<span style="color:#6b7280; font-size:13px; padding:6px;">Door is locked. Cannot move.</span>`;
    } else if (state.room === 1) { // In Hall
        html += createBtn(2, "Kitchen", true);
        html += createBtn(3, "Bedroom", true);
        html += createBtn(4, "Library", true);
        html += createBtn(5, "Cellar", true);
    } else if (state.room === 5) { // In Cellar
        html += createBtn(1, "Hall", true);
        if (state.flags.isCageOpen) {
            html += createBtn(6, "Garden", true);
        }
    } else if (state.room >= 2 && state.room <= 6) { // Any other room, back to Hall
        html += createBtn(1, "Hall", true);
    }
    navRowEl.innerHTML = html;
}

function renderTargetRow() {
    if (!targetRowEl || state.isCutscene) return;
    
    if (state.flags.isVampireChasing) {
        if (uiState.activeVerb === 'use') {
             targetRowEl.innerHTML = '<span style="color:#ef4444; font-size:12px; font-weight:bold;">Use an item from your inventory on the gate!</span>';
        } else {
             targetRowEl.innerHTML = '<span style="color:#ef4444; font-size:12px; font-weight:bold;">No time for that! Open the gate!</span>';
        }
        return;
    }

    if (!uiState.activeVerb) {
        targetRowEl.innerHTML = '<span style="color: #6b7280; font-size: 12px;">Select an item from above to Use or Throw.</span>';
        return;
    }

    if (uiState.activeVerb === 'use' || uiState.activeVerb === 'throw') {
        if (uiState.activeItem) {
            targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: ${uiState.activeVerb.toUpperCase()} ${uiState.activeItem.toUpperCase()}</button>`;
        } else {
            targetRowEl.innerHTML = `<span style="color: #fbbf24; font-size: 12px;">Select an item from your inventory above to ${uiState.activeVerb}.</span>`;
        }
    }
}

// --- Menu Interaction Handlers ---

function handleVerbClick(verb) {
    if (!state.running || state.isCutscene) return;
    
    // Toggle off if clicking the same verb
    if (uiState.activeVerb === verb) {
        uiState.activeVerb = null;
    } else {
        uiState.activeVerb = verb;
    }
    
    document.querySelectorAll('.toggle-verb').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-verb') === uiState.activeVerb);
    });
    
    updateStatus();
}

function handleInventoryClick(item) {
    if (!state.running || state.isCutscene) return;
    
    // Auto-select "Use" if no valid item-verb is selected
    if (uiState.activeVerb !== 'use' && uiState.activeVerb !== 'throw') {
        uiState.activeVerb = 'use';
        document.querySelectorAll('.toggle-verb').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-verb') === 'use');
        });
    }
    
    uiState.activeItem = (uiState.activeItem === item) ? null : item;
    updateStatus();
}

function handleTargetClick(e) {
    if (!state.running || state.isCutscene) return;
    const targetBtn = e.target.closest('.execute-action');
    if (targetBtn) {
        executeCommand(`${uiState.activeVerb} ${uiState.activeItem}`);
    }
}

// --- Core Game Logic Engine ---
// Expose executeCommand to window so inline HTML string buttons can call it
window.executeCommand = function(rawCmd, forcedTargetRoom = -1) {
    if (!state.running || state.isCutscene) return;

    printLog(`<br>> ${rawCmd}`);
    let cmd = rawCmd.toLowerCase();
    
    // Reset UI selections after execution attempt
    uiState.activeVerb = null;
    uiState.activeItem = null;
    document.querySelectorAll('.toggle-verb').forEach(b => b.classList.remove('selected'));

    if (cmd === "use iron key" || cmd === "use silver key") cmd = "use key";

    // --- VAMPIRE CHASE OVERRIDE ---
    if (state.flags.isVampireChasing) {
        if (cmd === "use key" && state.inventory.includes("iron key")) {
            state.running = false;
            state.cleared = true;
            updateStatus();
            printLog("You unlock the gate! You and Benji run outside into the sun. The vampire screams and stops. You are safe! YOU WIN!", true);
            document.getElementById('game-clear-overlay').style.display = 'flex';
        } else {
            printLog("<span class='danger'>No time! The vampire is coming! Open the gate!</span>");
        }
        updateStatus();
        return;
    }

    // --- LOOK AROUND ---
    if (cmd === "look") {
        if (state.room === 0) printLog("You are on the porch. The door is locked. There is a window here.");
        else if (state.room === 1) printLog("You are in the hall. It is dark and cold. There is a tall picture on the wall.");
        else if (state.room === 2) printLog("You are in the kitchen. It is very dirty." + (!state.inventory.includes('salt') ? " There is a bowl of <button class='inline-item-btn' onclick='executeCommand("pick up salt")'>salt</button> on the table." : ""));
        else if (state.room === 3) printLog("You are in the bedroom. It is very dusty." + (!state.inventory.includes('flashlight') ? " There is a <button class='inline-item-btn' onclick='executeCommand("pick up flashlight")'>flashlight</button> on the bed." : ""));
        else if (state.room === 4) printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.inventory.includes('silver key') ? "There is a <button class='inline-item-btn' onclick='executeCommand("pick up silver key")'>silver key</button> on the floor." : "The room is quiet now.")) : "You are in the library. A scary ghost is here!");
        else if (state.room === 5) printLog(state.flags.isCellarLit ? "You are in the cellar. Benji is in a cage!" : "You are in the cellar. It is pitch black. You cannot see.");
        else if (state.room === 6) printLog("You are in a dark garden. The iron gate is locked." + (!state.inventory.includes('stick') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up stick\")'>long stick</button> next to the gate." : ""));
        updateStatus();
        return;
    }

    // --- MOVEMENT ---
    if (cmd.includes("walk to")) {
        if (state.room === 0) {
            printLog("The door is locked. You cannot walk in.");
            updateStatus();
            return;
        }

        if (forcedTargetRoom === 1) {
            state.room = 1;
            printLog("You are back in the hall. It is dark and cold. There is a tall picture on the wall. A heavy iron key is on top of it!", true);
        } else if (state.room === 1) { 
            if (forcedTargetRoom === 2) { state.room = 2; printLog("You are in the kitchen. It is very dirty." + (!state.inventory.includes('salt') ? " There is a bowl of <button class='inline-item-btn' onclick='executeCommand("pick up salt")'>salt</button> on the table." : ""), true); }
            else if (forcedTargetRoom === 3) { state.room = 3; printLog("You are in the bedroom. It is very dusty." + (!state.inventory.includes('flashlight') ? " There is a <button class='inline-item-btn' onclick='executeCommand("pick up flashlight")'>flashlight</button> on the bed." : ""), true); }
            else if (forcedTargetRoom === 4) { state.room = 4; printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.inventory.includes('silver key') ? "There is a <button class='inline-item-btn' onclick='executeCommand("pick up silver key")'>silver key</button> on the floor." : "The room is empty.")) : "You are in the library. A scary ghost is here!", true); }
            else if (forcedTargetRoom === 5) { state.room = 5; printLog(state.flags.isCellarLit ? (state.flags.isCageOpen ? "You are in the cellar. The cage is open. There is a secret door here." : "You are in the cellar. Benji is in a cage! The cage is locked.") : "You are in the cellar. It is pitch black. You cannot see. You need a light.", true); }
        } else if (state.room === 5 && forcedTargetRoom === 6 && state.flags.isCageOpen) {
            state.room = 6;
            printLog("You open the door and go outside. You are in a dark garden. The iron gate is locked." + (!state.inventory.includes('stick') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up stick\")'>long stick</button> next to the gate." : ""), true);
        } else {
            printLog("You can only walk back to the hall from here.");
        }
        updateStatus();
        return;
    }

    // --- PICK UP (Inline button targets) ---
    if (cmd.includes("pick up")) {
        if (cmd === "pick up salt" && state.room === 2 && !state.inventory.includes("salt")) {
            state.inventory.push("salt"); printLog("You picked up the salt. The table is empty.");
        } else if (cmd === "pick up flashlight" && state.room === 3 && !state.inventory.includes("flashlight")) {
            state.inventory.push("flashlight"); printLog("You picked up the flashlight. The bed is empty.");
        } else if (cmd === "pick up silver key" && state.room === 4 && state.flags.isGhostGone && !state.inventory.includes("silver key")) {
            state.inventory.push("silver key"); printLog("You picked up the silver key. The floor is empty.");
        } else if (cmd === "pick up stick" && state.room === 6 && !state.inventory.includes("stick")) {
            state.inventory.push("stick"); printLog("You picked up the long stick.");
        } else {
            printLog("You cannot pick that up here.");
        }
        updateStatus();
        return;
    }

    // --- ROOM SPECIFIC INTERACTIONS ---
    if (state.room === 0 && cmd.includes("throw rock")) {
        if (state.inventory.includes("rock")) {
            state.inventory = state.inventory.filter(item => item !== "rock"); 
            state.isCutscene = true;
            state.flags.isWindowBreaking = true;
            
            printLog("You throw the rock and break the window. You enter the house...", true);
            updateStatus();
            
            setTimeout(() => {
                state.flags.isWindowBreaking = false;
                state.room = 1;
                state.isCutscene = false;
                printLog("<br>You are in the hall. It is dark and cold. There is a tall picture on the wall. A heavy iron key is on top of it!");
                updateStatus();
            }, 2500);
            return; 
        }
    } 
    else if (state.room === 1) {
        if (cmd === "use stick" && state.inventory.includes("stick")) {
            state.inventory.push("iron key");
            state.flags.isIronKeyFallen = true;
            
            state.isCutscene = true; 
            state.flags.isVampireAppearing = true;
            
            printLog("You use the stick. The iron key falls! You have the key!<br><br><span class='danger'>Suddenly, a vampire runs down the stairs! He has big teeth!</span>", true);
            updateStatus();
            
            setTimeout(() => {
                state.flags.isVampireAppearing = false;
                state.room = 6;
                state.flags.isVampireChasing = true;
                state.time = 20; 
                state.isCutscene = false;
                
                printLog("<br><span class='danger'>You run to the garden! The vampire is right behind you! The heavy gate is locked. You have 20 seconds!</span>");
                const timerEl = document.getElementById('timer');
                if (timerEl) {
                    timerEl.style.color = '#ef4444';
                    timerEl.style.fontWeight = 'bold';
                }
                updateStatus();
            }, 3000);
            return; 
        } else if (cmd.includes("throw")) {
            printLog("Throwing that here won't help you.");
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 2) {
        if (cmd.includes("throw")) {
            printLog("Throwing that here won't help you.");
        } else {
             printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 3) {
        if (cmd.includes("throw")) {
            printLog("Throwing that here won't help you.");
        } else {
             printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 4) {
        if (cmd === "throw salt" && state.inventory.includes("salt") && !state.flags.isGhostGone) {
            state.inventory = state.inventory.filter(item => item !== "salt"); 
            state.flags.isGhostGone = true;
            printLog("You throw the salt at the ghost. The ghost screams and runs away! It drops a silver key.");
            // Print updated room state automatically to show the new pill
            printLog("There is a <button class='inline-item-btn' onclick='executeCommand("pick up silver key")'>silver key</button> on the floor.");
        } else if (cmd.includes("ghost") && !state.flags.isGhostGone) {
            printLog("<span class='danger'>The ghost blocks your way! You cannot pass. You need something to scare it.</span>");
        } else if (cmd.includes("throw")) {
            printLog("Throwing that won't work on the ghost.");
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 5) {
        if (cmd === "use flashlight" && state.inventory.includes("flashlight") && !state.flags.isCellarLit) {
            state.flags.isCellarLit = true;
            printLog("You turn on the flashlight. You can see now! Benji is in a cage! The cage is locked.");
        } else if (cmd === "use key" && state.flags.isCellarLit && !state.flags.isCageOpen) {
            if (state.inventory.includes("silver key")) {
                state.flags.isCageOpen = true;
                printLog("You unlock the cage! Benji jumps out. He scratches the wall. It is a secret door!");
            } else {
                printLog("<span class='danger'>The cage is locked. Benji is crying. You need a key.</span>");
            }
        } else if (cmd.includes("throw")) {
            printLog("Throwing things around in the cellar won't help.");
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 6) {
        if (cmd.includes("throw")) {
             printLog("Don't throw things in the garden right now!");
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else {
        if (cmd.includes("throw")) {
             printLog("You cannot throw that here.");
        } else {
            printLog("You cannot do that here.");
        }
    }

    updateStatus();
};

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
    // Don't show player location marker if in intro
    if (state.room >= 0) {
        const activeEl = document.getElementById(roomMap[state.room]);
        if (activeEl) {
            activeEl.style.borderColor = '#fbbf24';
            activeEl.style.background = '#261e19';
            activeEl.style.color = '#fff';
            activeEl.innerHTML += '<br><span style="color:#fbbf24; font-size:11px;">★ 現在地</span>';
        }
    }
    mapModal.style.display = 'flex';
}
function closeMap() { document.getElementById('map-modal').style.display = 'none'; }

function showHint() {
    const hintModal = document.getElementById('hint-modal');
    const hintText = document.getElementById('hint-text');
    let msg = "";

    if (state.room === 0) msg = "石を使って窓を割りましょう。(Select 'Throw', tap 'rock', then confirm)";
    else if (state.room === 1 && !state.flags.isVampireChasing) msg = "色々な部屋に行ってみましょう。(Use the Go To buttons below the image)";
    else if (state.room === 1 && state.flags.isVampireChasing) msg = "ガーデンに逃げてください！(Use the Go To Garden button!)";
    else if (state.room === 2 && !state.inventory.includes('salt')) msg = "塩を拾いましょう。(Tap the 'salt' button in the text)";
    else if (state.room === 3 && !state.inventory.includes('flashlight')) msg = "懐中電灯を拾いましょう。(Tap the 'flashlight' button in the text)";
    else if (state.room === 4 && !state.flags.isGhostGone) msg = "ゴーストに塩を投げましょう。(Select 'Throw', tap 'salt', then confirm)";
    else if (state.room === 4 && !state.inventory.includes('silver key')) msg = "鍵を拾いましょう。(Tap the 'silver key' button in the text)";
    else if (state.room === 5 && !state.flags.isCellarLit) msg = "懐中電灯を使って部屋を明るくしましょう。(Select 'Use', tap 'flashlight')";
    else if (state.room === 5 && !state.flags.isCageOpen) msg = "シルバーキーを使ってケージを開けましょう。(Select 'Use', tap 'silver key')";
    else if (state.room === 6 && !state.inventory.includes('stick')) msg = "ゲートの横にある木の棒を拾いましょう。(Tap the 'long stick' button in the text)";
    else if (state.room === 1 && state.inventory.includes('stick') && !state.inventory.includes('iron key')) msg = "木の棒を使って高いところにある鍵を落としましょう。(Select 'Use', tap 'stick')";
    else if (state.flags.isVampireChasing && state.room === 6) msg = "急いでアイアンキーを使ってゲートを開けましょう！(Select 'Use', tap 'iron key')";
    else msg = "周りを見て、色々な場所に行ってみましょう。";

    if (hintText && hintModal) {
        hintText.innerText = msg;
        hintModal.style.display = 'flex';
    }
}
function closeHint() { document.getElementById('hint-modal').style.display = 'none'; }


// --- DOM Initialization Guard ---
document.addEventListener('DOMContentLoaded', () => {
    logEl = document.getElementById('game-log');
    imageEl = document.getElementById('scene-image');
    targetRowEl = document.getElementById('target-row');
    inventoryContainerEl = document.getElementById('inventory-container');
    navRowEl = document.getElementById('nav-row');
    
    const adminPanel = document.getElementById('admin-panel');
    const gamePanel = document.getElementById('game-panel');
    const params = new URLSearchParams(window.location.search);
    const timeParam = parseInt(params.get('time'), 10);

    preloadGameImages();

    // Attach Event Listeners to Toggle Verbs
    document.querySelectorAll('.toggle-verb').forEach(btn => {
        btn.addEventListener('click', (e) => handleVerbClick(e.target.getAttribute('data-verb')));
    });

    // Attach Event Listener to dynamic targets row (Event Delegation)
    targetRowEl.addEventListener('click', handleTargetClick);
    
    // Attach Event Listener to dynamic inventory (Event Delegation)
    inventoryContainerEl.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('.inventory-item');
        if (itemBtn) {
            handleInventoryClick(itemBtn.getAttribute('data-item'));
        }
    });

    if (timeParam && !isNaN(timeParam) && timeParam > 0) {
        state.time = timeParam; 
        if (adminPanel) adminPanel.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'flex';
        
        // START INTRO CUTSCENE
        state.room = -1;
        state.introStep = 1;
        state.isCutscene = true;
        updateStatus();
        printLog("You are walking with your dog, Benji.", true);

        setTimeout(() => {
            state.introStep = 2;
            updateStatus();
            printLog("<br>Benji runs into the house.");
            
            setTimeout(() => {
                state.introStep = 3;
                updateStatus();
                printLog("<br>You run to find Benji.");
                
                setTimeout(() => {
                    state.room = 0; // Move to porch
                    state.isCutscene = false; // Unlock inputs
                    updateStatus();
                    printLog("<br><br>Your dog, Benji, ran into this scary house. You hear him crying. The door is locked. There is a rock here.");
                }, 3000);
            }, 3000);
        }, 3000);

    } else {
        if (adminPanel) adminPanel.style.display = 'block';
        if (gamePanel) gamePanel.style.display = 'none';
    }
});

// --- Timer Interval ---
setInterval(() => {
    const params = new URLSearchParams(window.location.search);
    const hasTimeParam = params.has('time');

    // Pause timer logic if cutscene is active
    if (!state.running || state.cleared || !hasTimeParam || state.isCutscene) return;
    
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
        
        // Disable UI
        if(targetRowEl) targetRowEl.innerHTML = '';
        if(navRowEl) navRowEl.innerHTML = '';
        uiState.activeVerb = null;
        document.querySelectorAll('.action-verb').forEach(b => b.classList.remove('selected'));
    }
}, 1000);
