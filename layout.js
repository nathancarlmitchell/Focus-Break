// Focus Break -- where things go. Screens are laid out for a LAYOUT_W x LAYOUT_H frame and fitted to the window:
// the whole frame for the start screen, and for the rest the band each one actually fills, so a phone stops showing
// them at half the size it has room for. The HUD's own shrink, the banners, a copy of the canvas, and the resize. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

// Screens (start, level transitions, finish, pause) are laid out for a LAYOUT_W x LAYOUT_H window and scaled to fit
// the actual window, centered, so they never run off screen. Gameplay stays in window pixels. Only the start screen
// fills the whole frame; the rest are fitted to the band they actually use instead -- see fitBand and useBand below.
var LAYOUT_W = 1280;
var LAYOUT_H = 800;

function layoutFrame() { // scale and offset that fit the LAYOUT_W x LAYOUT_H layout into the window, centered
    var scale = Math.min(gameArea.canvas.width / LAYOUT_W, gameArea.canvas.height / LAYOUT_H);
    return { scale: scale, x: (gameArea.canvas.width - LAYOUT_W * scale) / 2, y: (gameArea.canvas.height - LAYOUT_H * scale) / 2 };
}

function useLayout() { // draw in layout coordinates until useWindow()
    var f = layoutFrame();
    ctx.setTransform(f.scale, 0, 0, f.scale, f.x, f.y);
}

