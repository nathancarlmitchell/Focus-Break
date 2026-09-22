// Focus Break -- the effects. Everything here draws the look of the game and nothing here changes it: these
// functions read the game's state (the square, the obstacles, the speed, the score, the level) and never write to it,
// so every spawn, score and sound is the same with the effects on or off. FOCUS BREAK.html loads this with a plain
// <script src> before its own script, as globals rather than modules, so the game still opens straight off disk.
//
// House rules, from the log: no red or black (the obstacles' colours), no filled squares (the powerups' shape), no
// Math.random (fxHash instead, so the spawns' stream is never touched), reduced-motion aware, and switchable off to the
// picture exactly as it was. The CRT is the deliberate exception, a tube over the whole picture. Three things here run
// while the game loop is stopped and drive their own animation frames: the death shatter (die), the between-levels
// transition (nxt), and the words typed under the victory screens, which ride on the transition.
//
// The game's entry points into this file: fxStep and fxRecord once a step, fxDrawBackdrop and fxDrawAfterimages and
// fxDrawScreen when a step is drawn, fxDieStart and fxNextStart from gameOver, fxReset and fxGroundClear at a level's
// edges, fxWave and fxPop for a Break and a pickup, fxLook and fxHash from the menus.

// Power effects: Warp streaks speed lines across the screen and leaves a comet trail behind the square; Focus closes a
// violet vignette in from the edges and leaves outlined echoes of the square. They only read the game, never change it:
// no Math.random, clocks, timers or sounds, so every spawn, score and sound is the same with them on or off. To stay
// readable they never use red or black (the obstacles' colors) and never draw a filled square (the powerups' shape).
//
// Two of these are drawn all the time. The horizon grid is the world's floor rather than power feedback, so it is drawn
// whenever effects are on at all; graze sparks fire during ordinary play whenever the square passes close to something,
// which also makes fx the first thing here that is O(obstacle count) a step rather than O(1). fxMode == "off" is still
// the picture exactly as it was, and FX_GRID_ON / FX_GRAZE_ON take back each of the two on its own.
//
// The contrast budget, gathered here because every effect needs it and it was being re-derived by hand each time:
//  - Against white, red (#FF0000) starts at only 3.998:1, so a 3:1 floor needs the local background to keep a relative
//    luminance of 0.7378. That caps a full-screen wash at: cyan unrestricted (solid cyan still leaves red at 3.19:1),
//    magenta 0.183, deep violet rgba(40,0,70) 0.13.
//  - Compose first. The binding number is the composite with the worst wash the new ink can sit on, not the value
//    against white. The shipped washes leave no headroom along the bottom edge: the Focus vignette reads 3.063:1 and
//    the reduced-Warp rim 3.032:1 there.
//  - A wash is not a mark. Those caps are wash caps: a wash darkens the whole of an obstacle's surround, while a hairline
//    crosses a few percent of a 25x25 silhouette. The game already ships marks well under 3:1 (an opaque speed line puts
//    red at 1.275:1, the trail at its 0.6 cap at 1.637:1). Marks are held to 2.8:1 locally and 3:1 averaged over any
//    40x40 window instead.
var fxMode = "auto"; // "auto" follows the device's reduced-motion setting; "full", "reduced" or "off" (drawn exactly as before) pin it
var reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null; // .matches follows the setting live
var FX_HISTORY = 32; // steps of square positions remembered (the oldest echo is 30 steps back)
var FX_TRAIL_PX = 5; // how far the world carries the trail and echoes each step at normal speed (10px in Warp, 1.25px in Focus)
var FX_TRAIL_STEPS = 12; // Warp trail length at full strength, in steps: 120px behind a square that holds still
var FX_KICK_STEPS = 12; // Warp from nothing: the speed lines burst out longer, peaking about 80ms in and settled by 120ms
var FX_SNAP_STEPS = 24; // Focus from nothing: the vignette closes a touch past its rest, settled by 240ms
// fades count whole steps so they end at exactly 0: Warp in over 8 steps and out over 25, Focus in over 15 and out over 30
const FX_FADE = { warp: { full: 200, up: 25, down: 8 }, focus: { full: 30, up: 2, down: 1 } };
const FX_ECHO_AGES = [30, 20, 12, 6]; // Focus echoes, in steps behind the square; oldest first so newer ones lie on top
const FX_LINE_LAYERS = [ // speed lines, far to near: thickness (px), opacity, speed at full Warp (px per step)
    { h: 1, alpha: 0.45, v: 12 },
    { h: 2, alpha: 0.6, v: 18 },
    { h: 3, alpha: 0.8, v: 26 },
];

// The horizon grid: a perspective ground plane under everything, so the powers change the world and not just the
// foreground. The game has no other absolute motion cue, so without it Warp and Focus read as "the obstacles changed
// rate" instead of "the world did".
var FX_GRID_ON = true; // the grid at all: one switch back to the picture without it
var FX_GRID_HORIZON = 0.62; // the horizon, as a fraction of the height: the plane is the lower 38%, clear of the HUD
var FX_GRID_PITCH = 0.03; // Warp drops the horizon (the camera pitching back). A pitch, not a roll: a roll would draw
                          // arbitrary diagonals, the one shape that competes with the obstacles
var FX_GRID_DEEPEN = 0.05; // Focus lifts it; more than the pitch because Focus fades over 150ms against Warp's 80ms
var FX_GRID_KICK = 0.012; // Warp's burst, through a full sine off fx.kick: up, past, settled, with no residual at rest
var FX_GRID_SNAP = 0.018; // Focus's mirror of it, off fx.snap
var FX_GRID_LOW = 0.50, FX_GRID_HIGH = 0.72; // the horizon can never cross the HUD or the bottom banner, whatever sums
var FX_GRID_NEAR = 0.92; // the nearest rung, as a fraction of the plane's height
var FX_GRID_GAP_FRAC = 0.0146; // stop adding rungs below this fraction of the plane: holds the count flat at any size
var FX_GRID_GAP_MIN = 4; // px: a moire floor, binding only on a very short plane
var FX_GRID_GAP_FOCUS = 0.67; // Focus resolves rungs the others hide: "deeper" as detail, so reduced motion keeps it
var FX_GRID_RUNGS_MAX = 10; // hard bound on the rung loop
var FX_GRID_HAZE = 0.10; // the depth lines start this far below the horizon, so the vanishing point is never a knot
var FX_GRID_LANES = 16; // target depth lines across the width; the spacing follows the width, so the count stays flat
var FX_GRID_LANE_MIN = 70, FX_GRID_LANE_MAX = 260; // px between them at the bottom edge
var FX_GRID_LANES_MAX = 28; // hard bound on the depth-line loop
var FX_GRID_STRETCH = 0.5; // Warp widens the lanes, as it lengthens the speed lines
var FX_GRID_RATE = 2; // px a step at normal speed: OBSTACLE_SPEEDS.medium, the lane the level 1 bar pairs ride, so the
                      // floor travels with the game's furniture (deliberately not fx.scroll's 5, a mid-lane average)
var FX_GRID_EDGE_STEPS = 25; // the clear gutter each side as time: 250ms of white before the fastest obstacle reaches ink
var FX_GRID_EDGE_FRAC = 0.30; // ...capped at this fraction of the width per side
var FX_GRID_EDGE_PAD = 12; // px of extra clearance past the touch buttons
var FX_GRID_FADE = 60; // px the depth lines take to reach full width past a gutter, so they fan in instead of starting
var FX_GRID_SPAN_MIN = 200, FX_GRID_BAND_MIN = 60; // px: below these the grid fades out rather than popping
var FX_GRID_W_NEAR = 1.6, FX_GRID_W_FAR = 0.3; // depth-line thickness at the bottom edge and at the haze cut
var FX_GRID_W_RUNG = 1, FX_GRID_W_HORIZON = 2; // the rungs, and the horizon that makes the rest read as a plane
var FX_GRID_A_MAG = 0.11, FX_GRID_A_CYAN = 0.16; // resting ink: magenta at the horizon, cyan nearest the viewer
var FX_GRID_HORIZON_INK = "rgba(255,0,255,0.1485)"; // A_MAG * LIFT_MAX, painted under the plane's own globalAlpha
var FX_GRID_WARP_LIFT = 0.35; // Warp brightens it (full look only: that look draws marks, not a wash)
var FX_GRID_WASH_DIM = 0.60; // ...and either full-screen wash dims it to 40%, which is what keeps red legible under both
var FX_GRID_LIFT_MAX = 1.35; // the largest lift reachable; the divisor that keeps globalAlpha inside [0, 1]
var FX_GRID_STALL = 40; // steps behind before the grid's ink is fully shed: scenery goes, the simulation never does

// Graze sparks: the square is lit on whichever side just passed close to an obstacle, so threading a gap by 1px looks
// different from clearing it by 40. The threshold is absolute, so each level the flawless streak shrinks the hitbox
// (20px down to 8), every line already flown measures further out and goes quiet.
var FX_GRAZE_ON = true; // graze sparks at all: one switch back to the picture without them
const FX_GRAZE = { full: 100, up: 100, down: 5 }; // a spark's life: filled in one step, out over 20 (200ms), landing on 0
const FX_GRAZE_CALM = { full: 100, up: 100, down: 2 }; // reduced motion: out over 50 steps, so sparks breathe, not blink
var FX_GRAZE_STRIKE = 0.1; // the rise in closeness that counts as a new pass (about 0.67px at the ramp's middle)
var FX_GRAZE_HIT = 12; // steps of flare after a strike, finished at the maximum: the same 12 as Warp's kick
var FX_GRAZE_DIM = 0.45; // the faintest spark: a magenta hairline at 2:1 on white, still legible
var FX_GRAZE_ALPHA = 0.9; // the brightest: magenta at 3.07:1 on white, cyan at 2.56:1 over a red block
var FX_GRAZE_BLADE = 2; // band thickness, px: the echoes' outline weight
var FX_GRAZE_LIFT = 1; // px clear of the hitbox, so the square (drawn last) can't cover the blade
var FX_GRAZE_SPLIT = 2; // the cyan band, outward of the magenta: whichever lands on the block is the one that reads there
var FX_GRAZE_OVER = 4; // px the blade overhangs each end in the flare, along the edge only: never across it, because
                       // across is the axis the player judges gaps on. With LIFT and BLADE the envelope is always 5px
