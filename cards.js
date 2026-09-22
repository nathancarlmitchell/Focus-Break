// Focus Break -- the words on the screen. The level name typing itself into the corner and tearing itself apart, and
// the lore cards: a level's card, or on level 1 the introduction's beats and then its card, typed in one after another
// in the roomiest place the layout leaves. The constants that time them come first; the words are in lore.js. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

var FX_NAME_ON = true; // the level name typing itself in
var FX_NAME_HOLD = 20; // steps before it starts, so it doesn't race the level's opening
var FX_NAME_STEP = 4; // steps a character
var FX_NAME_LINGER = 300; // steps the finished name stays up (3s): long enough to read, then it stops taking up room
var FX_NAME_GLITCH = 45; // steps it takes to come apart (450ms), in the full look
var FX_NAME_FADE = 150; // ...or to fade out over, in the reduced look: a slice glitch is exactly the motion that asks to go
var FX_NAME_BANDS = 7; // horizontal slices the name tears into
var FX_NAME_STUTTER = 3; // steps each jitter is held for, so it stutters instead of shimmering
var FX_NAME_SHOVE = 26; // px a slice can jump sideways once it is fully broken up
var FX_NAME_SPLIT = 5; // px the cyan and magenta copies pull apart by
var FX_LORE_ON = true; // the level's lore card typing itself in. The words themselves are in LEVEL_LORE
var FX_LORE_HOLD = 90; // steps before its first character (0.9s): the level name goes in first and is read first
var FX_LORE_STEP = 2; // steps a character, against the name's 4: there is a lot more of it to get through
var FX_LORE_BREAK = 20; // a line break costs this many characters' worth of pause before the next line starts
var FX_LORE_LINGER = 420; // steps the finished card stays up (4.2s)
var FX_LORE_FADE = 120; // steps it fades out over (1.2s). A card fades in every look rather than tearing the way
// the level name does in the full one: the tear is the name's signature, and this is the quieter voice
var FX_LORE_LINE = 44; // px between baselines
var FX_LORE_FONT = 30; // px of type, against the level name's 40
var FX_LORE_RISE = 24; // px from the top of the card to its first baseline: the ascent of 30px Arial, plus a little
var FX_LORE_PAD = 40; // px of window kept clear at the sides...
var FX_LORE_AIR = 14; // ...and of clearance from everything inside it the card is fitted around
// How far right the HUD reaches across the rows a card sits in, in the HUD's own frame, with the HUD at its very
// widest: a four-digit score, a full graze bank, a two-digit death count, level 15 and hard mode's power ration.
// Measured 93 in mouse play, where the stats are a narrow column, and 385 in touch play, where the same three
// readouts are packed up into exactly those rows. The difference is why the card has two places it can go.
var FX_LORE_HUD = 120, FX_LORE_HUD_TOUCH = 400;
var FX_LORE_HUD_Y = 120; // and the HUD row a card starts below: the score and the graze meter share the row above
// it, and the meter reaches 291 across -- far past either reach above, but only for those forty or so rows
var FX_LORE_INK = "#555555"; // grey: 7.46:1 on white and 6.45:1 on the level 14 tint, and neither of the two colors
// an obstacle can be, so a card never reads as something to dodge
var FX_INTRO_HOLD = 150; // steps before the introduction's first character (1.5s), longer than a card's: the level
                         // name is typing itself into the corner at the same time, and is read first
var FX_INTRO_LINGER = 60; // steps a finished beat stays before it goes (0.6s)...
var FX_INTRO_FADE = 60; // ...and fades out over (0.6s). Together a real pause, so the next beat reads as an answer to
                        // the last rather than a continuation of it: FX_LORE_BREAK's twenty characters is a line
                        // break, not that
var FX_SCREEN_HOLD = 150; // steps before a screen's first lore character (1.5s): the message is read first, and on
                          // the level 10 screen the sentence is meant to arrive late
var FX_SCREEN_LINGER = 140; // steps a finished beat stays before the next replaces it (1.4s): each is a whole thought,
                            // and the finish is in no hurry
