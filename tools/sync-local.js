/**
 * collections 변경 감지 → images.json·collections.json 갱신만 (Git/서버 없음)
 * 폴더 이름이 _ 로 시작하면 "맨 위 + 간격" 컬렉션으로 표시됩니다.
 */

const fs = require("fs").promises;
const path = require("path");
const { execSync } = require("child_process");
const { generateSitemap } = require("./generate-sitemap.js");

const { WEB: ROOT, WORK_DIR, WORK_URL } = require("./paths");
const { DISPLAY_DIR, makeDisplayJpeg, removeStaleDisplayFiles } = require("./display-photo");
const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
/** 맨 위에 간격을 두는 컬렉션: 폴더 이름이 이 문자로 시작 */
function isImage(name) {
  return IMAGE_EXT.includes(path.extname(name).toLowerCase());
}

/** 파일명 stem이 background(오타 bsckground 포함)면 페이지 배경용 */
function isBackgroundFile(name) {
  const stem = path.parse(name).name.toLowerCase();
  return stem === "background" || stem === "bsckground";
}

/** bg- 접두사 씬 에셋(기차·랜드 등)은 갤러리에서 제외 */
function isSceneAssetFile(name) {
  const stem = path.parse(name).name.toLowerCase();
  return stem.startsWith("bg-");
}

function isGalleryExcludedFile(name) {
  return isBackgroundFile(name) || isSceneAssetFile(name);
}

/** bsckground.* → background.* 로 통일 (확장자 유지) */
async function normalizeBackgroundFilename(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const bgLike = entries.filter(
      (e) => e.isFile() && isImage(e.name) && isBackgroundFile(e.name)
    );
    if (!bgLike.length) return null;
    const canonical = bgLike.find(
      (e) => path.parse(e.name).name.toLowerCase() === "background"
    );
    const typo = bgLike.find(
      (e) => path.parse(e.name).name.toLowerCase() === "bsckground"
    );
    if (typo && !canonical) {
      const ext = path.extname(typo.name);
      const dest = path.join(dir, `background${ext}`);
      await fs.rename(path.join(dir, typo.name), dest);
      return `background${ext}`;
    }
    return canonical ? canonical.name : bgLike[0].name;
  } catch {
    return null;
  }
}

async function getCollectionDirs() {
  const dir = WORK_DIR;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function getCollectionDirsByCreationOrder() {
  const dir = WORK_DIR;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    const withBirth = await Promise.all(
      dirs.map(async (e) => {
        const stat = await fs.stat(path.join(dir, e.name));
        const t = Number(stat.birthtimeMs) || 0;
        return { id: e.name, birthtime: t };
      })
    );
    withBirth.sort((a, b) => b.birthtime - a.birthtime);
    return withBirth;
  } catch {
    return [];
  }
}

async function getCollectionImageList(collectionId) {
  const dir = path.join(WORK_DIR, collectionId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return sortPhotoNames(
      entries
        .filter((e) => e.isFile() && e.name !== "images.json" && isImage(e.name) && !isGalleryExcludedFile(e.name))
        .map((e) => e.name)
    );
  } catch {
    return [];
  }
}

async function getCollectionJsonList(collectionId) {
  const file = path.join(WORK_DIR, collectionId, "images.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data.images || []);
    return sortPhotoNames(
      (list || [])
        .filter((item) => item && item.src)
        .map((item) => path.basename(item.src))
    );
  } catch {
    return null;
  }
}

/** images.json 안의 src가 모두 현재 폴더명(id)과 일치하는지 검사. 이름 변경 시 false */
async function imagesJsonPathsMatchId(collectionId) {
  const file = path.join(WORK_DIR, collectionId, "images.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : (data.images || []);
    const srcList = (list || []).filter((item) => item && item.src).map((item) => item.src);
    if (srcList.length === 0) return true;
    const prefix = `${WORK_URL}/${collectionId}/`;
    return srcList.every((src) => src.startsWith(prefix));
  } catch {
    return false;
  }
}

