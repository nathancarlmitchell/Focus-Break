// A static server for the repo folder, started by the Claude browser pane through .claude/launch.json so the page can
// be checked served rather than as a snapshot of one file: served, it fetches its sibling scripts and the music by
// relative path, storage works, and a reload is a reload. Local only, reads only, and the pane stops it.
//   /            the game
//   /<path>      any file in the folder, including CLASSIC EDITION/ and music/
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 8123;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json",
    ".css": "text/css; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer(function (req, res) {
    let rel = decodeURIComponent(req.url.split("?")[0]);
    if (rel === "/") { rel = "/FOCUS BREAK.html"; }
    const file = path.resolve(root, "." + rel);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end("outside the folder"); return; }
    fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found: " + rel); return; }
        res.writeHead(200, { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store" }); // so an edit is what the next reload gets
        res.end(data);
    });
}).listen(port, "127.0.0.1", function () { console.log("Focus Break served from " + root + " at http://localhost:" + port + "/"); });
