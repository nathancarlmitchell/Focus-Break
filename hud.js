// Focus Break -- the HUD. The score, deaths and level in the corner, packed up in touch play; the graze meter
// beside the score; and the progress stripe filling the top banner's slot as the score walks toward the limit. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

// The score walking toward the level's limit, filling the top banner's own stripe from the left. The alpha is what
// keeps it honest: obstacles pass behind this band, and a solid fill would hide a black block crossing it. At 0.45 a
// black block under the stripe still reads at better than 3:1 against the stripe over the ground beside it.
var FX_BAR_ON = true;
var FX_BAR_TOP = 40, FX_BAR_H = 20; // the magenta banner's own slot, so this reads as that stripe filling up
var FX_BAR_ALPHA = 0.45;
var FX_BAR_TRACK = 0.10; // the unfilled remainder, just enough to show how far there is left to go
var FX_BAR_READ = 0.45; // while a level is being read (the pre-roll), the stripe fills in the track's own magenta as the
                        // reading goes, so the level begins the moment it is full...
var FX_BAR_READ_FADE = 60; // ...and it lets go of that over these steps of play, under the score's cyan starting from nothing
var BREAK_RING_GAP = 6; // px between the square's edge and the Break ring around it
var BREAK_RING_W = 3; // the ring's weight; the white halo under it is 2px wider
var BREAK_RING_TRACK = 0.25; // the whole circle, faint, so what is left reads as a fraction of what there was
var BREAK_RING_ALPHA = 0.9;

// On a phone the stats are the same size as on a desktop but the screen is a third of the height, so the column ran
// three quarters of the way down it, through the middle of the play area. In touch play the two secondary readouts
// shrink and close up under the score, which keeps its size: it is the one being raced to the level's limit.
var TOUCH_STAT_FONT = 26; // px, against the score's 40
var TOUCH_STAT_DEATHS = 150, TOUCH_STAT_LEVEL = 190; // instead of 200 and 300

function drawStats(color, scoreColor) { // deaths, level and score in the top-left corner; the score can have its own color
    var touch = inputMode == "touch";
    ctx.font = (touch ? TOUCH_STAT_FONT : 40) + "px Arial";
    ctx.fillStyle = color;
    ctx.fillText(deaths, 50, touch ? TOUCH_STAT_DEATHS : 200); // show deaths
    ctx.fillText("Level " + level, 50, touch ? TOUCH_STAT_LEVEL : 300); // show level
    var rationed = runStatusText(); // beside the level, and only when the difficulty is rationing something
    if (rationed) {
        ctx.fillText(rationed, 250, touch ? TOUCH_STAT_LEVEL : 300);
    }
    ctx.font = "40px Arial"; // the score is drawn at full size in both layouts
    fxDrawMilestone(50, 100); // the hundreds, behind the number and in the same place, so nothing moves
    ctx.fillStyle = scoreColor || color;
    ctx.fillText(score, 50, 100); // show score
    drawGrazeMeter();
}

// The graze meter, under the score: a slot per charge, the next one filling, and what the bank is worth. It is
// the HUD and not an effect, because the charges score -- a player with the effects off still has to see them.
var GRAZE_HUD_X = 160; // beside the score rather than under it: the number it multiplies, and the one place
var GRAZE_HUD_Y = 80; // both HUD layouts leave clear -- the touch one packs the deaths and level lines up close
var GRAZE_SLOT_W = 24, GRAZE_SLOT_H = 10, GRAZE_SLOT_GAP = 5;

