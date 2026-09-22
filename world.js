// Focus Break -- the world. Obstacles by lane, which sets how fast they move; the component every obstacle,
// powerup and the square itself is made of, and the hit test between them; the square's movement toward the cursor,
// in steps that cannot jump an obstacle; what each level spawns and when; the refit after a resize; and the random
// helpers, which draw from the one stream the spawns come out of. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

// obstacles by lane (the lane sets how fast they move) and powerups; clearObjects replaces the lists
const OBSTACLE_SPEEDS = { slow: 1, medium: 2, fast: 4, hyper: 5 }; // pixels per frame at normal speed
var obstacles, powerups;
var lanes; // the four obstacle lists in one array, slowest first, rebuilt with them. hitObstacle wants it once per
           // 5px of the square's travel every step, so it is built here and never per call
function clearObjects() {
    obstacles = { slow: [], medium: [], fast: [], hyper: [] };
    lanes = [obstacles.slow, obstacles.medium, obstacles.fast, obstacles.hyper];
    powerups = { break: [], score: [] };
}
clearObjects();
function obstacleLists() { // every obstacle list, slowest lane first: the one array, so it is read and never altered
    return lanes;
}

function component(width, height, color, x, y) {
    this.width = width;
    this.height = height;
    this.color = color;
    this.x = x;
    this.y = y;
    this.update = function () {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    };

    this.crashWith = function (otherobj) {
        if (otherobj.width <= 0 || otherobj.height <= 0) {
            return false; // nothing drawn (e.g. a bar squeezed off screen by a resize), so nothing to hit
        }
        return !(this.y + this.height < otherobj.y || this.y > otherobj.y + otherobj.height ||
                 this.x + this.width < otherobj.x || this.x > otherobj.x + otherobj.width); // touching edges count as a hit
    };
}

function detectCollision(objects) { // is gamePiece touching anything in this list. A plain loop: movePiece asks for
    // every list once per 5px of travel a step, and .some allocated a closure on each of those
    for (var i = 0; i < objects.length; i++) {
        if (gamePiece.crashWith(objects[i])) {
            return true;
        }
    }
    return false;
}

function collectPowerUps() { // apply any powerup gamePiece is touching
    if (detectCollision(powerups.break)) {
        playSound(aud_powerUp);
        if (invincible) {
            fxPop(0, powerups.break); // a refill opens no break, so it gets its own ring; setBreak's shockwave covers the rest
        }
        powerups.break = [];
        if (invincible) {
            invincibleTime = 0; // refill an active break instead of wasting the powerup
        } else {
            setBreak(0);
        }
    }
    if (detectCollision(powerups.score)) {
        playSound(aud_pickupCoin);
        fxPop(1, powerups.score);
        powerups.score = [];
        score += powerupScoreBonus;
    }
}

function hitObstacle() { // is gamePiece touching any obstacle
    for (var i = 0; i < lanes.length; i++) {
        if (detectCollision(lanes[i])) {
            return true;
        }
    }
    return false;
}

function movePiece(targetX, targetY) { // move gamePiece to the cursor, returns true on a crash
    // step at most 5px at a time so fast mouse moves (or moving while paused) can't jump over obstacles
    var startX = gamePiece.x;
    var startY = gamePiece.y;
    var dx = targetX - startX;
    var dy = targetY - startY;
    var steps = invincible ? 1 : Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
    for (let s = 1; s <= steps; s += 1) {
        gamePiece.x = startX + dx * s / steps;
        gamePiece.y = startY + dy * s / steps;
        collectPowerUps(); // pick up powerups along the way too
        if (!invincible && hitObstacle()) {
            return true;
        }
    }
    return false;
}

function heightScaledBlock(fraction, color) { // square sized as a fraction of the screen height, spawned at the right edge
    var size = gameArea.canvas.height * fraction;
    var block = new component(size, size, color, gameArea.canvas.width, Math.random() * gameArea.canvas.height);
    block.heightFraction = fraction; // lets fitObstaclesToWindow keep its proportion after a resize
    return block;
}

function fitObstaclesToWindow() { // after a resize, refit obstacles whose size depends on the screen height
    var canvasHeight = gameArea.canvas.height;
    obstacleLists().forEach(function (objects) {
        objects.forEach(function (obj) {
            var before = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
            if (obj.barGap) {
                // keep the gap where it is (the square may be in it), moving it up only if the
                // window got too short to show it, so a bar pair never becomes a solid wall
                var gapTop = obj.barGap.top ? obj.height : obj.y - obj.barGap.size;
                gapTop = Math.max(0, Math.min(gapTop, canvasHeight - obj.barGap.size));
                if (obj.barGap.top) {
                    obj.height = gapTop;
                } else { // the bottom bar always reaches the bottom edge
                    obj.y = gapTop + obj.barGap.size;
                    obj.height = Math.max(0, canvasHeight - obj.y);
                }
            }
            if (obj.heightFraction) {
                resizeAroundCenter(obj, canvasHeight * obj.heightFraction);
            }
            if (gamePiece.crashWith(obj) && !gamePiece.crashWith(before)) {
                Object.assign(obj, before); // growing onto the square would be an unavoidable death; keep the old size
            }
        });
    });
}

