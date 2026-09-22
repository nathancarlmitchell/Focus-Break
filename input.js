// Focus Break -- the input. What is held and what a press does: the keys and mouse buttons, the touch fingers and
// which of them steers, the on-screen touch buttons and their drawing, the pause and the touch resume countdown, the
// input mode that follows the last real input, and the listeners that feed all of it, which gameArea.load binds once
// through bindInput. FOCUS BREAK.html loads this with a plain <script src> before its own script, as globals rather
// than modules, so the game still opens straight off disk. Nothing here runs at load beyond the tables and one
// matchMedia question.
//
// It reaches into the powers (setSlowSpeed, setFastSpeed, setBreak, powerAllowed), the menus (buttonAt, openMenu,
// closeMenu, menuPress, cycleSetting), the level flow (startGame, restartRun), the loop (gameArea) and the paused
// redraw (drawLevel); the game reaches back for canAct, setPause, applyHeldSpeed, touchButtons and drawTouchControls.

// power inputs currently held down, so releasing one can fall back to another (tfocus/twarp: the touch buttons)
var held = { shift: false, ctrl: false, lmb: false, rmb: false, tfocus: false, twarp: false };

// Input: the mouse (with keyboard) or touch. inputMode follows the last real input and picks the labels and controls.
var inputMode = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ? "touch" : "mouse";
var lastTouchTime = 0; // when the last touch event arrived; mouse events a browser makes up after a touch are ignored
var activeTouches = 0; // fingers down
var TOUCH_GAIN = 1.25; // touch steering: the square moves 1.25px for each px the steering finger moves
var TOUCH_SIDE = "right"; // which edge the power buttons and the pause icon sit against: where they always were
var touch = { steerId: null, lastX: 0, lastY: 0, roles: {}, order: 0 }; // what each finger is doing, and which one steers
var resumeTimer = null; // the 3-2-1 countdown after a touch resume
var pauseNo = 0; // counts pauses (and cut-short countdowns): a finger lifted during the pause it came down in resumes
var layoutClick = false; // this mouse press switched the start screen to the mouse layout; its click only shows it
var rotated = false; // a phone or tablet held upright: the game is drawn turned a quarter clockwise, so it always plays landscape

function canAct() { // powers only work while playing, unpaused, and past the pre-roll -- a Focus over an
    // empty field would spend a rationed activation and burn a graze charge for nothing
    return alive && !pause && !inGrace();
}

function setPause(paused) { // pause or resume play; only while alive
    if (paused && pause && stopResume()) { // pausing during a touch resume countdown stops it: show the panel again
        drawPauseScreen();
        return;
    }
    if (!alive || paused == pause) {
        return;
    }
    if (!paused && menuUp()) { // the instructions are up over this pause and own the screen: nothing resumes under
        return; // them, not P and not a touch countdown, or the level would run unseen until BACK put the panel back
    }
    cancelResume();
    pause = paused;
    gameArea.canvas.style.cursor = pause ? "default" : "none"; // let the player line the cursor back up with their square
    if (pause) {
        pauseStart = Date.now();
        pauseNo++;
        // nothing is silenced here any more: the album plays through a pause, and so does whatever sound was
        // mid-way. Only the rate goes back to normal, because a track left pitched down by Focus or up by Warp
        // would drone at that speed for as long as the pause lasts. applyHeldSpeed puts it back on the way out
        setMusicRate(1.0);
        drawPauseScreen();
    } else { // exclude paused time from the completion timer, and from the level's split
        startTime += Date.now() - pauseStart;
        levelStart += Date.now() - pauseStart;
        applyHeldSpeed(); // pick up anything pressed or released while paused, and with it the music's rate
    }
}

function releaseAll() { // the player went away (window blur, app switch, a system gesture): let go of everything and pause
    held.shift = held.ctrl = held.lmb = held.rmb = held.tfocus = held.twarp = false;
    touch.roles = {};
    touch.steerId = null;
    applyHeldSpeed();
    setPause(true); // this also stops a resume countdown
}

function cancelResume() { // stop a touch resume countdown
    if (resumeTimer) {
        clearTimeout(resumeTimer);
        resumeTimer = null;
    }
}

