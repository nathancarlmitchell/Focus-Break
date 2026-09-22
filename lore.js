// Focus Break -- the words. Every level name and every piece of lore lives here, and nothing else does: the game
// reads these lists and never writes them. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, so these are globals rather than modules: the game is opened straight off disk as often as it is served,
// and a file:// page can load a plain script but not an ES module. Nothing here runs at load beyond building the lists.
//
// A card is an array of strings, one a line, drawn top to bottom in the cards' grey. A list of cards is a sequence of
// beats, played one after another, each typing in and making way for the next. Keep lines short: the longest line
// sets the size of its card, because a narrow window scales the card down to fit it, and a landscape phone shows a
// 43-character line at about seven tenths.

// level names; levels 6 and 10 have [name while no deaths yet, name after a death]; levels past 14 use the fallback
const LEVEL_NAMES = [null,
    "Breath Easy",                                  // 1
    "Clear Your Mind",                              // 2
    "Looking Inward",                               // 3
    "Flow",                                         // 4
    "Reaching",                                     // 5
    ["Seeking Perfection", "Past mistakes"],        // 6: no deaths yet, then after one
    "Looking Outward",                              // 7
    "Memory Advance",                               // 8
    "Self Destruct",                                // 9
    ["Perfection", "Remains"],                      // 10: no deaths yet, then after one
    "Afterlife",                                    // 11
    "Desolation",                                   // 12
    "Rebirth",                                      // 13
    "...",                                          // 14
                                                    // 15 has no entry: LEVEL_NAME_BEYOND, below, names anything past the end of this list
];

const LEVEL_NAME_BEYOND = "How did this happen?"; // the name of any level past the end of LEVEL_NAMES: level 15, today

// PLACEHOLDER TEXT -- this is the list to rewrite. One entry per level, indexed by level number the way LEVEL_NAMES
// above is (index 0 is unused, and so is anything past level 15). An entry is that level's card: one string a line,
// drawn top to bottom. Give a level [] for no card at all. Nothing else needs touching when the words change -- the
// card is measured from whatever is here, so lines can be added, removed or rewritten freely. Keep the lines short:
// the longest one sets the size of the whole card, because a narrow window scales the card down to fit it.
const LEVEL_LORE = [null,
    ["You sit down to practice.", "Nothing is chasing you yet."],                                    // 1
    ["The first thought arrives.", "It is larger than it needs to be."],                             // 2
    ["Smaller thoughts now. More of them.", "None are important.", "All of them are quick."],        // 3
    ["Something red among the rest.", "You notice that you noticed."],                               // 4
    ["You reach for the next thing.", "The next thing reaches back."],                               // 5
    ["No mistakes so far.", "Keeping it that way is its own noise."],                                // 6
    ["The room is louder than the practice.", "You keep your eyes open anyway."],                    // 7
    ["Old moments arrive out of order.", "You have been here before.", "You were faster then."],     // 8
    ["Something is coming.", "You cannot sit through this one.", "The music steps back to make room."], // 9
    ["Halfway is not a destination.", "Keep breathing."],                                            // 10
    ["The practice continues without you.", "You watch it from somewhere else."],                    // 11
    ["Nothing here is looking for you.", "That is the hardest part."],                               // 12
    ["You are put back together wrong.", "It still works."],                                         // 13
    ["There is nothing left to name.", "Only the moving."],                                          // 14
    ["One last thought.", "Let it pass."],                                                           // 15
];

// The introduction, before the first level: beats rather than lines, each an entry shaped like a level's card, played
// one after another in front of level 1's own on every fresh run. The clinic voice: it matches the level names
// (Breath Easy, Clear Your Mind, Looking Inward) and stays calm all the way to Self Destruct, where calm becoming
// wrong is the point. The thesis -- a break from your thoughts sometimes means focusing, and focusing sometimes
// means a break -- arrives in the last beat as an instruction rather than a statement. Every word of it is
// placeholder to rewrite, as LEVEL_LORE is; the other drafts are in log.txt
const INTRO_LORE = [
    ["Welcome.", "Find somewhere you will not be interrupted."],
    ["The exercise is simple.", "Nothing may touch you."],
    ["Thoughts will arrive. That is what they do.", "You are not asked to stop them.", "You are asked to be somewhere they are not."],
    ["If you lose the thread, do not chase it.", "Put it down and pick it up again."],
];

// The level 10 screen: the victory that is lying, since five levels follow it. Its banner line stays where it was,
// and this arrives under it late, in the cards' grey, to undercut it. Beats, as INTRO_LORE is, and placeholder
// like the rest; the other drafts are in log.txt, beside the finish screen's (finishLore, which branches on the run)
const VICTORY_LORE = [
    ["So is everything else."],
];

var FINISH_MANY = 10; // deaths from which the finish counts them out loud

function finishLore(runBest, seenBefore) { // the words under the finish: the arc the first card opened, closing --
    // "Nothing is chasing you yet" with the yet taken off -- and then how this run got here, one beat at a time.
    // Placeholder text, as all the lore is; the drafts it was picked from are in log.txt. It reads the run through
    // globals the game defines before it is ever called: deaths, difficulty, runLives, perfectClear and graze.charges
    var beats = [["Nothing is chasing you."], ["You can stop now.", "If you want to."]];
    if (deaths == 0 && runBest) {
        beats.push(["Nobody has done this better.", "Including you."]);
    } else if (deaths == 0) {
        beats.push(["You never once flinched.", "That should worry you."]);
    } else if (deaths >= FINISH_MANY) {
        beats.push(["You were wrong " + deaths + " times", "and here you are anyway."]);
    } else if (runBest) {
        beats.push(["Faster than you have ever been.", "Faster than you will be again."]);
    } else {
        beats.push(["Slower than the one you remember."]);
    }
    if (difficulty == "true") {
        beats.push(["No powers. No lives. No excuses.", "真"]);
    } else if (difficulty == "easy" && runLives > 0) {
        beats.push(["You did not need all of them."]);
    } else if (perfectClear == 7) {
        beats.push(["You made yourself as small as you could."]);
    } else if (graze.charges > 0) {
        beats.push(["You finished holding something", "you never spent."]);
    }
    if (seenBefore) {
        beats.push(["You have seen this screen before."]);
    }
    return beats;
}
