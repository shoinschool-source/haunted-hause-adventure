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
window.generateQR = function generateQR() {
    const timeInput = document.getElementById('game-time');
    const qrImg = document.getElementById('qr-code');
    const timeDisplay = document.getElementById('time-display');
    const qrResult = document.getElementById('qr-result');
    const linkContainer = document.getElementById('url-link-container');

    if (!timeInput) return;
    const minutes = parseInt(timeInput.value, 10) || 10;
    const seconds = minutes * 60;
    const cleanUrl = window.location.href.split('?')[0];
    const gameUrl = `${cleanUrl}?time=${seconds}`;
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(gameUrl)}&bgcolor=141110&color=fef3c7`;
    
    if (qrImg) qrImg.src = qrApi;
    if (timeDisplay) timeDisplay.innerText = minutes;
    
    if (linkContainer) {
        linkContainer.innerHTML = `
            <p style="font-size: 13px; margin-bottom: 4px; color: #fbbf24;">Direct URL Link:</p>
            <a href="${gameUrl}" target="_blank" style="color: #60a5fa; font-size: 13px; text-decoration: underline;">${gameUrl}</a>
        `;
    }

    if (qrResult) qrResult.style.display = 'block';
};

// --- Game State Object ---
let state = {
    room: -1, // Start at intro cutscene
    introStep: 1,
    tutorialStep: 0, // 0 = inactive, 1-4 = tutorial pages
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
    activeVerb: null,          // 'look at', 'use', 'throw'
    activeItem: null,          // Inventory item name
    activeTargetObject: null   // Room text target name (e.g. 'picture', 'ghost')
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
    "1-GOT-KEY": "assets/got_key.webp",
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
    if (state.flags.isVampireAppearing) return "1-GOT-KEY"; 
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

// --- Room Object Selection Handler (Inline Text Buttons) ---
function handleObjectClick(objectName) {
    if (!state.running || state.isCutscene) return;
    
    // Toggle the selected target object
    if (uiState.activeTargetObject === objectName) {
        uiState.activeTargetObject = null;
    } else {
        uiState.activeTargetObject = objectName;
        uiState.activeItem = null; // Clear item selection
        
        // If not already set to 'look at', default verb to 'look at'
        if (uiState.activeVerb !== 'look at') {
            uiState.activeVerb = 'look at';
            document.querySelectorAll('.toggle-verb').forEach(btn => {
                btn.classList.toggle('selected', btn.getAttribute('data-verb') === 'look at');
            });
        }
    }
    
    updateInlineHighlights();
    updateStatus();
}

function updateInlineHighlights() {
    document.querySelectorAll('.inline-item-btn').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (uiState.activeTargetObject && onclickAttr.includes(`"${uiState.activeTargetObject}"`)) {
            btn.style.outline = '2px solid #fbbf24';
            btn.style.background = '#d97706';
        } else {
            btn.style.outline = 'none';
            btn.style.background = '#b45309';
        }
    });
}

// --- Tutorial Overlay Management ---
function renderTutorialOverlay() {
    let tutorialEl = document.getElementById('hud-tutorial-overlay');
    if (!tutorialEl) {
        tutorialEl = document.createElement('div');
        tutorialEl.id = 'hud-tutorial-overlay';
        tutorialEl.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85); z-index: 9999; display: flex;
            justify-content: center; align-items: center; font-family: monospace;
        `;
        document.body.appendChild(tutorialEl);
    }

    if (state.tutorialStep === 0) {
        tutorialEl.style.display = 'none';
        return;
    }

    tutorialEl.style.display = 'flex';
    let title = "";
    let desc = "";

    if (state.tutorialStep === 1) {
        title = "【HUD（操作パネル）について】";
        desc = "画面上部にはインベントリ（持ち物）、アクションボタン（LOOK AT / USE / THROW）が表示されます。ここをクリックして行動を選択します。";
    } else if (state.tutorialStep === 2) {
        title = "【アイテムの入手と確認】";
        desc = "屋敷の中を探索すると、様々なアイテムが見つかります。画面内のボタンや指示をクリックしてインベントリに追加しましょう。現在「rock（石）」を持っています。";
    } else if (state.tutorialStep === 3) {
        title = "【アイテムの使用方法】";
        desc = "インベントリ内のアイテムをクリックし、アクション（USEまたはTHROW）を選んで確認ボタンを押すことで、ギミックを解除できます。";
    } else if (state.tutorialStep === 4) {
        title = "【オブジェクトの観察（LOOK AT）】";
        desc = "「Look at」を押してからテキスト内の黄色い文字（例: <span style='color:#fbbf24'>picture</span>, <span style='color:#fbbf24'>ghost</span>）を選ぶか、直接文字をタップしてから「CONFIRM: LOOK AT」を押すとヒントが表示されます。";
    }

    tutorialEl.innerHTML = `
        <div style="background: #1c1917; border: 2px solid #fbbf24; padding: 24px; max-width: 450px; text-align: center; border-radius: 8px; color: #fef3c7;">
            <h3 style="color: #fbbf24; margin-top: 0; font-size: 18px;">${title}</h3>
            <p style="font-size: 14px; line-height: 1.6; color: #d6d3d1; margin-bottom: 24px;">${desc}</p>
            <button onclick="advanceTutorial()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">
                ${state.tutorialStep < 4 ? '次へ (Next)' : 'ゲーム開始 (Start)'}
            </button>
        </div>
    `;
}