function stopResume() { // a touch resume countdown was cut short: stay paused and wait for a new tap
    if (!resumeTimer) {
        return false;
    }
    cancelResume();
    pauseNo++; // fingers already down don't count as that tap
    return true;
}

function startResumeCountdown() { // touch resume: 3, 2, 1 (400ms each), so the player can put their thumbs down first
    if (resumeTimer || !pause || !alive || menuUp()) { // no 3-2-1 over the instructions: setPause would refuse the
        return; // resume at the end of it anyway
    }
    var n = 3;
    var beat = function () {
        resumeTimer = null;
        if (!pause || !alive) {
            return;
        }
        if (n == 0) {
            setPause(false);
            return;
        }
        drawPauseScreen(n);
        n -= 1;
        resumeTimer = setTimeout(beat, 400);
    };
    beat();
}

function drawPauseScreen(countdown) { // drawn once over the frozen frame; countdown is the touch resume's 3-2-1
    if (inputMode == "touch") {
        drawTouchPauseScreen(countdown);
        return;
    }
    useBand(PAUSE_BAND); // the panel, not the whole frame, which on a small window shrank it along with the 800px
    // of height it never used
    var centerX = LAYOUT_W / 2;
    var centerY = LAYOUT_H / 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "white";
    ctx.fillRect(centerX - 220, centerY - 70, 440, 160);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "center";
    ctx.fillStyle = "red";
    ctx.font = "60px Arial";
    ctx.fillText("PAUSED", centerX, centerY);
    ctx.fillStyle = "black";
    ctx.font = "25px Arial";
    ctx.fillText("P to resume,  H for instructions", centerX, centerY + 40);
    ctx.font = "18px Arial";
    ctx.fillText("Move the cursor onto your square first", centerX, centerY + 72);
    ctx.textAlign = "start"; // the rest of the game draws left-aligned text
    useWindow();
}

function drawTouchPauseScreen(countdown) { // touch play: tap anywhere to resume (steering is relative, so nothing to line up)
    drawLevel(); // a clean frame under the panel: no hint or power message left over from the last one
    useBand(TOUCH_PAUSE_BAND);
    var centerX = LAYOUT_W / 2;
    var centerY = LAYOUT_H / 2;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "white";
    ctx.fillRect(centerX - 280, centerY - 120, 560, 240);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "center";
    ctx.fillStyle = "red";
    if (countdown) {
        ctx.font = "140px Arial";
        ctx.fillText(countdown, centerX, centerY + 50);
    } else {
        ctx.font = "72px Arial";
        ctx.fillText("PAUSED", centerX, centerY - 40);
        ctx.fillStyle = "black";
        ctx.font = "40px Arial";
        ctx.fillText("TAP TO RESUME", centerX, centerY + 18);
        ctx.font = "24px Arial";
        ctx.fillText("Your square stays put. Drag to steer.", centerX, centerY + 56);
        var h = PAUSE_HELP; // the one tap here that does something other than resume
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(centerX + h.dx, centerY + h.dy, h.w, h.h);
        ctx.fillStyle = "black";
        ctx.fillRect(centerX + h.dx + 2, centerY + h.dy + 2, h.w - 4, h.h - 4);
        ctx.fillStyle = "#ff00ff";
        ctx.font = "26px Arial";
        ctx.fillText("HELP 説明", centerX + h.dx + h.w / 2, centerY + h.dy + h.h / 2 + 9, h.w - 12);
    }
    ctx.textAlign = "start";
    useWindow();
}

function applyHeldSpeed() { // set speed from whatever power is still held
    if (!canAct()) {
        return;
    }
    var want = (held.shift || held.lmb || held.tfocus) ? "focus"
        : (held.ctrl || held.rmb || held.twarp) ? "warp" : "";
    if (want && !powerAllowed(want)) {
        want = ""; // rationed out: falling back to a held power still counts as starting one
    }
    if (want == "focus") {
        setSlowSpeed();
    } else if (want == "warp") {
        setFastSpeed();
    } else {
        resumeSpeed();
    }
}

const POWER_OF = { shift: "focus", lmb: "focus", tfocus: "focus", ctrl: "warp", rmb: "warp", twarp: "warp" };