function useWindow() { // draw in window pixels (gameplay, banners)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Most of the LAYOUT_W x LAYOUT_H frame is empty on every screen but the start screen, so fitting the whole of it into
// a phone shrinks the part that matters -- a 844x390 window was giving the messages 0.487 when they had room for
// nearly full size. A screen that only fills a band says how big that band is and gets that fitted instead. The cap is
// what fitting the whole frame would have given, so a window with room to spare is left exactly as it was.
var SCREEN_MARGIN = 0.075; // of the window kept clear around a band, so it never runs into the edges
var BANNER_REACH = 72; // how far in from each edge the stripes on a laid-out screen come (66), plus a little air:
                       // the fit always fills the room it is given, so a band that just cleared them looked stuck to them

function bandRoom() { // the width and height a band has, once the margins and the banner stripes are kept clear
    return { w: gameArea.canvas.width * (1 - 2 * SCREEN_MARGIN),
        // on a short window the stripes come further in than the margin does, and a band under one is unreadable
        h: gameArea.canvas.height - 2 * Math.max(SCREEN_MARGIN * gameArea.canvas.height, BANNER_REACH * bannerScale()) };
}

function fitBand(w, h) { // the scale a w x h band drawn around the middle of the layout gets on this window
    var room = bandRoom();
    return Math.min(Math.max(1, layoutFrame().scale), room.w / w, room.h / h);
}

function bandFrame(band) { // scale and offset that put a band, centred band.dy below the layout centre, on this window
    var s = fitBand(band.w, band.h);
    return { scale: s, x: (gameArea.canvas.width - LAYOUT_W * s) / 2,
        y: gameArea.canvas.height / 2 - s * (LAYOUT_H / 2 + band.dy) };
}

function useBand(band) { // layout coordinates again, with that band fitted in place of the whole frame
    var f = bandFrame(band);
    ctx.setTransform(f.scale, 0, 0, f.scale, f.x, f.y);
}

// the bands each of them fills, measured rather than guessed: the settings screen and the two pause panels
const OPTIONS_BAND = { w: 600, h: 540, dy: 24 };
const PAUSE_BAND = { w: 440, h: 160, dy: 10 };
const TOUCH_PAUSE_BAND = { w: 560, h: 240, dy: 0 };
const HELP_BAND = { w: 670, h: 500, dy: 34 }; // the larger of its two pages, measured; re-measure if they change
const PAUSE_HELP = { dx: -75, dy: 66, w: 150, h: 40 }; // the touch pause panel's way into the instructions

function pauseHelpAt(px, py) { // is this window point on that button? Only while the panel is actually up
    if (!pause || !alive || inputMode != "touch" || menuUp() || resumeTimer) {
        return false;
    }
    var f = bandFrame(TOUCH_PAUSE_BAND); // the frame the panel was drawn in, so the button is where it looks
    var bx = f.x + f.scale * (LAYOUT_W / 2 + PAUSE_HELP.dx);
    var by = f.y + f.scale * (LAYOUT_H / 2 + PAUSE_HELP.dy);
    return px >= bx && px <= bx + f.scale * PAUSE_HELP.w && py >= by && py <= by + f.scale * PAUSE_HELP.h;
}

function screenFrame() { // the frame the screen that is up was drawn in, so a click lands where its buttons are
    return menuScreen == "options" ? bandFrame(OPTIONS_BAND)
        : menuScreen == "help" ? bandFrame(HELP_BAND) : layoutFrame();
}

function useScreenFrame() { // draw in that same frame, so what is drawn and what is clicked agree
    var f = screenFrame();
    ctx.setTransform(f.scale, 0, 0, f.scale, f.x, f.y);
}

function hudScale() { // the in-game HUD keeps its size unless the window is too short or narrow for it
    // between the top banner (ends at 70px) and the level name (baseline 60px from the bottom) it needs 240px of
    // stats plus 30px of level name, and 600px across for the FOCUS/BREAK/DANGER text
    return Math.max(0.1, Math.min(1, (gameArea.canvas.height - 130) / 270, gameArea.canvas.width / 600));
}

function useHud() { // draw the top-left HUD, shrunk toward the top banner if needed
    var s = hudScale();
    ctx.setTransform(s, 0, 0, s, 0, 70 * (1 - s));
}

function copyCanvas() { // copy of what's on screen, or null if the canvas has no size
    if (gameArea.canvas.width == 0 || gameArea.canvas.height == 0) {
        return null;
    }
    var copy = document.createElement("canvas");
    copy.width = gameArea.canvas.width;
    copy.height = gameArea.canvas.height;
    copy.getContext("2d").drawImage(gameArea.canvas, 0, 0);
    return copy;
}

function windowResize() {
    var wasTall = gameArea.tall;
    var wasRotated = rotated;
    var moved = false; // the square had to be moved back on screen
    var dying = null;
    if (nxt.on && nxt.lore) { // words still arriving: they carry on over the held frame, which is drawn at its old
        nxt.plain = true; // size exactly as restFrame would draw it. The ground, rings and sweep are given up, since
    } else { // they are sized to a window that is gone
        fxNextStop(); // the between-levels animation holds a frame at the old size; restFrame takes over from here
    }
    if (die.on) { // a resize mid-shatter: the held frame is the wrong size now, so cut it short and let the message stand
        dying = die.then;
        fxDieStop();
        restFrame = null;
    }
    // resizing clears the canvas; keep what's shown between levels, e.g. a level transition message.
    // copy it once, before the first resize crops it, and reuse that copy for later resizes
    if (gameStart && !alive && !restFrame && !dying && !nxt.on) { // an animation still running redraws its own
        restFrame = copyCanvas();
    }
    gameArea.load();
    if (dying) { // draw it onto the newly sized canvas, and keep that as the frame later resizes redraw
        dying();
        restFrame = copyCanvas();
    } else if (alive) {
        if (inputMode == "touch") {
            if (wasTall != gameArea.tall || wasRotated != rotated) {
                setPause(true); // the device was turned: give the player a moment
            }
            // keep the square on the new screen (otherwise it would sweep back through obstacles it can't see) and steer from there
            var cx = gamePiece.x + gamePiece.width / 2;
            if (cx > gameArea.canvas.width) { // off the right edge: put it a little inside, not in the column where obstacles come in
                cx = gameArea.canvas.width - gamePiece.width / 2 - 40;
            }
            cx = Math.max(0, cx);
            var cy = Math.max(0, Math.min(gamePiece.y + gamePiece.height / 2, gameArea.canvas.height));
            moved = cx != gamePiece.x + gamePiece.width / 2 || cy != gamePiece.y + gamePiece.height / 2;
            gamePiece.x = cx - gamePiece.width / 2;
            gamePiece.y = cy - gamePiece.height / 2;
            gameArea.x = cx;
            gameArea.y = cy;
        }
        fitObstaclesToWindow();
        grazeDrop(); // the square may have been moved: it didn't fly whatever it is next to now
        if (moved) { // clear anything the square was moved onto: it couldn't be dodged (steering waits for the resume)
            obstacleLists().forEach(function (objects) {
                for (var i = objects.length - 1; i >= 0; i--) {
                    if (gamePiece.crashWith(objects[i])) {
                        objects.splice(i, 1);
                    }
                }
            });
        }
        if (pause) { // nothing redraws while paused, so draw the refitted level and the panel once
            stopResume(); // a resize stops a touch resume countdown: the panel asks for a tap again
            drawLevel();
            drawPauseScreen();
        }
    } else if (restFrame) {
        gameArea.context.drawImage(restFrame, 0, 0);
    }
    if (menuUp() || !gameStart) {
        drawStartScreen(); // which is whichever menu screen is up, if one is
    }
}

function drawBanners(top, thickness, scale) { // matching stripes across the top and bottom of the window, in the current fill style
    var k = scale || 1; // screens pass bannerScale() so the stripes shrink along with their text
    ctx.save();
    useWindow(); // always the full window width, whatever layout is being drawn
    ctx.fillRect(0, top * k, gameArea.canvas.width, thickness * k);
    ctx.fillRect(0, gameArea.canvas.height - (100 - top) * k, gameArea.canvas.width, thickness * k);
    ctx.restore();
}

function bannerScale() { // stripe size on laid-out screens: normal, or smaller when the layout is scaled down
    return Math.min(1, layoutFrame().scale);
}