function leadingPhotoNumber(name) {
  const stem = path.parse(String(name || "").trim()).name;
  const match = stem.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function photoCaption(filename) {
  const stem = path.parse(String(filename || "").trim()).name;
  const match = stem.match(/^\d+_(.*)$/);
  return match ? match[1].trim() : "";
}

function sortPhotoNames(names) {
  return [...names].sort((a, b) => {
    const an = leadingPhotoNumber(a);
    const bn = leadingPhotoNumber(b);
    if (an !== bn) return an - bn;
    return a.trim().localeCompare(b.trim(), "en", { numeric: true });
  });
}

function isHtmlFile(name) {
  const ext = path.extname(name).toLowerCase();
  return ext === ".html" || ext === ".htm";
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function loadCollectionsJson() {
  const file = path.join(ROOT, "collections.json");
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveCollectionsJson(list) {
  const file = path.join(ROOT, "collections.json");
  await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
}

function run(cmd, cwd = ROOT) {
  execSync(cmd, { cwd, stdio: "inherit", shell: true });
}

/** 컬렉션 폴더의 사진 목록을 읽어 images.json 생성/갱신 (프로세스 분리 없이 직접 실행) */
async function generateCollectionImagesJson(collectionId) {
  const dir = path.join(WORK_DIR, collectionId);
  const outFile = path.join(dir, "images.json");
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {}
  const backgroundFile = await normalizeBackgroundFilename(dir);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = sortPhotoNames(
    entries
      .filter((e) => e.isFile() && e.name !== "images.json" && isImage(e.name) && !isGalleryExcludedFile(e.name))
      .map((e) => e.name)
  );
  const images = [];
  let optimized = 0;
  for (const file of files) {
    const item = await galleryItem(dir, WORK_URL, collectionId, file);
    if (item.optimized) optimized += 1;
    images.push(item.entry);
  }
  await removeStaleDisplayFiles(
    path.join(dir, DISPLAY_DIR),
    images.map((item) => path.basename(item.src))
  );
  const data = {
    background: backgroundFile
      ? `${WORK_URL}/${collectionId}/${backgroundFile}`
      : null,
    images,
  };
  await fs.writeFile(outFile, JSON.stringify(data, null, 2), "utf8");
  return { count: images.length, background: backgroundFile, optimized };
}

async function galleryItem(dir, urlPrefix, collectionId, file) {
  const stem = path.parse(file).name;
  const alt = photoCaption(file) || stem;
  if (isHtmlFile(file)) {
    return {
      optimized: false,
      entry: {
        src: `${urlPrefix}/${collectionId}/${file}`,
        alt,
        type: "html",
      },
    };
  }
  try {
    const displayName = await makeDisplayJpeg(path.join(dir, file), path.join(dir, DISPLAY_DIR));
    if (displayName) {
      return {
        optimized: true,
        entry: {
          src: `${urlPrefix}/${collectionId}/${DISPLAY_DIR}/${displayName}`,
          alt,
        },
      };
    }
  } catch (err) {
    console.error(`⚠️ 화면용 사진 실패 "${file}":`, err.message);
  }
  return {
    optimized: false,
    entry: {
      src: `${urlPrefix}/${collectionId}/${file}`,
      alt,
    },
  };
}

async function runSync() {
  process.chdir(ROOT);
  console.log("📷 collections 동기화\n");
  console.log("   작업 폴더:", ROOT, "\n");

  let changed = false;

  const collectionDirs = await getCollectionDirs();
  const collectionDirsByCreation = await getCollectionDirsByCreationOrder();
  let collections = await loadCollectionsJson();
  const byId = new Map(collections.map((c) => [c.id, c]));

  const kept = collections.filter((c) => collectionDirs.includes(c.id));
  if (kept.length !== collections.length) {
    collections = kept;
    byId.clear();
    collections.forEach((c) => byId.set(c.id, c));
    changed = true;
    console.log("📁 삭제된 컬렉션 폴더 반영 (collections.json 정리)");
  }

  const newIds = new Set();
  for (const id of collectionDirs) {
    if (byId.has(id)) continue;
    newIds.add(id);
    byId.set(id, {
      id,
      name: id,
      path: `collection.html?collection=${encodeURIComponent(id)}`,
      photoOrder: "asc",
    });
    changed = true;
    console.log(`📁 새 컬렉션 추가: ${id}`);
  }

  // 폴더 생성 시각(birthtime)이 최근인 컬렉션이 위. 수정 시각은 순서를 바꾸지 않는다.
  const ordered = collectionDirsByCreation
    .filter((entry) => byId.has(entry.id))
    .map((entry) => {
      const c = byId.get(entry.id);
      return {
        ...c,
        createdAt: entry.birthtime,
        path: `collection.html?collection=${encodeURIComponent(c.id)}`,
        photoOrder: "asc",
      };
    });
  await saveCollectionsJson(ordered);

  // 모든 컬렉션의 images.json을 매번 재생성 (사진 추가/삭제/변경 반영)
  for (const id of collectionDirs) {
    try {
      const entry = byId.get(id);
      const { count, background, optimized } = await generateCollectionImagesJson(id);
      const bgNote = background ? `, 배경 ${background}` : "";
      console.log(`🖼 컬렉션 "${id}" → images.json 갱신 (${count}개 이미지, 화면용 ${optimized}개${bgNote})`);
      changed = true;
    } catch (err) {
      console.error(`❌ 컬렉션 "${id}" images.json 생성 실패:`, err.message);
    }
  }

  if (!changed) {
    console.log("\n✅ 적용할 변경 없음 (컬렉션 폴더 없음).");
  } else {
    console.log("\n✅ 모든 컬렉션 갱신 완료.");
  }

  changed = (await syncExtraLibrary("C.V", "cv")) || changed;
  changed = (await syncExtraLibrary("Text", "text")) || changed;
  changed = (await syncContact()) || changed;

  await generateSitemap({ bumpLastmod: changed });

  return changed;
}

async function syncExtraLibrary(folderName, section) {
  const dir = path.join(ROOT, "..", "menu", folderName);
  const urlPrefix = `menu/${folderName}`;
  const catalogFile = path.join(ROOT, section + ".json");
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const births = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "images.json") continue;
    const stat = await fs.stat(path.join(dir, entry.name));
    births.push({
      id: entry.name,
      isDir: entry.isDirectory(),
      birthtime: Number(stat.birthtimeMs) || 0,
    });
  }
  births.sort((a, b) => b.birthtime - a.birthtime || a.id.localeCompare(b.id, "ko"));

  let previous = [];
  try {
    previous = JSON.parse(await fs.readFile(catalogFile, "utf8"));
  } catch {
    previous = [];
  }
  const previousList = Array.isArray(previous) ? previous : [];
  if (section === "cv") {
    const previousIds = previousList.map((item) => item && item.id).filter(Boolean);
    const seen = new Set(previousIds);
    const ordered = [];
    previousIds.forEach((id) => {
      const entry = births.find((item) => item.id === id);
      if (entry) ordered.push(entry);
    });
    births.forEach((entry) => {
      if (!seen.has(entry.id)) ordered.push(entry);
    });
    births.splice(0, births.length, ...ordered);
  }
  const byId = new Map(previousList.map((item) => [item.id, item]));
  const list = [];
  for (const entry of births) {
    const known = byId.get(entry.id);
    if (section === "text" && !entry.isDir) continue;
    if (section === "cv" && !entry.isDir) continue;
    if (!entry.isDir) {
      list.push({
        id: entry.id,
        name: entry.id,
        type: "file",
        src: `${urlPrefix}/${encodeURIComponent(entry.id)}`,
        path: `${urlPrefix}/${encodeURIComponent(entry.id)}`,
        createdAt: entry.birthtime,
      });
      console.log(`📄 ${folderName} / "${entry.id}" 파일`);
      continue;
    }
    const images = await writeLibraryImages(dir, urlPrefix, entry.id, {
      includeHtml: section === "text",
      includeGroups: section === "cv",
    });
    list.push({
      id: entry.id,
      name: known && known.name ? known.name : entry.id,
      type: "folder",
      path: `collection.html?section=${section}&collection=${encodeURIComponent(entry.id)}`,
      photoOrder: "asc",
      createdAt: entry.birthtime,
    });
    const groupNote = images.groups ? `, 하위폴더 ${images.groups}개` : "";
    console.log(`🖼 ${folderName} / "${entry.id}" → images.json 갱신 (${images.count}개, 화면용 ${images.optimized}개${groupNote})`);
  }
  await fs.writeFile(catalogFile, JSON.stringify(list, null, 2), "utf8");
  return true;
}

async function writeLibraryImages(dir, urlPrefix, collectionId, options) {
  const includeHtml = !!(options && options.includeHtml);
  const folder = path.join(dir, collectionId);
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const files = sortPhotoNames(
    entries
      .filter((entry) => {
        if (!entry.isFile() || entry.name === "images.json" || entry.name.startsWith(".")) return false;
        if (isGalleryExcludedFile(entry.name)) return false;
        if (isImage(entry.name)) return true;
        return includeHtml && isHtmlFile(entry.name);
      })
      .map((entry) => entry.name)
  );
  const images = [];
  let optimized = 0;
  for (const file of files) {
    const item = await galleryItem(folder, urlPrefix, collectionId, file);
    if (item.optimized) optimized += 1;
    images.push(item.entry);
  }
  await removeStaleDisplayFiles(
    path.join(folder, DISPLAY_DIR),
    images.filter((item) => item.src.includes(`/${DISPLAY_DIR}/`)).map((item) => path.basename(item.src))
  );
  const groups = [];
  if (options && options.includeGroups) {
    const subdirs = sortPhotoNames(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== DISPLAY_DIR
        )
        .map((entry) => entry.name)
    );
    for (const name of subdirs) {
      const sub = await writeLibraryImages(folder, `${urlPrefix}/${collectionId}`, name, {
        includeHtml,
      });
      groups.push({ title: name, images: sub.images });
    }
  }
  const data = { background: null, images };
  if (groups.length) data.groups = groups;
  await fs.writeFile(path.join(folder, "images.json"), JSON.stringify(data, null, 2), "utf8");
  return { count: images.length, optimized, images, groups: groups.length };
}

async function syncContact() {
  const dir = path.join(ROOT, "..", "menu", "Contact");
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const names = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && path.extname(entry.name).toLowerCase() === ".html")
    .map((entry) => entry.name);
  const withBirth = await Promise.all(
    names.map(async (name) => {
      const stat = await fs.stat(path.join(dir, name));
      return { name, birthtime: Number(stat.birthtimeMs) || 0 };
    })
  );
  withBirth.sort((a, b) => b.birthtime - a.birthtime || a.name.localeCompare(b.name, "ko"));
  const files = withBirth.map((item) => "menu/Contact/" + encodeURIComponent(item.name));
  await fs.writeFile(path.join(ROOT, "contact.json"), JSON.stringify({ files }, null, 2), "utf8");
  console.log(`✉️  Contact HTML ${files.length}개`);
  return true;
}

module.exports = { runSync, syncExtraLibrary, syncContact };