function pressPower(input, activate) { // a power key or button went down: remember it, and use it now if playing
    held[input] = true;
    if (canAct() && powerAllowed(POWER_OF[input])) {
        activate(); // the pressed one wins over one already held, which is how it has always behaved
    }
}

function keyName(e) { // the game key pressed: "p", "r", " " (space), "Shift", "Control", or something else
    var key = e.key === "Spacebar" ? " " : e.key; // old Edge/IE called space "Spacebar"
    if (key && key.length == 1 && /[a-z ]/i.test(key)) {
        return key.toLowerCase(); // letters as typed, so Shift+P or Caps Lock still works
    }
    if (key == "Shift" || key == "Control") {
        return key;
    }
    // anything else: an older browser without e.key, a non-Latin keyboard layout (including letters outside the
    // basic character range, like ADLaM), a layout-switch key such as "GroupNext", or a tool that leaves key empty
    return { 16: "Shift", 17: "Control", 32: " ", 80: "p", 82: "r" }[e.keyCode] || key;
}

function tryBreak() { // Space or middle click
    if (canAct() && !invincible && powerAllowed("break")) { // a Break while one is running was never a second one
        setBreak(scorePenalty);
    }
}

function setInputMode(mode) { // switch between mouse and touch play, redrawing whatever shows labels or controls
    if (mode == inputMode) {
        return;
    }
    inputMode = mode;
    if (!gameStart) {
        drawStartScreen();
    } else if (alive && pause) {
        stopResume();
        if (menuUp()) { // the instructions are up over the pause: redraw them, in the wording for this input,
            drawStartScreen(); // rather than paint the level and the panel over them
        } else {
            drawLevel();
            drawPauseScreen();
        }
    } else if (alive && mode == "mouse") {
        drawLevel(); // without the touch controls
        setPause(true); // the cursor is somewhere else: pause so the player can line it up with the square
    }
}

function screenUpright() { // the device is held upright (a tall window alone could be split screen on a landscape tablet)
    var type = window.screen && screen.orientation && screen.orientation.type;
    if (type) {
        return type.indexOf("portrait") == 0;
    }
    if (typeof window.orientation == "number") { // older iOS Safari
        return window.orientation % 180 == 0;
    }
    return true;
}

function toGame(sx, sy) { // a window point (clientX/Y or pageX/Y) in game coordinates; they differ only while the game is turned
    return rotated ? { x: sy, y: gameArea.canvas.height - sx } : { x: sx, y: sy };
}

function touchEcho(e) { // a mouse event the browser made up after a touch
    return Date.now() - lastTouchTime < 800 || !!(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents);
}

var touchLayout = null; // touchButtons' last answer. It is asked for three or four times a painted frame in touch play
                        // (the level name, the grid, the controls, the graze blades) and once per touch event, and the
                        // answer only moves on a resize or in the settings, so it is kept until one of those

function touchButtons() { // the on-screen power buttons for touch play, in window pixels (worked out from the window size)
    var W = gameArea.canvas.width;
    var H = gameArea.canvas.height;
    var was = touchLayout;
    if (was && was.w == W && was.h == H && was.side == TOUCH_SIDE) {
        return was; // nothing that places them has changed. Every caller reads it; none writes to it
    }
    var u = Math.min(W, H);
    var big = Math.max(64, Math.min(96, 0.22 * u)) / 2; // radii
    var small = Math.max(56, Math.min(80, 0.17 * u)) / 2;
    var gap = 16;
    var focus = { x: W - 20 - big, y: H - 24 - big, r: big }; // FOCUS in the corner, where the thumb rests
    var brk, warp;
    if (W >= H) { // landscape: BREAK to its left, WARP above it
        brk = { x: focus.x - big - gap - small, y: H - 24 - small, r: small };
        warp = { x: focus.x, y: focus.y - big - gap - small, r: small };
    } else { // portrait: a column up the right edge, where obstacles come in
        brk = { x: focus.x, y: focus.y - big - gap - small, r: small };
        warp = { x: focus.x, y: brk.y - small - gap - small, r: small };
    }
    var tb = { tfocus: focus, twarp: warp, "break": brk, side: TOUCH_SIDE,
        pause: { x: W - 12 - 48, y: 12, w: 48, h: 48 } };
    if (TOUCH_SIDE == "left") { // laid out against the right edge as it always was, then mirrored whole, so the
        [focus, warp, brk].forEach(function (c) { c.x = W - c.x; }); // two hands get the same reach and spacing
        tb.pause.x = W - tb.pause.x - tb.pause.w;
    }
    var pad = 14;
    // the cluster's footprint, which everything else keeps out of: the level name, the grid's gutter, a graze
    // blade, and the quick reject in touchButtonAt. It runs to the bottom of the window on whichever side it is
    tb.box = {
        left: TOUCH_SIDE == "left" ? 0 : Math.min(focus.x - focus.r, brk.x - brk.r, warp.x - warp.r) - pad,
        right: TOUCH_SIDE == "left" ? Math.max(focus.x + focus.r, brk.x + brk.r, warp.x + warp.r) + pad : W,
        top: Math.min(warp.y - warp.r, brk.y - brk.r, focus.y - focus.r) - pad,
    };
    tb.w = W; // what it was worked out for, so the next call can tell whether it still holds
    tb.h = H;
    touchLayout = tb;
    return tb;
}

