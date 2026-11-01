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
    const cleanUrl = window.location.href.split('?')[0].split('#')[0];
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
    room: -1,
    introStep: 1,
    tutorialStep: 0,
    tutorialOverlayActive: false,
    flags: {
        isGhostGone: false,
        isCellarLit: false,
        isCageOpen: false,
        isIronKeyFallen: false,
        isVampireAppearing: false,
        isVampireInHall: false,
        isVampireChasing: false,
        isWindowBreaking: false,
        isRockPickedUp: false,
        isSaltPickedUp: false,
        isFlashlightPickedUp: false,
        isSilverKeyPickedUp: false,
        isStickPickedUp: false
    },
    inventory: [], // Start without rock
    time: 600,
    running: true,
    cleared: false,
    isCutscene: true
};

// UI State
let uiState = {
    activeVerb: null,
    activeItem: null,
    activeTargetObject: null
};

let logEl, imageEl, targetRowEl, inventoryContainerEl, navRowEl;

const imageMap = {
    "GAME_OVER": "assets/game_over.webp",
    "WIN": "assets/win.webp",
    "-1-INTRO1": "assets/intro_1.webp",
    "-1-INTRO2": "assets/intro_2.webp",
    "-1-INTRO3": "assets/intro_3.webp",
    "0-START": "assets/porch.webp",
    "0-NO-ROCK": "assets/porch_no_rock.webp",
    "0-BREAKING": "assets/window_broken.webp",
    "1-NORMAL": "assets/foyer.webp",
    "1-GOT-KEY": "assets/got_key.webp",
    "1-CHASE": "assets/vampire.webp",
    "2-NORMAL": "assets/kitchen.webp",
    "2-NO-SALT": "assets/kitchen_no_salt.webp",
    "3-NORMAL": "assets/bedroom.webp",
    "3-NO-FLASHLIGHT": "assets/bedroom_no_flashlight.webp",
    "4-GHOST": "assets/library_ghost.webp",
    "4-CLEAR": "assets/library_clear.webp",
    "4-CLEAR-NO-KEY": "assets/library_clear_no_key.webp",
    "5-DARK": "assets/cellar_dark.webp",
    "5-LIT": "assets/cellar_lit.webp",
    "5-OPEN": "assets/cellar_open.webp",
    "6-NORMAL": "assets/garden.webp",
    "6-NO-STICK": "assets/garden_no_stick.webp",
    "6-CHASE": "assets/garden_chase.webp"
};

