// Focus Break -- the start screen and its menus. The buttons of the start, settings and help screens and what they
// do, the settings they cycle and remember, the hover flash, the slogans, the CLASSIC launch, and the glitches that
// tear the start screen now and then. FOCUS BREAK.html loads this with a plain <script src> before its own script,
// as globals rather than modules, so the game still opens straight off disk. Nothing here runs at load beyond
// building the tables: the timers are started by onLoad, in the game's script, once everything they draw with exists.
//
// It draws with the game's canvas and context (ctx, gameArea), reads its input mode, and reaches the records and the
// difficulty through their own functions; the game reaches in for the screens (drawStartScreen, openMenu, closeMenu),
// the hit test (buttonAt, geom), the settings (loadSettings, cycleSetting) and the timers (startMenuTimers,
// startScreenIntervals).

// start-screen buttons, relative to the center of the layout; used for drawing, hover and clicks
// `touch` is the bigger layout used for touch play (labels centered in the boxes)
const START_BUTTONS = {
    start: { dx: -410, dy: -32, w: 220, h: 44, hitH: 46, // clickable area is 2px taller than the drawn box
        touch: { dx: -450, dy: -60, w: 400, h: 150 } },
    break: { dx: 0, dy: 0, w: 272, h: 40, label: "Space to Break", ty: 38,
        help: "SPACEBAR or MIDDLE MOUSE BUTTON = BREAK - Become invincible briefly.  Lose score, emergency use only!",
        touch: { dx: 60, dy: -150, w: 420, h: 110 }, touchLabel: "Tap to Break",
        touchHelp: "BREAK button (tap) = Become invincible briefly.  Lose 250 score, emergency use only!  Drag anywhere to steer." },
    focus: { dx: 0, dy: 60, w: 272, h: 40, label: "Shift to Focus", ty: 100,
        help: "SHIFT or LEFT MOUSE BUTTON = FOCUS - Slows time and decrease hitbox size.  Earn no score, use in a tight spot.",
        touch: { dx: 60, dy: -20, w: 420, h: 110 }, touchLabel: "Hold to Focus",
        touchHelp: "FOCUS button (hold) = Slows time and shrinks your hitbox.  Earn no score, use in a tight spot.  Drag anywhere to steer." },
    warp: { dx: 0, dy: 120, w: 272, h: 40, label: "Click to warp", ty: 160,
        help: "CTRL or RIGHT MOUSE BUTTON: WARP - Speeds up time.  Earn double score, you madman.",
        touch: { dx: 60, dy: 110, w: 420, h: 110 }, touchLabel: "Hold to Warp",
        touchHelp: "WARP button (hold) = Speeds up time.  Earn double score, you madman.  Drag anywhere to steer." },
    // the two that aren't the game or a control: the run's difficulty, under START because it decides the run,
    // and the settings, which open a screen of their own
    difficulty: { dx: -410, dy: 85, w: 220, h: 40, setting: "difficulty",
        touch: { dx: -450, dy: 110, w: 400, h: 90 } },
    options: { dx: -128, dy: 272, w: 256, h: 40, menu: "options",
        touch: { dx: 60, dy: 240, w: 200, h: 90 } },
    help: { dx: 148, dy: 272, w: 256, h: 40, menu: "help",
        touch: { dx: 280, dy: 240, w: 200, h: 90 } },
    // the 2019 build, still in the repo under CLASSIC EDITION. It leaves this page rather than running inside
    // it, so it gets a corner of its own on touch, where the row of three below has no room for a fourth
    classic: { dx: -404, dy: 272, w: 256, h: 40, launch: true,
        touch: { dx: 60, dy: -318, w: 420, h: 84 } },
};

var menuScreen = ""; // which menu screen is up: "" for none, "options" for the settings, "help" for the
                     // instructions. The instructions are the one that can also come up over a paused level

function menuUp() {
    return menuScreen != "";
}

// the settings screen's own buttons. One layout for both mouse and touch: it is a menu of its own, with room to be
// read either way, so there is nothing for the start screen's two layouts to disagree about
const OPTION_BUTTONS = {
    options_effects: { dx: -300, dy: -136, w: 600, h: 78, setting: "options" },
    options_steering: { dx: -300, dy: -48, w: 600, h: 78, setting: "steering" },
    options_buttons: { dx: -300, dy: 40, w: 600, h: 78, setting: "buttons" },
    options_back: { dx: -170, dy: 190, w: 340, h: 70, back: true, label: "BACK" },
};

function buttonTable() { // whichever screen's buttons are live
    return menuScreen == "options" ? OPTION_BUTTONS : menuScreen == "help" ? HELP_BUTTONS : START_BUTTONS;
}

function buttonDef(name) { // a live button's definition, for the things that only need its flags
    return buttonTable()[name];
}

const FX_MODES = ["auto", "full", "reduced", "off"]; // what the effects button cycles through
const FX_MODE_LABELS = { auto: "Auto", full: "Full", reduced: "Reduced", off: "Off" };
const TOUCH_GAINS = [0.75, 1, 1.25, 1.5, 2]; // px the square moves per px of finger; 1.25 is what it always was
const TOUCH_SIDES = ["right", "left"]; // the edge the power buttons sit against, for the hand that holds the phone