function touchButtonAt(px, py) { // "tfocus", "twarp", "break", "pause" or "" for a touch at a window point
    var tb = touchButtons();
    var p = tb.pause;
    if (px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h) {
        return "pause";
    }
    if (px < tb.box.left || px > tb.box.right || py < tb.box.top) {
        return "";
    }
    var best = "";
    var bestDistance = Infinity;
    ["tfocus", "break", "twarp"].forEach(function (name) { // anywhere near the cluster counts as its nearest button
        var d = Math.sqrt(Math.pow(px - tb[name].x, 2) + Math.pow(py - tb[name].y, 2));
        if (d < bestDistance) {
            bestDistance = d;
            best = name;
        }
    });
    return best;
}

function drawTouchControls() { // touch play: the power buttons and pause icon, over the obstacles and under the square
    if (inputMode != "touch" || !alive) {
        return;
    }
    var tb = touchButtons();
    ctx.save();
    useWindow();
    [["tfocus", "FOCUS", "#00FFFF", held.tfocus], ["twarp", "WARP", "#ff0000", held.twarp], ["break", "BREAK", "#FFD700", false]].forEach(function (b) {
        var c = tb[b[0]];
        ctx.globalAlpha = b[3] ? 0.45 : (b[0] == "break" && invincible ? 0.06 : 0.15);
        ctx.fillStyle = b[2];
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9; // a white halo, then a colored ring, so the buttons show on white and on black columns
        ctx.lineWidth = 5;
        ctx.strokeStyle = "white";
        ctx.stroke();
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 3;
        ctx.strokeStyle = b[2];
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.font = "bold " + Math.round(0.4 * c.r) + "px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3; // a white outline keeps the label readable over a black column
        ctx.strokeStyle = "white";
        ctx.strokeText(b[1], c.x, c.y);
        ctx.fillStyle = "#222";
        ctx.fillText(b[1], c.x, c.y);
    });
    if (invincible) { // BREAK's ring drains as the break runs out
        var c = tb["break"];
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#FFD700";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - invincibleTime / invincibleTimeMax));
        ctx.stroke();
    }
    var p = tb.pause; // pause icon: two bars, outlined in white like the labels
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "white";
    ctx.fillRect(p.x + 12, p.y + 8, 11, 32);
    ctx.fillRect(p.x + 25, p.y + 8, 11, 32);
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = "black";
    ctx.fillRect(p.x + 14, p.y + 10, 7, 28);
    ctx.fillRect(p.x + 27, p.y + 10, 7, 28);
    ctx.restore();
}

function steerBy(dx, dy) { // touch steering is relative: move the square's target by the finger's movement
    if (gameArea.x === undefined) { // no target yet: start from where the square is
        gameArea.x = gamePiece.x + gamePiece.width / 2;
        gameArea.y = gamePiece.y + gamePiece.height / 2;
    }
    gameArea.x = Math.max(0, Math.min(gameArea.canvas.width, gameArea.x + dx * TOUCH_GAIN));
    gameArea.y = Math.max(0, Math.min(gameArea.canvas.height, gameArea.y + dy * TOUCH_GAIN));
    setPieceSize(pieceSize());
}

