// Focus Break -- the loop. The game's state, the boot, the fixed-step loop and the step itself. Everything else is
// one of the plain scripts FOCUS BREAK.html loads before this one, in the order its tags give, and every one of them
// is reached as globals: the world and the powers are what the step moves, the cards and the HUD are what it draws,
// the effects read all of it, and the menus, the level flow and the input drive it from outside. This is the last
// script the page loads; onLoad, below, is what its body calls once it has.


// game play variables
var x = window.innerWidth;
var y = window.innerHeight;
var startTime; // when the run started (ms); moved forward by time spent paused
var pauseStart;
var restFrame = null; // uncropped copy of the between-levels screen, for redrawing after resizes
var gamePiece;
var gamePieceColor = "blue";

var invincible = false;
var gameStart = false;
var alive = false;
var focused = false;
var pause = false;

var score = 0;
var scoreBank = 0; // fractional score carried between steps, so the graze multiplier needn't land on whole points
var scoreLimit = 1000;
var powerupScoreBonus = 50;
var scorePenalty = 250; // point deduction for break
var deaths = 0;
var invincibleTime = 0;
var invincibleTimeMax = 200;
var perfectClear = 0;
var scoreLimitReached = false; // level cleared, even if score later drops below the limit
var runFinished = false; // level 15 cleared; the finish screen is showing
var restartArmed = false; // a click began on the finish screen
var finishTime = 0; // when the finish screen appeared
var level = 1;
var speed = 1;
var speed_slow = 0.25;
var speed_fast = 2;
var showFrame = true; // is this step's picture going to be seen, or is another step already due to replace it


function onLoad() {
    loadSettings(); // before anything is drawn, so the start screen opens on the settings that are in force
    loadRecords(); // and on whatever previous runs left behind
    gameArea.load();
    updateSloganText();
    startMenuTimers(); // the start screen's flashers and glitches, now that everything they draw with exists
    playSound(aud_startup); // startup sound; browsers usually block it until the first click
}