function effectsLabel() { // what the effects button reads: for "auto", also what the device is asking for
    var name = FX_MODE_LABELS[fxMode] || fxMode;
    return fxMode == "auto" ? name + " (" + FX_MODE_LABELS[fxLook()] + ")" : name;
}

// each setting is a value cycled by its own button and remembered between runs. read() is what the button says,
// pick() takes a stored string and returns the value to use, or undefined if it isn't one of ours
const SETTINGS = {
    options: { store: "focusbreak.effects",
        read: function () { return "EFFECTS: " + effectsLabel().toUpperCase(); },
        next: function () { fxMode = FX_MODES[(FX_MODES.indexOf(fxMode) + 1) % FX_MODES.length]; return fxMode; },
        pick: function (v) { return FX_MODES.indexOf(v) >= 0 ? v : undefined; },
        apply: function (v) { fxMode = v; } },
    steering: { store: "focusbreak.steering",
        read: function () { return "STEERING: " + TOUCH_GAIN.toFixed(2) + "x"; },
        next: function () {
            var i = TOUCH_GAINS.indexOf(TOUCH_GAIN); // an unlisted value (an old save, a hand edit) steps to the first
            TOUCH_GAIN = TOUCH_GAINS[(i + 1) % TOUCH_GAINS.length];
            return String(TOUCH_GAIN);
        },
        pick: function (v) { return TOUCH_GAINS.indexOf(parseFloat(v)) >= 0 ? parseFloat(v) : undefined; },
        apply: function (v) { TOUCH_GAIN = v; } },
    difficulty: { store: "focusbreak.difficulty", // its button is on the start screen, but it is stored like the rest
        read: function () { return mode().label; },
        next: function () {
            var i = 0;
            while (i < DIFFICULTIES.length && DIFFICULTIES[i].name != difficulty) { i++; }
            difficulty = DIFFICULTIES[(i + 1) % DIFFICULTIES.length].name;
            return difficulty;
        },
        pick: function (v) {
            for (var i = 0; i < DIFFICULTIES.length; i++) {
                if (DIFFICULTIES[i].name === v) { return v; }
            }
            return undefined;
        },
        apply: function (v) { difficulty = v; } },
    buttons: { store: "focusbreak.buttons",
        read: function () { return "BUTTONS: " + TOUCH_SIDE.toUpperCase(); },
        next: function () {
            TOUCH_SIDE = TOUCH_SIDES[(TOUCH_SIDES.indexOf(TOUCH_SIDE) + 1) % TOUCH_SIDES.length];
            return TOUCH_SIDE;
        },
        pick: function (v) { return TOUCH_SIDES.indexOf(v) >= 0 ? v : undefined; },
        apply: function (v) { TOUCH_SIDE = v; } },
};

function loadSettings() { // whatever was chosen last time, if the browser will tell us
    for (var name in SETTINGS) {
        var s = SETTINGS[name];
        try {
            var saved = s.pick(window.localStorage.getItem(s.store));
            if (saved !== undefined) {
                s.apply(saved);
            }
        } catch (e) { // private windows and blocked storage throw rather than return null: keep the default
        }
    }
}

function cycleSetting(name) { // a settings button: step to its next value and remember it
    var s = SETTINGS[name];
    var value = s.next();
    try {
        window.localStorage.setItem(s.store, value);
    } catch (e) { // nothing to do: the setting still applies for this run
    }
    playSound(aud_click);
    drawStartScreen();
}

var hoveredButton = ""; // start-screen button under the mouse (or finger)

function startLayout() { // "classic" (the original mouse layout) or "touch" (bigger, centered buttons)
    return inputMode == "touch" ? "touch" : "classic";
}

function geom(name) { // a live button's rectangle, or null if it isn't on the screen that is up
    if (menuUp()) {
        return buttonTable()[name] || null; // a menu screen has one layout, so there is nothing to choose
    }
    var b = START_BUTTONS[name];
    if (!b) {
        return null;
    }
    var style = startLayout();
    return style == "classic" ? (b.touchOnly ? null : b) : b[style];
}

function buttonAt(px, py) { // name of the start-screen button at a window point, or ""
    var f = screenFrame();
    if (!(f.scale > 0)) {
        return "";
    }
    var lx = (px - f.x) / f.scale; // the point in layout coordinates
    var ly = (py - f.y) / f.scale;
    var table = buttonTable();
    for (var name in table) {
        var b = geom(name);
        if (!b) {
            continue; // not shown in this layout, so nothing to hit
        }
        var left = LAYOUT_W / 2 + b.dx;
        var top = LAYOUT_H / 2 + b.dy;
        if (lx > left && lx < left + b.w && ly > top && ly < top + (b.hitH || b.h)) {
            return name;
        }
    }
    return "";
}

function mouseMove(event) { // highlight the button under the mouse, on the start screen or on a menu over a pause
    if (!gameStart || menuUp()) {
        var p = toGame(event.clientX, event.clientY);
        setHovered(buttonAt(p.x, p.y));
    }
}