function forgetTouch(id) { // a finger is gone: release its power and hand steering to the newest other steering finger
    var info = touch.roles[id];
    delete touch.roles[id];
    if (!info) {
        return null;
    }
    if (info.role == "tfocus" || info.role == "twarp") { // released once no other finger holds the same button
        held[info.role] = false;
        for (var k in touch.roles) {
            if (touch.roles[k].role == info.role) {
                held[info.role] = true;
            }
        }
        applyHeldSpeed();
    }
    if (id === touch.steerId) {
        touch.steerId = null;
        var next = null;
        for (var other in touch.roles) {
            var o = touch.roles[other];
            if (o.role == "steer" && (!next || o.order > next.order)) {
                next = o;
            }
        }
        if (next) { // continue from where that finger is, so the square doesn't jump
            touch.steerId = next.id;
            touch.lastX = next.x;
            touch.lastY = next.y;
        }
    }
    return info;
}

function reconcileTouches(list) { // let go of any finger the browser no longer reports (a lost touchend)
    var down = {};
    for (var i = 0; i < list.length; i++) {
        down[list[i].identifier] = true;
    }
    for (var id in touch.roles) {
        if (!down[id]) {
            forgetTouch(touch.roles[id].id);
        }
    }
    activeTouches = list.length;
}

function onTouchStart(e) {
    if (e.cancelable) {
        e.preventDefault(); // no scrolling, zooming or made-up mouse events
    }
    lastTouchTime = Date.now();
    reconcileTouches(e.touches);
    window.focus(); // as for mouse clicks: an embedded game needs focus to receive keys and stay unpaused
    var wasTouch = inputMode == "touch";
    setInputMode("touch");
    for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        var p = toGame(t.clientX, t.clientY);
        var info = { id: t.identifier, x: p.x, y: p.y, order: ++touch.order, role: "none", pausedAt: pause ? pauseNo : -1, switched: !wasTouch };
        if (menuUp()) {
            setHovered(buttonAt(p.x, p.y)); // press feedback, on whichever menu screen is up
        } else if (!gameStart) {
            setHovered(buttonAt(p.x, p.y));
        } else if (pause && alive && pauseHelpAt(p.x, p.y)) {
            info.role = "phelp"; // not a power button and not a resume: it keeps the role until it lifts
        } else if (runFinished) {
            if (Date.now() - finishTime >= 1000) {
                restartArmed = true; // same rule as a mouse click: only a touch that starts on the finish screen, after 1s
            }
        } else {
            // the buttons also work between levels, so FOCUS or WARP held into the next level starts in it (as with the mouse);
            // a touch that switches from mouse play steers, as the buttons weren't showing
            var button = wasTouch ? touchButtonAt(p.x, p.y) : "";
            info.role = button || "steer"; // a finger keeps its role until it lifts, even if it slides off its button
            if (button == "tfocus") {
                pressPower("tfocus", setSlowSpeed);
            } else if (button == "twarp") {
                pressPower("twarp", setFastSpeed);
            } else if (button == "break") {
                tryBreak();
            } else if (!button) { // the newest steering finger steers
                touch.steerId = t.identifier;
                touch.lastX = p.x;
                touch.lastY = p.y;
            }
        }
        touch.roles[t.identifier] = info;
    }
}

function onTouchMove(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
    lastTouchTime = Date.now();
    reconcileTouches(e.touches);
    for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        var p = toGame(t.clientX, t.clientY);
        var info = touch.roles[t.identifier];
        if (!info) {
            continue;
        }
        info.x = p.x;
        info.y = p.y;
        if (menuUp() || !gameStart) {
            setHovered(buttonAt(p.x, p.y));
        } else if (t.identifier === touch.steerId) {
            var dx = p.x - touch.lastX;
            var dy = p.y - touch.lastY;
            touch.lastX = p.x; // movement while paused or between levels is dropped, not saved up
            touch.lastY = p.y;
            if (alive && !pause && !resumeTimer) {
                steerBy(dx, dy);
            }
        }
    }
}