var gameArea = {
    canvas: document.createElement("canvas"),
    load: function () {
        this.tall = window.innerHeight > window.innerWidth;
        // phones and tablets always play landscape: held upright, the canvas is turned a quarter clockwise
        // (orientation locking needs fullscreen on Android and isn't available on iOS)
        rotated = this.tall && screenUpright() && !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
        this.canvas.width = rotated ? window.innerHeight : window.innerWidth;
        this.canvas.height = rotated ? window.innerWidth : window.innerHeight;
        this.canvas.style.transformOrigin = "0 0";
        this.canvas.style.transform = rotated ? "rotate(90deg) translateY(-100%)" : "";
        x = this.canvas.width; // the screens are drawn across the whole canvas
        y = this.canvas.height;
        if (this.inputBound) {
            return; // load() re-runs on resize; only insert the canvas and register input listeners once
        }
        this.inputBound = true;
        document.body.insertBefore(this.canvas, document.body.childNodes[0]);
        bindInput(); // the touch, mouse, keyboard and page listeners, in input.js
    },
    start: function () {
        fxDieStop(); // a shatter still playing would draw its held frame over the level starting underneath it
        fxNextStop(); // and so would the between-levels screen
        this.canvas.style.cursor = "none"; // hide the original cursor
        this.frameNo = 0;
        this.spawnClock = 0; // game time for spawning, advanced by the game speed each step
        grazeLevel(); // the charges carry into it; the pass in progress and the part point don't
        fxReset(); // no fade, trail or echo carried into the level
        this.stop(); // never run two loops
        this.running = true;
        this.lastTime = performance.now();
        this.pendingTime = 0;
        this.frameRequest = requestAnimationFrame(runSteps);
    },
    clear: function () {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    stop: function () {
        this.running = false;
        cancelAnimationFrame(this.frameRequest);
    }
};

// The game advances in fixed 10ms steps, 100 a second (the speed it was tuned for): every display frame runs
// as many steps as real time has covered, so a slow or busy machine doesn't slow the game down.
var STEP_MS = 10;
var MAX_CATCH_UP_MS = 100; // after a longer stall, resume instead of fast-forwarding through it

function runSteps(now) {
    if (!gameArea.running) {
        return;
    }
    gameArea.pendingTime += Math.min(Math.max(now - gameArea.lastTime, 0), MAX_CATCH_UP_MS);
    gameArea.lastTime = now;
    while (gameArea.running && gameArea.pendingTime >= STEP_MS) { // a step can end the level, which stops the loop
        gameArea.pendingTime -= STEP_MS;
        updateGameArea();
    }
    if (gameArea.running) {
        gameArea.frameRequest = requestAnimationFrame(runSteps);
    }
}
var ctx = gameArea.context = gameArea.canvas.getContext("2d"); // the one drawing context (resizing resets its state, not the object)


// The pre-roll. A level the run has not reached before opens with its card typing itself out over an empty
// field, and the level proper begins when the last character lands. Nothing spawns and nothing scores until
// then. The scoring half is not caution: score is a clock rather than a reward for dodging, so a grace with
// it still running would not shorten the level -- except under Warp, which doubles the rate and would be
// completely safe for the whole pre-roll. Three and a half seconds of that is a third of a level banked
// before anything can touch you, against splits that are records now. levelStart is set when the pre-roll
// ends for the same reason: the split times the level, not the reading.
// A death replays the level without a card, so it gets no pre-roll either. One flag decides both.
var graceSpan = 0; // steps of pre-roll this level opened with, 0 for a level being replayed

function loreGrace() { // how long the card takes to finish typing, in steps: the pre-roll's length.
    // Built from the text and the constants alone and never from fxLook -- the look changes how a card
    // arrives, not how long it takes, and the simulation has to be identical with the effects off
    if (!FX_LORE_ON || !lorePlaying) {
        return 0;
    }
    return loreCards[loreCards.length - 1].end; // the last character of the last of them
}

function inGrace() { // is the level still being read rather than played
    return gameArea.frameNo <= graceSpan;
}

function playFrame() { // steps of the level actually played, which is what frameNo was before this existed.
    // The card and the level name keep their own clock on frameNo: they are what the pre-roll is for
    return gameArea.frameNo - graceSpan;
}


function drawLevel() { // draw the level as it stands, without moving anything (used while paused)
    gameArea.clear();
    fxDrawBackdrop(); // the power effects as they stood when play stopped
    drawLevelName();
    drawLore();
    [powerups.break, powerups.score].concat(obstacleLists()).forEach(function (objects) {
        objects.forEach(function (obj) {
            obj.update();
        });
    });
    fxDrawAfterimages();
    drawProgress();
    drawTouchControls();
    gamePiece.update();
    useHud();
    drawStats("black");
    useWindow();
    fxDrawScreen(fxLook()); // the CRT last, over the finished picture (the other of its two call sites is updateGameArea)
}

function updateGameArea() {
    if (!pause){
        if (!invincible && hitObstacle()) { // detect collisions
            gameOver();
            return;
        }

        collectPowerUps();

        // The loop runs 100 fixed steps a second against a screen that refreshes 60 times, so a step that another
        // step is already due to overwrite was drawing a picture nobody ever saw -- on a phone that was better than
        // two in five of them. Such a step is still simulated in full; it just isn't painted. Everything that draws
        // below is gated on this, EXCEPT the getRandomColor() calls sitting among them: those draw from the same
        // Math.random the spawns do, so skipping one would change what the level spawns next.
        showFrame = !fxOverdrawn();
        if (showFrame) {
            gameArea.clear();
        }
        gameArea.frameNo += 1;
        if (graceSpan > 0 && playFrame() == 1) { // the pre-roll just ended, on this step. The reading is outside the
            // run's time as it is outside the split's, the way a pause is: a run is its levels, and LEVEL_LORE is
            // placeholder text, so a rewrite must not move every stored best. levelStart is where the level began,
            // carried past any pause inside the pre-roll as startTime was, so the reading is measured from it
            startTime += Date.now() - levelStart;
            levelStart = Date.now(); // the split times the level, not the reading
            applyHeldSpeed(); // and a power held through it takes effect now, as one held through a pause does
        }
        gameArea.lastSpawnClock = gameArea.spawnClock;
        if (!inGrace()) {
            gameArea.spawnClock += speed; // held through the pre-roll, so nothing spawns and nothing is due
        }
        fxStep(); // power effects: fade toward the power in use
        fxDrawBackdrop(); // Focus's vignette and Warp's speed lines, under everything drawn below

        if (invincible) {
            if (showFrame) {
                ctx.fillRect((gamePiece.x + gamePiece.width / 2 - 50 + invincibleTime / 2), (gamePiece.y + gamePiece.height / 2 - 25),(invincibleTimeMax - invincibleTime), (15)); // display invincible progress
            }
            invincibleTime += focused ? 2 : 1;
            gamePiece.color = getRandomColor();
            if (invincibleTime >= invincibleTimeMax) {
                endBreak();
            }
        }

        if (showFrame) {
            drawLevelName();
            drawLore();
        }
        // Object Spawning
        if (clockDue(250) && !focused) { // powerup (none during Focus or Warp), even odds of each kind
            if (Math.random() >= 0.5) {
                powerups.break.push(edgeBlock(15, 15, getRandomColor()));
            } else {
                powerups.score.push(edgeBlock(20, 20, getRandomColorGold()));
            }
        }
        SPAWN_RULES.forEach(function (rule) {
            if (level >= rule.from && (rule.to === undefined || level <= rule.to) && spawnDue(rule.every)) {
                var obj = rule.make();
                if (rule.lane) {
                    obstacles[rule.lane].push(obj);
                }
            }
        });
        if (level >= 15 && spawnDue(20)) { // level 15 keeps forcing Warp
            var speedBefore = speed;
            setFastSpeed();
            gameArea.spawnClock += speed - speedBefore; // this step's objects move at the new speed; keep the spawn clock in step
        }

        moveObjects(powerups.break, 3, getRandomColor());
        moveObjects(powerups.score, 3, getRandomColorGold());
        for (var lane in OBSTACLE_SPEEDS) {
            moveObjects(obstacles[lane], OBSTACLE_SPEEDS[lane]);
        }

        if (gameArea.x !== undefined && movePiece(gameArea.x - gamePiece.width / 2, gameArea.y - gamePiece.height / 2)) { // center the hitbox on the cursor
            gameOver();
            return;
        }
        grazeStep(); // everything has moved: how close the square just came, and what that has banked
        fxRecord(); // where the square is now, for the Warp trail and Focus echoes
        fxDrawAfterimages(); // over the obstacles and the level's bars, under the HUD, touch buttons and square
        if (showFrame) {
            drawProgress(); // under the power banners below, which take the same slot and matter more while they're up
            useHud(); // score, deaths, level and the power messages
        }
        if (invincible) { // BREAK
            var flash = getRandomColor(); // drawn or not, this runs: it shares Math.random with the spawns
            if (showFrame) {
                ctx.fillStyle = flash;
                ctx.globalAlpha = 0.75;
                ctx.font = "60px Arial";
                ctx.fillText("BREAK! 壊れる", 200, 200);
                drawBanners(40, 20);
                ctx.globalAlpha = 0.8;
                drawStats(flash, "red");
                ctx.globalAlpha = 1.0;
            }
        } else if (showFrame) {
            drawStats("black");
        }
        if (speed == 1) {
            if (gameArea.frameNo % 2 == 0){
                addScore(1);
            }
        } else if (speed == speed_slow) { // FOCUS
            if (graze.burning && gameArea.frameNo % GRAZE_BURN_EVERY == 0) {
                addScore(1); // a charge is paying: the level keeps moving, at half the rate and a quarter the risk
            }
            if (showFrame) {
                ctx.globalAlpha = 0.75;
                drawBanners(40, 30);
                ctx.fillStyle = "red";
                ctx.font = "60px Arial";
                ctx.fillText("FOCUS! 焦点", 200, 200);
                ctx.font = "40px Arial";
                ctx.fillText(score, 50, 100);
                ctx.globalAlpha = 1.0;
            }
        } else if (speed == speed_fast){
            if (aud_danger.paused) { // it was being asked to play on every one of the 100 steps a second Warp runs for
                playSound(aud_danger);
            }
            var warpInk = getRandomColor(); // as with the Break flash: this runs whether or not it is painted
            if (showFrame) {
                ctx.fillStyle = "red";
                ctx.globalAlpha = 0.8;
                drawBanners(40, 30);
                ctx.globalAlpha = 1.0;
                ctx.font = "60px Arial";
                if (everyinterval(1)) {
                    ctx.fillText("DANGER! 危険", 200, 200);
                }
                ctx.font = "40px Arial";
                ctx.fillStyle = warpInk;
                ctx.fillText("+", 120, 100);
                ctx.fillText(score, 50, 100);
            }
            addScore(1); // Warp's double rate, itself multiplied by whatever grazing has banked
        }
        if (showFrame) {
            if (inputMode == "touch" && level == 1 && playFrame() < 200) { // first seconds of a touch run
                ctx.fillStyle = "black";
                ctx.font = "30px Arial";
                ctx.fillText("DRAG ANYWHERE TO STEER", 200, 260, gameArea.canvas.width / hudScale() - 220); // squeezed to fit a narrow window
            }
            drawTouchControls(); // over the HUD and the power stripes, under the square
            useWindow();
            gamePiece.update();
        }
        fxDrawScreen(fx.look); // the CRT last, over everything. Before the level-cleared check below, whose gameOver
                               // clears the canvas anyway and draws the between-levels message on a clean one
        if (score >= scoreLimit) {
            scoreLimitReached = true; // stays set if a break penalty drops the score back below the limit
        }
        if (scoreLimitReached) { // score limit reached
            if (level == 9){ // play until you die
                var lvl9Ink = getRandomColor(); // runs either way, as above
                if (showFrame) {
                    useHud();
                    ctx.fillStyle = lvl9Ink;
                    ctx.fillText(score, 50, 100);
                    useWindow();
                }
            } else {
                gameOver();
            }
        }
    } // while paused, nothing updates; setPause draws the pause screen once
}

function everyinterval(n) {
    if ((((gameArea.frameNo) / (n)) % 2) == 0) { return true; }
    return false;
}