function setHovered(name) { // highlight one start-screen button (or none)
    if (name != hoveredButton) { // only one button highlighted at a time
        drawStartScreen(); // erase the old highlight
        hoveredButton = name;
    }
}

function drawStartButtonText(b) { // the START button's label, in the current fill style
    var cx = LAYOUT_W / 2;
    var cy = LAYOUT_H / 2;
    if (startLayout() == "classic") {
        ctx.font = "25px Arial";
        ctx.fillText("CLICK TO START", cx - 400, cy);
        return;
    }
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "44px Arial";
    ctx.fillText("TAP TO START", cx + b.dx + b.w / 2, cy + b.dy + b.h * 0.45);
    ctx.font = "28px Arial";
    ctx.fillText("タップして開始", cx + b.dx + b.w / 2, cy + b.dy + b.h * 0.8);
    ctx.restore();
}

function drawControlLabel(name) { // a control button's label, in the current fill style
    var b = START_BUTTONS[name];
    var cx = LAYOUT_W / 2;
    var cy = LAYOUT_H / 2;
    if (startLayout() == "classic") {
        ctx.font = "40px Impact";
        ctx.fillText(b.label, cx + b.dx, cy + b.ty);
        return;
    }
    var g = geom(name);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "48px Impact";
    ctx.fillText(b.touchLabel, cx + g.dx + g.w / 2, cy + g.dy + g.h / 2 + 17);
    ctx.restore();
}

function drawTitle(shadowColor, passes) { // FOCUS BREAK title: stacked shadow copies, then magenta on top
    ctx.font = "80px Arial";
    ctx.fillStyle = shadowColor;
    for (let count = 130 - passes; count < 130; count++){ // Bold effect
        ctx.fillText("FOCUS BREAK", count, count+80);
        ctx.fillText("焦点を絞る", count+100, count+180);
    }
    ctx.fillStyle = "#ff00ff";
    ctx.fillText("FOCUS BREAK", 130, 210);
    ctx.fillText("焦点を絞る", 230, 310);
}

function focus_break_colors(){ // Flashing colors on start screen
    if (menuUp()) {
        return; // a menu screen is up: these run on a timer and would paint the title over it
    }
    useLayout();
    drawTitle(getRandomColor(), 3);
    useWindow();
}

function click_to_start_colors(){ // Flashing colors on start screen
    if (menuUp()) {
        return;
    }
    if (hoveredButton == "start" || (inputMode == "touch" && !hoveredButton)) { // in touch play START always flashes
        var b = geom("start");
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = getRandomColorGold();
        var i_x = getRandomInteger(-1, 1);
        var i_y = getRandomInteger(-1, 1);
        useLayout();
        ctx.fillRect(LAYOUT_W / 2 + b.dx + i_x, LAYOUT_H / 2 + b.dy + i_y, b.w + i_x, b.h + i_y);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "black";
        drawStartButtonText(b);
        useWindow();
    }
}

var flashNo = 0; // ticks of the hover flash. Its colours are hashed off this rather than drawn from Math.random,
                 // because the instructions can be up over a paused level and the spawns' stream must not move
                 // while they are: a replay would diverge by however long the cursor sat on BACK

function flashColor() { // a colour for this tick of the flash: any of them, and none from the spawns' stream
    flashNo++;
    var c = "#";
    for (var i = 0; i < 3; i++) {
        c += ("0" + Math.floor(fxHash(flashNo, i) * 256).toString(16)).slice(-2);
    }
    return c;
}

function highlightControl() { // Flashing colors on the hovered button, on whichever menu screen is up
    var b = buttonDef(hoveredButton);
    var g = b ? geom(hoveredButton) : null;
    if (!g) {
        return; // nothing under the cursor, or nothing shown in this layout
    }
    var bx = LAYOUT_W / 2 + g.dx, by = LAYOUT_H / 2 + g.dy;
    useScreenFrame(); // a menu row is fitted to its screen's band; the start screen's buttons are in the whole frame
    if (b.help) { // a control button: its box goes black under a label that flashes, as it always has, and that
        // is all of it. It is a solid slab rather than a frame, so it has no edge to light
        ctx.fillStyle = "#000000";
        ctx.fillRect(bx, by, g.w, g.h);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = flashColor();
        drawControlLabel(hoveredButton);
        ctx.globalAlpha = 1.0;
        useWindow();
        return;
    }
    // every framed button's edge flashes. This was the settings rows and BACK alone, which left OPTIONS, HELP,
    // CLASSIC, NEXT and the start button dead to the cursor beside a NORMAL that lit up
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = flashColor();
    ctx.fillRect(bx, by, g.w, 2);
    ctx.fillRect(bx, by + g.h - 2, g.w, 2);
    ctx.fillRect(bx, by, 2, g.h);
    ctx.fillRect(bx + g.w - 2, by, 2, g.h);
    ctx.globalAlpha = 1.0;
    useWindow();
}

// the slogan under the title, and where it sits, in layout coordinates
var sloganText = "";
var sloganY = 120;
var sloganX = 100;

