import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "dist");
const PORT = process.env.PORT || 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function tryFile(filePath) {
  try {
    const s = await stat(filePath);
    if (s.isFile()) return filePath;
  } catch {}
  return null;
}

async function serve(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  const host = (req.headers.host || "").split(":")[0];

  // download.splitapp.fr → always serve download.html
  if (host === "download.splitapp.fr") {
    // still serve static assets (images, css, js, manifest, sw)
    const asset = await tryFile(join(DIST, pathname));
    if (asset && pathname !== "/") return sendFile(res, asset);
    return sendFile(res, join(DIST, "download.html"));
  }

  // Try exact file
  let file = await tryFile(join(DIST, pathname));
  if (file) return sendFile(res, file);

  // Try with .html
  file = await tryFile(join(DIST, pathname + ".html"));
  if (file) return sendFile(res, file);

  // Try index.html in dir
  file = await tryFile(join(DIST, pathname, "index.html"));
  if (file) return sendFile(res, file);

  // SPA fallback → index.html
  return sendFile(res, join(DIST, "index.html"));
}

async function sendFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

createServer(serve).listen(PORT, () => {
  console.log(`Static server on port ${PORT}`);
});