var FX_GRAZE_MINLEN = 10; // the shortest blade, px: never near-square, even on an 8px hitbox
var FX_GRAZE_TICKAT = 0.104; // the closeness that throws sparks: a gap under 8px of the 10px band. The band itself is
                             // the ceiling on this -- past GRAZE_PX nothing registers as a graze at all

// The sparks a graze throws off, in place of the three fixed dashes this used to drop. A pool, so emitting allocates
// nothing; fxHash rather than Math.random, so a replay of the same run draws the same sparks; and streaks rather than
// dots, because a filled square is what a powerup looks like. They carry the same tier signal the dashes did: nothing
// is thrown until the gap is under FX_GRAZE_TICKAT, and how many are thrown still scales with how close it was.
var FX_PART_ON = true;
var FX_PART_MAX = 160; // the pool. Four sides can strike at once, and a held line trickles on top of that
var FX_PART_EMIT = 14; // sparks at the closest pass, scaling down to FX_PART_MIN at the tier boundary
var FX_PART_MIN = 4;
var FX_PART_TRICKLE = 4; // while a tight line is held, one more every this many steps: a grind, not just an impact
var FX_PART_LIFE = 34; // steps (340ms) for an ordinary spark, scaled per particle below
var FX_PART_EMBER = 0.28; // this fraction come off as embers: slower, heavier, longer lived, and brighter
var FX_PART_EMBER_LIFE = 1.5; // ...living this much longer than an ordinary one
var FX_PART_V0 = 3.2; // px a step at normal speed, before the fan and the jitter
var FX_PART_SPREAD = 1.7; // how much of that goes along the edge, where the gap actually vents
var FX_PART_OUT = 0.55; // ...and how much away from the obstacle, so they lift off the surface rather than hug it
var FX_PART_DRAG = 0.93; // a step: they burst, slow, and are left riding the world
var FX_PART_CURL = 0.085; // radians a step the spray turns by, so sparks arc away instead of running dead straight
var FX_PART_LEN = 3.4; // streak length, as a multiple of a step's travel
var FX_PART_W = 1.5; // an ordinary spark's width at birth
var FX_PART_W_EMBER = 3; // ...and an ember's
var FX_PART_ALPHA = 0.85;


// Death. The one moment with real stakes used to cut straight from play to red text. Now the last frame the player saw
// is held, the obstacle that got them is ringed, and the square comes apart. This is the only effect that runs while
// the game loop is stopped, so it drives its own animation frames and hands back to the message when it is done.
var FX_DIE_ON = true;
var FX_DIE_STEPS = 34; // frames of shatter before the message appears (about 560ms of the death pause's 2500)
var FX_DIE_HOLD = 6; // ...of which the first few are a dead hold on the frozen frame, before anything moves
var FX_DIE_PARTS = 8; // fragments the square comes apart into
var FX_DIE_V = 3.4; // px a frame they fly out at, before the jitter
var FX_DIE_DRAG = 0.94;
var FX_DIE_SPIN = 0.12; // radians a frame, so the pieces tumble rather than slide
var FX_DIE_RING = 26; // px the ring around the killing obstacle expands by
var FX_DIE_W = 2; // outline weight: fragments are outlines, never fills, like the Focus echoes

// The screen between levels. The message used to be drawn once onto a blank canvas and sat there for two to five
// seconds. It now plays over the ground of the level being entered, so the transition previews the palette you are
// about to be in, with rings going out from the middle and a bar wiping across. Same trick as the death shatter: the
// message is captured as drawn and redrawn over the animation, so none of gameOver's branches had to be unpicked.
var FX_NEXT_ON = true;
var FX_NEXT_TINT = 26; // frames the new ground takes to come up under the message
var FX_NEXT_TINT_A = 0.55; // ...and how far it comes up. Held short of full because these messages were coloured
                           // against white: red and black are fine on every ground, but the perfect-clear turquoise
                           // is only 1.86:1 on white to begin with, and a full-strength ground takes it to 1.61
var FX_NEXT_RINGS = 3; // rings going out from the middle, one after another
var FX_NEXT_RING_SPAN = 54; // frames each takes to reach the edge
var FX_NEXT_RING_GAP = 15; // frames between them
var FX_NEXT_RING_A = 0.34;
var FX_NEXT_SWEEP = 64; // frames the wipe takes to cross
var FX_NEXT_SWEEP_W = 150; // px wide
var FX_NEXT_SWEEP_A = 0.2;

// Flourishes: one-shot marks on the moments the game currently passes over in silence -- a powerup taken, a Break
// opened, a hundred points reached, a level named, a screen-high block on its way. Each is small and each is drawn
// under the obstacles, so none of them can hide the thing that kills you.
var FX_POP_ON = true; // the powerup rings and the Break shockwave
var FX_POP = 30; // steps a powerup ring lives (300ms)
var FX_POP_R0 = 10, FX_POP_R1 = 70; // its radius at birth and at death, px
var FX_POP_DRIFT = 3; // px a step at normal speed: the rate moveObjects carries the powerups at, so it stays put
var FX_WAVE = 36; // the Break shockwave lives a little longer and goes a lot further
var FX_WAVE_R0 = 12, FX_WAVE_R1 = 150;
var FX_POP_W = 3; // ring line width at birth, tapering to 1
var FX_POP_ALPHA = 0.55;
var FX_BEACON_ON = true; // a printed ring breathing around every Break pickup on the field: the one pickup that saves you
                         // is found by it, and read as a pickup by it on the steps its flash lands on black or red
var FX_BEACON_R = 13; // px from the pickup's centre, clear of the 15px square's corners
var FX_BEACON_PULSE = 3; // px it breathes in and out by, in the full look only
var FX_BEACON_STEPS = 50; // steps a breath takes
var FX_BEACON_W = 2;
var FX_BEACON_ALPHA = 0.6;
var FX_COIN_PARTS = 14; // gold sparks thrown when a score powerup is taken: it is the one pickup that pays, so it gets the most
var FX_COIN_V = 2.8; // px a step they leave at, before the jitter
var FX_COIN_INNER = 0.42; // the second, tighter ring, as a fraction of the outer one's reach
var FX_COIN_TEXT = 26; // px: the "+50" that rises off it, which is the only place the game says what a coin is worth
var FX_COIN_RISE = 46; // px it climbs over its life
var FX_COIN_TEXT_A = 0.9;
var FX_MILE_ON = true; // the score's hundreds
var FX_MILE = 24; // steps of flourish (240ms)
var FX_MILE_PASSES = 10; // stacked shadow copies behind the number, as the title prints itself
var FX_MILE_ALPHA = 0.5;
// The constants that time the level-name typewriter, the lore cards and the screens' words (FX_NAME_*, FX_LORE_*,
// FX_INTRO_*, FX_SCREEN_*) are in cards.js with what they time, and the progress stripe's (FX_BAR_*) in hud.js
var FX_TELL_ON = true; // the screen-high block telegraph
var FX_TELL_STEPS = 60; // how far ahead one is announced (600ms at normal speed)
var FX_TELL_W = 6; // the mark's width at the right edge, px
var FX_TELL_ALPHA = 0.35; // it sits under the obstacles, so an entering block covers it rather than compositing over it

// The CRT: scanlines over the finished picture, and a bar rolling slowly down them. Two deliberate exceptions live
// here. It is the only effect drawn ABOVE the obstacles, and the only one that uses black. Both are safe for the same
// reason: a scanline darkens the obstacle and its background in the same proportion, so the ratio between them barely
// moves -- red keeps 3.82:1 against its ground at FX_SCAN_ALPHA, against 4.00:1 with no lines at all. Every other wash
// in this file sits on the background only, which is why they are all capped so much harder.
var FX_SCAN_ON = true;
var FX_SCAN_PERIOD = 3; // px from one line to the next
var FX_SCAN_LINE = 1; // px of that period which is dark
var FX_SCAN_ALPHA = 0.12; // measured: red 3.818:1 against its own ground, the whole picture dimmed 8.9%
var FX_ROLL_ON = true; // the bar sweeping down: the CRT's one moving part, so the reduced look keeps the lines and drops it
var FX_ROLL_H = 140; // its height, px
var FX_ROLL_ALPHA = 0.06;
var FX_ROLL_RATE = 1.1; // px a step, and deliberately NOT scaled by the game speed: this belongs to the tube, not the world

// The ground under each level. The run drifts through hue at a FIXED luminance (L = 0.859 for every tint below), so the
// picture changes across a run without the obstacles ever getting harder to see. Every entry was solved against a red
// block through the worst stack this game can put on screen at once -- the tint, plus the grid's brightest cyan at full
// Warp lift, plus a scanline row, plus the roll bar. The floor is 3:1 and the lowest entry lands at 3.03.
// Going darker than this needs the obstacles to stop being black and red, which is a separate job.
var FX_TINT_ON = true;
var FX_TINT_FADE = 45; // steps to cross from the ground that was on screen when the level opened to its own
const T_WHITE = [255, 255, 255], T_CYAN1 = [206, 255, 255], T_CYAN = [157, 255, 255],
      T_GOLD = [255, 238, 189], T_ROSE = [255, 233, 238], T_VIOLET = [242, 236, 250];
// indexed by level; a level whose ground is already the one on screen, which is most of them, makes no cross-fade
const FX_TINTS = [null, T_WHITE, T_WHITE, T_WHITE, T_CYAN1, T_CYAN1, T_CYAN, T_CYAN, T_CYAN,
                  T_GOLD, T_GOLD, T_ROSE, T_ROSE, T_VIOLET, T_VIOLET, T_VIOLET];
FX_TINTS.forEach(function (t) { // the solid form, built once: the cross-fade is the only thing that makes a string
    if (t) { t.css = "rgb(" + t[0] + "," + t[1] + "," + t[2] + ")"; }
});