// one of these sits over the title, picked again every three seconds. The room it has is about 420 layout px at
// 40px Arial: eighteen Latin characters, or nine Japanese. "Bug Free!" is the one drawStartScreen prints bold
const SLOGANS = ["TOO HARD", "Now in Color!", "Vegan!", "Siezure inducing!", "Advanced!", "Fresh!", "Spicy!", "Gotta Go Fast!",
    "Classic", "Coming Soon!", "4K 1080p", "Lite", "今は日本語です！", "Version 2", "Bug Free!", "Not Lame!", "...", "ULTRA", "",
    "Now with lore!", "Free to play!", "No ads!", "Handmade", "Award winning*", "Certified organic", "Gluten free",
    "As seen on TV", "Limited edition", "Contains pixels", "Made with math", "Since 2019", "F11 recommended",
    "Press H for help", "Warp responsibly", "Zero deaths!",
    "Do not flinch", "Let it pass", "Nothing chases you", "State of mind",
    "頑張って！", "集中して", "休憩中", "無理", "難しすぎる", "新登場！", "深呼吸", "焦らないで", "続けますか？",
    // cryptic: the cards' voice, and things that are true of the game said with no context
    "Only the moving", "Out of order", "Still works", "The room is louder", "Halfway is nowhere", "Score is a clock",
    "Victory is a lie", "So is everything", "Remains",
    "Not the first time", "It knows you paused", "Do not chase it", "Self destruct in 3",
    // spicy: aimed at the player
    "Skill issue", "Git gud", "You will die", "Touching counts", "It was 1px", "Blame the mouse", "Therapy, but worse",
    "TRUE", "EASY mode", "Not bug free",
    "Back so soon?", "Stop reading this", "This changes in 3s", "Music by Cavalier",
    // and both, in Japanese
    "死ぬよ", "諦めろ", "まだ生きてる？", "逃げるな", "誰もいない", "触れるな", "赤に注意", "嘘です", "終わりはない",
    "また君か", "考えるな", "何も来ない", "練習しろ", "下手",
    // splash lines
    "Loading...", "100% square", "Now with more red", "Fewer bugs!", "Patent pending", "Not sponsored", "Works offline",
    "No install", "Runs in a tab", "Multiplayer soon", "REMASTERED", "Director's cut", "Tested on humans",
    // the cards, one line at a time
    "You noticed", "Eyes open anyway", "Been here before", "Keep breathing", "From somewhere else", "The hardest part",
    "One last thought", "Sit down", "Not chasing you yet", "Larger than needed", "None are important", "Music steps back",
    "Put back wrong", "Be somewhere else", "Lose the thread", "Pick it up again", "Thoughts arrive", "Session 1 of 15",
    "Duration: unknown", "Something is coming", "The one you needed", "Stop trying to rest", "Let go for a while",
    "The yet comes off",
    // at the player, and at the slogan itself
    "Dodge better", "That was a wall", "You saw it coming", "Read the help", "Nice try", "Almost", "Not even close",
    "Try Focus", "Break earlier", "You paused a lot", "Rage is not focus", "It's just pixels", "Insert coin", "Roll again",
    "Over 100 slogans!", "40px Arial", "#ff00ff", "No black, no red",
    // and in Japanese
    "上手くなれ", "見てる", "赤は速い", "一つだけ", "壁だ", "惜しい", "全然ダメ", "もう一回", "二回目", "十五面",
    "眠るな", "夢じゃない", "戻れない", "戻ってきた", "休め"];

function updateSloganText() { // pick a random slogan and redraw the start screen
    sloganText = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];
    drawStartScreen();
}

function drawStartScreen() { // draw the start screen, or whichever menu screen is standing in for it
    if (menuScreen == "options") {
        drawOptionsScreen();
        return;
    }
    if (menuScreen == "help") {
        drawHelpScreen();
        return;
    }
    var cx = LAYOUT_W / 2;
    var cy = LAYOUT_H / 2;

    // clear screen
    useWindow();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, x, y);

    // Title
    useLayout();
    drawTitle("#00FFFF", 10);

    if (startLayout() == "classic") {
        // start button
        ctx.font = "25px Arial";
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = "gray";
        var start = START_BUTTONS.start;
        ctx.fillRect(cx + start.dx, cy + start.dy, start.w, start.h);
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "black";
        ctx.fillText("CLICK TO START", cx - 400, cy);
        ctx.fillRect(cx - 450, cy + 25, 300, 2);
        ctx.fillText("クリックして開始", cx - 400, cy + 65);

        // controls: all boxes, then all labels
        var controls = [START_BUTTONS.break, START_BUTTONS.focus, START_BUTTONS.warp];
        ctx.fillStyle = "#00FFFF";
        controls.forEach(function (b) { ctx.fillRect(cx + b.dx, cy + b.dy, b.w, b.h); });
        ctx.font = "40px Impact";
        ctx.fillStyle = "#ff00ff";
        ctx.globalAlpha = 0.5;
        controls.forEach(function (b) { ctx.fillText(b.label, cx + b.dx, cy + b.ty); });
    } else {
        drawBigStartButtons();
    }

    // horizontal banners across the whole window
    useWindow();
    ctx.globalAlpha = 1.0;
    ctx.font = "40px Arial";
    ctx.fillStyle = "#00FFFF";
    var k = bannerScale();
    drawBanners(34, 30, k);
    ctx.fillStyle = "#ff00ff";
    drawBanners(40, 20, k);
    ctx.fillStyle = "black";
    ctx.globalAlpha = 0.7;
    ctx.fillRect(0, y - 40 * k, x, 2);
    ctx.fillRect(0, 60 * k, x, 2);

    // slogan
    useLayout();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#ff00ff";
    ctx.fillText(sloganText,sloganX,sloganY);
    if (sloganText == "Bug Free!"){
        for (let count = 1; count < 40; count++){ // Bold effect
            ctx.fillText("Bug Free!",sloganX-40+count,sloganY-40+count);
            ctx.fillStyle = getRandomColor();
        }
    }

    drawRecords();
    drawSettingButtons();
    useWindow();
}