var FX_SCREEN_DROP = 80; // layout px from the block's lowest baseline to the slot's first: what showSplit gives its line

function drawLevelName() { // level name in the bottom-left corner (level 13 also draws a red bar, level 14 two black bars)
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    var w = gameArea.canvas.width / 1920; // the bars were placed for a 1920px-wide (fullscreen) window; keep their relative spot
    if (level == 13) {
        ctx.fillStyle = "red";
        ctx.fillRect(900 * w, 0, 100 * w, gameArea.canvas.height);
        ctx.fillStyle = "black";
    } else if (level == 14) {
        ctx.fillRect(900 * w, 0, 100 * w, gameArea.canvas.height);
        ctx.fillRect(1100 * w, 0, 2000 * w, gameArea.canvas.height);
    }
    var name = LEVEL_NAMES[level];
    if (Array.isArray(name)) {
        name = deaths == 0 ? name[0] : name[1];
    }
    name = name || LEVEL_NAME_BEYOND; // levels past the end of the list
    var full = name; // the whole name: the fade is timed from when the last character of it lands, not the shown prefix
    if (FX_NAME_ON && fxLook() != "off") { // the level names itself, a character at a time. Resolved after the fallback
        var shown = Math.floor((gameArea.frameNo - FX_NAME_HOLD) / FX_NAME_STEP); // above, or an empty prefix would be
        if (shown < name.length) { // falsy and show the fallback. frameNo holds while paused, so a redraw holds too
            name = shown <= 0 ? "" : name.slice(0, shown);
        }
    }
    var out = nameOut(full);
    if (out >= 1) {
        useWindow(); // gone. The level 13 and 14 bars above are not part of this: they are the level, not a caption
        return;
    }
    var s = hudScale(); // shrunk with the HUD, baseline kept just above the bottom banner
    ctx.setTransform(s, 0, 0, s, 0, gameArea.canvas.height - 60);
    var nameX = 80, maxWidth;
    if (inputMode == "touch") { // the name shares the bottom of the screen with the power buttons
        var tb = touchButtons();
        if (tb.side == "left") { // they are in its corner: start clear of them and run to the far edge instead
            nameX = (tb.box.right + 12) / s;
            maxWidth = (gameArea.canvas.width - 12) / s - nameX;
        } else {
            maxWidth = (tb.box.left - 12) / s - nameX; // stop short of them
        }
        if (maxWidth <= 0) {
            useWindow(); // no room for it beside the buttons at all
            return;
        }
    }
    if (out > 0 && fxLook() == "full") {
        drawNameGlitch(name, nameX, 0, maxWidth, out);
    } else {
        if (out > 0) { // reduced motion keeps the old smooth fade instead of tearing the name apart
            ctx.globalAlpha = 1 - out * out * (3 - 2 * out);
        }
        nameText(name, nameX, 0, maxWidth);
        ctx.globalAlpha = 1;
    }
    useWindow();
}

function nameText(name, x, y, maxWidth) { // fillText, with the touch layout's width limit only when there is one
    if (maxWidth === undefined) {
        ctx.fillText(name, x, y);
    } else {
        ctx.fillText(name, x, y, maxWidth);
    }
}

function nameOut(full) { // how far the name is through leaving: 0 while it is solid, 1 once it has gone
    if (!FX_NAME_ON || fxLook() == "off") {
        return 0;
    }
    var typed = FX_NAME_HOLD + full.length * FX_NAME_STEP; // when the last character landed
    var span = fxLook() == "full" ? FX_NAME_GLITCH : FX_NAME_FADE;
    var t = (gameArea.frameNo - typed - FX_NAME_LINGER) / span;
    return t <= 0 ? 0 : (t >= 1 ? 1 : t);
}