window.advanceTutorial = function() {
    state.tutorialStep++;
    if (state.tutorialStep > 4) {
        state.tutorialStep = 0;
        state.isCutscene = false;
    }
    renderTutorialOverlay();
    updateStatus();
};

// --- Interactive UI Renderers ---

function updateStatus() {
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

    const stateKey = getStateKey();
    if (imageEl) {
        if (imageMap[stateKey]) {
            imageEl.src = imageMap[stateKey];
            imageEl.style.display = 'block';
        } else {
            imageEl.style.display = 'none';
        }
    }
    
    renderNavRow();
    renderTargetRow();
    updateInlineHighlights();
}

function renderNavRow() {
    if (!navRowEl || state.isCutscene) return;

    if (state.flags.isVampireChasing) {
        navRowEl.innerHTML = `<span style="color:#ef4444; font-weight:bold; font-size: 15px; padding: 6px;">ESCAPE! HURRY!</span>`;
        return;
    }

    let html = "";
    const createBtn = (roomId, name, isActive, isFlashing = false) => {
        const activeClass = isActive ? "active-path" : "";
        const flashStyle = isFlashing ? "animation: pulse-glow 1s infinite alternate; border-color: #fbbf24; background: #b45309;" : "";
        const clickAttr = isActive ? `onclick="executeCommand('walk to ${name.toLowerCase()}', ${roomId})"` : "";
        return `<button class="nav-btn ${activeClass}" style="${flashStyle}" ${clickAttr}>Go to ${name}</button>`;
    };

    if (state.room === -1 || state.room === 0) {
        html += `<span style="color:#6b7280; font-size:13px; padding:6px;">Door is locked. Cannot move.</span>`;
    } else if (state.room === 1) { 
        html += createBtn(2, "Kitchen", true);
        html += createBtn(3, "Bedroom", true);
        html += createBtn(4, "Library", true);
        html += createBtn(5, "Cellar", true);
    } else if (state.room === 5) { 
        html += createBtn(1, "Hall", true);
        if (state.flags.isCageOpen) {
            html += createBtn(6, "Garden", true, true);
        }
    } else if (state.room >= 2 && state.room <= 6) { 
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

    // Case 1: Look at action
    if (uiState.activeVerb === 'look at') {
        if (uiState.activeTargetObject) {
            targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: LOOK AT ${uiState.activeTargetObject.toUpperCase()}</button>`;
        } else {
            targetRowEl.innerHTML = '<span style="color: #fbbf24; font-size: 12px;">Tap an orange word in the text above to Look at.</span>';
        }
        return;
    }

    // Case 2: Use or Throw action
    if (uiState.activeVerb === 'use' || uiState.activeVerb === 'throw') {
        if (uiState.activeItem) {
            targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: ${uiState.activeVerb.toUpperCase()} ${uiState.activeItem.toUpperCase()}</button>`;
        } else {
            targetRowEl.innerHTML = `<span style="color: #fbbf24; font-size: 12px;">Select an item from inventory to ${uiState.activeVerb.toUpperCase()}.</span>`;
        }
        return;
    }

    // Case 3: Item clicked first without explicit verb selected
    if (uiState.activeItem) {
        targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: USE ${uiState.activeItem.toUpperCase()}</button>`;
        return;
    }

    // Case 4: Target object clicked first without explicit verb selected
    if (uiState.activeTargetObject) {
        targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: LOOK AT ${uiState.activeTargetObject.toUpperCase()}</button>`;
        return;
    }

    targetRowEl.innerHTML = '<span style="color: #6b7280; font-size: 12px;">Select an action (Look at / Use / Throw) or a target.</span>';
}

// --- Menu Interaction Handlers ---

function handleVerbClick(verb) {
    if (!state.running || state.isCutscene) return;
    
    if (uiState.activeVerb === verb) {
        uiState.activeVerb = null;
    } else {
        uiState.activeVerb = verb;
        if (verb === 'look at') {
            uiState.activeItem = null;
        } else {
            uiState.activeTargetObject = null;
        }
    }
    
    document.querySelectorAll('.toggle-verb').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-verb') === uiState.activeVerb);
    });
    
    updateStatus();
}