var fx = {
    look: "off", // this step's look: "full", "reduced" or "off" (see fxLook)
    warp: 0, focus: 0, // fade levels: 0 (off) up to FX_FADE's full
    kick: FX_KICK_STEPS, snap: FX_SNAP_STEPS, // steps into Warp's burst and Focus's snap (finished at the maximum)
    run: 0, // how far the speed lines have traveled, in steps at full Warp
    scroll: 0, // how far the world has moved left; recorded positions drift with it
    drift: 0, // how far the ground has scrolled, in px: the grid's phase. Three odometers now run at three rates and
              // none of them is the others: fx.scroll is the trail's mid-lane 5px, fx.drift the grid's medium-lane 2px,
              // and a spark's own vx the lane of the block that made it. Don't unify them
    stall: 0, // steps the machine has been behind: sheds the grid's ink rather than stuttering. Ink only, never geometry
    next: 0, count: 0, samples: [], // the square's recent positions: a ring of reused { x, y, size, scroll } records
    graze: [], // a spark per side of the square (0 top, 1 right, 2 bottom, 3 left); how close each pass was is the
               // game's own measurement now, in graze.side, and these are only what the sparks made of it
    ring: [], // a powerup ring per kind (0 break, 1 score): { age, x, y }, spent once age reaches FX_POP
    wave: { age: FX_WAVE, x: 0, y: 0 }, // the Break shockwave, off the square
    mile: { age: FX_MILE, at: 0 }, // the score flourish, and the hundred it last marked (it follows the score down too)
    roll: 0, // how far the CRT's bar has swept, in px
    ground: [255, 255, 255], // the ground the screen is showing, kept by whatever paints one: the level's tint as it
                             // stands, the between-levels screen's part-strength preview of the next, or white
    from: [255, 255, 255], // ...and what it was when this level opened, which the level's ground fades in from. Taken
                           // from ground by fxReset, so a death replays onto the ground it died on and a new level
                           // comes up from the preview, not from the previous level's tint two screens ago
    scan: null, // the scanline pattern, built once from a tiny offscreen tile
    rim: null, // the reduced-motion Warp glow, baked to a bitmap once per canvas size
    part: [], pnext: 0, // the graze sparks: a pool of reused records and the next one to hand out
    live: 0, // ...and how many of them are in flight, kept exact by the places that light one or spend one, so an
             // empty pool is one compare rather than a scan of all 160 slots, three times a step
    grad: null, // gradients, made once in unit space and stretched over the screen or along the trail with setTransform
    rx: [], ry: [], rs: [], rt: [], // scratch for the trail's outline, so drawing allocates nothing
};
while (fx.samples.length < FX_HISTORY) {
    fx.samples.push({ x: 0, y: 0, size: 0, scroll: 0 });
}
while (fx.graze.length < 4) {
    fx.graze.push({ lit: 0, power: 0, struck: 0, hit: FX_GRAZE_HIT, sx: 0, sy: 0, vx: 0, seed: 0 });
}
while (fx.ring.length < 2) {
    fx.ring.push({ age: FX_POP, x: 0, y: 0 });
}
while (fx.part.length < FX_PART_MAX) {
    fx.part.push({ age: 1, life: 1, x: 0, y: 0, vx: 0, vy: 0, lane: 0, w: FX_PART_W, curl: 0, warm: 0 }); // born spent
}

function fxLook() { // fxMode, or for "auto": "reduced" if the player asked their device for less motion, else "full"
    if (fxMode != "auto") {
        return fxMode;
    }
    return reducedMotion && reducedMotion.matches ? "reduced" : "full";
}

function fxReset() { // a level starts or ends: no fade, trail, echo, spark or ground phase carries over
    fx.warp = fx.focus = fx.run = fx.scroll = fx.count = fx.drift = fx.stall = fx.roll = 0;
    fx.kick = FX_KICK_STEPS;
    fx.snap = FX_SNAP_STEPS;
    fx.from[0] = fx.ground[0]; fx.from[1] = fx.ground[1]; fx.from[2] = fx.ground[2]; // whatever is up is where it starts
    fxGrazeClear();
    fxPopClear();
    fxSparksClear(); // cleared here and not in fxDropHistory: a spark is a world object, not hung off the square
}

function fxPopClear() { // no ring, shockwave or score flourish carries across a level or a death
    fx.ring[0].age = fx.ring[1].age = FX_POP; // spent at the maximum, like fx.kick and fx.snap
    fx.wave.age = FX_WAVE;
    fx.mile.age = FX_MILE;
    fx.mile.at = 0; // a level opens at zero score, so the first hundred fires again
}

function fxFlourishing() { // is any one-shot mark still on screen
    return fx.ring[0].age < FX_POP || fx.ring[1].age < FX_POP || fx.wave.age < FX_WAVE;
}

function fxPop(kind, objects) { // a powerup was taken: a ring where it was sitting
    if (!FX_POP_ON || fx.look == "off") {
        return;
    }
    for (var i = 0; i < objects.length; i++) { // the one the square is actually touching, as collectPowerUps found it
        if (gamePiece.crashWith(objects[i])) {
            var r = fx.ring[kind];
            r.age = 0;
            r.x = objects[i].x + objects[i].width / 2;
            r.y = objects[i].y + objects[i].height / 2;
            // and it throws sparks, seeded off where it was so a replay throws the same: gold off a coin, the
            // cyan and magenta pair off a Break pickup
            fxPopBurst(r.x, r.y, Math.round(r.x) * 31 + Math.round(r.y), kind == 1 ? 1 : 0);
            return;
        }
    }
}

function fxPopBurst(x, y, seed, warm) { // a powerup was taken: sparks thrown out in every direction, not vented off an edge
    if (!FX_PART_ON || fx.look != "full") {
        return; // reduced motion keeps the rings, which expand rather than stream, and skips the spray
    }
    for (var k = 0; k < FX_COIN_PARTS; k++) {
        var p = fx.part[fx.pnext];
        fx.pnext = (fx.pnext + 1) % FX_PART_MAX;
        if (p.age >= p.life) {
            fx.live++; // as in fxSpark
        }
        var ang = 2 * Math.PI * (k + 0.6 * fxHash(seed, k)) / FX_COIN_PARTS; // evenly round, jittered off the spokes
        var ember = fxHash(seed, k + 96) < FX_PART_EMBER;
        var spd = FX_COIN_V * (ember ? 0.5 + 0.3 * fxHash(seed, k + 64) : 0.7 + 0.8 * fxHash(seed, k + 64));
        p.age = 0;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.lane = FX_POP_DRIFT; // it came off a powerup, so it travels at the rate moveObjects carries those
        p.life = Math.round(FX_PART_LIFE * (ember ? FX_PART_EMBER_LIFE : 0.7 + 0.6 * fxHash(seed, k + 128)));
        p.w = ember ? FX_PART_W_EMBER : FX_PART_W * (0.7 + 0.6 * fxHash(seed, k + 160));
        p.curl = (fxHash(seed, k + 192) - 0.5) * 2 * FX_PART_CURL;
        p.warm = warm; // gold off a coin; the cyan and magenta pair off a Break pickup
    }
}

function fxWave() { // a Break opened: a shockwave off the square
    if (!FX_POP_ON || fx.look == "off" || !gamePiece) {
        return;
    }
    fx.wave.age = 0;
    fx.wave.x = gamePiece.x + gamePiece.width / 2;
    fx.wave.y = gamePiece.y + gamePiece.height / 2;
}

function fxGrazeClear() { // no spark carries across a level, a death, or a jump
    for (var i = 0; i < 4; i++) {
        var g = fx.graze[i];
        g.lit = g.power = g.struck = 0;
        g.hit = FX_GRAZE_HIT; // finished at the maximum, like fx.kick and fx.snap: a level never opens mid-flare
    }
}

// the death shatter's own state. It lives outside fx because it deliberately survives the fxReset that gameOver runs
var die = { on: false, frame: null, age: 0, request: 0, then: null, parts: [], hit: null };
while (die.parts.length < FX_DIE_PARTS) {
    die.parts.push({ x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, size: 0 });
}

function fxDieFatal() { // the obstacle the square is sitting on, so the shatter can point at what got them
    var lists = obstacleLists();
    for (var i = 0; i < lists.length; i++) {
        for (var k = 0; k < lists[i].length; k++) {
            if (gamePiece.crashWith(lists[i][k])) {
                var o = lists[i][k];
                return { x: o.x, y: o.y, w: o.width, h: o.height };
            }
        }
    }
    return null; // a level can also end with the square clear of everything (a resize moved it), so this is optional
}

function fxDieStart(then) { // draw and hold the frame, remember what to burst; returns false if it can't, and the
    // caller falls straight through to the message exactly as before
    if (!FX_DIE_ON || fxLook() == "off" || !gamePiece || die.on) {
        return false;
    }
    // A death is nearly always found mid-step, after the obstacles have been drawn and before the HUD, the buttons,
    // the square and the CRT have, so the canvas holds half a picture: the stats vanished for the whole shatter.
    // Draw the level as it stands instead, and hold that. The game is still alive here, so the touch buttons are
    // in it; fxRecord first, so the trail and the echoes reach the square's last move rather than stopping a
    // step short of it. gameOver has stopped the loop, so fxOverdrawn can't skip any of it
    fxRecord();
    drawLevel();
    var frame = copyCanvas(); // the last thing the player saw, whole
    if (!frame) {
        return false;
    }
    die.frame = frame;
    die.hit = fxDieFatal();
    var cx = gamePiece.x + gamePiece.width / 2, cy = gamePiece.y + gamePiece.height / 2;
    var size = Math.max(4, gamePiece.width / 2);
    for (var i = 0; i < FX_DIE_PARTS; i++) {
        var p = die.parts[i];
        var ang = 2 * Math.PI * (i + 0.5) / FX_DIE_PARTS + (fxHash(i, 1) - 0.5); // a ring, jittered off the spokes
        var spd = FX_DIE_V * (0.55 + 0.9 * fxHash(i, 2));
        p.x = cx;
        p.y = cy;
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.a = fxHash(i, 3) * Math.PI;
        p.va = (fxHash(i, 4) - 0.5) * 2 * FX_DIE_SPIN;
        p.size = size * (0.5 + 0.7 * fxHash(i, 5));
    }
    die.on = true;
    die.age = 0;
    die.then = then;
    die.request = requestAnimationFrame(fxDieFrame);
    return true;
}

function fxDieStop() { // let go of the held frame, whether it finished or was cut short
    if (die.request) {
        cancelAnimationFrame(die.request);
        die.request = 0;
    }
    die.on = false;
    die.frame = null;
    die.then = null;
}