function moveObjects(objects, amount, recolor) { // move left, drop what's off screen, draw the rest (optionally recolored)
    for (let i = objects.length - 1; i >= 0; i -= 1) {
        objects[i].x += -amount * speed; // speed of obstacles
        if (objects[i].x + objects[i].width < 0) { // remove once off screen
            objects.splice(i, 1);
            continue;
        }
        if (recolor) {
            objects[i].color = recolor;
        }
        if (showFrame) {
            objects[i].update();
        }
    }
}

function clockDue(every) { // true once per 2 * every frames of normal-speed time
    // spawnClock runs at the game speed, so Focus/Warp stretch or shrink the gap in frames but not in distance;
    // switching speed doesn't bunch up or spread out what spawns on it
    var period = every * 2;
    return Math.floor(gameArea.spawnClock / period) > Math.floor(gameArea.lastSpawnClock / period);
}

function spawnDue(every) { // obstacles: on the level's first played frame, then on the spawn clock
    return playFrame() == 1 || clockDue(every);
}

function edgeBlock(w, h, color, xOffset) { // block entering at the right edge (plus xOffset) at a random height
    return new component(w, h, color, gameArea.canvas.width + (xOffset || 0), Math.random() * gameArea.canvas.height);
}

function spawnBarPair() { // a vertical black bar pair with a gap to pass through
    var minHeight = 20;
    var maxHeight = gameArea.canvas.height - 60;
    var height = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);
    var minGap = 85 - (level * 2);
    var maxGap = 125 - (level * 2);
    var gap = Math.floor(Math.random() * (maxGap - minGap + 1) + minGap);
    var barX = gameArea.canvas.width;
    var topBar = new component(20, height, "black", barX, 0);
    var bottomBar = new component(20, gameArea.canvas.height - height - gap, "black", barX, height + gap);
    // remember where the gap sits so fitObstaclesToWindow can keep it passable after a resize
    topBar.barGap = { size: gap, top: true };
    bottomBar.barGap = { size: gap, top: false };
    obstacles.medium.push(topBar);
    obstacles.medium.push(bottomBar);
}

function blackBlock() { return edgeBlock(25, 25, "black"); }
function redBlock() { return edgeBlock(25, 25, "red"); }
function scatteredBlackBlock() { return edgeBlock(25, 25, "black", getRandomInteger(0, 250)); } // up to 250px further right so they don't line up
function blackOblong() { return edgeBlock(10, 50, "black"); }

// what each level spawns, checked in this order every frame (the order also decides which blocks draw on top).
// `big` marks the screen-high blocks, which fxTelegraph announces before they arrive.
// A rule applies from level `from` on, up to `to` if given; `every` is its spawnDue period; `lane` is the list it joins.
const SPAWN_RULES = [
    { from: 1, every: 50, make: spawnBarPair }, // adds itself to the medium lane
    { from: 2, every: 100, lane: "hyper", big: true, make: function () { return heightScaledBlock(1 / 8, "black"); } },
    { from: 3, every: 20, lane: "fast", make: blackBlock },
    { from: 4, every: 20, lane: "medium", make: function () { return edgeBlock(10, 10, "red"); } },
    { from: 5, every: 20, lane: "fast", make: scatteredBlackBlock }, // levels 5-8 each add one more
    { from: 6, every: 20, lane: "fast", make: scatteredBlackBlock },
    { from: 7, every: 20, lane: "fast", make: scatteredBlackBlock },
    { from: 8, every: 20, lane: "fast", make: scatteredBlackBlock },
    { from: 9, every: 8, lane: "fast", make: redBlock },
    { from: 10, to: 10, every: 8, lane: "fast", make: redBlock },
    { from: 10, to: 10, every: 200, lane: "slow", big: true, make: function () { return heightScaledBlock(1 / 4, "red"); } },
    { from: 11, every: 200, lane: "medium", make: blackOblong },
    { from: 12, every: 20, lane: "medium", make: blackOblong },
    { from: 13, every: 20, lane: "fast", make: redBlock },
    { from: 14, every: 150, lane: "slow", big: true, make: function () { return heightScaledBlock(1 / 8, "red"); } },
    { from: 14, every: 20, lane: "fast", make: blackBlock },
    { from: 15, every: 20, lane: "fast", make: redBlock },
    { from: 15, every: 20, lane: "fast", make: blackBlock },
];

function getRandomColor() {  // generate a random color
    var letters = '0123456789ABCDEF';
    var color = '#';
    for (var i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function getRandomColorGold() { // random bright color from orange to yellow-green (hue 25-100), as #rrggbb
    var hue = (Math.floor(Math.random() * 76) + 25) / 360;
    var channel = function (t) { // HSL at 100% saturation and 50% lightness: a trapezoid wave around the hue circle
        if (t < 0) t += 1;
        var v = t < 1 / 6 ? 6 * t : t < 1 / 2 ? 1 : t < 2 / 3 ? (2 / 3 - t) * 6 : 0;
        return ("0" + Math.round(v * 255).toString(16)).slice(-2);
    };
    return "#" + channel(hue + 1 / 3) + channel(hue) + channel(hue - 1 / 3);
}

function getRandomInteger(min, max) {
    return Math.floor(Math.random() * (max - min) ) + min;
}
