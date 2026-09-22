// Focus Break -- the powers. The square's size and the speed modes Focus and Warp set, the score and the rate the
// graze bank pays, the graze system itself -- a pass banks charge for how close it came, and the three things a
// charge is worth -- and Break, which a charge pays for before the score does. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

function resizeAroundCenter(obj, size) { // make obj a size x size square with the same center
    obj.x -= (size - obj.width) / 2;
    obj.y -= (size - obj.height) / 2;
    obj.width = size;
    obj.height = size;
}

function setPieceSize(size) { // gamePiece's center sits on the cursor
    resizeAroundCenter(gamePiece, size);
}

function pieceSize() { // hitbox size: smaller during Focus or Warp, and 1px smaller for each flawless level
    return (focused ? 15 : 20) - perfectClear;
}

function setMode(isFocused, newSpeed, musicRate) { // normal speed, Focus or Warp
    focused = isFocused;
    if (alive) {
        setPieceSize(pieceSize());
    }
    speed = newSpeed;
    setMusicRate(musicRate);
}

function addScore(points) { // score for staying alive, at whatever rate the banked graze charges are worth.
    // With nothing banked the rate is 1 and the bank stays empty, so this is the bare score++ it replaced
    if (inGrace()) {
        return; // the card is still being read: the level has not started, so neither has its clock
    }
    scoreBank += points * grazeRate();
    var whole = Math.floor(scoreBank);
    scoreBank -= whole;
    score += whole;
}

function resumeSpeed() { setMode(false, 1, 1.0); }
function setSlowSpeed() { setMode(true, speed_slow, 0.75); } // FOCUS
function setFastSpeed() { setMode(true, speed_fast, 1.2); } // WARP

// The graze system. The square is grazing whenever an obstacle comes within GRAZE_PX of one of its sides without
// touching it, and the closer the pass the more it counts. The measurement used to live in the effects, where it only
// fed the sparks; it is game state now, because it pays -- the effects are switchable and must never change what the
// game does, so anything that scores has to be on this side of the line. The sparks read it, as they read everything.
//
// A pass banks charge for how close it got: hold charges and the score rate climbs, spend one and a Break is free
// instead of costing 250. That is the whole loop -- flying tight is worth something, and cashing it in costs you the
// rate you built. Before this a graze was purely decorative and Warp's double rate was the only scoring lever.
var GRAZE_PX = 10; // how close, per axis, counts as a graze; also the farthest the world moves in a step (hyper in Warp)
const GRAZE_RAMP = { full: GRAZE_PX }; // reads a gap as 0..1 through fxEase, so closeness eases like every fade
var GRAZE_GAIN = 0.4; // charge for a pass with no gap left at all; a pass pays gain * closeness squared, so a 2px
                      // pass is worth three 5px ones and seventy 8px ones. Flying tight has to beat flying near
var GRAZE_MAX = 3; // charges held at once: past this a pass still lights the square, it just has nowhere to bank
var GRAZE_CLEAR = 10; // steps a side must be clear before the next thing along it counts as a new pass and pays again
var GRAZE_BOOST = 0.25; // score rate added per charge held: three charges is +75%, and a Break is what spends them
var GRAZE_LIT = 30; // steps a charge landing or leaving keeps the meter marked, so it isn't missed mid-dodge
// Focus slows time, shrinks the hitbox and scores nothing: it stops the clock on the level's progress, and that
// is its price. A banked charge pays that price instead, and the level keeps moving while the world crawls --
// which is the one thing the charges can be spent on deliberately, rather than by pressing Break in a panic.
// The premium is the rate: holding a charge for a whole level saves about four seconds, burning one buys about
// two, and the two seconds it buys are flown at a quarter of the danger. Safety costs progress.
var GRAZE_BURN = 300; // steps of scoring Focus one charge buys: three seconds
var GRAZE_BURN_EVERY = 4; // and it scores every fourth step: half what the same time at normal speed pays

