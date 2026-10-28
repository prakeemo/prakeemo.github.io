/**
 * collections.json과 루트 HTML을 기준으로 sitemap.xml / robots.txt를 만들고,
 * index.html noscript 컬렉션 링크를 동기화합니다.
 * 동기화(runSync)와 GitHub Pages 배포에서 자동 실행됩니다.
 */

const fs = require("fs").promises;
const path = require("path");

const { PROJECT, WEB: ROOT } = require("./paths");
const DEFAULT_SITE_URL = "";
const SKIP_HTML = new Set(["index.html", "collection.html", "wall.html"]);

function displayName(id) {
  return id && String(id).startsWith("_") ? String(id).slice(1) : String(id || "");
}

async function siteUrl() {
  try {
    const raw = await fs.readFile(
      path.join(PROJECT, ".photo-site-manager", "layout.json"),
      "utf8"
    );
    const layout = JSON.parse(raw);
    const url = layout && layout.preview && layout.preview.mainPageUrl;
    if (url) return String(url).replace(/\/+$/, "");
  } catch {
    // layout.json이 없으면 기본 도메인 사용
  }
  return DEFAULT_SITE_URL;
}

async function readCollectionFile(name) {
  try {
    const list = JSON.parse(await fs.readFile(path.join(ROOT, name), "utf8"));
    if (!Array.isArray(list)) return [];
    return list.filter((c) => c && c.id);
  } catch {
    return [];
  }
}

async function publicCollections() {
  const groups = await Promise.all([
    readCollectionFile("collections.json"),
    readCollectionFile("cv.json"),
  ]);
  return groups.flat();
}

async function extraHtmlPages(origin) {
  const entries = await fs.readdir(ROOT, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.toLowerCase().endsWith(".html") &&
        !SKIP_HTML.has(e.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      loc: origin + "/" + encodeURI(e.name),
      priority: "0.6",
    }));
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function locList(xml) {
  return [...String(xml).matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
}

function sameLocs(a, b) {
  if (a.length !== b.length) return false;
  return a.every((loc, i) => loc === b[i]);
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function buildSitemapXml(urls, lastmod) {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

async function writeSitemap(origin, collections, lastmod, bumpLastmod) {
  const extra = await extraHtmlPages(origin);
  const urls = [
    { loc: origin + "/", priority: "1.0" },
    ...collections.map((c) => ({
      loc: origin + "/" + (c.path || "collection.html?collection=" + encodeURIComponent(c.id)),
      priority: "0.8",
    })),
    ...extra,
  ];
  const xml = buildSitemapXml(urls, lastmod);
  const filePath = path.join(ROOT, "sitemap.xml");
  const prev = await readIfExists(filePath);
  const urlsChanged = !sameLocs(locList(prev), urls.map((u) => u.loc));
  if (!urlsChanged && !bumpLastmod && prev) return urls.length;
  await fs.writeFile(filePath, xml, "utf8");
  return urls.length;
}

async function writeRobots(origin) {
  const text = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
  const filePath = path.join(ROOT, "robots.txt");
  const prev = await readIfExists(filePath);
  if (prev === text) return;
  await fs.writeFile(filePath, text, "utf8");
}

async function updateIndexNoscript(collections) {
  const indexPath = path.join(ROOT, "index.html");
  let html = await fs.readFile(indexPath, "utf8");
  const start = "<!-- SEO_COLLECTION_LINKS -->";
  const end = "<!-- /SEO_COLLECTION_LINKS -->";
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end);
  if (startAt === -1 || endAt === -1 || endAt < startAt) return;

  const links = collections
    .map((c) => {
      const href = c.path || "collection.html?collection=" + encodeURIComponent(c.id);
      const name = displayName(c.id);
      return `        <a href="${href}">${xmlEscape(name)}</a>`;
    })
    .join("\n");

  const next =
    html.slice(0, startAt + start.length) +
    "\n" +
    links +
    "\n        " +
    html.slice(endAt);
  if (next === html) return;
  await fs.writeFile(indexPath, next, "utf8");
}

async function generateSitemap(opts = {}) {
  const bumpLastmod = Boolean(opts.bumpLastmod);
  const origin = await siteUrl();
  const collections = await publicCollections();
  await updateIndexNoscript(collections);
  if (!origin) {
    const emptySitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>
`;
    const robots = `User-agent: *
Allow: /
`;
    await fs.writeFile(path.join(ROOT, "sitemap.xml"), emptySitemap, "utf8");
    await fs.writeFile(path.join(ROOT, "robots.txt"), robots, "utf8");
    console.log("🗺 사이트 주소가 없어 sitemap URL은 비워 두었습니다.");
    return;
  }
  const lastmod = new Date().toISOString().slice(0, 10);
  const urlCount = await writeSitemap(origin, collections, lastmod, bumpLastmod);
  await writeRobots(origin);
  console.log(`🗺 sitemap.xml 갱신 (${urlCount}개 URL)`);
}

if (require.main === module) {
  generateSitemap({ bumpLastmod: true }).catch((err) => {
    console.error("❌ sitemap 생성 실패:", err.message);
    process.exit(1);
  });
}

module.exports = { generateSitemap };