function drawRecords() { // low on the start screen, under the start button; nothing at all before there is any
    var line = recordsLine();
    if (!line) {
        return; // a first run sees the screen the game has always opened on
    }
    var classic = startLayout() == "classic";
    ctx.globalAlpha = 1.0;
    ctx.font = (classic ? "24px" : "30px") + " Arial";
    ctx.fillStyle = "#ff00ff"; // 3.14:1 on the screen's white, and the colour the title and slogan already use
    ctx.fillText(line, classic ? 240 : 190, classic ? 575 : 690); // under the difficulty button, whose best it is
}

function drawSettingButtons() { // the start screen's two menu buttons: the run's difficulty, and the settings
    var classic = startLayout() == "classic";
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "center";
    [["difficulty", mode().label], ["options", "OPTIONS 設定"], ["help", "HELP 説明"],
        ["classic", "CLASSIC 旧版"]].forEach(function (b) {
        var g = geom(b[0]);
        if (!g) {
            return;
        }
        var x = LAYOUT_W / 2 + g.dx, y = LAYOUT_H / 2 + g.dy;
        ctx.font = (classic ? "22px" : "34px") + " Arial";
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(x, y, g.w, g.h);
        ctx.fillStyle = "black";
        ctx.fillRect(x + 2, y + 2, g.w - 4, g.h - 4);
        ctx.fillStyle = "#ff00ff";
        ctx.fillText(b[1], x + g.w / 2, y + g.h / 2 + (classic ? 8 : 12), g.w - 16);
    });
    ctx.textAlign = "start"; // the rest of the screen draws left-aligned
}

function drawOptionsScreen() { // the settings, on a screen of their own
    var cx = LAYOUT_W / 2, cy = LAYOUT_H / 2;
    useWindow();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, x, y);

    useScreenFrame(); // a menu of rows to read and tap, so it is sized for the screen rather than for the frame
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "center";
    ctx.font = "70px Arial";
    ctx.fillStyle = "#00FFFF"; // the title printed twice, as everything in this game is
    ctx.fillText("OPTIONS", cx - 4, cy - 196);
    ctx.fillStyle = "#ff00ff";
    ctx.fillText("OPTIONS", cx, cy - 192);
    ctx.font = "28px Arial";
    ctx.fillStyle = "black";
    ctx.fillText("設定", cx, cy - 158);

    for (var name in OPTION_BUTTONS) {
        var b = OPTION_BUTTONS[name];
        var bx = cx + b.dx, by = cy + b.dy;
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = "black";
        ctx.fillRect(bx + 2, by + 2, b.w - 4, b.h - 4);
        ctx.fillStyle = "#ff00ff";
        ctx.font = (b.back ? "36px" : "30px") + " Arial";
        ctx.fillText(b.back ? b.label : SETTINGS[b.setting].read(), bx + b.w / 2, by + b.h / 2 + 10, b.w - 20);
    }

    ctx.font = "20px Arial"; // neither touch setting does anything under a mouse, and the menu is where you look
    ctx.fillStyle = "black";
    ctx.fillText("Steering: how far the square moves per pixel of finger", cx, cy + 142);
    ctx.fillText("Buttons: which side they sit on. Both are touch only", cx, cy + 166);
    ctx.fillText(inputMode == "touch" ? "Tap BACK to return" : "Click BACK, or press Escape, to return", cx, cy + 290);
    ctx.textAlign = "start";

    useWindow(); // the same stripes the start screen wears, so this reads as part of it
    ctx.font = "40px Arial";
    var k = bannerScale();
    ctx.fillStyle = "#00FFFF";
    drawBanners(34, 30, k);
    ctx.fillStyle = "#ff00ff";
    drawBanners(40, 20, k);
}

// The instructions. Two pages, because one screen holding all of it would have to shrink to fit a phone and the whole
// point is that it can be read. Reachable from the start screen and from pause, and it paints its own background, so
// it works over the menu and over a frozen level alike.
var helpPage = 0;

const HELP_BUTTONS = {
    help_next: { dx: -310, dy: 186, w: 280, h: 66, page: true, label: "NEXT 次へ" },
    help_back: { dx: 30, dy: 186, w: 280, h: 66, back: true, label: "BACK" },
};