function onTouchEnd(e) { // touchend and touchcancel
    if (e.cancelable) {
        e.preventDefault();
    }
    lastTouchTime = Date.now();
    var last = null;
    var switched = false; // the lifted finger switched the start screen from the mouse layout
    for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        var p = toGame(t.clientX, t.clientY);
        last = p;
        var info = forgetTouch(t.identifier);
        switched = !!(info && info.switched);
        if (!info || e.type == "touchcancel") {
            continue;
        }
        if (info.role == "pause" && (!pause || resumeTimer) && touchButtonAt(p.x, p.y) == "pause") { // also stops a countdown
            setPause(true);
        } else if (info.role == "phelp" && pauseHelpAt(p.x, p.y)) {
            openMenu("help"); // over the frozen level; closing it puts the panel back
        } else if (pause && info.pausedAt == pauseNo && Date.now() - pauseStart > 300) { // began during this pause
            startResumeCountdown(); // a tap anywhere resumes (after the pause has been up for a moment)
        }
    }
    reconcileTouches(e.touches);
    if (e.type == "touchcancel") {
        if (!gameStart && e.touches.length === 0) {
            setHovered(""); // no start-screen button stays pressed
        }
        if (alive) {
            releaseAll(); // a system gesture took the touch: pause rather than let the player die
        }
        return;
    }
    if (e.touches.length === 0 && last) {
        if (menuUp()) { // up over the start screen or over a paused level: either way it owns the tap
            setHovered("");
            menuPress(buttonAt(last.x, last.y)); // a tap on nothing does nothing: it must not start or resume
        } else if (!gameStart) {
            var button = buttonAt(last.x, last.y);
            setHovered("");
            if (switched) {
                // this tap switched the start screen to the touch layout; it only shows it
            } else if (START_BUTTONS[button] && START_BUTTONS[button].menu) {
                openMenu(START_BUTTONS[button].menu);
            } else if (button && START_BUTTONS[button].launch) {
                launchClassic();
            } else if (button && START_BUTTONS[button].setting) {
                cycleSetting(START_BUTTONS[button].setting);
            } else if (button && button != "start") {
                alert(START_BUTTONS[button].touchHelp);
            } else {
                startTouchGame(); // a tap anywhere else starts (it has to be on touchend for sound to be allowed)
            }
        } else if (runFinished && restartArmed) {
            restartRun();
        }
    }
}