function getStateKey() {
    if (state.room === -1) return `-1-INTRO${state.introStep}`;
    if (state.flags.isVampireAppearing) return "1-GOT-KEY";
    if (state.flags.isVampireInHall) return "1-CHASE"; 
    if (state.flags.isVampireChasing) return "6-CHASE"; 
    if (state.flags.isWindowBreaking) return "0-BREAKING"; 
    if (state.room === 0) return state.flags.isRockPickedUp ? "0-NO-ROCK" : "0-START";
    if (state.room === 1) return "1-NORMAL";
    if (state.room === 2) return state.flags.isSaltPickedUp ? "2-NO-SALT" : "2-NORMAL";
    if (state.room === 3) return state.flags.isFlashlightPickedUp ? "3-NO-FLASHLIGHT" : "3-NORMAL";
    if (state.room === 4) return state.flags.isGhostGone ? (state.flags.isSilverKeyPickedUp ? "4-CLEAR-NO-KEY" : "4-CLEAR") : "4-GHOST";
    if (state.room === 5) {
        if (state.flags.isCageOpen) return "5-OPEN";
        if (state.flags.isCellarLit) return "5-LIT";
        return "5-DARK";
    }
    if (state.room === 6) return state.flags.isStickPickedUp ? "6-NO-STICK" : "6-NORMAL";
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

function removeFromInventory(itemName) {
    state.inventory = state.inventory.filter(item => item !== itemName);
}

function handleObjectClick(objectName) {
    if (!state.running || state.isCutscene) return;
    
    if (uiState.activeTargetObject === objectName) {
        uiState.activeTargetObject = null;
    } else {
        uiState.activeTargetObject = objectName;
        uiState.activeItem = null; 
    }
    
    updateInlineHighlights();
    syncLogHighlights();
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

    if (!state.tutorialOverlayActive || state.tutorialStep === 0) {
        tutorialEl.style.display = 'none';
        return;
    }

    tutorialEl.style.display = 'flex';
    let title = "";
    let desc = "";
    let btnHtml = "";

    if (state.tutorialStep === 1) {
        title = "【チュートリアル 1/5：観察する（LOOK AT）】";
        desc = "「LOOK AT」アクションは、部屋のオブジェクトや人物を調べてパズルのヒントを得るために使います。<br><br>上のテキスト内の黄色い文字「<span style='color:#fbbf24'>window</span>」を選択し、「Look at」アクションを選んでから「CONFIRM: LOOK AT WINDOW」ボタンを押して窓を調べてみましょう。";
        btnHtml = `<button onclick="closeTutorialOverlay()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">閉じる (Close)</button>`;
    } else if (state.tutorialStep === 2) {
        title = "【チュートリアル 2/5：拾う（PICK UP）】";
        desc = "「PICK UP」アクションは、パズルを解くためのアイテムをインベントリ（持ち物）に追加するために使います。<br><br>テキスト内の「<span style='color:#fbbf24'>rock</span>」を選択し、「Pick Up」アクションを選んでから「CONFIRM: PICK UP ROCK」を押して石を拾いましょう。";
        btnHtml = `<button onclick="closeTutorialOverlay()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">閉じる (Close)</button>`;
    } else if (state.tutorialStep === 3) {
        title = "【チュートリアル 3/5：使う・投げる（USE / THROW）】";
        desc = "「USE（使う）」や「THROW（投げる）」アクションは、インベントリのアイテムと組み合わせてパズルを解くために使います。<br><br>インベントリに追加された「rock」を選択し、「Throw」アクションを選んでから「CONFIRM: THROW ROCK」を押し、窓を割って中に入りましょう！";
        btnHtml = `<button onclick="closeTutorialOverlay()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">閉じる (Close)</button>`;
    } else if (state.tutorialStep === 4) {
        title = "【チュートリアル 4/5：部屋の移動（GO TO）】";
        desc = "画面中央にある「Go to ○○」ボタンを押すと、繋がっている別の部屋へ移動できます。<br><br>大広間（Hall）からは台所、寝室、図書室、地下室などへ向かうことができます。怪しい部屋を自由に探索してみましょう。";
        btnHtml = `<button onclick="nextTutorialStep()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">次へ (Next) ➔</button>`;
    } else if (state.tutorialStep === 5) {
        title = "【チュートリアル 5/5：ヒントとマップ（HINT / MAP）】";
        desc = "画面下部にある「Hint」ボタンを押すと、次にするべきことのヒントが表示されます。「Map」ボタンを押すと、現在の居場所や屋敷の間取りを確認できます。<br><br>これでチュートリアルは全て終了です。屋敷を探索し、愛犬ベンジを救出しましょう！";
        btnHtml = `<button onclick="closeTutorialOverlay()" style="background: #b45309; color: #fff; border: 1px solid #fbbf24; padding: 10px 24px; font-weight: bold; cursor: pointer; border-radius: 4px; font-family: monospace;">ゲーム開始 (Start)</button>`;
    }

    tutorialEl.innerHTML = `
        <div style="background: #1c1917; border: 2px solid #fbbf24; padding: 24px; max-width: 450px; text-align: center; border-radius: 8px; color: #fef3c7;">
            <h3 style="color: #fbbf24; margin-top: 0; font-size: 18px;">${title}</h3>
            <p style="font-size: 14px; line-height: 1.6; color: #d6d3d1; margin-bottom: 24px;">${desc}</p>
            ${btnHtml}
        </div>
    `;
}

window.nextTutorialStep = function() {
    state.tutorialStep = 5;
    renderTutorialOverlay();
};

window.closeTutorialOverlay = function() {
    state.tutorialOverlayActive = false;
    if (state.tutorialStep >= 4) state.tutorialStep = 0;
    renderTutorialOverlay();
};

function syncLogHighlights() {
    if (!logEl) return;
    logEl.classList.remove('highlight-pickup', 'highlight-look', 'highlight-interact');
    if (uiState.activeVerb === 'pick up') logEl.classList.add('highlight-pickup');
    else if (uiState.activeVerb === 'look at') logEl.classList.add('highlight-look');
    else if (uiState.activeVerb === 'use' || uiState.activeVerb === 'throw') logEl.classList.add('highlight-interact');
}

function updateStatus() {
    if (inventoryContainerEl) {
        if (state.inventory.length === 0) {
            inventoryContainerEl.innerHTML = '<span style="color:#6b7280; font-size:14px; font-style:italic;">Inventory empty</span>';
        } else {
            inventoryContainerEl.innerHTML = state.inventory.map(item => {
                const isSelected = uiState.activeItem === item ? 'selected' : '';
                return `<div class="inventory-item ${isSelected}" data-item="${item}" style="color:${isSelected ? '#fff' : '#00FFFF'};">
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
    syncLogHighlights();
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
        if (uiState.activeVerb === 'use' && uiState.activeItem) {
            targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#ef4444; border-color:#fbbf24; color:#fff; font-weight:bold;">CONFIRM: USE ${uiState.activeItem.toUpperCase()}</button>`;
        } else if (uiState.activeVerb === 'use') {
             targetRowEl.innerHTML = '<span style="color:#ef4444; font-size:12px; font-weight:bold;">インベントリから鍵（key）を選択してください！</span>';
        } else if (uiState.activeItem) {
             targetRowEl.innerHTML = '<span style="color:#ef4444; font-size:12px; font-weight:bold;">USE（使う）アクションを選択してください！</span>';
        } else {
             targetRowEl.innerHTML = '<span style="color:#ef4444; font-size:12px; font-weight:bold;">そんな時間はない！早く門（gate）を開けろ！</span>';
        }
        return;
    }

    const target = uiState.activeItem || uiState.activeTargetObject;

    if (uiState.activeVerb && target) {
        targetRowEl.innerHTML = `<button class="target-noun execute-action" style="background:#b45309; border-color:#fbbf24;">CONFIRM: ${uiState.activeVerb.toUpperCase()} ${target.toUpperCase()}</button>`;
        return;
    }

    if (uiState.activeVerb && !target) {
        targetRowEl.innerHTML = `<span style="color: #fbbf24; font-size: 12px;">${uiState.activeVerb.toUpperCase()} する対象を選択してください。</span>`;
        return;
    }

    if (!uiState.activeVerb && target) {
        targetRowEl.innerHTML = `<span style="color: #fbbf24; font-size: 12px;">${target.toUpperCase()} に対するアクションを選択してください。</span>`;
        return;
    }

    targetRowEl.innerHTML = '<span style="color: #6b7280; font-size: 12px;">アクションと対象（ターゲット）を選択してください。</span>';
}

function handleVerbClick(verb) {
    if (!state.running || state.isCutscene) return;
    
    if (uiState.activeVerb === verb) {
        uiState.activeVerb = null;
    } else {
        uiState.activeVerb = verb;
        if (verb === 'look at' || verb === 'pick up') {
            uiState.activeItem = null;
        } else {
            uiState.activeTargetObject = null;
        }
    }
    
    document.querySelectorAll('.toggle-verb').forEach(btn => {
        btn.classList.toggle('selected', btn.getAttribute('data-verb') === uiState.activeVerb);
    });
    
    syncLogHighlights();
    updateStatus();
}

function handleInventoryClick(item) {
    if (!state.running || state.isCutscene) return;
    
    uiState.activeTargetObject = null;
    uiState.activeItem = (uiState.activeItem === item) ? null : item;
    
    syncLogHighlights();
    updateStatus();
}

function handleTargetClick(e) {
    if (!state.running || state.isCutscene) return;
    const targetBtn = e.target.closest('.execute-action');
    if (targetBtn) {
        if (uiState.activeVerb && uiState.activeTargetObject) {
            executeCommand(`${uiState.activeVerb} ${uiState.activeTargetObject}`);
        } else if (uiState.activeVerb && uiState.activeItem) {
            executeCommand(`${uiState.activeVerb} ${uiState.activeItem}`);
        }
    }
}

window.executeCommand = function(rawCmd, forcedTargetRoom = -1) {
    if (!state.running || state.isCutscene) return;

    printLog(`<br>> ${rawCmd}`);
    let cmd = rawCmd.toLowerCase();
    
    uiState.activeVerb = null;
    uiState.activeItem = null;
    uiState.activeTargetObject = null;
    document.querySelectorAll('.toggle-verb').forEach(b => b.classList.remove('selected'));
    updateInlineHighlights();
    syncLogHighlights();

    if (cmd === "use iron key" || cmd === "use silver key") cmd = "use key";
    if (cmd === "use salt") cmd = "throw salt"; 

    if (cmd.startsWith("look at ")) {
        let obj = cmd.replace("look at ", "").trim();
        const hints = {
            "picture": "Look up. Something is on the picture.",
            "key": "You need a long tool to get the key.",
            "salt": "It is white and small. Good for food... or ghosts.",
            "flashlight": "It is a flashlight. Good for seeing in the dark.",
            "ghost": "It is scary! It does not like white powder.",
            "cage": "Benji is inside! The door is locked with a key.",
            "stick": "A long wood branch on the ground.",
            "gate": "The gate is locked. You need a key.",
            "window": "You need something to break the window.",
            "rock": "It is hard and heavy. Good for throwing."
        };
        
        if (hints[obj]) {
            printLog(`<span style="color: #fbbf24; font-style: italic;">💡 You look at the ${obj}: "${hints[obj]}"</span>`);
        } else {
            printLog("You see nothing special about that.");
        }
        
        if (obj === "window" && state.tutorialStep === 1) {
            setTimeout(() => {
                state.tutorialStep = 2;
                state.tutorialOverlayActive = true;
                renderTutorialOverlay();
            }, 800);
        }
        updateStatus();
        return;
    }

    // Default any command on the key in the hall to the Japanese hint
    if (state.room === 1 && !state.flags.isIronKeyFallen && (cmd.endsWith(" key") || cmd === "key")) {
        printLog('<span style="color: #fbbf24; font-style: italic;">💡 鍵を調べた：「絵画の上にあって手が届かない。何か長い道具が必要だ……」</span>');
        updateStatus();
        return;
    }

    if (state.flags.isVampireChasing) {
        if ((cmd === "use key" || cmd === "use iron") && (state.inventory.includes("iron key") || state.inventory.includes("key"))) {
            removeFromInventory("iron key");
            removeFromInventory("key");
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

    if (cmd === "look") {
        if (state.room === 0) printLog("You are on the porch. The door is locked. There is a <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"window\")'>window</button> here." + (!state.flags.isRockPickedUp ? " A <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"rock\")'>rock</button> is on the ground." : ""));
        else if (state.room === 1) printLog("You are in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!");
        else if (state.room === 2) printLog("You are in the kitchen. It is very dirty." + (!state.flags.isSaltPickedUp ? " There is a bowl of <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"salt\")'>salt</button> on the table." : ""));
        else if (state.room === 3) printLog("You are in the bedroom. It is very dusty." + (!state.flags.isFlashlightPickedUp ? " There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"flashlight\")'>flashlight</button> on the bed." : ""));
        else if (state.room === 4) printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.flags.isSilverKeyPickedUp ? "There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"silver key\")'>silver key</button> on the floor." : "The room is quiet now.")) : "You are in the library. A scary <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"ghost\")'>ghost</button> is here!");
        else if (state.room === 5) printLog(state.flags.isCellarLit ? "You are in the cellar. Benji is in a <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"cage\")'>cage</button>!" : "You are in the cellar. It is pitch black. You cannot see.");
        else if (state.room === 6) printLog("You are in a dark garden. The iron <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"gate\")'>gate</button> is locked." + (!state.flags.isStickPickedUp ? " There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"stick\")'>long stick</button> next to the gate." : ""));
        updateStatus();
        return;
    }

    if (cmd.includes("walk to")) {
        if (state.room === 0) {
            printLog("The door is locked. You cannot walk in.");
            updateStatus();
            return;
        }

        if (forcedTargetRoom === 1) {
            state.room = 1;
            printLog("You are back in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!", true);
        } else if (state.room === 1) { 
            if (forcedTargetRoom === 2) { state.room = 2; printLog("You are in the kitchen. It is very dirty." + (!state.flags.isSaltPickedUp ? " There is a bowl of <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"salt\")'>salt</button> on the table." : ""), true); }
            else if (forcedTargetRoom === 3) { state.room = 3; printLog("You are in the bedroom. It is very dusty." + (!state.flags.isFlashlightPickedUp ? " There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"flashlight\")'>flashlight</button> on the bed." : ""), true); }
            else if (forcedTargetRoom === 4) { state.room = 4; printLog(state.flags.isGhostGone ? ("You are in the library. " + (!state.flags.isSilverKeyPickedUp ? "There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"silver key\")'>silver key</button> on the floor." : "The room is empty.")) : "You are in the library. A scary <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"ghost\")'>ghost</button> is here!", true); }
            else if (forcedTargetRoom === 5) { state.room = 5; printLog(state.flags.isCellarLit ? (state.flags.isCageOpen ? "You are in the cellar. The cage is open. There is a secret door here." : "You are in the cellar. Benji is in a <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"cage\")'>cage</button>! The cage is locked.") : "You are in the cellar. It is pitch black. You cannot see. You need a light.", true); }
        } else if (state.room === 5 && forcedTargetRoom === 6 && state.flags.isCageOpen) {
            state.room = 6;
            printLog("You open the door and go outside. You are in a dark garden. The iron <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"gate\")'>gate</button> is locked." + (!state.flags.isStickPickedUp ? " There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"stick\")'>long stick</button> next to the gate." : ""), true);
        } else {
            printLog("You can only walk back to the hall from here.");
        }
        updateStatus();
        return;
    }

    if (cmd.includes("pick up")) {
        if (cmd === "pick up salt" && state.room === 2 && !state.flags.isSaltPickedUp) {
            state.inventory.push("salt"); state.flags.isSaltPickedUp = true; printLog("You picked up the salt. The table is empty.");
        } else if (cmd === "pick up flashlight" && state.room === 3 && !state.flags.isFlashlightPickedUp) {
            state.inventory.push("flashlight"); state.flags.isFlashlightPickedUp = true; printLog("You picked up the flashlight. The bed is empty.");
        } else if (cmd === "pick up silver key" && state.room === 4 && state.flags.isGhostGone && !state.flags.isSilverKeyPickedUp) {
            state.inventory.push("silver key"); state.flags.isSilverKeyPickedUp = true; printLog("You picked up the silver key. The floor is empty.");
        } else if (cmd === "pick up stick" && state.room === 6 && !state.flags.isStickPickedUp) {
            state.inventory.push("stick"); state.flags.isStickPickedUp = true; printLog("You picked up the long stick.");
        } else if (cmd === "pick up rock" && state.room === 0 && !state.flags.isRockPickedUp) {
            state.inventory.push("rock"); state.flags.isRockPickedUp = true; printLog("You picked up the rock. The porch is empty.");
            if (state.tutorialStep === 2) {
                setTimeout(() => {
                    state.tutorialStep = 3;
                    state.tutorialOverlayActive = true;
                    renderTutorialOverlay();
                }, 800);
            }
        } else {
            printLog("You cannot pick that up here.");
        }
        updateStatus();
        return;
    }

    if (state.room === 0 && cmd.includes("throw rock")) {
        if (state.inventory.includes("rock")) {
            removeFromInventory("rock");
            state.isCutscene = true;
            state.flags.isWindowBreaking = true;
            state.tutorialStep = 4;
            state.tutorialOverlayActive = false;
            
            printLog("You throw the rock and break the window. You enter the house...", true);
            updateStatus();
            
            setTimeout(() => {
                state.flags.isWindowBreaking = false;
                state.room = 1;
                state.isCutscene = false;
                printLog("<br>You are in the hall. It is dark and cold. There is a tall <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"picture\")'>picture</button> on the wall. A heavy iron <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"key\")'>key</button> is on top of it!");
                state.tutorialOverlayActive = true;
                renderTutorialOverlay();
                updateStatus();
            }, 2500);
            return; 
        }
    } 
    else if (state.room === 1) {
        if (cmd === "use stick" && state.inventory.includes("stick")) {
            removeFromInventory("stick");
            state.inventory.push("iron key");
            state.flags.isIronKeyFallen = true;
            
            state.isCutscene = true; 
            state.flags.isVampireAppearing = true;
            state.flags.isVampireInHall = false;
            
            printLog("You use the stick. The iron key falls! You have the key!", true);
            syncLogHighlights();
            updateStatus();
            
            // Phase 1: Reveal the Vampire in the Hall
            setTimeout(() => {
                state.flags.isVampireAppearing = false;
                state.flags.isVampireInHall = true;
                printLog("<br><br><span class='danger'>Suddenly, a vampire runs down the stairs! He has big teeth!</span>");
                syncLogHighlights();
                updateStatus();
                
                // Phase 2: Run to the Garden Chase
                setTimeout(() => {
                    state.flags.isVampireInHall = false;
                    state.room = 6;
                    state.flags.isVampireChasing = true;
                    state.time = 60;
                    state.isCutscene = false;
                    
                    printLog("<br><br><span class='danger'>You run to the garden! The vampire is right behind you! The heavy <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"gate\")'>gate</button> is locked. You have 60 seconds!</span>");
                    const timerEl = document.getElementById('timer');
                    if (timerEl) {
                        timerEl.style.color = '#ef4444';
                        timerEl.style.fontWeight = 'bold';
                    }
                    syncLogHighlights();
                    updateStatus();
                }, 2500);
            }, 1800);
            return; 
        } else if (cmd.includes("throw")) {
            printLog("Throwing that here won't help you.");
        } else {
            printLog("That doesn't seem to work here.");
        }
    }
    else if (state.room === 4) {
        if (cmd === "throw salt" && state.inventory.includes("salt") && !state.flags.isGhostGone) {
            removeFromInventory("salt");
            state.flags.isGhostGone = true;
            printLog("You throw the salt at the ghost. The ghost screams and runs away! It drops a silver key.");
            printLog("There is a <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"silver key\")'>silver key</button> on the floor.");
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
            removeFromInventory("flashlight");
            state.flags.isCellarLit = true;
            printLog("You turn on the flashlight. You can see now! Benji is in a <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"cage\")'>cage</button>! The cage is locked.");
        } else if (cmd === "use key" && state.flags.isCellarLit && !state.flags.isCageOpen) {
            if (state.inventory.includes("silver key")) {
                removeFromInventory("silver key");
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

    syncLogHighlights();
    updateStatus();
};


// --- Map & Hint Handlers ---
window.showMap = function() {
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
};
window.closeMap = function() { document.getElementById('map-modal').style.display = 'none'; };

window.showHint = function() {
    const hintModal = document.getElementById('hint-modal');
    const hintText = document.getElementById('hint-text');
    let msg = "";

    if (state.room === 0) msg = "閉ざされた家に入るには、硬いものでガラスを砕く必要があるようだ……。";
    else if (state.room === 1 && !state.flags.isVampireChasing && !state.flags.isIronKeyFallen) msg = "高い絵画の上に鍵が見えるが、手では届きそうにない。どこかに届くような長い道具はないだろうか……？";
    else if (state.room === 1 && !state.flags.isVampireChasing) msg = "屋敷の中は広く、様々な部屋に秘密が眠っている。周囲を探索してみよう。";
    else if (state.room === 1 && state.flags.isVampireChasing) msg = "背後から恐ろしい気配が迫る！一刻も早く外へ通じる門へ逃げ延びろ！";
    else if (state.room === 2 && !state.flags.isSaltPickedUp) msg = "台所のテーブルの上にある「塩」を拾いましょう。";
    else if (state.room === 3 && !state.flags.isFlashlightPickedUp) msg = "暗闇の寝室。足元を照らす光の導き手を探さなければならない。";
    else if (state.room === 4 && !state.flags.isGhostGone) msg = "何かを投げてゴーストを追い払いましょう。";
    else if (state.room === 4 && !state.flags.isSilverKeyPickedUp) msg = "静寂を取り戻した床に、銀色に光る鍵が残されている。";
    else if (state.room === 5 && !state.flags.isCellarLit) msg = "地下の闇は深くて何も見えない。明かりを灯さなければ愛犬の姿も見つからないだろう。";
    else if (state.room === 5 && !state.flags.isCageOpen) msg = "頑丈な檻に囚われた愛犬。その扉を開ける鍵はどこにあるのか？";
    else if (state.room === 6 && !state.flags.isStickPickedUp) msg = "高く手が届かない場所にある物を落とすには、長くて頑丈な棒が役に立ちそうだ。";
    else if (state.room === 1 && state.inventory.includes('stick') && !state.inventory.includes('iron key')) msg = "高い絵画の上に何か重要なものが引っかかっている。手元にある長い道具を使えないか？";
    else if (state.flags.isVampireChasing && state.room === 6) msg = "重く閉ざされた鉄の門。手に入れた鍵で錠を開け、光の中へ脱出するのだ！";
    else msg = "周囲をよく観察し、隠された手がかりを探し出そう。";

    if (hintText && hintModal) {
        hintText.innerText = msg;
        hintModal.style.display = 'flex';
    }
};
window.closeHint = function() { document.getElementById('hint-modal').style.display = 'none'; };


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
                    state.isCutscene = false; // Player needs to interact
                    state.tutorialStep = 1;
                    state.tutorialOverlayActive = true;
                    renderTutorialOverlay();
                    updateStatus();
                    printLog("<br><br>Your dog, Benji, ran into this scary house. You hear him crying. The door is locked. There is a <button class='inline-item-btn' data-interact='true' onclick='handleObjectClick(\"window\")'>window</button> here. A <button class='inline-item-btn' data-pickup='true' onclick='handleObjectClick(\"rock\")'>rock</button> is on the ground.");
                }, 3000);
            }, 3000);
        }, 3000);

    } else {
        if (adminPanel) adminPanel.style.display = 'block';
        if (gamePanel) gamePanel.style.display = 'none';
    }
});

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