function helpLines() { // the page now showing: a heading is a line of its own, and the line under it says what it does
    var touch = inputMode == "touch";
    if (helpPage === 0) {
        return [
            { t: "CONTROLS 操作", title: true },
            { t: touch ? "Drag anywhere to steer" : "The square follows your cursor" },
            { t: touch ? "HOLD FOCUS" : "SHIFT or LEFT CLICK  -  FOCUS", head: true },
            { t: "time slows, your hitbox shrinks, and the score stops" },
            { t: touch ? "HOLD WARP" : "CTRL or RIGHT CLICK  -  WARP", head: true },
            { t: "time speeds up and the score doubles" },
            { t: touch ? "TAP BREAK" : "SPACE or MIDDLE CLICK  -  BREAK", head: true },
            { t: "two seconds where nothing can touch you, for 250 score" },
            { t: touch ? "The pause icon is in the top " + (TOUCH_SIDE == "left" ? "left" : "right") + " corner"
                : "P pauses.  R plays again from the finish screen." },
        ];
    }
    return [
        { t: "SCORING 得点", title: true },
        { t: "Reach 1000 to clear a level. There are fifteen of them." },
        { t: "GRAZE", head: true },
        { t: "pass close to an obstacle without touching it, and the" },
        { t: "closer the pass, the more charge it banks" },
        { t: "CHARGES", head: true },
        { t: "each one you hold adds 25% to your score rate" },
        { t: "a Break spends one instead of costing 250 score" },
        { t: "Focus burns one to keep scoring while it is slowed" },
        { t: "Gold pickups are worth 50. The flashing kind is a free Break." },
    ];
}

function drawHelpScreen() { // over the start screen, or over a level that is paused: either way it paints its own white
    useWindow();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, x, y);

    useScreenFrame();
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "center";
    var cx = LAYOUT_W / 2, cy = LAYOUT_H / 2;
    var dy = -176;
    helpLines().forEach(function (line) {
        if (line.title) {
            ctx.font = "46px Arial";
            ctx.fillStyle = "#00FFFF"; // the title printed twice, as everything in this game is
            ctx.fillText(line.t, cx - 3, cy + dy + 3);
            ctx.fillStyle = "#ff00ff";
            ctx.fillText(line.t, cx, cy + dy);
            dy += 62;
            return;
        }
        ctx.font = (line.head ? "bold 28px" : "26px") + " Arial";
        ctx.fillStyle = line.head ? "#ff00ff" : "black";
        ctx.fillText(line.t, cx, cy + dy);
        dy += line.head ? 40 : 36;
    });

    for (var name in HELP_BUTTONS) {
        var b = HELP_BUTTONS[name];
        var bx = cx + b.dx, by = cy + b.dy;
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(bx, by, b.w, b.h);
        ctx.fillStyle = "black";
        ctx.fillRect(bx + 2, by + 2, b.w - 4, b.h - 4);
        ctx.fillStyle = "#ff00ff";
        ctx.font = "32px Arial";
        ctx.fillText(b.label, bx + b.w / 2, by + b.h / 2 + 11, b.w - 20);
    }
    ctx.font = "20px Arial";
    ctx.fillStyle = "black";
    ctx.fillText((helpPage + 1) + " / 2", cx, cy + 282);
    ctx.textAlign = "start";

    useWindow(); // the same stripes the start and settings screens wear, so the three read as one set
    var k = bannerScale();
    ctx.fillStyle = "#00FFFF";
    drawBanners(34, 30, k);
    ctx.fillStyle = "#ff00ff";
    drawBanners(40, 20, k);
}

function helpPress(name) { // a press on the instructions: turn the page, or leave
    var b = HELP_BUTTONS[name];
    if (!b) {
        return;
    }
    playSound(aud_click);
    if (b.back) {
        closeMenu();
    } else {
        helpPage = (helpPage + 1) % 2;
        drawHelpScreen();
    }
}

// The 2019 build lives beside this file, in the repo and in anything this is published to. A space and a bang
// both need escaping in a URL; the rest of the path is literal.
var CLASSIC_URL = "CLASSIC%20EDITION/Focus%20Break!.html";

function launchClassic() { // a new tab if the browser will give us one, so this game is still here to come back
    playSound(aud_click); // to. Embedded in a frame that refuses, there is nowhere to put it but here
    try {
        if (window.open(CLASSIC_URL, "_blank")) {
            return;
        }
    } catch (e) { // a sandboxed frame can throw rather than hand back null
    }
    window.location.href = CLASSIC_URL;
}

var menuFlash = null; // the hover flash while a menu screen is up over a paused level: the start screen's timers
                      // are gone by then, so this one runs for exactly as long as the menu is

function openMenu(name) { // put a menu screen up, over the start screen or over a level that is paused
    hoveredButton = ""; // set directly: setHovered would redraw the screen being left or entered, twice
    menuScreen = name;
    playSound(aud_click);
    drawStartScreen();
    if (gameStart && !menuFlash) {
        menuFlash = setInterval(highlightControl, 100); // the flash the start screen's own timer would be giving it
    }
}