function drawNameGlitch(name, x, y, maxWidth, out) { // the name tearing itself apart in horizontal slices
    var tick = Math.floor(gameArea.frameNo / FX_NAME_STUTTER); // one jitter held for a few steps: a stutter, not a shimmer
    var top = -34, tall = 46; // the 40px glyphs, measured from the baseline at y = 0
    var right = maxWidth === undefined ? 4000 : maxWidth; // a shoved slice is cut off at the buttons, not drawn over them
    for (var i = 0; i < FX_NAME_BANDS; i++) {
        if (fxHash(tick * 16 + i, 7) < out * out) {
            continue; // slices drop out as it goes, and by the end every one of them has
        }
        var shove = (fxHash(tick * 16 + i, 8) - 0.5) * 2 * FX_NAME_SHOVE * out;
        var split = FX_NAME_SPLIT * out * (0.5 + fxHash(tick * 16 + i, 9));
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 40, top + i * tall / FX_NAME_BANDS, right + 40, tall / FX_NAME_BANDS + 0.5);
        ctx.clip();
        ctx.globalAlpha = 0.8 * out; // the channels pull apart as it breaks up, and are not there at all before it
        ctx.fillStyle = "#00FFFF";
        nameText(name, x + shove - split, y, maxWidth);
        ctx.fillStyle = "#ff00ff";
        nameText(name, x + shove + split, y, maxWidth);
        ctx.globalAlpha = 1 - 0.3 * out;
        ctx.fillStyle = "black"; // the name's own color: this is the text coming apart, not an overlay laid on top of it
        nameText(name, x + shove, y, maxWidth);
        ctx.restore(); // puts back the alpha, the fill color and the clip together
    }
}

// The lore card: the level's lines typing themselves out under the top banner, in the same voice as the level name
// and on the same clock (gameArea.frameNo, which holds while paused, so a paused redraw holds the card too).
// The one thing it does not share with the name is repetition. gameArea.start() zeroes frameNo on every death as
// well as every level, so the name retypes each time the level is retried; the story is told once and then left
// alone. loreShown remembers how far the telling has got, and only a fresh run winds it back.
// A level can show more than one card: level 1 opens with the introduction, INTRO_LORE, as beats in front of its
// own. They play one after another -- each types in, stays a moment, fades, and the next begins as it has gone --
// and the pre-roll runs until the last character of the last of them lands.
var loreShown = 0; // the highest level whose cards have already played this run
var lorePlaying = false; // is the level on screen showing any
var loreCards = []; // the cards it shows, in order: the lines, the widest of them in card pixels (measured once,
                    // when armed, rather than every frame), the step its first character lands on (start), its
                    // last (end) and the one it is gone by (gone), with how long it stays and fades between those
var loreAt = { s: 0, cx: 0, y: 0, w: 0, h: 0, mode: "", side: "", card: -1 }; // where the card is drawn, and what
// that was worked out for: which card, the window size, the input mode and the side the touch cluster is on. Anything
// else about the game can change without moving it, so the fit below is redone when one of those does, not once a frame

function armLore() { // a level is beginning: line up its cards, if this is the first time the run has seen the level
    var fresh = level > loreShown;
    loreShown = Math.max(loreShown, level);
    lorePlaying = false;
    loreCards = [];
    loreAt.w = loreAt.h = 0; // a new card is a new size to fit: the old placing does not carry over
    loreAt.card = -1;
    if (!fresh) {
        return;
    }
    var scripts = [], beats = 0;
    if (level == 1) { // the introduction comes in front of the first level's own card, on every fresh run: a death
        // replays the level without it, as without the card, and a new run tells it again from the top
        beats = INTRO_LORE.length;
        for (var b = 0; b < beats; b++) {
            scripts.push(INTRO_LORE[b]);
        }
    }
    if (LEVEL_LORE[level] && LEVEL_LORE[level].length) {
        scripts.push(LEVEL_LORE[level]);
    }
    if (!scripts.length) {
        return; // nothing to say
    }
    // a beat makes way for the next; the level's own card, last, stays up into play as it always has
    loreCards = loreSchedule(scripts, beats ? FX_INTRO_HOLD : FX_LORE_HOLD, FX_INTRO_LINGER, FX_INTRO_FADE,
        FX_LORE_LINGER, FX_LORE_FADE);
    lorePlaying = true;
}

