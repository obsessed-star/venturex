const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "dist");
const port = Number(process.env.VENTUREX_PORT || 4317);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const server = http.createServer((req, res) => {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    return res.end("Geçersiz adres");
  }
  const file = path.resolve(root, "." + (url === "/" ? "/index.html" : url));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end("Dosya bulunamadı");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
});
server.listen(port, "127.0.0.1", () =>
  console.log("VentureX hazır: http://127.0.0.1:" + port),
);
