// Focus Break -- the run. The four difficulties and the lives and power rations they set, and the records: the
// best run and what it cost, a best split per level, and the furthest level reached, kept per difficulty in
// localStorage and read defensively. And the m:ss the finish and the start screen print. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk.

// The four difficulties, picked on the start screen because they define a run rather than configure one. Two levers
// between them: lives, which make a death keep the level's score instead of wiping it, and a per-level ration of power
// activations. Normal is the game as it always was, and is what a save with nothing in it opens on.
const DIFFICULTIES = [
    { name: "easy", label: "EASY 簡単", lives: 3, powers: null }, // powers: null is no ration at all
    { name: "normal", label: "NORMAL 普通", lives: 0, powers: null },
    { name: "hard", label: "HARD 難しい", lives: 0, powers: 3 },
    { name: "true", label: "TRUE 真", lives: 0, powers: 0 },
];
var difficulty = "normal";
var runLives = 0; // lives left this run, and power activations left this level
var runPowers = null;
var lifeSpent = false; // the death being shown was paid for with a life

function mode() { // the difficulty in force
    for (var i = 0; i < DIFFICULTIES.length; i++) {
        if (DIFFICULTIES[i].name == difficulty) {
            return DIFFICULTIES[i];
        }
    }
    return DIFFICULTIES[1]; // normal, if a stored name ever gets past the check that should have caught it
}

function startRunRations() { // a run begins: the lives are its own, the powers are the first level's
    runLives = mode().lives;
    startLevelRations();
}

function startLevelRations() { // and every level after that gets its powers back
    runPowers = mode().powers;
}

function powerRunning() { // which power the game is in the middle of, so holding one isn't charged for twice
    return speed == speed_slow ? "focus" : speed == speed_fast ? "warp" : "";
}

function powerAllowed(name) { // hard and true ration activations: holding one is free, starting one is not
    if (runPowers === null || name == powerRunning()) {
        return true;
    }
    if (runPowers <= 0) {
        return false; // out: the button does nothing at all, which is the whole of TRUE mode
    }
    runPowers--;
    return true;
}

function runStatusText() { // what this difficulty is rationing, for the HUD, or "" when it is rationing nothing
    var d = mode();
    if (d.lives > 0) {
        return "LIVES " + runLives;
    }
    if (d.powers === 0) {
        return "NO POWERS";
    }
    if (d.powers !== null) {
        return "POWERS " + runPowers;
    }
    return "";
}

// Records. The game timed a run to the second, printed it on the finish screen and then threw it away: nothing about
// a run survived it, so a flawless fifteen levels and a scrappy one left the same trace, which was none. Kept as one
// JSON blob beside the settings and read the same defensive way -- a private window throws rather than returning null,
// and a half-written or hand-edited value must not be what stops the game starting.
var RECORDS_STORE = "focusbreak.records";
var RUN_LEVELS = 15; // levels in a full run; level 16 is the finish screen, not a level

var records = { modes: {} }; // a set per difficulty: a best on EASY is not a best on TRUE, and mixing them
                             // would let the easiest mode set a time the hardest could never beat

function rec() { // the record set for the difficulty now selected
    if (!records.modes[difficulty]) {
        records.modes[difficulty] = {
            run: null, // fastest completed run, in ms
            runDeaths: 0, // and what it cost
            level: {}, // fastest clear of each level, in ms: the split
            reached: 0, // furthest level started, so a run that never finishes still leaves a mark
        };
    }
    return records.modes[difficulty];
}
var levelStart = 0; // when the level being played began (ms), moved forward by time spent paused, as startTime is
var levelBeat = 0; // how long the level just cleared took, and whether that is the best it has been
var levelRecord = false;

var RECORD_MAX_MS = 86400000; // a day: past this a stored time is not a run, and printing it would look broken

function storedTime(v) { // a stored number we are willing to believe
    return typeof v == "number" && isFinite(v) && v > 0 && v <= RECORD_MAX_MS ? v : null;
}

function loadRecords() { // whatever previous runs left, if the browser will tell us
    try {
        var got = JSON.parse(window.localStorage.getItem(RECORDS_STORE));
        if (!got || typeof got != "object" || !got.modes || typeof got.modes != "object") {
            return;
        }
        records.modes = {}; // what was stored replaces what is held, rather than merging into it
        for (var i = 0; i < DIFFICULTIES.length; i++) {
            var name = DIFFICULTIES[i].name;
            var from = got.modes[name];
            if (!from || typeof from != "object") {
                continue; // a mode never played, or something that isn't a record set
            }
            var to = { run: storedTime(from.run), runDeaths: storedTime(from.runDeaths) || 0,
                reached: Math.min(RUN_LEVELS, storedTime(from.reached) || 0), level: {} };
            if (from.level && typeof from.level == "object") {
                for (var n = 1; n <= RUN_LEVELS; n++) {
                    var split = storedTime(from.level[n]);
                    if (split) {
                        to.level[n] = split;
                    }
                }
            }
            records.modes[name] = to;
        }
    } catch (e) { // blocked storage, a private window, or something that isn't JSON: play without them
    }
}

function saveRecords() {
    try {
        window.localStorage.setItem(RECORDS_STORE, JSON.stringify(records));
    } catch (e) { // nothing to do: the records still hold for this session
    }
}

function reachedLevel(n) { // a level began: the furthest one reached is a record of its own for a run that never ends
    if (n > rec().reached && n <= RUN_LEVELS) {
        rec().reached = n;
        saveRecords();
    }
}

function recordLevel(n) { // a level was cleared: its split, and whether that is the fastest it has been flown
    levelBeat = Date.now() - levelStart;
    levelRecord = !rec().level[n] || levelBeat < rec().level[n];
    if (levelRecord) {
        rec().level[n] = levelBeat;
        saveRecords();
    }
}

function recordRun(ms, cost) { // all fifteen cleared: the run's time, against the best there has been
    var beat = !rec().run || ms < rec().run;
    if (beat) {
        rec().run = ms;
        rec().runDeaths = cost;
        saveRecords();
    }
    return beat;
}

function splitText(ms) { // a level takes seconds, not minutes: m:ss would round away the difference between two runs
    return (ms / 1000).toFixed(1) + "s";
}

function mistakes(n) {
    return n + (n == 1 ? " mistake" : " mistakes");
}

function recordsLine() { // what the start screen has to say about how this has gone before, or "" the first time
    if (rec().run) {
        return "BEST " + millisToMinutesAndSeconds(rec().run) + "   " + mistakes(rec().runDeaths);
    }
    if (rec().reached > 1) {
        return "FURTHEST   Level " + rec().reached;
    }
    return "";
}

function millisToMinutesAndSeconds(millis) { // m:ss, to the nearest second. Rounded to whole seconds first and split
    // after: rounding the seconds on their own turned the last half second of every minute into ":60"
    var total = Math.round(millis / 1000);
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
}
