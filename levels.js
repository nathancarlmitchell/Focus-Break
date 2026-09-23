// Focus Break -- a level's beginning and its end. startGame and the touch start that seeds it, the waits between
// levels and the restart from the finish, the message block that lays out the screens between levels and the finish
// itself (measured, centred and fitted to the window, with the lore slot the screen animation types into), gameOver,
// which is where a level cleared or lost becomes records, messages and the next level, and the death message.
// FOCUS BREAK.html loads this with a plain <script src> before its own script, as globals rather than modules, so the
// game still opens straight off disk. Nothing here runs at load beyond three empty variables.
//
// It drives the game rather than reading it: startGame sets it running, gameOver stops it. Both reach into the loop
// (gameArea), the world (clearObjects, component), the powers (endBreak, resumeSpeed, pieceSize), the cards (armLore,
// loreGrace), the records, the effects (fxDieStart, fxNextStart, fxReset, fxGroundClear) and the words (finishLore).

function startGame(e) {
    if (!gameStart) { // first start
        startScreenIntervals.forEach(function (id) { clearInterval(id); });
        loadAudio();
        playSound(aud_click);
        startTime = Date.now();
        startRunRations(); // the difficulty is locked in from here: its button only lives on the start screen
        var size = pieceSize();
        gamePiece = new component(size, size, gamePieceColor, e.pageX - size / 2, e.pageY - size / 2); // centered on the cursor
        gamePiece.update = function () { fxDrawPiece(this); }; // and drawn by the effects: torn, while a Break runs
    }
    gameArea.start();
    gameStart = true;
    alive = true;
    startLevelRations(); // a level gets its powers back, whether it was cleared or died on
    levelStart = Date.now(); // the split clock; startTime runs across the whole run, skipping pauses and pre-rolls
    levelBeat = 0;
    armLore(); // plays only the first time this run sees the level, so a death does not retell the story
    graceSpan = loreGrace(); // ...and that same first visit is the one that gets a pre-roll to read it in
    reachedLevel(level);
    restFrame = null; // the next transition screen gets a fresh copy
    pause = false;
    var cx = gamePiece.x + gamePiece.width / 2;
    var cy = gamePiece.y + gamePiece.height / 2;
    if (inputMode == "touch" && (cx < 0 || cy < 0 || cx > gameArea.canvas.width || cy > gameArea.canvas.height)) {
        // the window shrank between levels: back to the touch start spot (the level starts empty)
        gameArea.x = gameArea.canvas.width * 0.25;
        gameArea.y = gameArea.canvas.height * 0.5;
        gamePiece.x = gameArea.x - gamePiece.width / 2;
        gamePiece.y = gameArea.y - gamePiece.height / 2;
    }
    if (!document.hasFocus()) { // player left during the level transition; wait for them
        setPause(true);
    }
    applyHeldSpeed(); // pick up a power held through the level transition (does nothing while paused)
}

function startTouchGame() { // start from a tap: the square starts at the left middle, and sounds are unlocked in this tap
    [aud_bomb, aud_menuSound, aud_death, aud_danger, aud_powerUp, aud_pickupCoin].forEach(function (sound) {
        // mobile browsers only let a sound play later if it was first played during a tap; pausing at once keeps it silent
        // (a later reset, once play() settles, could stop the sound's first real use on a slow connection)
        var playing = sound.play();
        sound.pause();
        if (playing) {
            playing.catch(function () {}); // pausing before playback starts rejects play()
        }
    });
    var startX = gameArea.canvas.width * 0.25;
    var tb = touchButtons();
    if (tb.side == "left") { // that quarter is where the buttons are now: start clear of them, no further
        startX = Math.max(startX, tb.box.right + 40);
    }
    var startY = gameArea.canvas.height * 0.5;
    startGame({ pageX: startX, pageY: startY });
    gameArea.x = startX; // the steering target starts on the square
    gameArea.y = startY;
}

var nextWait = 0; // how long the screen just put up is going to stay, so the transition can play for exactly that

function wait(time) {
    nextWait = time;
    setTimeout(startNextLevel, time);
}

function restartRun() { // after the finish screen, start a fresh run from level 1
    runFinished = false;
    restartArmed = false;
    level = 1;
    deaths = 0;
    perfectClear = 0; // the hitbox shrink is earned again each run
    score = 0;
    grazeClear();
    startRunRations();
    scoreLimitReached = false;
    startTime = Date.now();
    loreReset();
    setPieceSize(pieceSize());
    startNextLevel();
}