function fxDieFrame() { // one frame of the shatter, over the held picture
    die.request = 0;
    if (!die.on) {
        return;
    }
    if (die.age >= FX_DIE_STEPS) {
        var then = die.then;
        fxDieStop();
        if (then) {
            then(); // the message the player was always going to get, just later
        }
        return;
    }
    var moving = Math.max(0, die.age - FX_DIE_HOLD);
    var t = die.age / FX_DIE_STEPS;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, gameArea.canvas.width, gameArea.canvas.height);
    ctx.drawImage(die.frame, 0, 0); // the frozen frame, redrawn each time so the pieces move over a clean copy
    ctx.save();
    if (die.hit) { // ring what got them: a hard outline, growing and fading
        var g = Math.min(1, moving / 10);
        var pad = 3 + FX_DIE_RING * g;
        ctx.globalAlpha = 0.9 * (1 - g * g);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#00FFFF";
        ctx.strokeRect(die.hit.x - pad, die.hit.y - pad, die.hit.w + 2 * pad, die.hit.h + 2 * pad);
        ctx.strokeStyle = "#ff00ff";
        ctx.strokeRect(die.hit.x - pad + 2, die.hit.y - pad + 2, die.hit.w + 2 * pad - 4, die.hit.h + 2 * pad - 4);
    }
    ctx.globalAlpha = Math.max(0, 1 - t * t);
    ctx.lineWidth = FX_DIE_W;
    for (var i = 0; i < FX_DIE_PARTS; i++) {
        var p = die.parts[i];
        if (moving > 0) {
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= FX_DIE_DRAG;
            p.vy *= FX_DIE_DRAG;
            p.a += p.va;
        }
        var s = p.size * (1 - 0.45 * t);
        ctx.setTransform(Math.cos(p.a), Math.sin(p.a), -Math.sin(p.a), Math.cos(p.a), p.x, p.y);
        ctx.strokeStyle = "#00FFFF"; // outlines, never filled: a filled square is what a powerup looks like
        ctx.strokeRect(-s / 2 - 1, -s / 2 - 1, s, s);
        ctx.strokeStyle = "#ff00ff";
        ctx.strokeRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    die.age++;
    die.request = requestAnimationFrame(fxDieFrame);
}

// the between-levels animation. Like `die` it lives outside fx, because it runs after gameOver's fxReset
var nxt = { on: false, frame: null, age: 0, span: 0, request: 0,
    plain: false, // the frame and the words only: no ground, rings, sweep or tube (the finish, or the look with no motion)
    lore: null, at: null }; // the beats typed in under the message, scheduled as cards, and the slot they go in

function fxNextStart(ms, plain) { // hold the message as drawn and play the transition under and over it. With a lore
    // slot laid out under the message (msgLore) the beats are typed into it as the frames go by, and a screen with
    // one runs even in the look with no motion, plainly: the picture exactly as it was, the words arriving whole.
    // `plain` asks for that outright, for the finish, which has no wait to end it: it runs until the run restarts
    if (nxt.on) {
        return;
    }
    var lore = msgLore;
    msgLore = null; // this screen's, spent
    var still = plain || !FX_NEXT_ON || fxLook() == "off";
    if (still && !lore) {
        return; // nothing to bring in over the picture, and nothing to bring in under it
    }
    var frame = copyCanvas(); // the message, on the transparent canvas gameOver cleared for it
    if (!frame) {
        return;
    }
    nxt.frame = frame;
    nxt.age = 0;
    nxt.span = ms > 0 ? Math.round(ms * 0.06) : Infinity; // the wait, in frames at 60Hz; it ends when the level does
    nxt.plain = still;
    nxt.lore = lore ? loreSchedule(lore.beats, FX_SCREEN_HOLD, FX_SCREEN_LINGER, FX_INTRO_FADE, Infinity, FX_INTRO_FADE)
                    : null; // the last beat stays for as long as the screen does
    nxt.at = lore;
    nxt.on = true;
    nxt.request = requestAnimationFrame(fxNextFrame);
}

function fxNextStop() { // the level is starting, or the screen is going: let go of the held frame
    if (nxt.request) {
        cancelAnimationFrame(nxt.request);
        nxt.request = 0;
    }
    nxt.on = false;
    nxt.frame = null;
    nxt.plain = false;
    nxt.lore = null;
    nxt.at = null;
}

function fxDrawScreenLore() { // the beat that is up, typed into the slot showMessage left under the message, on the
    // lore card's clock: the frames are counted at 60Hz, as nxt.span is, and turned into that clock's steps
    var t = nxt.age * (1000 / 60) / STEP_MS;
    var n = loreCardAt(nxt.lore, t);
    if (n < 0) {
        return;
    }
    var c = nxt.lore[n], out = loreOut(c, t), left = loreTyped(c, t);
    if (out >= 1 || left <= 0) {
        return;
    }
    var at = nxt.at;
    ctx.save();
    ctx.setTransform(at.s, 0, 0, at.s, at.cx, at.cy); // the block's own frame, as showMessage drew it
    loreDrawLines(c, left, out, at.x, at.y);
    ctx.restore();
}

function fxNextFrame() {
    nxt.request = 0;
    if (!nxt.on) {
        return;
    }
    var w = gameArea.canvas.width, h = gameArea.canvas.height;
    var look = fxLook();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!nxt.plain) { // the transition proper, under the message
        fxNextEffects(w, h, look);
    }
    ctx.drawImage(nxt.frame, 0, 0); // the message itself, over all of it and unchanged
    if (nxt.lore) {
        fxDrawScreenLore(); // the words arriving under it: over the message, under the tube
    }
    if (!nxt.plain) {
        fxDrawScreen(look); // and the CRT over that, as in play
    }

    nxt.age++;
    if (nxt.age >= nxt.span) {
        fxNextStop(); // the last frame stays up until the level starts
        return;
    }
    nxt.request = requestAnimationFrame(fxNextFrame);
}