function handleInventoryClick(item) {
    if (!state.running || state.isCutscene) return;
    
    uiState.activeTargetObject = null;

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
        if (uiState.activeVerb === 'look at' && uiState.activeTargetObject) {
            executeCommand(`look at ${uiState.activeTargetObject}`);
        } else if (uiState.activeItem) {
            const verb = uiState.activeVerb || 'use';
            executeCommand(`${verb} ${uiState.activeItem}`);
        }
    }
}

// --- Core Game Logic Engine ---
window.executeCommand = function(rawCmd, forcedTargetRoom = -1) {
    if (!state.running || state.isCutscene) return;

    printLog(`<br>> ${rawCmd}`);
    let cmd = rawCmd.toLowerCase();
    
    // Clear selection state
    uiState.activeVerb = null;
    uiState.activeItem = null;
    uiState.activeTargetObject = null;
    document.querySelectorAll('.toggle-verb').forEach(b => b.classList.remove('selected'));
    updateInlineHighlights();

    if (cmd === "use iron key" || cmd === "use silver key") cmd = "use key";

    // --- LOOK AT OBJECTS (HINTS) ---
    if (cmd.startsWith("look at ")) {
        let obj = cmd.replace("look at ", "").trim();
        const hints = {
            "picture": "Look up. Something is on the picture.",
            "key": "You need a long tool to get the key.",
            "salt": "It is white and small. Good for food... or ghosts.",
            "flashlight": "It is dark here. You need light.",
            "ghost": "It is scary! It does not like white powder.",
            "cage": "Benji is inside! The door is locked with a key.",
            "stick": "A long wood branch on the ground.",
            "gate": "It is heavy and locked. Use your key fast!"
        };
        
        if (hints[obj]) {
            printLog(`<span style="color: #fbbf24; font-style: italic;">💡 You look at the ${obj}: "${hints[obj]}"</span>`);
        } else {
            printLog("You see nothing special about that.");
        }
        updateStatus();
        return;
    }

    // --- VAMPIRE CHASE OVERRIDE ---
    if (state.flags.isVampireChasing) {
        if ((cmd === "use key" || cmd === "use iron key" || cmd === "use iron") && (state.inventory.includes("iron key") || state.inventory.includes("key"))) {
            state.inventory = state.inventory.filter(item => item !== "iron key" && item !== "key");
            state.running = false;
            state.cleared = true;
            updateStatus();
            printLog("You unlock the gate! You and Benji run outside into the sun. The vampire screams and stops. You are safe! YOU WIN!", true);
            document.getElementById('game-clear-overlay').style.display = 'flex';
        } else {
            printLog("<span class='danger'>No time! The vampire is coming! Open the gate with the iron key!</span>");
        }
        updateStatus();
        return;
    }

    // --- LOOK AROUND (Room default) ---
    if (cmd === "look") {
        if (state.room === 0) printLog("You are on the porch. The door is locked. There is a window here.");
        else if (state.room === 1) printLog("You are in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!");
        else if (state.room === 2) printLog("You are in the kitchen. It is very dirty." + (!state.inventory.includes('salt') ? " There is a bowl of <button class='inline-item-btn' onclick='executeCommand(\"pick up salt\")'>salt</button> on the table." : ""));
        else if (state.room === 3) printLog("You are in the bedroom. It is very dusty." + (!state.inventory.includes('flashlight') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up flashlight\")'>flashlight</button> on the bed." : ""));
        else if (state.room === 4) printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.inventory.includes('silver key') ? "There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up silver key\")'>silver key</button> on the floor." : "The room is quiet now.")) : "You are in the library. A scary <button class='inline-item-btn' onclick='handleObjectClick(\"ghost\")'>ghost</button> is here!");
        else if (state.room === 5) printLog(state.flags.isCellarLit ? "You are in the cellar. Benji is in a <button class='inline-item-btn' onclick='handleObjectClick(\"cage\")'>cage</button>!" : "You are in the cellar. It is pitch black. You cannot see.");
        else if (state.room === 6) printLog("You are in a dark garden. The iron <button class='inline-item-btn' onclick='handleObjectClick(\"gate\")'>gate</button> is locked." + (!state.inventory.includes('stick') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up stick\")'>long stick</button> next to the gate." : ""));
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
            printLog("You are back in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!", true);
        } else if (state.room === 1) { 
            if (forcedTargetRoom === 2) { state.room = 2; printLog("You are in the kitchen. It is very dirty." + (!state.inventory.includes('salt') ? " There is a bowl of <button class='inline-item-btn' onclick='executeCommand(\"pick up salt\")'>salt</button> on the table." : ""), true); }
            else if (forcedTargetRoom === 3) { state.room = 3; printLog("You are in the bedroom. It is very dusty." + (!state.inventory.includes('flashlight') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up flashlight\")'>flashlight</button> on the bed." : ""), true); }
            else if (forcedTargetRoom === 4) { state.room = 4; printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.inventory.includes('silver key') ? "There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up silver key\")'>silver key</button> on the floor." : "The room is empty.")) : "You are in the library. A scary <button class='inline-item-btn' onclick='handleObjectClick(\"ghost\")'>ghost</button> is here!", true); }
            else if (forcedTargetRoom === 5) { state.room = 5; printLog(state.flags.isCellarLit ? (state.flags.isCageOpen ? "You are in the cellar. The cage is open. There is a secret door here." : "You are in the cellar. Benji is in a <button class='inline-item-btn' onclick='handleObjectClick(\"cage\")'>cage</button>! The cage is locked.") : "You are in the cellar. It is pitch black. You cannot see. You need a light.", true); }
        } else if (state.room === 5 && forcedTargetRoom === 6 && state.flags.isCageOpen) {
            state.room = 6;
            printLog("You open the door and go outside. You are in a dark garden. The iron <button class='inline-item-btn' onclick='handleObjectClick(\"gate\")'>gate</button> is locked." + (!state.inventory.includes('stick') ? " There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up stick\")'>long stick</button> next to the gate." : ""), true);
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
                printLog("<br>You are in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!");
                updateStatus();
            }, 2500);
            return; 
        }
    } 
    else if (state.room === 1) {
        if (cmd === "use stick" && state.inventory.includes("stick")) {
            state.inventory = state.inventory.filter(item => item !== "stick"); 
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
                state.time = 60; // Final escape timer is 60 seconds
                state.isCutscene = false;
                
                printLog("<br><span class='danger'>You run to the garden! The vampire is right behind you! The heavy <button class='inline-item-btn' onclick='handleObjectClick(\"gate\")'>gate</button> is locked. You have 60 seconds!</span>");
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
    else if (state.room === 4) {
        if (cmd === "throw salt" && state.inventory.includes("salt") && !state.flags.isGhostGone) {
            state.inventory = state.inventory.filter(item => item !== "salt"); 
            state.flags.isGhostGone = true;
            printLog("You throw the salt at the ghost. The ghost screams and runs away! It drops a silver key.");
            printLog("There is a <button class='inline-item-btn' onclick='executeCommand(\"pick up silver key\")'>silver key</button> on the floor.");
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
            state.inventory = state.inventory.filter(item => item !== "flashlight"); 
            state.flags.isCellarLit = true;
            printLog("You turn on the flashlight. You can see now! Benji is in a <button class='inline-item-btn' onclick='handleObjectClick(\"cage\")'>cage</button>! The cage is locked.");
        } else if (cmd === "use key" && state.flags.isCellarLit && !state.flags.isCageOpen) {
            if (state.inventory.includes("silver key")) {
                state.inventory = state.inventory.filter(item => item !== "silver key"); 
                state.flags.isCageOpen = true;
                printLog("You unlock the cage! Benji jumps out. He scratches the wall. It is a secret door to the garden!");
            } else {
                printLog("<span class='danger'>The cage is locked. Benji is crying. You need a key.</span>");
            }
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else {
        printLog("You cannot do that here.");
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
            el.innerHTML = el.innerHTML.replace('<br><span style="color:#fbbf24; font-size:11px;">★ Current Location</span>', '');
        }
    });
    if (state.room >= 0) {
        const activeEl = document.getElementById(roomMap[state.room]);
        if (activeEl) {
            activeEl.style.borderColor = '#fbbf24';
            activeEl.style.background = '#261e19';
            activeEl.style.color = '#fff';
            activeEl.innerHTML += '<br><span style="color:#fbbf24; font-size:11px;">★ Current Location</span>';
        }
    }
    mapModal.style.display = 'flex';
}
function closeMap() { document.getElementById('map-modal').style.display = 'none'; }

function showHint() {
    const hintModal = document.getElementById('hint-modal');
    const hintText = document.getElementById('hint-text');
    let msg = "";

    if (state.room === 0) msg = "閉ざされた家に入るには、硬いものでガラスを砕く必要があるようだ……。";
    else if (state.room === 1 && !state.flags.isVampireChasing) msg = "屋敷の中は広く、様々な部屋に秘密が眠っている。周囲を探索してみよう。";
    else if (state.room === 1 && state.flags.isVampireChasing) msg = "背後から恐ろしい気配が迫る！一刻も早く外へ通じる門へ逃げ延びろ！";
    else if (state.room === 2 && !state.inventory.includes('salt')) msg = "台所のテーブルの上にある「塩」を拾いましょう。";
    else if (state.room === 3 && !state.inventory.includes('flashlight')) msg = "暗闇の寝室。足元を照らす光の導き手を探さなければならない。";
    else if (state.room === 4 && !state.flags.isGhostGone) msg = "何かを投げてゴーストを追い払いましょう。";
    else if (state.room === 4 && !state.inventory.includes('silver key')) msg = "静寂を取り戻した床に、銀色に光る鍵が残されている。";
    else if (state.room === 5 && !state.flags.isCellarLit) msg = "地下の闇は深くて何も見えない。明かりを灯さなければ愛犬の姿も見つからないだろう。";
    else if (state.room === 5 && !state.flags.isCageOpen) msg = "頑丈な檻に囚われた愛犬。その扉を開ける鍵はどこにあるのか？";
    else if (state.room === 6 && !state.inventory.includes('stick')) msg = "高く手が届かない場所にある物を落とすには、長くて頑丈な棒が役に立ちそうだ。";
    else if (state.room === 1 && state.inventory.includes('stick') && !state.inventory.includes('iron key')) msg = "高い絵画の上に何か重要なものが引っかかっている。手元にある長い道具を使えないか？";
    else if (state.flags.isVampireChasing && state.room === 6) msg = "重く閉ざされた鉄の門。手に入れた鍵で錠を開け、光の中へ脱出するのだ！";
    else msg = "周囲をよく観察し、隠された手がかりを探し出そう。";

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

    // Attach listener to all action verbs (Look at, Use, Throw)
    document.querySelectorAll('.toggle-verb').forEach(btn => {
        btn.addEventListener('click', (e) => handleVerbClick(e.target.getAttribute('data-verb')));
    });

    targetRowEl.addEventListener('click', handleTargetClick);
    
    inventoryContainerEl.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('.inventory-item');
        if (itemBtn) {
            handleInventoryClick(itemBtn.getAttribute('data-item'));
        }
    });

    if (timeParam && !isNaN(timeParam) && timeParam > 0) {
        // Player device mode: mute/remove sound so only admin device plays audio
        const bgAudio = document.getElementById('bg-audio');
        if (bgAudio) {
            bgAudio.pause();
            bgAudio.remove();
        }

        state.time = timeParam; 
        if (adminPanel) adminPanel.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'flex';
        
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
                    state.room = 0; 
                    state.isCutscene = true;
                    state.tutorialStep = 1;
                    renderTutorialOverlay();
                    updateStatus();
                    printLog("<br><br>Your dog, Benji, ran into this scary house. You hear him crying. The door is locked.");
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

    if (!state.running || state.cleared || !hasTimeParam || state.isCutscene) return;
    
    state.time--;
    const m = String(Math.floor(state.time / 60)).padStart(2, '0');
    const s = String(state.time % 60).padStart(2, '0');
    const timerEl = document.getElementById('timer');
    
    if (timerEl) {
        timerEl.innerText = `Timer: ${state.flags.isVampireChasing ? "00:" + s : m + ":" + s}`;
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
        
        if(targetRowEl) targetRowEl.innerHTML = '';
        if(navRowEl) navRowEl.innerHTML = '';
        uiState.activeVerb = null;
        document.querySelectorAll('.action-verb').forEach(b => b.classList.remove('selected'));
    }
}, 1000);