var graze = {
    charges: 0, // whole charges banked
    fill: 0, // progress toward the next one, 0..1
    lit: GRAZE_LIT, // steps since one landed, for the meter's mark
    free: false, // a charge paid for the Break that is running
    burn: 0, // how much of the top charge Focus has eaten, 0..1
    burning: false, // and whether it is eating it this step, so the meter and the score can say so
    side: [], // this step's closest pass per side (0 top, 1 right, 2 bottom, 3 left), so the scan allocates nothing
};
while (graze.side.length < 4) {
    graze.side.push({ power: 0, x: 0, y: 0, v: 0, peak: 0, clear: GRAZE_CLEAR });
}

function grazeDrop() { // no pass in progress: the next thing along a side starts a fresh one and pays again
    for (var i = 0; i < 4; i++) {
        var s = graze.side[i];
        s.power = s.peak = 0;
        s.clear = GRAZE_CLEAR;
    }
}

function grazeLevel() { // a level begins: no pass is in progress and the fraction of a point doesn't carry, but
    // the charges do. They were earned by flying tight and the next level is where they are worth spending
    graze.free = false;
    scoreBank = 0;
    grazeDrop();
}

function grazeClear() { // a death or a fresh run: the bank goes the same way the score does
    graze.charges = 0;
    graze.fill = 0;
    graze.burn = 0;
    graze.lit = GRAZE_LIT;
    grazeLevel();
}

function grazeRate() { // what the banked charges are worth: the multiplier on the score for staying alive
    return 1 + GRAZE_BOOST * graze.charges;
}

function grazeBurn() { // Focus with something banked: the charge pays for the slowed time, and drains for it
    if (invincible || speed != speed_slow || graze.charges <= 0) {
        return false; // nothing to spend, nothing slowed to spend it on, or a Break is already paying
    }
    graze.burn += 1 / GRAZE_BURN;
    if (graze.burn >= 1) { // that one is gone; the next Focus starts on the one under it
        graze.burn = 0;
        graze.charges--;
        graze.lit = 0;
    }
    return true;
}

function grazeEarn(amount) { // bank a pass, carrying whole charges out of the meter
    if (graze.charges >= GRAZE_MAX) {
        return; // nowhere to put it: spend one, or the pass is only a spark
    }
    graze.fill += amount;
    while (graze.fill >= 1) {
        graze.fill -= 1;
        graze.charges++;
        graze.lit = 0;
        playSound(aud_menuSound);
        if (graze.charges >= GRAZE_MAX) {
            graze.fill = 0; // full: the overflow is lost rather than sitting there waiting for a spend
            break;
        }
    }
}

function grazeBank(side) { // one side's pass: pay for how much closer it got than it has already been paid for
    var s = graze.side[side];
    if (s.power <= 0) {
        s.clear++;
        if (s.clear >= GRAZE_CLEAR) {
            s.peak = 0; // clear for long enough that whatever comes next is a new pass
        }
        return;
    }
    s.clear = 0;
    if (s.power > s.peak) { // only the tightening is new, so one pass pays gain * its closest moment, once
        grazeEarn(GRAZE_GAIN * (s.power * s.power - s.peak * s.peak));
        s.peak = s.power;
    }
}

function grazeConsider(side, power, x, y, v) { // this step's closest pass on each side wins the slot
    var c = graze.side[side];
    if (power > c.power) {
        c.power = power;
        c.x = x;
        c.y = y;
        c.v = v;
    }
}

function grazeHidden(x1, x2) { // does this span sit inside a level 13/14 bar, where a block of the bar's color is
    // camouflaged? The sparks don't outline what the level is hiding, and a pass the player couldn't see doesn't pay
    if (level != 13 && level != 14) {
        return false;
    }
    var w = gameArea.canvas.width / 1920; // the bars' own units, from drawLevelName
    if (x1 >= 900 * w && x2 <= 1000 * w) {
        return true;
    }
    return level == 14 && x1 >= 1100 * w;
}