function fxNextEffects(w, h, look) { // the ground coming up, the rings going out and the bar wiping across
    if (FX_TINT_ON) { // the ground of the level being entered, coming up under the message
        var a = FX_NEXT_TINT_A * Math.min(1, nxt.age / FX_NEXT_TINT);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = fxTint(level).css; // the tint itself, not fxDrawTint: that fades up from the ground a level
        ctx.fillRect(0, 0, w, h); // opened on, and this screen is where the next one's is decided
        ctx.restore();
        fxGroundShown(fxTint(level), a); // over the page's white: the ground the level then opens on and fades up from
    }
    ctx.save();
    for (var i = 0; i < FX_NEXT_RINGS; i++) { // rings out from the middle, one after another
        var a = nxt.age - i * FX_NEXT_RING_GAP;
        if (a < 0 || a >= FX_NEXT_RING_SPAN) {
            continue;
        }
        var t = a / FX_NEXT_RING_SPAN;
        ctx.globalAlpha = FX_NEXT_RING_A * (1 - t) * (1 - t);
        ctx.lineWidth = Math.max(1, 5 * (1 - t));
        ctx.strokeStyle = i % 2 ? "#ff00ff" : "#00FFFF";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 20 + (1 - (1 - t) * (1 - t)) * Math.max(w, h) * 0.62, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.beginPath(); // leave no path behind for the fills below
    if (look == "full" && nxt.age < FX_NEXT_SWEEP) { // a bar wiping across, once, only in the full look
        var sx = (nxt.age / FX_NEXT_SWEEP) * (w + FX_NEXT_SWEEP_W) - FX_NEXT_SWEEP_W;
        ctx.globalAlpha = FX_NEXT_SWEEP_A;
        ctx.fillStyle = "#00FFFF";
        ctx.fillRect(sx, 0, FX_NEXT_SWEEP_W, h);
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(sx + FX_NEXT_SWEEP_W - 4, 0, 4, h);
    }
    ctx.restore();
}

function fxSparksClear() { // sparks in flight do not cross a level or a death
    for (var i = 0; i < FX_PART_MAX; i++) {
        fx.part[i].age = fx.part[i].life; // each spark carries its own life now, so spend it against that
    }
    fx.live = 0;
}

function fxSparking() { // is any spark still in flight
    return fx.live > 0;
}

function fxSpark(side, x, y, lane, power, seed, count) { // vent sparks out of the gap the square just went through
    // the same gate the released marks had: nothing below the tier, nothing in the reduced look (streaming motion),
    // and nothing on 13 or 14, where a world-anchored mark can drift into a bar and trace a block the level is hiding
    if (!FX_PART_ON || fx.look != "full" || level == 13 || level == 14 || power < FX_GRAZE_TICKAT) {
        return;
    }
    var nx = side == 1 ? 1 : side == 3 ? -1 : 0; // the outward normal: which way the obstacle lies
    var ny = side == 2 ? 1 : side == 0 ? -1 : 0;
    var tx = -ny, ty = nx; // and along the edge, which is where the gap actually vents
    // the count spans the whole spark range between the threshold and a touching pass, rather than between 0 and a
    // touching pass, so moving the threshold out adds faint sparks at distance instead of a crowd at every gap
    var reach = (power - FX_GRAZE_TICKAT) / (1 - FX_GRAZE_TICKAT);
    var n = count !== undefined ? count : FX_PART_MIN + Math.round((FX_PART_EMIT - FX_PART_MIN) * reach);
    for (var k = 0; k < n; k++) {
        var p = fx.part[fx.pnext];
        fx.pnext = (fx.pnext + 1) % FX_PART_MAX; // the oldest in flight is the one overwritten
        if (p.age >= p.life) {
            fx.live++; // a spent slot lit; one overwritten in flight was already counted
        }
        var h = seed * 8 + side;
        var ember = fxHash(h, k + 96) < FX_PART_EMBER; // a heavier one, thrown slower and burning longer
        var along = 2 * fxHash(h, k) - 1;
        var out = 0.35 + 0.65 * fxHash(h, k + 32);
        var spd = FX_PART_V0 * (ember ? 0.5 + 0.3 * fxHash(h, k + 64) : 0.7 + 0.8 * fxHash(h, k + 64));
        p.age = 0;
        p.x = x;
        p.y = y;
        p.vx = (tx * along * FX_PART_SPREAD - nx * out * FX_PART_OUT) * spd;
        p.vy = (ty * along * FX_PART_SPREAD - ny * out * FX_PART_OUT) * spd;
        p.lane = lane; // the world's own leftward travel, which is never damped: they end up riding it
        p.life = Math.round(FX_PART_LIFE * (ember ? FX_PART_EMBER_LIFE : 0.7 + 0.6 * fxHash(h, k + 128)));
        p.w = ember ? FX_PART_W_EMBER : FX_PART_W * (0.7 + 0.6 * fxHash(h, k + 160));
        p.curl = (fxHash(h, k + 192) - 0.5) * 2 * FX_PART_CURL; // which way this one arcs, and how hard
        p.warm = 0; // struck off an obstacle, so it takes the cyan and magenta pair like everything else that is
    }
}

function fxDropHistory() { // the square isn't where it was recorded: nothing hung off its past positions survives
    fx.count = 0;
    fxGrazeClear();
}

function fxGrazing() { // is any side of the square lit or still cooling
    return fx.graze[0].lit > 0 || fx.graze[1].lit > 0 || fx.graze[2].lit > 0 || fx.graze[3].lit > 0;
}

function fxGrazeFade() { // how fast a spark cools: 200ms, or 500ms with reduced motion, so sparks breathe, not blink
    return fx.look == "full" ? FX_GRAZE : FX_GRAZE_CALM;
}

function fxShowing() { // is a power's own overlay on screen (the grid and the sparks are drawn outside it)
    return fx.warp > 0 || fx.focus > 0;
}

function fxFade(level, on, f) { // one step of a fade toward full (on) or 0 (off)
    return on ? Math.min(f.full, level + f.up) : Math.max(0, level - f.down);
}

function fxEase(level, f) { // a fade level as 0..1, smoothstepped so effects ease in and out instead of popping
    var t = level / f.full;
    return t * t * (3 - 2 * t);
}

function fxHash(a, b) { // a repeatable 0..1 from two whole numbers: the effects' own randomness (Math.random drives the spawns)
    var h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fxSample(age) { // the square as it was `age` steps ago (0: the latest record)
    return fx.samples[(fx.next - 1 - age + 2 * FX_HISTORY) % FX_HISTORY];
}

function fxAttached() { // is the square where it was last recorded (a touch resize can move it between steps)
    if (fx.count == 0) {
        return false;
    }
    var s = fxSample(0);
    return Math.abs(gamePiece.x + gamePiece.width / 2 - s.x) + Math.abs(gamePiece.y + gamePiece.height / 2 - s.y) < 1;
}

function fxOverdrawn() { // runSteps runs another step before the screen shows this one, and that step clears it first
    return gameArea.running && gameArea.pendingTime >= STEP_MS;
}

function fxStep() { // each step, before anything is drawn: fade each power's look toward the power in use
    fx.look = fxLook();
    if (fx.look == "off") {
        fxReset();
        return;
    }
    if (!fxAttached()) {
        fxDropHistory(); // the square was moved between steps (a touch resize): no trail, echoes or sparks back there
    }
    var warpOn = speed == speed_fast;
    var focusOn = speed == speed_slow;
    if (warpOn && fx.warp == 0) {
        fx.kick = 0; // Warp from nothing: the speed lines burst out
    }
    if (focusOn && fx.focus == 0) {
        fx.snap = 0; // Focus from nothing: the vignette snaps in
    }
    fx.warp = fxFade(fx.warp, warpOn, FX_FADE.warp);
    fx.focus = fxFade(fx.focus, focusOn, FX_FADE.focus);
    fx.kick = Math.min(fx.kick + 1, FX_KICK_STEPS);
    fx.snap = Math.min(fx.snap + 1, FX_SNAP_STEPS);
    fx.run += fxEase(fx.warp, FX_FADE.warp); // the lines speed up as Warp comes in and coast to a stop as it fades

    fx.drift += FX_GRID_RATE * speed; // the ground scrolled: the grid's phase, in px
    fx.stall = fxOverdrawn() ? Math.min(fx.stall + 1, FX_GRID_STALL) // the machine is behind: shed scenery, not simulation
                             : Math.max(0, fx.stall - 1);
    var gf = fxGrazeFade();
    for (var i = 0; i < 4; i++) { // sparks always cool; fxGraze refills them later this step if anything is near
        var g = fx.graze[i];
        g.lit = fxFade(g.lit, false, gf);
        g.hit = Math.min(g.hit + 1, FX_GRAZE_HIT);
        g.sx -= g.vx * speed; // the contact point travels with the obstacle that made it, as moveObjects moves that
    }

    for (i = 0; i < 2; i++) { // powerup rings travel with the world, at the rate their powerup was moving
        var r = fx.ring[i];
        r.age = Math.min(r.age + 1, FX_POP);
        r.x -= FX_POP_DRIFT * speed;
    }
    fx.wave.age = Math.min(fx.wave.age + 1, FX_WAVE); // the shockwave came off the square, which doesn't travel
    fx.mile.age = Math.min(fx.mile.age + 1, FX_MILE);
    var hundred = Math.floor(score / 100);
    if (hundred > fx.mile.at) {
        fx.mile.age = 0; // another hundred
    }
    fx.mile.at = hundred; // follows the score down as well, so a Break penalty re-arms the hundred it dropped below
    fx.roll += FX_ROLL_RATE; // not multiplied by speed: the tube doesn't know the game slowed down
    var flying = fx.live; // in flight as the step begins: the loop is over once it has seen that many
    for (i = 0; i < FX_PART_MAX && flying > 0; i++) { // sparks: burst, arc, slow, then ride the world out
        var p = fx.part[i];
        if (p.age >= p.life) {
            continue;
        }
        flying--;
        p.age++;
        if (p.age >= p.life) {
            fx.live--; // spent on this step
        }
        p.x += (p.vx - p.lane) * speed; // the spray is damped below; the world's travel never is
        p.y += p.vy * speed;
        var turn = p.curl * speed; // small-angle rotation: two multiplies instead of a sin and a cos per spark
        var vx = p.vx - p.vy * turn;
        p.vy = (p.vy + p.vx * turn) * FX_PART_DRAG;
        p.vx = vx * FX_PART_DRAG;
    }
}

function fxRecord() { // each step, after the square has moved: remember where it is now
    if (fx.look == "off") {
        return;
    }
    var cx = gamePiece.x + gamePiece.width / 2;
    var cy = gamePiece.y + gamePiece.height / 2;
    if (fx.count > 0) {
        var last = fxSample(0);
        if (Math.abs(cx - last.x) + Math.abs(cy - last.y) > 250) {
            fxDropHistory(); // a jump, not a move (the cursor came back into the window somewhere else): no streak across the screen
        }
    }
    fx.scroll += FX_TRAIL_PX * speed; // the world moved left this step; everything recorded before drifts with it
    var s = fx.samples[fx.next];
    s.x = cx;
    s.y = cy;
    s.size = gamePiece.width;
    s.scroll = fx.scroll;
    fx.next = (fx.next + 1) % FX_HISTORY;
    fx.count = Math.min(fx.count + 1, FX_HISTORY + 8); // past the ring's size it only times the echoes' fade-in
    fxGraze(); // everything has moved now, so this is the one moment the gaps are the ones the player actually flew
}

function fxGraze() { // the sparks follow the game's own graze measurement: this step's closest pass on each side
    if (!FX_GRAZE_ON || invincible) { // Break: grazeStep leaves the sides clear all through it anyway
        return;
    }
    for (var i = 0; i < 4; i++) {
        fxGrazeApply(i);
    }
}

function fxGrazeApply(side) { // light the side, and flare if this is a new pass or a real tightening of an old one
    var g = fx.graze[side], c = graze.side[side];
    if (c.power <= 0) {
        return; // nothing near this side: leave power where it was and let lit cool
    }
    if (g.lit == 0 || c.power >= g.struck + FX_GRAZE_STRIKE) {
        g.hit = 0; // a strike: flare, and vent sparks from the contact point
        g.seed++;
        g.struck = c.power;
        g.sx = c.x;
        g.sy = c.y;
        g.vx = c.v;
        fxSpark(side, c.x, c.y, c.v, c.power, g.seed);
    } else if (gameArea.frameNo % FX_PART_TRICKLE == 0) {
        // no new strike, but the line is still being held: keep venting, so holding one reads as a grind and not
        // as a single impact. Seeded off the frame so it stays repeatable
        fxSpark(side, c.x, c.y, c.v, c.power, g.seed * 97 + gameArea.frameNo, 1);
    }
    g.power = c.power; // closeness now: the blade's brightness follows the live gap, not the gap back at the strike
    g.lit = fxFade(g.lit, true, fxGrazeFade()); // full life again while anything is near
}

function fxGradients() { // made once in unit space (1 is the middle of an edge); setTransform fits them to any screen
    if (!fx.grad) {
        var vignette = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.3); // Focus: deep violet from the edges, a faint magenta rim like an old CRT
        vignette.addColorStop(0.54, "rgba(255,0,255,0)"); // clear out to 0.7 (in the rim's color, so it fades in without a gray fringe)
        // light enough that a red block entering anywhere along an edge keeps at least 3:1 contrast
        vignette.addColorStop(0.66, "rgba(255,0,255,0.05)"); // the rim, at 0.86
        vignette.addColorStop(0.77, "rgba(40,0,70,0.1)"); // the middles of the edges
        vignette.addColorStop(1, "rgba(18,0,36,0.12)"); // 1.3 and beyond: the corners
        var rim = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.3); // Warp with reduced motion: a still magenta glow instead of speed lines
        rim.addColorStop(0.54, "rgba(255,0,255,0)");
        rim.addColorStop(1, "rgba(255,0,255,0.22)"); // at most 0.18 once scaled: red blocks keep their contrast
        var trail = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); // the Warp trail, by distance: 0 at the square, 1 at its farthest point
        trail.addColorStop(0, "#ff00ff");
        trail.addColorStop(0.45, "rgba(0,255,255,0.6)");
        trail.addColorStop(1, "rgba(0,255,255,0)");
        // the horizon grid's plane, by depth: 0 at the horizon, 1 at the bottom edge. Linear, not radial like the other
        // three, because its transform scales x by 1 and y by the plane's height, which would stretch a radial one into
        // a several-hundred-to-one ellipse. The stops carry the design's most ink; globalAlpha scales them back down
        var grid = ctx.createLinearGradient(0, 0, 0, 1);
        grid.addColorStop(0, "rgba(255,0,255,0)"); // the horizon's own row: the rungs fade up into it without a fringe
        grid.addColorStop(FX_GRID_HAZE, "rgba(255,0,255,0.1485)"); // the magenta haze where the rungs bunch up
        grid.addColorStop(1, "rgba(0,255,255,0.216)"); // pale cyan nearest the viewer
        // the CRT's rolling bar, across its own height: nothing at the edges, darkest through the middle
        var roll = ctx.createLinearGradient(0, 0, 0, 1);
        roll.addColorStop(0, "rgba(0,0,0,0)");
        roll.addColorStop(0.5, "rgba(0,0,0,1)"); // globalAlpha scales this down to FX_ROLL_ALPHA at the peak
        roll.addColorStop(1, "rgba(0,0,0,0)");
        fx.grad = { vignette: vignette, rim: rim, trail: trail, grid: grid, roll: roll };
    }
    return fx.grad;
}