function startNextLevel() {
    gameArea.clear();
    startGame();
    setMusicVolume(musicVolume); // back up from level 9's duck; every other transition is already at full
}

// The death and between-levels messages used to be laid out inside the same 1280x800 frame as the start screen and
// scaled with it. A phone therefore had to fit 800px of height the messages never use -- they only ever fill a band
// about 865 by 337 in the middle of that frame -- and showed them at 0.487 when there was room for nearly full size.
// The lines were centred by eye too, which left the finish screen sitting 134px to the left of the middle.
// A message is now collected line by line, measured, and drawn as one block: every line truly centred, the block
// centred on the screen, and the whole thing scaled to fill it. It is the one band that has to be measured at draw
// time rather than written down, because the lines it holds depend on the level, the score and the deaths.
var msgBlock = []; // the lines queued so far, measured and drawn by showMessage
var msgLore = null; // the lore slot showMessage laid out under the last block, if one was queued: where it is, in the
                    // block's own frame, and the beats that go in it. fxNextStart takes it and types them in
var msgTally = null; // and the score's tally slot, likewise: where it is and the score. fxNextStart takes it and counts
                     // it up; when there is no animation to do that, drawDeathMessage draws it whole at once

function centerText(text, dy, passes) { // queue a line dy from the block's baseline, in the font and fill set now;
    // passes > 1 repeats it 1px down and right for a bold look
    msgBlock.push({ text: text, dy: dy, passes: passes || 1, font: ctx.font, fill: ctx.fillStyle });
}

var PRINT_TRAIL = 8; // copies a printed line trails: the title trails ten at 80px

function printText(text, dy) { // queue a line printed as the title is: cyan copies trailing up and left, a pixel apart,
    // and magenta over them, in the font set now
    msgBlock.push({ text: text, dy: dy, passes: 1, font: ctx.font, fill: "#ff00ff", print: "#00FFFF", trail: PRINT_TRAIL });
}

function msgBottom() { // the lowest line queued so far, so another can be put under whatever a branch put up
    var low = 0;
    for (let i = 0; i < msgBlock.length; i++) {
        low = Math.max(low, msgBlock[i].dy);
    }
    return low;
}

function showSplit() { // the level's time under the message, and what it was before, on every cleared screen
    if (levelBeat <= 0) {
        return; // nothing timed: a level that was never played can't have a split
    }
    var best = rec().level[level - 1]; // recordLevel has already taken it, and level has already moved on
    ctx.font = "30px Arial";
    ctx.fillStyle = levelRecord ? "#48D1CC" : "black";
    centerText(splitText(levelBeat) + (levelRecord ? "   NEW BEST" : "   best " + splitText(best)),
        msgBottom() + 80);
}

function loreSlot(beats) { // queue a screen's lore under whatever is queued so far: a slot as tall as the tallest
    // beat, since they replace one another in it, and as wide as the widest line, laid out with the block so the
    // whole thing shrinks together on a small window. The beats are typed into it by the screen's animation
    // (fxDrawScreenLore), not drawn by showMessage, which only leaves room for them
    if (!beats.length) {
        return;
    }
    ctx.font = FX_LORE_FONT + "px Arial";
    var rows = 0, wide = 0;
    for (var i = 0; i < beats.length; i++) {
        rows = Math.max(rows, beats[i].length);
        for (var k = 0; k < beats[i].length; k++) {
            wide = Math.max(wide, ctx.measureText(beats[i][k]).width);
        }
    }
    msgBlock.push({ lore: beats, dy: msgBottom() + FX_SCREEN_DROP, rows: rows, wide: wide, font: ctx.font });
}

// The score on the death screen: a number printed twice, as the title is, counting up to what it was. It replaces a
// red "Score: N" in the message's own font
var TALLY_DY = -54; // its baseline in the block: the number sits centred between the "Try Again" above and the Japanese
                    // line below, box to box, to within a pixel. The headline's box ends 17px under its baseline at
                    // -175, the Japanese line's begins 51px over its at 45, and the digits reach 58px above theirs and
                    // 1px below, which leaves 46 above the number and 47 below it
var TALLY_FONT = 80; // px of the number, against the message's 60
var TALLY_GAP = 47; // px from the number's baseline to the box of the life line when that comes straight under it: the
                    // Japanese line's distance, so that screen is spaced as the Try Again one is