function closeMenu() { // and put back whatever it was covering
    if (menuFlash) {
        clearInterval(menuFlash);
        menuFlash = null;
    }
    hoveredButton = "";
    menuScreen = "";
    playSound(aud_click);
    if (gameStart) {
        stopResume(); // a countdown can't have been running under it, but a tap may have started one since
        drawLevel();
        drawPauseScreen();
    } else {
        drawStartScreen();
    }
}

function optionsPress(name) { // a press on the settings screen: cycle a row, or go back. Anything else is ignored
    var b = OPTION_BUTTONS[name];
    if (!b) {
        return;
    }
    if (b.back) {
        closeMenu();
    } else {
        cycleSetting(b.setting);
    }
}

function menuPress(name) { // a press while a menu screen is up, whichever one it is
    if (menuScreen == "options") {
        optionsPress(name);
    } else if (menuScreen == "help") {
        helpPress(name);
    }
}

function drawBigStartButtons() { // the start screen's START and control buttons in the bigger touch layout
    var cx = LAYOUT_W / 2;
    var cy = LAYOUT_H / 2;
    var start = geom("start");
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "gray";
    ctx.fillRect(cx + start.dx, cy + start.dy, start.w, start.h);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "black";
    drawStartButtonText(start);
    var names = ["break", "focus", "warp"];
    ctx.fillStyle = "#00FFFF";
    names.forEach(function (name) { var g = geom(name); ctx.fillRect(cx + g.dx, cy + g.dy, g.w, g.h); });
    ctx.fillStyle = "#ff00ff";
    ctx.globalAlpha = 0.5;
    names.forEach(drawControlLabel);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "black";
    ctx.font = "28px Arial";
    ctx.fillText("Drag anywhere to steer", 190, 640);
}

// The menu glitches. Every so often a piece of the start screen tears, ghosts or gets crushed for a moment, and then
// the screen is drawn clean again. All three kinds are self-copies of what is already on the canvas -- nothing is
// redrawn from the model, so whatever a piece looked like is what tears.
// Its randomness is fxHash off a counter, not Math.random, for the reason the effects have that rule: Math.random
// is the stream the spawns come out of, and this runs on a timer, so how many draws it takes before a run starts
// depends on how long the start screen sat there. The flashers already burned a few dozen that way; this would have
// burned a thousand, which is enough to make a seeded run unreproducible.
var GLITCH_EVERY = 220; // ms between rolls
// The menu arrives broken and settles. It comes up glitching hard for about the first two seconds, eases off
// over those rolls, and then sits at a rate you notice rather than watch: roughly one every six seconds.
var GLITCH_ARRIVE = 0.9; // how many rolls break something on the very first one
var GLITCH_CHANCE = 0.035; // and how many once it has settled
var GLITCH_SETTLE = 10; // rolls it takes to get from one to the other, about two seconds
var GLITCH_HOLD = 90; // ms the damage stays up before a clean redraw takes it away
var GLITCH_SHOVE = 26; // px a torn band can slide, in layout units
var GLITCH_BAND = 26; // and how thick a torn or tinted band is. Absolute, not a fraction of what it is breaking:
                      // sized by the victim, a glitch on a button tears and the same one on the whole screen
                      // came out as three giant slabs instead
var glitchClear = null; // the timer that will draw it clean
var glitchNo = 0; // which roll this is; everything about it is hashed off this and a slot number
var glitchSeed = Date.now() & 0xffff; // so two loads don't break in exactly the same places. A clock, not
                                      // Math.random: that one belongs to the spawns. Tests pin it to 0

function glitchRand(slot) { // repeatable within a load, and out of the spawns' way
    return fxHash(glitchSeed + glitchNo, slot);
}

function glitchChance() { // hot on arrival, easing to rare over the first couple of seconds
    var settled = Math.min(1, (glitchNo - 1) / GLITCH_SETTLE);
    return GLITCH_ARRIVE + (GLITCH_CHANCE - GLITCH_ARRIVE) * settled;
}

function glitchTargets() { // the pieces it can pick on, in layout coordinates
    var out = [
        { x: 110, y: 135, w: 620, h: 200 }, // the title, and the Japanese line under it
        { x: 90, y: 85, w: 420, h: 50 }, // the slogan
        { x: 0, y: 70, w: LAYOUT_W, h: LAYOUT_H - 140 }, // and sometimes the lot, inside the banners
    ];
    ["start", "break", "focus", "warp", "difficulty", "options", "help", "classic"].forEach(function (name) {
        var g = geom(name);
        if (g) {
            out.push({ x: LAYOUT_W / 2 + g.dx - 6, y: LAYOUT_H / 2 + g.dy - 6, w: g.w + 12, h: g.h + 12 });
        }
    });
    if (recordsLine()) {
        out.push(startLayout() == "classic" ? { x: 230, y: 552, w: 400, h: 34 } : { x: 180, y: 660, w: 440, h: 44 });
    }
    return out;
}