function loreSchedule(scripts, hold, linger, fade, lastLinger, lastFade) { // cards, one after another, from a list
    // of scripts: each one's width in card pixels (measured here, once, rather than every frame -- a resize changes
    // the scale it is drawn at but never this), the step its first character lands on (start), its last (end) and
    // the one it is gone by (gone), with how long it stays and fades between those. The next begins as one has gone
    ctx.font = FX_LORE_FONT + "px Arial";
    var cards = [], t = hold;
    for (var i = 0; i < scripts.length; i++) {
        var lines = scripts[i], wide = 0;
        for (var k = 0; k < lines.length; k++) {
            wide = Math.max(wide, ctx.measureText(lines[k]).width);
        }
        var last = i == scripts.length - 1;
        var card = { lines: lines, wide: wide, start: t, end: t + loreSpan(lines) * FX_LORE_STEP,
            linger: last ? lastLinger : linger, fade: last ? lastFade : fade };
        card.gone = card.end + card.linger + card.fade;
        cards.push(card);
        t = card.gone;
    }
    return cards;
}

function loreCardAt(cards, t) { // which card is up at step t, or -1 once they have all been and gone. They follow
    // one another, each beginning as the last has gone, so there is never more than one to draw
    for (var i = 0; i < cards.length; i++) {
        if (t < cards[i].gone) {
            return i;
        }
    }
    return -1;
}

function loreReset() { // a fresh run starts the story over
    loreShown = 0;
    lorePlaying = false;
    loreCards = [];
}

function loreSpan(lines) { // the whole card's length in characters, counting the pause at each line break as its own
    var n = 0;
    for (var i = 0; i < lines.length; i++) {
        n += lines[i].length + (i < lines.length - 1 ? FX_LORE_BREAK : 0);
    }
    return n;
}

function loreOut(c, t) { // how far a card is through leaving at step t: 0 while it is up, 1 once it has gone
    var k = (t - c.end - c.linger) / c.fade; // from when its last character landed and it had stayed
    if (!FX_LORE_ON || fxLook() == "off") {
        return k <= 0 ? 0 : 1; // no motion at all in that look: the card is there, and then it is not. It still goes,
    } // unlike the name -- a name is three words in a corner, a card is three lines across the top of the play area
    return k <= 0 ? 0 : (k >= 1 ? 1 : k);
}

function loreTyped(c, t) { // characters of the card placed by step t: none before it starts, and in the look with
    // no motion all of them the moment it does
    if (FX_LORE_ON && fxLook() != "off") {
        return Math.floor((t - c.start) / FX_LORE_STEP);
    }
    return t < c.start ? -1 : Infinity;
}

function loreDrawLines(c, left, out, x, y) { // the card's lines, the first `left` characters of them, centred on x
    // with the first baseline at y, in whatever frame the caller has set, in the cards' grey, fading by `out`
    ctx.textAlign = "center";
    ctx.font = FX_LORE_FONT + "px Arial";
    ctx.fillStyle = FX_LORE_INK;
    ctx.globalAlpha = 1 - out * out * (3 - 2 * out); // the smoothstep the level name's reduced fade uses
    for (var i = 0; i < c.lines.length; i++) {
        if (left <= 0) {
            break; // this line has not started, and nor has anything under it
        }
        ctx.fillText(left >= c.lines[i].length ? c.lines[i] : c.lines[i].slice(0, left), x, y + i * FX_LORE_LINE);
        left -= c.lines[i].length + FX_LORE_BREAK; // the break's pause is spent before the next line starts
    }
}