function tallySlot(value, dy) { // queue the score's tally with the message: as wide as the number, and laid out with the
    // block so the whole thing shrinks together on a small window. Drawn by the death screen's animation, which counts
    // it up, or whole at once by drawDeathMessage when there is none
    ctx.font = TALLY_FONT + "px Arial";
    msgBlock.push({ tally: value, dy: dy, wide: ctx.measureText(String(value)).width, font: ctx.font });
}

function drawTally(at, shown, flourish) { // the tally as it stands: `shown` on its way to the score, and the flourish
    // the landing gets, 1 as it lands and 0 once it has faded
    ctx.save();
    ctx.setTransform(at.s, 0, 0, at.s, at.cx, at.cy); // the block's own frame, as showMessage drew it
    ctx.textAlign = "center";
    ctx.font = TALLY_FONT + "px Arial";
    var text = String(shown);
    if (flourish > 0) { // the hundreds' own flourish, as the HUD prints one: stacked copies trailing up and left
        ctx.globalAlpha = FX_MILE_ALPHA * flourish * flourish;
        for (var i = FX_MILE_PASSES; i > 0; i--) {
            ctx.fillStyle = i * 2 <= FX_MILE_PASSES ? "#ff00ff" : "#00FFFF";
            ctx.fillText(text, at.x - i, at.y - i);
        }
        ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#00FFFF"; // printed twice: cyan up and left, magenta over it
    ctx.fillText(text, at.x - 3, at.y - 3);
    ctx.fillStyle = "#ff00ff";
    ctx.fillText(text, at.x, at.y);
    ctx.restore();
}

function showMessage() { // draw the queued lines centred and as large as this screen allows, and return that scale
    msgLore = null;
    msgTally = null;
    if (!msgBlock.length) {
        return 1;
    }
    var left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < msgBlock.length; i++) {
        var line = msgBlock[i];
        ctx.font = line.font;
        if (line.lore) { // the slot: measured into the block by its font's reach and its tallest beat, and left empty
            var reach = ctx.measureText("Ag");
            left = Math.min(left, -line.wide / 2);
            right = Math.max(right, line.wide / 2);
            top = Math.min(top, line.dy - reach.actualBoundingBoxAscent);
            bottom = Math.max(bottom, line.dy + (line.rows - 1) * FX_LORE_LINE + reach.actualBoundingBoxDescent);
            continue;
        }
        if (line.tally !== undefined) { // the tally slot: the number's reach above and below its baseline
            var digit = ctx.measureText("0");
            left = Math.min(left, -line.wide / 2);
            right = Math.max(right, line.wide / 2);
            top = Math.min(top, line.dy - digit.actualBoundingBoxAscent);
            bottom = Math.max(bottom, line.dy + digit.actualBoundingBoxDescent);
            continue;
        }
        var m = ctx.measureText(line.text);
        left = Math.min(left, -m.width / 2);
        right = Math.max(right, m.width / 2 + line.passes - 1); // the bold passes reach 1px further for each repeat
        top = Math.min(top, line.dy - m.actualBoundingBoxAscent - (line.trail || 0)); // and a print's trail reaches up
        bottom = Math.max(bottom, line.dy + m.actualBoundingBoxDescent + line.passes - 1); // and left, as far as it is long
        left = Math.min(left, -m.width / 2 - (line.trail || 0));
    }
    var s = fitBand(right - left, bottom - top);
    var dx = -(left + right) / 2;
    var dy = -(top + bottom) / 2; // the lines sit mostly above their baseline, so the block has to come down to the middle
    ctx.setTransform(s, 0, 0, s, gameArea.canvas.width / 2, gameArea.canvas.height / 2);
    ctx.textAlign = "center";
    for (let i = 0; i < msgBlock.length; i++) {
        var l = msgBlock[i];
        if (l.lore) { // the block's frame, and the slot's first baseline in it: the animation draws there
            msgLore = { s: s, cx: gameArea.canvas.width / 2, cy: gameArea.canvas.height / 2, x: dx, y: l.dy + dy, beats: l.lore };
            continue;
        }
        if (l.tally !== undefined) { // likewise for the tally
            msgTally = { s: s, cx: gameArea.canvas.width / 2, cy: gameArea.canvas.height / 2, x: dx, y: l.dy + dy, value: l.tally };
            continue;
        }
        ctx.font = l.font;
        if (l.trail) { // a printed line: the copies trailing up and left first, then the line over them
            ctx.fillStyle = l.print;
            for (let q = l.trail; q > 0; q--) {
                ctx.fillText(l.text, dx - q, l.dy + dy - q);
            }
        }
        ctx.fillStyle = l.fill;
        for (let p = 0; p < l.passes; p++) {
            ctx.fillText(l.text, dx + p, l.dy + dy + p);
        }
    }
    ctx.textAlign = "start"; // the rest of the game draws left-aligned text
    msgBlock.length = 0;
    return s;
}