function drawGrazeMeter() {
    if (graze.charges == 0 && graze.fill <= 0) {
        return; // nothing earned yet, so the HUD is exactly the one the game has always drawn
    }
    var y = GRAZE_HUD_Y, x = GRAZE_HUD_X;
    ctx.save();
    ctx.fillStyle = "#ff00ff"; // the title's magenta: 3.14:1 on white, where the HUD's other cyan would vanish
    for (var i = 0; i < GRAZE_MAX; i++) {
        var part = i < graze.charges ? 1 : (i == graze.charges ? graze.fill : 0);
        if (i == graze.charges - 1 && graze.burn > 0) {
            part = 1 - graze.burn; // the top one is part spent: Focus has been living off it
        }
        ctx.globalAlpha = 0.35; // the empty slot: an outline, so the bank's size is visible before it is full
        ctx.fillRect(x, y, GRAZE_SLOT_W, 1);
        ctx.fillRect(x, y + GRAZE_SLOT_H - 1, GRAZE_SLOT_W, 1);
        ctx.fillRect(x, y, 1, GRAZE_SLOT_H);
        ctx.fillRect(x + GRAZE_SLOT_W - 1, y, 1, GRAZE_SLOT_H);
        if (part > 0) {
            ctx.globalAlpha = 1;
            ctx.fillRect(x + 2, y + 2, (GRAZE_SLOT_W - 4) * part, GRAZE_SLOT_H - 4);
        }
        x += GRAZE_SLOT_W + GRAZE_SLOT_GAP;
    }
    if (graze.lit < GRAZE_LIT) { // a charge just landed: rule the meter for a moment, fading out
        ctx.globalAlpha = 1 - graze.lit / GRAZE_LIT;
        var w = GRAZE_MAX * (GRAZE_SLOT_W + GRAZE_SLOT_GAP) - GRAZE_SLOT_GAP + 6;
        ctx.fillRect(GRAZE_HUD_X - 3, y - 4, w, 2);
        ctx.fillRect(GRAZE_HUD_X - 3, y + GRAZE_SLOT_H + 2, w, 2);
    }
    ctx.globalAlpha = 1;
    ctx.font = "16px Arial";
    ctx.fillText(graze.free ? "FREE 無料" : (graze.charges > 0 ? "x" + grazeRate().toFixed(2) : "GRAZE"),
        x + 6, y + GRAZE_SLOT_H - 1);
    ctx.restore();
}

function drawProgress() { // the top stripe filling as the score walks toward the level's limit, and before that, as
    // the level's reading walks toward its end
    if (!FX_BAR_ON || fxLook() == "off") {
        return;
    }
    var w = gameArea.canvas.width;
    var y = FX_BAR_TOP, h = FX_BAR_H; // unscaled, as the power stripes it stands in for are (drawBanners with no
    // scale) and as the HUD is laid out around: scaled with the menu screens' banners, on a phone it sat above them
    var done = Math.max(0, Math.min(1, (scoreLimitReached ? scoreLimit : score) / scoreLimit));
    ctx.save();
    useWindow(); // the full window width, like the banners it sits in
    ctx.globalAlpha = FX_BAR_TRACK;
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(0, y, w, h);
    if (graceSpan > 0) { // a level opened with a reading: the introduction on level 1, a card elsewhere. frameNo
        // holds while paused, so the fill holds with it, as the card does
        var read = inGrace() ? gameArea.frameNo / graceSpan : 1;
        var hold = inGrace() ? 1 : Math.max(0, 1 - playFrame() / FX_BAR_READ_FADE);
        if (hold > 0) {
            ctx.globalAlpha = FX_BAR_READ * hold;
            ctx.fillRect(0, y, w * read, h);
        }
    }
    ctx.globalAlpha = FX_BAR_ALPHA;
    ctx.fillStyle = "#00FFFF";
    ctx.fillRect(0, y, w * done, h);
    ctx.restore();
}

function drawBreakMeter() { // a Break running: a ring around the square, draining clockwise from the top as the Break
    // runs out, printed twice like everything the game marks, over a faint whole circle so what is left reads as a
    // fraction. It is the touch BREAK button's own drain, brought to the square, where mouse play never had one: the
    // sliding bar it replaces was a filled rectangle in whatever colour the last thing drawn had left set
    if (!invincible) {
        return;
    }
    var cx = gamePiece.x + gamePiece.width / 2, cy = gamePiece.y + gamePiece.height / 2;
    var r = gamePiece.width / 2 + BREAK_RING_GAP;
    var left = Math.max(0, 1 - invincibleTime / invincibleTimeMax);
    ctx.save();
    useWindow();
    ctx.lineWidth = BREAK_RING_W + 2; // a white halo under it, so it shows on a black column as it does on the ground
    ctx.strokeStyle = "white";
    ctx.globalAlpha = BREAK_RING_ALPHA;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = BREAK_RING_W;
    ctx.globalAlpha = BREAK_RING_TRACK;
    ctx.strokeStyle = "#ff00ff";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (left > 0) {
        ctx.globalAlpha = BREAK_RING_ALPHA;
        ctx.strokeStyle = "#00FFFF"; // cyan a pixel up and left, magenta over it, as the title is printed
        ctx.beginPath();
        ctx.arc(cx - 1, cy - 1, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
        ctx.strokeStyle = "#ff00ff";
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
        ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); // leave no path behind: a live arc is what the grid's fill would paint next
}