function fxRimImage() { // the reduced-motion Warp glow, baked once per canvas size.
    // It is the same picture either way, but a radial gradient has to be evaluated across the whole screen every time
    // it is filled, where a bitmap of it is a straight blit. Measured on a throttled phone at level 15, dropping the
    // live gradient took the reduced look from 16.7fps to 23 -- it was the reason reduced ran SLOWER than full, which
    // is exactly backwards for a setting people choose to make things easier.
    var w = gameArea.canvas.width, h = gameArea.canvas.height;
    if (!fx.rim || fx.rim.width != w || fx.rim.height != h) {
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        var g = c.getContext("2d");
        var rim = g.createRadialGradient(0, 0, 0, 0, 0, 1.3); // built on its own context, in the same unit space
        rim.addColorStop(0.54, "rgba(255,0,255,0)");
        rim.addColorStop(1, "rgba(255,0,255,0.22)");
        g.fillStyle = rim;
        g.setTransform(w / 2, 0, 0, h / 2, w / 2, h / 2);
        g.fillRect(-2, -2, 4, 4); // exactly what fxFillScreen would have painted at full alpha
        fx.rim = c;
    }
    return fx.rim;
}

function fxFillScreen(gradient, alpha, scaleX, scaleY) { // a unit-space gradient stretched over the whole screen from its center
    var w = gameArea.canvas.width;
    var h = gameArea.canvas.height;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.setTransform(w / 2 * scaleX, 0, 0, h / 2 * scaleY, w / 2, h / 2);
    ctx.fillRect(-2, -2, 4, 4); // the whole screen, even squeezed a little past its rest
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function fxTint(lvl) { // the ground for a level, clamped at both ends of the table
    return FX_TINTS[Math.max(1, Math.min(FX_TINTS.length - 1, lvl))];
}

function fxDrawTint() { // the level's ground, painted first. This is the game's only background: without effects the
    // canvas is left transparent by clearRect and the white you see is the page behind it
    var to = fxTint(level), from = fx.from; // from the ground that was on screen when the level opened (see fx.from)
    var k = gameArea.frameNo / FX_TINT_FADE; // frameNo holds while paused, so a paused redraw holds the same ground
    var r = to[0], g = to[1], b = to[2];
    if (k < 1 && (from[0] != r || from[1] != g || from[2] != b)) { // crossing to this level's ground
        r = Math.round(from[0] + (r - from[0]) * k);
        g = Math.round(from[1] + (g - from[1]) * k);
        b = Math.round(from[2] + (b - from[2]) * k);
        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    } else {
        ctx.fillStyle = to.css; // the solid form, built once: an unchanged ground makes no string at all
    }
    fx.ground[0] = r; fx.ground[1] = g; fx.ground[2] = b; // what is on screen now
    ctx.fillRect(0, 0, gameArea.canvas.width, gameArea.canvas.height);
}

function fxGroundShown(t, a) { // the between-levels screen is showing tint t at alpha a over the page's white
    for (var i = 0; i < 3; i++) {
        fx.ground[i] = Math.round(255 + (t[i] - 255) * a);
    }
}

function fxGroundClear() { // the canvas was cleared for a message with nothing held under it: the ground is the page's white
    fx.ground[0] = fx.ground[1] = fx.ground[2] = 255;
}

function fxScanPattern() { // the scanline tile, built once like the gradients, and equally immune to a canvas resize
    if (!fx.scan) {
        var tile = document.createElement("canvas");
        tile.width = 1;
        tile.height = FX_SCAN_PERIOD;
        var t = tile.getContext("2d");
        t.fillStyle = "rgba(0,0,0," + FX_SCAN_ALPHA + ")";
        t.fillRect(0, 0, 1, FX_SCAN_LINE);
        fx.scan = ctx.createPattern(tile, "repeat");
    }
    return fx.scan;
}

function fxDrawScreen(look) { // the CRT, over the finished picture: the scanlines, and the bar rolling down them
    if (!FX_SCAN_ON || look == "off" || fxOverdrawn()) {
        return;
    }
    var w = gameArea.canvas.width, h = gameArea.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fxScanPattern();
    ctx.fillRect(0, 0, w, h); // ONE fill. A fillRect per line measures 12.8ms at 1920x1080, which is the whole step budget
    if (FX_ROLL_ON && look == "full") {
        ctx.globalAlpha = FX_ROLL_ALPHA;
        ctx.fillStyle = fxGradients().roll;
        ctx.setTransform(w, 0, 0, FX_ROLL_H, 0, fx.roll % (h + FX_ROLL_H) - FX_ROLL_H); // the unit band, placed
        ctx.fillRect(0, 0, 1, 1);
    }
    ctx.restore();
}

function fxGridEdge(x, w, edgeL, edgeR) { // 0 anywhere inside the gutters, ramping up over FX_GRID_FADE past them:
    // the gutters have to be empty, not merely faint, or the quarter second of clean white isn't clean
    return Math.max(0, Math.min(1, (x - edgeL) / FX_GRID_FADE, (w - edgeR - x) / FX_GRID_FADE));
}

function fxGridSpan(x0, x1, y, t) { // a horizontal line as a clockwise hexagon, tapering to a point at both ends
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + t * 8, y - t);
    ctx.lineTo(x1 - t * 8, y - t);
    ctx.lineTo(x1, y);
    ctx.lineTo(x1 - t * 8, y + t);
    ctx.lineTo(x0 + t * 8, y + t);
    ctx.closePath();
}

function fxDrawGrid(look) { // the world's floor: a perspective plane under everything, drawn whether or not a power is on
    var w = gameArea.canvas.width, h = gameArea.canvas.height;
    var full = look == "full";
    var ew = fxEase(fx.warp, FX_FADE.warp), ef = fxEase(fx.focus, FX_FADE.focus);

    var horizon = FX_GRID_HORIZON;
    if (full) { // every bit of horizon movement is motion, so reduced motion keeps none of it
        horizon += FX_GRID_PITCH * ew - FX_GRID_DEEPEN * ef;
        horizon -= FX_GRID_KICK * Math.sin(2 * Math.PI * fx.kick / FX_KICK_STEPS); // Warp: up a touch, down past, settled
        horizon += FX_GRID_SNAP * Math.sin(2 * Math.PI * fx.snap / FX_SNAP_STEPS); // Focus: the mirror of it
    }
    horizon = Math.max(FX_GRID_LOW, Math.min(FX_GRID_HIGH, horizon)); // clamped on every path, moving or still
    var top = Math.round(horizon * h), band = h - top;

    // the gutters: the fastest obstacle the game can make gets a quarter second of clean white before it reaches any ink
    var edge = Math.min(FX_GRID_EDGE_FRAC * w, FX_GRID_EDGE_STEPS * OBSTACLE_SPEEDS.hyper * speed_fast);
    var edgeL = edge, edgeR = edge;
    if (inputMode == "touch") { // and nothing under the power buttons, where a cyan line would read as button feedback
        var tbg = touchButtons();
        if (tbg.side == "left") {
            edgeL = Math.max(edge, tbg.box.right + FX_GRID_EDGE_PAD);
        } else {
            edgeR = Math.max(edge, w - tbg.box.left + FX_GRID_EDGE_PAD);
        }
    }
    var span = w - edgeL - edgeR;

    var fit = Math.max(0, Math.min(1, (band - FX_GRID_BAND_MIN) / FX_GRID_BAND_MIN,
                                      (span - FX_GRID_SPAN_MIN) / FX_GRID_SPAN_MIN));
    if (fit <= 0) {
        return; // too short or too narrow to read as a plane at all
    }
    var lift = fit * (1 - fx.stall / FX_GRID_STALL)
                   * (1 - FX_GRID_WASH_DIM * ef) // Focus's vignette owns this budget
                   * (full ? 1 + FX_GRID_WARP_LIFT * ew * (1 - ef) // full Warp draws marks, so the grid can come up
                           : 1 - FX_GRID_WASH_DIM * ew); // reduced Warp draws the rim wash, so it gets out of the way
    if (lift <= 0.01) {
        return;
    }
    var lane = Math.max(FX_GRID_LANE_MIN, Math.min(FX_GRID_LANE_MAX, w / FX_GRID_LANES))
             * (full ? 1 + FX_GRID_STRETCH * ew : 1);
    var off = full ? fx.drift % lane : 0;
    var cx = w / 2, yt = top + FX_GRID_HAZE * band, K = FX_GRID_NEAR * band;
    var gap = Math.max(FX_GRID_GAP_MIN, FX_GRID_GAP_FRAC * band) * (1 - (1 - FX_GRID_GAP_FOCUS) * ef);
    var real = (Math.sqrt(1 + 4 * K / gap) - 1) / 2; // the largest m whose rung still clears the one before it by gap
    var M = Math.min(FX_GRID_RUNGS_MAX, Math.floor(real));

    // the gutters are a guarantee, not a tendency: tapering a depth line's width to nothing at its end still drags a
    // wedge of it across the gutter on the way, so cut the whole plane to the clean span. Full height, because the
    // horizon's own line straddles top and clipping at top would shave it
    ctx.save();
    ctx.beginPath();
    ctx.rect(edgeL, 0, span, h);
    ctx.clip();

    // not hygiene: drawTouchControls leaves a live arc behind, and save/restore doesn't reset the path. Without this
    // the first fill paints that arc with the plane's gradient, as a violet disc under the whole world
    ctx.beginPath();
    for (var m = 1; m <= M; m++) { // rungs on a K/m series: the perspective spacing of a plane seen edge on
        fxGridSpan(edgeL, w - edgeR, top + Math.round(K / m), FX_GRID_W_RUNG * Math.min(1, real - m) / 2);
    }
    var count = Math.min(FX_GRID_LANES_MAX, Math.ceil((w + edgeL + lane) / lane) + 1);
    for (var j = 0; j < count; j++) { // depth lines, fanning from the vanishing point and sliding left
        var xb = w + lane - off - j * lane;
        if (xb < -edgeL) {
            break;
        }
        var xt = cx + FX_GRID_HAZE * (xb - cx);
        var wt = FX_GRID_W_FAR * fxGridEdge(xt, w, edgeL, edgeR) / 2;
        var wb = FX_GRID_W_NEAR * fxGridEdge(xb, w, edgeL, edgeR) / 2;
        if (wt <= 0 && wb <= 0) {
            continue;
        }
        ctx.moveTo(xt - wt, yt);
        ctx.lineTo(xt + wt, yt);
        ctx.lineTo(xb + wb, h);
        ctx.lineTo(xb - wb, h);
        ctx.closePath();
    }
    ctx.globalAlpha = lift / FX_GRID_LIFT_MAX; // at most 1: the gradient's stops already carry the maximum
    ctx.fillStyle = fxGradients().grid;
    ctx.setTransform(1, 0, 0, band, 0, top); // unit depth: 0 at the horizon, 1 at the bottom edge
    ctx.fill(); // one fill, every subpath wound the same way, so the crossings composite once instead of twice
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.beginPath();
    fxGridSpan(edgeL, w - edgeR, top, FX_GRID_W_HORIZON / 2);
    ctx.fillStyle = FX_GRID_HORIZON_INK; // under the same globalAlpha as the plane, not budgeted on its own
    ctx.fill();
    ctx.restore(); // drops the clip, the alpha and the fill color together
    ctx.beginPath(); // leave no path behind
}

