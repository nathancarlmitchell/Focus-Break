// Focus Break -- the album and the sound effects. The eleven tracks, each playing the next; the sound effects at
// their levels; and the one volume and one rate that drive every track at once, with level 9's duck under the siren. FOCUS BREAK.html loads this with a plain <script src> before its own
// script, as globals rather than modules, so the game still opens straight off disk. The lookups here
// run at load, which is why every script tag sits after the audio elements.

// initialize audio
const all_songs = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"].map(function (n) {
    return document.getElementById("audio" + n);
});

function sfx(id, volume) { // look up a sound effect, optionally setting its volume
    var sound = document.getElementById(id);
    if (volume !== undefined) {
        sound.volume = volume;
    }
    return sound;
}
const aud_bomb = sfx("bombSFX", 0.3);
const aud_menuSound = sfx("menusound2", 0.2);
const aud_death = sfx("fx14", 0.15);
const aud_danger = sfx("danger", 0.05);
const aud_powerUp = sfx("fx_powerUp", 0.1);
const aud_pickupCoin = sfx("fx_pickupCoin", 0.1);
const aud_click = sfx("fx_click", 0.1);
const aud_startup = sfx("fx11");
var musicVolume = 0.2;
var MUSIC_DUCK = 0.35; // the album under level 9's siren: down far enough to let it through, not out from under
                       // it. The siren is at 0.3, so ducked the music sits about a quarter of its level

function loadAudio() { // on the first click: start the album, each track playing the next, looping back to the first
    setMusicVolume(musicVolume);
    all_songs.forEach(function (song, i) {
        song.onended = function () { playSound(all_songs[(i + 1) % all_songs.length]); };
    });
    playSound(all_songs[0]);
}

function playSound(audio) { // play, ignoring failures such as blocked autoplay or a missing file
    var playing = audio.play();
    if (playing) { // older browsers (Chrome < 50, Firefox < 53) return nothing
        playing.catch(function () {});
    }
}

var musicRate = 1; // the rate the songs are at, so putting it back to what it already is touches none of them: every
                   // setMode call comes through here, and most of them are putting back a rate that never changed

function setMusicRate(rate) { // playback rate for all songs
    if (rate == musicRate) {
        return;
    }
    musicRate = rate;
    all_songs.forEach(function (song) { song.playbackRate = rate; });
}

function setMusicVolume(volume) { // volume for all songs
    all_songs.forEach(function (song) { song.volume = volume; });
}
