const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const { PROJECT, WEB } = require("./paths");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".rtf": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  // URL 인코딩된 한글 경로 디코딩
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch (e) {
    // 디코딩 실패 시 원본 사용
  }
  // URL 경로를 파일 시스템 경로로 변환 (슬래시 유지)
  const safePath = urlPath.replace(/^\/+/, "").replace(/^(\.\.[/\\])+/, "");
  const parts = safePath.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }
  // menu는 프로젝트 루트에 있고, 나머지 페이지는 web에서 제공한다.
  const base = parts[0] === "menu" ? PROJECT : WEB;
  const filePath = path.join(base, ...parts);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

module.exports = server;