function finishedBefore() { // has a run been finished here before, on any difficulty: this screen has been seen
    for (var name in records.modes) {
        if (records.modes[name].run) {
            return true;
        }
    }
    return false;
}

// finishLore, the finish screen's beats, is in lore.js with the rest of the words: it reads the run (deaths, the
// difficulty, the lives and charges left, the hitbox shrink) and is called from gameOver below

function gameOver() { // the level was cleared or the player died
    gameArea.stop(); // first: with another step still pending, fxOverdrawn would keep the shatter's redraw below
                     // from drawing any of the effects
    var levelCleared = score >= scoreLimit || scoreLimitReached;
    var shattering = false;
    if (!levelCleared) { // before anything changes -- the square still alive, still its Focus size, still on what
        // hit it -- the shatter draws the level as it stands, holds that, and rings the obstacle. If it starts,
        // it plays over the held frame and draws the message itself when it finishes
        var died = score;
        shattering = fxDieStart(function () { drawDeathMessage(died); });
    }
    alive = false;
    endBreak(); // a level can end mid-break
    resumeSpeed(); // which also puts the music's rate back, whatever power the level ended under
    scoreLimitReached = false;
    lifeSpent = false;
    gameArea.clear();
    clearObjects();
    fxReset(); // the screen is cleared for the message: nothing of the effects carries over (die is deliberately not fx)
    if (!shattering) {
        fxGroundClear(); // and with no frame held under the message, the ground it sits on is the page's white
    }
    gameArea.canvas.style.cursor = "default"; // every screen below sets its own font. All of them are printed as the
    // title is, in the game's own ink, the death and the finish included, but one: the level 9 warning is an alarm,
    // and keeps the obstacles' red
    if (levelCleared) { // Next level
        recordLevel(level); // the split for the one just flown, before level moves on
        level++;
        if (level == 16){ // true finish
            var runMs = Date.now() - startTime;
            var seenBefore = finishedBefore(); // before this run is recorded, or it would always have been
            var runBest = recordRun(runMs, deaths);
            ctx.font = "80px Arial"; // the headline at the title's size, printed as the title is, like the death's
            if (deaths == 0){
                printText("Flawless Victory", -175);
            } else { // in the past tense, since they did: "Can you continue?" read as the arcade's continue prompt
                printText("You continued.", -175);
                ctx.font = "60px Arial";
                printText("It cost you " + mistakes(deaths) + ".", -87);
            }
            ctx.font = "60px Arial";
            printText("Time: " + millisToMinutesAndSeconds(runMs), 0);
            ctx.font = "30px Arial";
            ctx.fillStyle = runBest ? "#48D1CC" : "black";
            centerText(runBest ? "NEW BEST" : "best " + millisToMinutesAndSeconds(rec().run)
                + "   " + mistakes(rec().runDeaths), 45);
            ctx.fillStyle = "black";
            if (inputMode == "touch") {
                ctx.font = "40px Arial";
                centerText("Tap to play again", 100);
            } else {
                ctx.font = "30px Arial";
                centerText("Click or press R to play again", 100);
            }
            loreSlot(finishLore(runBest, seenBefore)); // under all of it, arriving one beat at a time
            showMessage();
            runFinished = true;
            finishTime = Date.now();
            restartArmed = false; // a click already in progress (e.g. held for Focus) shouldn't restart
            useWindow();
            fxNextStart(0, true); // the words, for as long as the screen is up: no wait ends this one, the restart does
            return;
        } else if (level == 10){ // you win
            ctx.font = "80px Arial";
            printText("Victory is a state of mind", -175);
            ctx.font = "60px Arial";
            printText("勝利は心の状態です", -75);
            showSplit();
            loreSlot(VICTORY_LORE); // and under it, late and in grey, that it is not over
            showMessage();
            ctx.fillStyle = "#ff00ff"; // the stripes in the same ink, rather than in whatever the last line left set
            drawBanners(40, 20, bannerScale());
            wait(5000);
        } else if (level == 9){
            setMusicVolume(musicVolume * MUSIC_DUCK); // the album drops under the siren for the warning, and
            playSound(aud_bomb); // comes back up when the level starts. It is ducked, never stopped
            ctx.font = "80px Arial"; // the one screen in the obstacles' red, on purpose: it is an alarm, and the
            ctx.fillStyle = "red"; // siren under it says so too
            centerText("WARNING 警告", -175, 3);
            centerText("多数の敵が接近する", -75, 3);
            showSplit();
            showMessage();
            ctx.fillStyle = "red"; // and its stripes with it, which used to take the split line's colour instead
            drawBanners(40, 30, bannerScale());
            wait(3500);
        } else if (deaths == 0) { // perfect clear
            playSound(aud_menuSound);
            ctx.font = "60px Arial";
            if (perfectClear < 7){ // decrease hitbox size
                perfectClear++;
                printText("Hitbox size decreased!", -75);
                printText("ヒットボックスを減らす!", 50);
            }
            ctx.font = "80px Arial";
            printText("+ Perfect 完全 +", -175);
            showSplit();
            showMessage();
            ctx.fillStyle = "#ff00ff";
            drawBanners(40, 20, bannerScale());
            wait(3000);
        } else { // normal clear
            ctx.font = "80px Arial";
            printText("Enemies Approaching", -175);
            ctx.font = "60px Arial";
            printText("非常に大きな敵に接近する危険!", -50);
            printText("慎重に進んでください!", 25);
            showSplit();
            showMessage();
            wait(3000);
        }
        useWindow(); // the message is down: hold it and play the transition under and over it
        fxNextStart(nextWait);
    } else { // you lose
        deaths += 1;
        lifeSpent = runLives > 0;
        if (lifeSpent) { // a life buys the level's progress back: the death reads as a transition, not a reset
            runLives--;
            grazeLevel(); // and the graze bank comes with it, as it does between levels
        } else {
            grazeClear(); // the level starts again from nothing, the graze bank with it
        }
        playSound(aud_death);
        if (!shattering) { // with the shatter running, this is drawn when it finishes instead
            drawDeathMessage(score);
        }
        wait(2500);
    }
    useWindow();
    if (!lifeSpent) {
        score = 0; // a cleared level starts the next one at nothing; a life is what keeps a death from doing it
    }
}