function fxDrawVignette(e, look) { // Focus: slides in from past the corners as it comes in (a touch too far, then back) and out as it fades
    var squeeze = 1;
    if (look == "full") {
        var snap = Math.sin(Math.PI * fx.snap / FX_SNAP_STEPS);
        squeeze = 1 + 0.35 * (1 - e) - 0.05 * snap * snap;
    }
    fxFillScreen(fxGradients().vignette, e, 1.15 * squeeze, squeeze); // wider than tall: the middle of the right edge, where obstacles come in, stays lightest
}

function fxDrawSpeedLines(e) { // Warp: streaks rushing right to left, printed twice like the title: cyan up-left, magenta on top
    var w = gameArea.canvas.width;
    var h = gameArea.canvas.height;
    var n = Math.max(8, Math.min(20, Math.round(h / 36))); // about one per 36px of height
    var span = w + 400; // a line (at most 390px long, bursting) is past the left edge before it comes round again
    var kick = Math.sin(Math.PI * fx.kick / FX_KICK_STEPS); // 0 once the burst is over
    var stretch = (0.35 + 0.65 * e) * (1 + 0.5 * kick); // longer as Warp comes in, and longer still in the burst
    var show = Math.min(1, 1.6 * e); // the lines show before they reach full length, so the burst lands
    for (var l = 0; l < FX_LINE_LAYERS.length; l++) {
        var layer = FX_LINE_LAYERS[l];
        ctx.globalAlpha = layer.alpha * show;
        for (var pass = 0; pass < 2; pass++) { // all the cyan copies, then all the magenta: two fill colors per layer
            var off = pass == 0 ? 2 : 0;
            ctx.fillStyle = pass == 0 ? "#00FFFF" : "#ff00ff";
            for (var i = l; i < n; i += FX_LINE_LAYERS.length) {
                var travel = fx.run * layer.v + fxHash(i, 0) * span;
                var lap = Math.floor(travel / span); // each time round the line gets a new height and length
                ctx.fillRect(w - (travel - lap * span) - off, Math.floor(fxHash(i, lap * 2 + 2) * h) - off,
                    (80 + 180 * fxHash(i, lap * 2 + 1)) * stretch, layer.h);
            }
        }
    }
}

function fxDrawTrail(e) { // Warp: a comet from the square back along its path, carried left by the world, magenta fading through cyan
    var length = Math.min(fx.count - 1, FX_TRAIL_STEPS * e); // in steps: it pulls in toward the square as Warp fades
    if (length < 1) {
        return;
    }
    var whole = Math.floor(length);
    var n = 0;
    for (var k = 0; k <= whole; k++) {
        var s = fxSample(k);
        fx.rx[n] = s.x - (fx.scroll - s.scroll);
        fx.ry[n] = s.y;
        fx.rs[n] = s.size;
        fx.rt[n] = k / length;
        n++;
    }
    if (length > whole) { // the tip, part way to the next older position
        var f = length - whole;
        var q = fxSample(whole + 1);
        fx.rx[n] = fx.rx[n - 1] + (q.x - (fx.scroll - q.scroll) - fx.rx[n - 1]) * f;
        fx.ry[n] = fx.ry[n - 1] + (q.y - fx.ry[n - 1]) * f;
        fx.rs[n] = q.size;
        fx.rt[n] = 1;
        n++;
    }
    ctx.beginPath();
    for (var side = 1; side >= -1; side -= 2) { // down one edge from the square to the tip, and back up the other
        for (var j = 0; j < n; j++) {
            var i = side > 0 ? j : n - 1 - j;
            var a = Math.max(i - 1, 0);
            var b = Math.min(i + 1, n - 1);
            var tx = fx.rx[a] - fx.rx[b]; // the trail's direction here
            var ty = fx.ry[a] - fx.ry[b];
            var tl = Math.sqrt(tx * tx + ty * ty);
            if (tl < 0.01) { // no direction: lie flat
                tx = 1;
                ty = 0;
                tl = 1;
            }
            var half = side * 0.5 * fx.rs[i] * Math.sqrt(1 - fx.rt[i]); // as tall as the square at the square, tapering to a point
            var ex = fx.rx[i] - ty / tl * half;
            var ey = fx.ry[i] + tx / tl * half;
            if (side > 0 && j == 0) {
                ctx.moveTo(ex, ey);
            } else {
                ctx.lineTo(ex, ey);
            }
        }
    }
    ctx.closePath();
    var reach = 0; // the trail's farthest point from the square (the tip, unless a quick dodge looped it out ahead)
    for (var r = 1; r < n; r++) {
        var rdx = fx.rx[r] - fx.rx[0];
        var rdy = fx.ry[r] - fx.ry[0];
        reach = Math.max(reach, Math.sqrt(rdx * rdx + rdy * rdy));
    }
    ctx.globalAlpha = 0.6 * e; // at most 0.6: a red or black block under the trail still shows as one
    if (reach < 2) {
        ctx.fillStyle = "rgba(255,0,255,0.5)"; // too short to shade
    } else { // the gradient fades with distance from the square: scale it to the trail's reach (the outline is already placed)
        ctx.fillStyle = fxGradients().trail;
        ctx.setTransform(reach, 0, 0, reach, fx.rx[0], fx.ry[0]);
    }
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); // leave no path behind
}

function fxDrawEchoes(e) { // Focus: outlines where the square was, drifting off with the slowed world, printed like the title
    var headX = gamePiece.x + gamePiece.width / 2;
    var headY = gamePiece.y + gamePiece.height / 2;
    ctx.lineWidth = 2;
    for (var j = 0; j < FX_ECHO_AGES.length; j++) {
        var age = FX_ECHO_AGES[j];
        if (age >= fx.count) {
            continue;
        }
        var s = fxSample(age);
        var x = s.x - (fx.scroll - s.scroll);
        // fade in over 8 steps once its record exists, and out as it slides under the square
        var fade = Math.min(1, (fx.count - age) / 8, (Math.max(Math.abs(x - headX), Math.abs(s.y - headY)) - 2) / 4);
        if (fade <= 0) {
            continue;
        }
        var size = Math.round(s.size); // the size it was then: entering Focus, the echoes show the square shrinking
        var left = Math.round(x - s.size / 2); // whole pixels keep the 2px outlines crisp
        var top = Math.round(s.y - s.size / 2);
        ctx.globalAlpha = e * (0.75 - 0.5 * age / 30) * fade;
        ctx.strokeStyle = "#00FFFF";
        ctx.strokeRect(left - 2, top - 2, size, size);
        ctx.strokeStyle = "#ff00ff"; // outlines, never filled: filled squares are powerups
        ctx.strokeRect(left, top, size, size);
    }
}

function fxDrawRing(x, y, age, max, r0, r1, inner, outer) { // an expanding outline, printed twice like everything else
    var t = age / max;
    var e = 1 - (1 - t) * (1 - t); // out fast, then coasting: an impact, not a launch
    var r = r0 + (r1 - r0) * e;
    ctx.globalAlpha = FX_POP_ALPHA * (1 - t) * (1 - t);
    ctx.lineWidth = Math.max(1, FX_POP_W * (1 - t));
    ctx.strokeStyle = outer;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = inner;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // leave no path behind: the next fill would paint it
}

function fxDrawPopText(x, y, age, text, ink) { // what the pickup was actually worth, which the game had never said
    var t = age / FX_POP;
    ctx.save();
    ctx.globalAlpha = FX_COIN_TEXT_A * (1 - t) * (1 - t);
    ctx.font = "bold " + FX_COIN_TEXT + "px Arial";
    ctx.textAlign = "center";
    var ty = y - FX_COIN_RISE * (1 - (1 - t) * (1 - t)); // climbing fast and slowing, the way the rings expand
    ctx.fillStyle = "#ff00ff"; // the magenta print first, offset, then the ink over it, as the title does
    ctx.fillText(text, x + 2, ty + 2);
    ctx.fillStyle = ink;
    ctx.fillText(text, x, ty);
    ctx.restore();
}

function fxDrawPops() { // the powerup rings and the Break shockwave
    if (fx.ring[1].age < FX_POP) { // the score powerup keeps its own gold, with a magenta print off it
        fxDrawRing(fx.ring[1].x, fx.ring[1].y, fx.ring[1].age, FX_POP, FX_POP_R0, FX_POP_R1, "#FFD700", "#ff00ff");
        // a second, tighter ring inside it: one pop with some depth to it rather than a single hoop
        fxDrawRing(fx.ring[1].x, fx.ring[1].y, fx.ring[1].age, FX_POP, FX_POP_R0 * 0.4, FX_POP_R1 * FX_COIN_INNER,
                   "#ff00ff", "#FFD700");
        fxDrawPopText(fx.ring[1].x, fx.ring[1].y, fx.ring[1].age, "+" + powerupScoreBonus, "#FFD700");
    }
    if (fx.ring[0].age < FX_POP) { // a Break pickup, whether it opened a Break or refilled one: its ring, a tighter one
        // inside it, and what it was worth, in the seconds a Break runs for
        fxDrawRing(fx.ring[0].x, fx.ring[0].y, fx.ring[0].age, FX_POP, FX_POP_R0, FX_POP_R1, "#00FFFF", "#ff00ff");
        fxDrawRing(fx.ring[0].x, fx.ring[0].y, fx.ring[0].age, FX_POP, FX_POP_R0 * 0.4, FX_POP_R1 * FX_COIN_INNER,
                   "#ff00ff", "#00FFFF");
        fxDrawPopText(fx.ring[0].x, fx.ring[0].y, fx.ring[0].age, "+" + Math.round(invincibleTimeMax * STEP_MS / 1000) + "s", "#00FFFF");
    }
    if (fx.wave.age < FX_WAVE) {
        fxDrawRing(fx.wave.x, fx.wave.y, fx.wave.age, FX_WAVE, FX_WAVE_R0, FX_WAVE_R1, "#00FFFF", "#ff00ff");
    }
    ctx.globalAlpha = 1;
}

