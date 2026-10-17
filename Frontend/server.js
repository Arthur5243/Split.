import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
};

async function sendFile(res, path, status = 200) {
  try {
    const buf = await readFile(path);
    const ext = extname(path).toLowerCase();
    res.writeHead(status, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}

const server = createServer(async (req, res) => {
  let url = (req.url || "/").split("?")[0].split("#")[0];
  if (url.includes("..")) { res.writeHead(400); return res.end("bad"); }

  // Route /download et /download/* → download.html (page d'install PWA)
  if (url === "/download" || url.startsWith("/download/")) {
    return sendFile(res, join(DIST, "download.html"));
  }

  // Redirect / → /download tant que la PWA n'est pas installée côté client.
  // Le JS d'index.html pose le cookie split_pwa=1 au premier boot standalone.
  // Sans ce cookie, on force la page d'install (sinon Chrome mobile peut ne
  // jamais exécuter le JS redirect de index.html à cause du cache).
  if (url === "/") {
    const cookie = req.headers.cookie || "";
    const isPwa = /(?:^|;\s*)split_pwa=1(?=;|$)/.test(cookie);
    const isRecovery = (req.url || "").includes("#type=recovery") || (req.url || "").includes("&type=recovery");
    if (!isPwa && !isRecovery) {
      res.writeHead(302, { Location: "/download" });
      return res.end();
    }
  }

  // Fichier statique existant (y compris download.html direct)
  const asFile = join(DIST, url === "/" ? "index.html" : url);
  try {
    const s = await stat(asFile);
    if (s.isFile()) return sendFile(res, asFile);
  } catch {}

  // Fallback SPA → index.html
  return sendFile(res, join(DIST, "index.html"));
});

server.listen(PORT, () => console.log(`[frontend] serving ${DIST} on ${PORT}`));