function glitchShove(x, y, w, h, dx) { // slide a band sideways, and leave white where it was
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); dx = Math.round(dx);
    if (w <= 0 || h <= 0 || dx == 0) {
        return;
    }
    ctx.drawImage(gameArea.canvas, x, y, w, h, x + dx, y, w, h);
    ctx.fillStyle = "#ffffff"; // the strip the band left behind, in the screen's own white
    ctx.fillRect(dx > 0 ? x : x + w + dx, y, Math.abs(dx), h);
}

function glitchTear(r, s) { // the piece comes apart in bands, each sliding its own way
    var bands = Math.max(2, Math.min(14, Math.round(r.h / Math.max(3, GLITCH_BAND * s))));
    var bh = r.h / bands;
    for (var i = 0; i < bands; i++) {
        if (glitchRand(10 + i * 2) < 0.3) {
            continue; // not every band moves, or it reads as a wobble rather than a break
        }
        glitchShove(r.x, r.y + i * bh, r.w, bh, (glitchRand(11 + i * 2) - 0.5) * 2 * GLITCH_SHOVE * s);
    }
}

function glitchGhost(r, s) { // a second copy pulls out sideways, tinted: the two colours the screen already wears
    var dx = Math.round((glitchRand(40) < 0.5 ? -1 : 1) * (3 + glitchRand(41) * 7) * s);
    var x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    if (w <= 0 || h <= 0 || dx == 0) {
        return;
    }
    ctx.globalAlpha = 0.45;
    ctx.drawImage(gameArea.canvas, x, y, w, h, x + dx, y, w, h);
    ctx.globalAlpha = 0.22; // tinted in bands rather than as one flat box, so it reads as colour noise
    ctx.fillStyle = dx < 0 ? "#00FFFF" : "#ff00ff";
    for (var i = 0; i < 4; i++) {
        var bh = Math.min(h, Math.round(GLITCH_BAND * s * (0.3 + glitchRand(42 + i * 2) * 0.7)));
        ctx.fillRect(x + dx, Math.round(y + glitchRand(43 + i * 2) * Math.max(0, h - bh)), w, bh);
    }
    ctx.globalAlpha = 1;
}

function glitchCrush(r, s) { // one band squashed into a shorter one, with white under it: a dropped scanline run
    var bh = Math.max(6, Math.min(r.h, GLITCH_BAND * s * (1.5 + glitchRand(50) * 1.5)));
    var by = Math.round(r.y + glitchRand(51) * Math.max(0, r.h - bh));
    var x = Math.round(r.x), w = Math.round(r.w);
    bh = Math.round(bh);
    var nh = Math.max(2, Math.round(bh * (0.35 + glitchRand(52) * 0.4)));
    if (w <= 0 || bh <= 0) {
        return;
    }
    ctx.drawImage(gameArea.canvas, x, by, w, bh, x, by, w, nh);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, by + nh, w, bh - nh);
}

function menuGlitch(force) { // break a piece of the start screen for a moment
    if (gameStart || menuUp() || fxLook() != "full") {
        return; // not the start screen, or the player asked for less motion: this is the noisiest thing on it
    }
    glitchNo++; // every roll, fired or not, so two in a row are never the same damage
    if (force === undefined && glitchRand(1) > glitchChance()) { // kind 0 is a kind, not an absence of one
        return;
    }
    var f = layoutFrame();
    if (!(f.scale > 0)) {
        return; // a window with no size to speak of: nothing to copy from
    }
    drawStartScreen(); // clean first, so a clear that ran late can never let two of them pile up
    var targets = glitchTargets();
    var t = targets[Math.floor(glitchRand(2) * targets.length)];
    var r = { x: f.x + f.scale * t.x, y: f.y + f.scale * t.y, w: f.scale * t.w, h: f.scale * t.h };
    ctx.save();
    useWindow(); // a self-copy is in canvas pixels, whatever the layout was drawn at
    var kind = force === undefined ? Math.floor(glitchRand(3) * 3) : force;
    if (kind == 0) {
        glitchTear(r, f.scale);
    } else if (kind == 1) {
        glitchGhost(r, f.scale);
    } else {
        glitchCrush(r, f.scale);
    }
    ctx.restore();
    if (glitchClear) {
        clearTimeout(glitchClear);
    }
    glitchClear = setTimeout(function () { // whatever it broke, the next clean draw puts back
        glitchClear = null;
        if (!gameStart) {
            drawStartScreen();
        }
    }, GLITCH_HOLD);
}

// start screen animation, stopped when the game starts (same-delay timers run in creation order). Started from
// onLoad rather than while this script runs: menu.js loads before the game's script, and a tick that landed in
// between would reach for the canvas and the game's state before they existed. It also puts every delay after every
// constant -- GLITCH_EVERY was once declared below the old array, which made it undefined there, and setInterval
// read that as 0: the glitches rolled 250 times a second instead of four and a half
var startScreenIntervals = [];

function startMenuTimers() {
    startScreenIntervals = [
        setInterval(updateSloganText, 3000),
        setInterval(focus_break_colors, 100),
        setInterval(click_to_start_colors, 50),
        setInterval(highlightControl, 100),
        setInterval(menuGlitch, GLITCH_EVERY), // and one that breaks a piece of it now and then
    ];
}