function bindInput() { // the touch, mouse, keyboard and page listeners, registered once by gameArea.load. The touch
    // ones go on the canvas; the rest on the window and the document, so a press anywhere is a press
    var touchOptions = { passive: false }; // so preventDefault can stop scrolling, zooming and made-up mouse events
    gameArea.canvas.addEventListener("touchstart", onTouchStart, touchOptions);
    gameArea.canvas.addEventListener("touchmove", onTouchMove, touchOptions);
    gameArea.canvas.addEventListener("touchend", onTouchEnd, touchOptions);
    gameArea.canvas.addEventListener("touchcancel", onTouchEnd, touchOptions);
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, touchOptions); // iOS pinch zoom
    document.addEventListener("gesturechange", function (e) { e.preventDefault(); }, touchOptions);
    window.addEventListener("orientationchange", function () { setTimeout(windowResize, 300); }); // iOS can report the new size late
    document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
            releaseAll();
        }
    });
    window.addEventListener("pagehide", releaseAll);
    window.addEventListener('click', function (e) {
        if (touchEcho(e)) {
            return;
        }
        if (layoutClick) { // the press switched the start screen to the mouse layout; the click only shows it
            layoutClick = false;
            return;
        }
        var p = toGame(e.pageX, e.pageY);
        var button = (gameStart && !menuUp()) ? "" : buttonAt(p.x, p.y);
        if (menuUp()) {
            menuPress(button); // a press on nothing here does nothing: it must not reach the game
        } else if (button == "start") {
            startGame({ pageX: p.x, pageY: p.y });
        } else if (button && START_BUTTONS[button].menu) {
            openMenu(START_BUTTONS[button].menu);
        } else if (button && START_BUTTONS[button].launch) {
            launchClassic();
        } else if (button && START_BUTTONS[button].setting) {
            cycleSetting(START_BUTTONS[button].setting);
        } else if (button) { // a control button: explain it
            alert(START_BUTTONS[button].help);
        } else if (runFinished && restartArmed) { // play again from the finish screen
            restartRun();
        }
    });
    window.addEventListener('mousedown', function (e) {
        e.preventDefault();
        if (touchEcho(e)) {
            return;
        }
        layoutClick = !gameStart && !activeTouches && inputMode != "mouse";
        if (!activeTouches) {
            setInputMode("mouse");
        }
        window.focus(); // preventDefault stops the page taking focus when embedded in an iframe
        if (e.button == 0 && runFinished && Date.now() - finishTime >= 1000) {
            // only a click that starts on the finish screen restarts, and not in the first second,
            // so a Focus tap as level 15 ends doesn't wipe the results before they're seen
            restartArmed = true;
        }
        if (e.button == 0) { // left mouse button = FOCUS
            pressPower("lmb", setSlowSpeed);
        }
        if (e.button == 2) { // right mouse button = WARP
            pressPower("rmb", setFastSpeed);
        }
        if (e.button == 1) { // middle mouse button = BREAK
            tryBreak();
        }
    });
    window.addEventListener('mouseup', function (e) {
        e.preventDefault();
        if (touchEcho(e)) {
            return;
        }
        var released = { 0: "lmb", 2: "rmb" }[e.button];
        if (released) {
            held[released] = false;
        }
        applyHeldSpeed(); // fall back to any power still held (this also ends level 15's forced Warp)
    });
    window.addEventListener('mousemove', function (e) {
        if (touchEcho(e)) {
            return;
        }
        if (!activeTouches && Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0) >= 2) {
            setInputMode("mouse"); // a real mouse moved (small jitter doesn't count)
        }
        if (inputMode != "mouse") {
            return;
        }
        mouseMove(e); // start-screen hover
        // catch buttons or keys released outside the window
        var lmb = (e.buttons & 1) != 0;
        var rmb = (e.buttons & 2) != 0;
        if (held.lmb != lmb || held.rmb != rmb || held.shift != e.shiftKey || held.ctrl != e.ctrlKey) {
            held.lmb = lmb;
            held.rmb = rmb;
            held.shift = e.shiftKey;
            held.ctrl = e.ctrlKey;
            applyHeldSpeed();
        }
        if (gameStart) { // the square follows the cursor (movePiece moves it there each frame)
            var p = toGame(e.pageX, e.pageY);
            gameArea.x = p.x;
            gameArea.y = p.y;
            setPieceSize(pieceSize());
        }
    });
    window.addEventListener('blur', releaseAll); // releases aren't seen while the window is unfocused; don't keep playing
    window.addEventListener('keydown', function (e) {
        var key = keyName(e);
        if (alive && e.ctrlKey) {
            e.preventDefault(); // block browser shortcuts while holding CTRL to warp
        }
        if (key == "Escape" && menuUp()) { // a menu screen's other way out, for anyone who expects it
            e.preventDefault();
            closeMenu();
            return;
        }
        if (key == "h" && !e.repeat && !menuUp() && (!gameStart || (alive && pause))) {
            e.preventDefault(); // the instructions, from the start screen or from a pause
            stopResume(); // a resume already counting down would come back under them
            openMenu("help");
            return;
        }
        if (key == "r" && runFinished && !e.repeat && !e.ctrlKey && !e.metaKey) { // R = play again (Ctrl+R still reloads)
            restartRun();
        }
        if (key == "p") { // P
            e.preventDefault();
            if (!e.repeat) { // holding P shouldn't flip pause on every key repeat
                setPause(!pause);
            }
        }
        if (key == " ") { // SPACEBAR = BREAK
            e.preventDefault();
            tryBreak();
        }
        if (key == "Shift") { // SHIFT = FOCUS
            e.preventDefault();
            if (!e.repeat) { // a held modifier repeats on Windows, and a repeat is not a press: with something else
                pressPower("shift", setSlowSpeed); // running (level 15's forced Warp), every one would count as a
            } // fresh activation and spend a ration. The mouse buttons never repeated, so this is what they do
        }
        if (key == "Control") { // CTRL = WARP
            e.preventDefault();
            if (!e.repeat) {
                pressPower("ctrl", setFastSpeed);
            }
        }
    });
    window.addEventListener('keyup', function (e) {
        var released = { Shift: "shift", Control: "ctrl" }[keyName(e)];
        if (released) {
            held[released] = false;
            applyHeldSpeed(); // fall back to any power still held
        }
    });
}