// Where the card goes. The HUD is a narrow column in mouse play and a wide, short block in touch play (see
// FX_LORE_HUD above), so "beside the stats" is roomy in one layout and useless in the other, and "under the stats"
// is the other way round. Both are worked out. In touch play the power cluster is then carved out of each, once by
// stopping short of its top and once by stopping short of its side, because which of those leaves more depends on
// whether the cluster is a corner (landscape) or a column up the edge (portrait). The card is drawn in whichever
// of the candidates fits it largest, never larger than the HUD's own scale, and a tie goes to the first -- which
// is the higher and more central one. Ties are the normal case on a desktop window, where everything fits.
function loreFit(n) { // for card n of the level's cards
    var W = gameArea.canvas.width, H = gameArea.canvas.height, s0 = hudScale(), touch = inputMode == "touch";
    if (loreAt.card == n && loreAt.w == W && loreAt.h == H && loreAt.mode == inputMode && loreAt.side == TOUCH_SIDE) {
        return loreAt; // nothing that moves it has changed
    }
    var lines = loreCards[n].lines;
    var cardW = loreCards[n].wide, cardH = (lines.length - 1) * FX_LORE_LINE + FX_LORE_FONT;
    // under the banner and its progress stripe, and under the score and graze meter row, whichever is lower
    var top = Math.max(BANNER_REACH * bannerScale(), 70 * (1 - s0) + FX_LORE_HUD_Y * s0) + FX_LORE_AIR;
    var bottom = H - 60 - 34 * s0 - FX_LORE_AIR; // over the level name, which keeps the bottom left corner
    var statsLow = 70 * (1 - s0) + (touch ? TOUCH_STAT_LEVEL : 300) * s0 + FX_LORE_AIR; // under the last stats line
    var right = W - FX_LORE_PAD;
    var boxes = [
        [FX_LORE_PAD + (touch ? FX_LORE_HUD_TOUCH : FX_LORE_HUD) * s0, top, right, bottom], // beside the stats
        [FX_LORE_PAD, statsLow, right, bottom], // under them
    ];
    if (touch) {
        var tb = touchButtons();
        for (var i = 0; i < 2; i++) {
            var c = boxes[i];
            boxes.push([c[0], c[1], c[2], Math.min(c[3], tb.box.top - FX_LORE_AIR)]); // stopping above the cluster
            boxes.push(tb.side == "left" // ...or stopping beside it, running past it on the other hand
                ? [Math.max(c[0], tb.box.right + FX_LORE_AIR), c[1], c[2], c[3]]
                : [c[0], c[1], Math.min(c[2], tb.box.left - FX_LORE_AIR), c[3]]);
        }
        boxes.splice(0, 2); // the uncarved pair would put the card over the buttons
    }
    loreAt.s = 0;
    for (var j = 0; j < boxes.length; j++) {
        var b = boxes[j], bw = b[2] - b[0], bh = b[3] - b[1];
        if (bw <= 0 || bh <= 0 || cardW <= 0) {
            continue; // a window with no room for this candidate at all
        }
        var s = Math.min(s0, bw / cardW, bh / cardH);
        if (s > loreAt.s + 0.001) { // the tie band: a candidate has to be meaningfully bigger to move the card
            loreAt.s = s;
            loreAt.cx = Math.max(b[0] + cardW * s / 2, Math.min(W / 2, b[2] - cardW * s / 2)); // centred, then
            loreAt.y = b[1]; // pushed inside the box if the middle of the window is not in it. Cards sit at the top
        }
    }
    loreAt.w = W; loreAt.h = H; loreAt.mode = inputMode; loreAt.side = TOUCH_SIDE; loreAt.card = n;
    return loreAt;
}

function drawLore() { // the card that is up, one character at a time, in the roomiest place the layout leaves for it
    if (!lorePlaying) {
        return; // a level being replayed after a death, or a level with nothing to say
    }
    var t = gameArea.frameNo, n = loreCardAt(loreCards, t);
    if (n < 0) {
        return; // every card has been and gone
    }
    var c = loreCards[n], out = loreOut(c, t), left = loreTyped(c, t);
    if (out >= 1 || left <= 0) {
        return; // gone, or still holding before the first character
    }
    var at = loreFit(n);
    if (!(at.s > 0)) {
        return; // a window with nowhere to put it: the play area comes first
    }
    ctx.save();
    ctx.setTransform(at.s, 0, 0, at.s, at.cx, at.y); // the card's own frame: centred on cx, top edge at y
    loreDrawLines(c, left, out, 0, FX_LORE_RISE);
    ctx.restore(); // puts back the transform, the alignment, the font, the ink and the alpha together
}