function drawDeathMessage(shown) { // the message after a death. Takes the score because with the shatter running it is
    // drawn after gameOver has already reset it
    tallySlot(shown, TALLY_DY); // the score: counted up by the screen's animation, or drawn whole at the end of this
    var deathSlogan = { 69: "😂", 420: "blaze it", 666: "😈", 911: "TOO SOON", 999: "TOO HARD" }[shown]; // special scores
    var sloganRow = 45; // the row under the score, which only the ordinary scores have anything in
    var numberLast = true; // is the number the lowest thing queued, so the life line, if there is one, goes straight under it
    ctx.font = "80px Arial"; // the headline: the title's size, and printed as the title is, in the game's own ink
    if (shown >= 900) { // rather than the red the obstacles wear
        printText("So Close", -175);
    } else if (shown <= 100) {
        printText("...", -175);
    } else {
        printText("Try Again", -175);
        ctx.font = "60px Arial";
        printText("再試行する", 45);
        sloganRow = 145; // taken: centred, the slogan would land straight on top of it instead of beside it
        numberLast = false;
    }
    if (deathSlogan) { // the joke, in the same magenta, plainly: an emoji takes no ink, and would double up printed
        ctx.font = "60px Arial";
        ctx.fillStyle = "#ff00ff";
        centerText(deathSlogan, sloganRow);
        numberLast = false;
    }
    if (lifeSpent) {
        ctx.font = "30px Arial";
        ctx.fillStyle = "#48D1CC";
        var lifeRow = msgBottom() + 80; // under the Japanese line or the slogan, at the drop the split takes on the other screens
        if (numberLast) { // straight under the number, at the Japanese line's distance from it, box to box (msgBottom is no
            lifeRow = TALLY_GAP + TALLY_DY + ctx.measureText("LIFE SPENT").actualBoundingBoxAscent; // use here: it floors at 0)
        }
        centerText("LIFE SPENT   score kept   " + runLives + " left", lifeRow);
    }
    showMessage();
    useWindow();
    if (!fxNextStart(0, true)) { // no animation to count it up (the look with no motion, or no canvas to hold): whole
        drawTally(msgTally, shown, 0);
        msgTally = null;
    }
}