function fxDrawBeacons() { // a Break pickup on the field: a printed ring around it, breathing, so the one pickup that
    // saves you can be found across the field and read as a pickup whatever colour its flash has landed on. Under
    // the obstacles, like every mark here, so it can never hide the thing that kills you. The breath is motion, so
    // the reduced look keeps the ring still
    var breath = fx.look == "full" ? Math.sin(2 * Math.PI * gameArea.frameNo / FX_BEACON_STEPS) : 0;
    var r = FX_BEACON_R + FX_BEACON_PULSE * breath;
    ctx.lineWidth = FX_BEACON_W;
    ctx.globalAlpha = FX_BEACON_ALPHA;
    for (var i = 0; i < powerups.break.length; i++) {
        var cx = powerups.break[i].x + powerups.break[i].width / 2, cy = powerups.break[i].y + powerups.break[i].height / 2;
        ctx.strokeStyle = "#00FFFF"; // printed twice: cyan a pixel up and left, magenta over it
        ctx.beginPath();
        ctx.arc(cx - 1, cy - 1, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#ff00ff";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); // leave no path behind
}

function fxTelegraph() { // steps until the next screen-high block, or -1 if none is on the way
    var soonest = -1;
    for (var i = 0; i < SPAWN_RULES.length; i++) {
        var rule = SPAWN_RULES[i];
        if (!rule.big || level < rule.from || (rule.to !== undefined && level > rule.to)) {
            continue;
        }
        var period = rule.every * 2; // clockDue's period: the spawn lands when the clock next crosses a multiple
        var next = (Math.floor(gameArea.spawnClock / period) + 1) * period;
        var steps = (next - gameArea.spawnClock) / speed; // the clock advances by the game speed, so this is in steps
        if (soonest < 0 || steps < soonest) {
            soonest = steps;
        }
    }
    return soonest;
}

function fxDrawTelegraph() { // a screen-high block is coming: a mark at the edge it will come from
    var steps = fxTelegraph();
    if (steps < 0 || steps > FX_TELL_STEPS) {
        return;
    }
    var e = 1 - steps / FX_TELL_STEPS;
    var w = gameArea.canvas.width, h = gameArea.canvas.height;
    ctx.globalAlpha = FX_TELL_ALPHA * e * e; // stays quiet until it is nearly here
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(w - FX_TELL_W, 0, FX_TELL_W, h);
    ctx.fillStyle = "#00FFFF";
    ctx.fillRect(w - FX_TELL_W - 2, 0, 2, h);
    ctx.globalAlpha = 1;
}

function fxDrawMilestone(x, y) { // another hundred: the number printed like the title, behind the number itself
    if (!FX_MILE_ON || fx.mile.age >= FX_MILE || fxLook() == "off") {
        return;
    }
    var t = fx.mile.age / FX_MILE;
    ctx.save();
    ctx.globalAlpha = FX_MILE_ALPHA * (1 - t) * (1 - t);
    ctx.fillStyle = "#00FFFF";
    for (var i = FX_MILE_PASSES; i > 0; i--) { // trailing up and left, as drawTitle stacks its shadow
        if (i * 2 <= FX_MILE_PASSES) {
            ctx.fillStyle = "#ff00ff";
        }
        ctx.fillText(score, x - i, y - i);
    }
    ctx.restore();
}

function fxGrazeRect(x, y, w, h, keep) { // one band of a spark, unless it would land on the touch buttons
    if (keep && x + w > keep.left && x < keep.right && y + h > keep.top) {
        return;
    }
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); // whole pixels keep a 2px band crisp
}

function fxDrawGrazes(look) { // a two-band blade on each side the square just passed close on
    var full = look == "full";
    var left = gamePiece.x, top = gamePiece.y;
    var right = left + gamePiece.width, bottom = top + gamePiece.height;
    var midX = (left + right) / 2, midY = (top + bottom) / 2;
    // a cyan band a few px from the cyan FOCUS button reads as button feedback, not proximity
    var keep = inputMode == "touch" ? touchButtons().box : null;
    var fade = fxGrazeFade();
    for (var side = 0; side < 4; side++) {
        var g = fx.graze[side];
        if (g.lit <= 0) {
            continue;
        }
        var base = FX_GRAZE_DIM + (FX_GRAZE_ALPHA - FX_GRAZE_DIM) * g.power; // brightness is closeness, and only closeness
        var flare = Math.cos(Math.PI * g.hit / (2 * FX_GRAZE_HIT)); // 1 on the strike step: an impact has no anticipation
        var over = full ? Math.round(FX_GRAZE_OVER * flare) : 0;
        var len = Math.max(FX_GRAZE_MINLEN, gamePiece.width + 2 * over);
        var vertical = side == 1 || side == 3;
        var sign = (side == 0 || side == 3) ? -1 : 1; // which way is out of the square
        var edge = side == 0 ? top : side == 1 ? right : side == 2 ? bottom : left;
        var along = (vertical ? midY : midX) - len / 2;
        var b, off, th, at;

        ctx.globalAlpha = base * fxEase(g.lit, fade);
        for (b = 0; b < 2; b++) { // magenta inboard, cyan outward: whichever lands on the block is the one that reads there
            off = b == 0 ? FX_GRAZE_LIFT : FX_GRAZE_LIFT + FX_GRAZE_BLADE;
            th = b == 0 ? FX_GRAZE_BLADE : FX_GRAZE_SPLIT;
            at = sign < 0 ? edge - off - th : edge + off;
            ctx.fillStyle = b == 0 ? "#ff00ff" : "#00FFFF";
            if (vertical) {
                fxGrazeRect(at, along, th, len, keep);
            } else {
                fxGrazeRect(along, at, len, th, keep);
            }
        }
    }
    ctx.globalAlpha = 1;
}

function fxDrawSparks() { // the sparks a graze vented, printed twice like everything else here
    var lw = ctx.lineWidth, cap = ctx.lineCap;
    ctx.lineCap = "round"; // a short streak with square ends reads as a dash; with round ends it reads as a spark
    var flying = fx.live; // the loop is over once every spark in flight has been drawn
    for (var i = 0; i < FX_PART_MAX && flying > 0; i++) {
        var p = fx.part[i];
        if (p.age >= p.life) {
            continue;
        }
        flying--;
        var t = p.age / p.life;
        var dx = (p.vx - p.lane) * FX_PART_LEN; // the streak lies back along the way it just came
        var dy = p.vy * FX_PART_LEN;
        ctx.globalAlpha = FX_PART_ALPHA * (1 - t) * (1 - t);
        ctx.lineWidth = Math.max(1, p.w * (1 - 0.45 * t));
        ctx.strokeStyle = p.warm ? "#FFD700" : "#00FFFF"; // laid down first and offset, so one of the pair reads
        // on black and one on the ground. A coin's sparks keep the coin's own gold in place of the cyan
        ctx.beginPath();
        ctx.moveTo(p.x - dx + 1, p.y - dy + 1);
        ctx.lineTo(p.x + 1, p.y + 1);
        ctx.stroke();
        ctx.strokeStyle = "#ff00ff";
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = lw;
    ctx.lineCap = cap; // the Warp trail and the graze blade both draw after this and expect it as it was
    ctx.beginPath(); // leave no path behind
}

function fxDrawBackdrop() { // Focus's vignette and Warp's speed lines: under the level's bars, the objects and the HUD
    // the look is resolved here, not read from fx.look: fxStep doesn't run on the paused redraw, so fx.look can be a
    // level behind (it is still "off" on the first frame of a run, and it never updates if effects are switched while paused)
    var look = fxLook();
    if (look == "off" || fxOverdrawn() || !(FX_TINT_ON || FX_GRID_ON || FX_TELL_ON || FX_BEACON_ON || fxShowing() || fxFlourishing())) {
        return; // nothing to add: the picture is exactly what it was without effects
    }
    ctx.save(); // puts every drawing setting back after
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (FX_TINT_ON) {
        fxDrawTint(); // the ground, under everything including the grid
    }
    if (FX_GRID_ON) {
        fxDrawGrid(look); // the floor, under the powers' own overlays
    }
    if (FX_TELL_ON) {
        fxDrawTelegraph(); // under the obstacles, so the block it announces covers it on the way in
    }
    if (FX_POP_ON) {
        fxDrawPops();
    }
    if (FX_BEACON_ON) {
        fxDrawBeacons(); // around the Break pickups on the field, under the obstacles
    }
    if (fx.focus > 0) {
        fxDrawVignette(fxEase(fx.focus, FX_FADE.focus), look);
    }
    if (fx.warp > 0) {
        var e = fxEase(fx.warp, FX_FADE.warp);
        if (look == "full") {
            fxDrawSpeedLines(e);
        } else {
            ctx.globalAlpha = 0.8 * e; // reduced motion: a still magenta glow at the edges instead of streaks
            ctx.drawImage(fxRimImage(), 0, 0);
            ctx.globalAlpha = 1;
        }
    }
    ctx.restore();
}

function fxDrawAfterimages() { // Focus's echoes and Warp's trail: over the obstacles and the level's bars, under the HUD, buttons and square
    var look = fxLook(); // resolved here rather than read from fx.look, as in fxDrawBackdrop
    if (look == "off" || fxOverdrawn()) {
        return;
    }
    // the echoes, the trail and the blade all hang off the square, so none of them can be drawn if it was moved since
    // its last record (a touch resize). A spark is a world object the moment it is thrown, and is drawn either way
    var attached = fxAttached();
    var sparks = FX_PART_ON && fxSparking();
    if (!sparks && (!attached || (!fxShowing() && !fxGrazing()))) {
        return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (attached) {
        if (fx.focus > 0) {
            fxDrawEchoes(fxEase(fx.focus, FX_FADE.focus));
        }
        if (fx.warp > 0) {
            fxDrawTrail(fxEase(fx.warp, FX_FADE.warp));
        }
        if (fxGrazing()) {
            fxDrawGrazes(look); // over the obstacles: at the passes that matter the blade lies partly inside their footprint
        }
    }
    if (sparks) {
        fxDrawSparks(); // over the blade, since they are what the blade threw
    }
    ctx.restore();
}