function grazeStep() { // each step, after everything has moved: how close did the square just come to anything, and
    // what has that earned. This is the one moment the gaps are the ones the player actually flew
    var i;
    graze.lit = Math.min(graze.lit + 1, GRAZE_LIT);
    graze.burning = grazeBurn(); // before drawStats reads it, further down the same step
    for (i = 0; i < 4; i++) {
        graze.side[i].power = 0;
    }
    if (invincible) { // Break: movePiece skips collisions, so obstacles sit on the square all through it
        grazeDrop();
        return;
    }
    var left = gamePiece.x, top = gamePiece.y;
    var right = left + gamePiece.width, bottom = top + gamePiece.height;
    var W = gameArea.canvas.width, H = gameArea.canvas.height;
    for (var lane in OBSTACLE_SPEEDS) {
        var objects = obstacles[lane], v = OBSTACLE_SPEEDS[lane];
        for (var k = 0; k < objects.length; k++) {
            var o = objects[k];
            if (o.width <= 0 || o.height <= 0) {
                continue; // nothing drawn, so nothing to pass close to (as crashWith's own guard has it)
            }
            if (o.x >= W || o.x + o.width <= 0 || o.y >= H || o.y + o.height <= 0) {
                continue; // off screen: if the player can't see it, they didn't dodge it
            }
            var gx = Math.max(o.x - right, left - (o.x + o.width)); // the gap per axis, the quantity crashWith splits on
            if (gx >= GRAZE_PX) {
                continue; // one subtract and a compare turn away almost everything
            }
            var gy = Math.max(o.y - bottom, top - (o.y + o.height));
            if (gy >= GRAZE_PX) {
                continue;
            }
            var sep = Math.max(gx, gy);
            if (sep <= 0) {
                continue; // touching is a hit, not a graze
            }
            if (grazeHidden(o.x, o.x + o.width)) {
                continue; // levels 13 and 14: what the level is hiding neither lights up nor pays
            }
            var p = fxEase(GRAZE_PX - sep, GRAZE_RAMP); // fxEase is the file's smoothstep, not an effect
            var px = Math.max(gx, 0), py = Math.max(gy, 0);
            var share = px / (px + py); // at a corner the pass belongs to both sides, in proportion
            if (share > 0) { // a vertical side: the shared extent runs along y
                var lo = Math.max(top, o.y), hi = Math.min(bottom, o.y + o.height);
                var my = hi >= lo ? (lo + hi) / 2 : (o.y > bottom ? bottom : top);
                grazeConsider(o.x > left ? 1 : 3, p * share, o.x > left ? right : left, my, v);
            }
            if (share < 1) { // a horizontal side: the shared extent runs along x
                var lx = Math.max(left, o.x), hx = Math.min(right, o.x + o.width);
                var mx = hx >= lx ? (lx + hx) / 2 : (o.x > right ? right : left);
                grazeConsider(o.y > top ? 2 : 0, p * (1 - share), mx, o.y > top ? bottom : top, v);
            }
        }
    }
    for (i = 0; i < 4; i++) {
        grazeBank(i);
    }
}

function setBreak(penalty){
    if (!invincible) {
        powerups.break = []; // destroy powerups on break
        powerups.score = [];
        invincible = true;
        if (penalty > 0 && graze.charges > 0) { // a banked charge pays for it instead of the score -- and the rate
            graze.charges--; // goes down with it, so the choice is a Break now against a faster score for the rest
            graze.burn = 0; // of the level. It goes whole: what Focus had eaten of it doesn't carry onto the next one
            graze.free = true;
        } else { // a powerup Break (penalty 0) has nothing to pay for, so it spends nothing
            score += -penalty;
        }
        fxWave(); // a shockwave off the square, for the one moment nothing can touch you
    }
}

function endBreak() { // back to normal after a Break
    invincible = false;
    invincibleTime = 0;
    graze.free = false;
    gamePiece.color = gamePieceColor;
}
