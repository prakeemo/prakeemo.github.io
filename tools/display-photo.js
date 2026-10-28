/**
 * 사이트에 보여줄 화면용 JPEG를 만든다.
 * 긴 변은 2400px을 넘기지 않고, 그보다 작은 사진은 픽셀 수를 유지한다.
 */

const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");

const DISPLAY_DIR = "display";
const LONG_EDGE = 2400;
const QUALITY = 82;

async function needsUpdate(srcPath, destPath) {
  try {
    const [srcStat, destStat] = await Promise.all([fs.stat(srcPath), fs.stat(destPath)]);
    return !(destStat.size > 0 && destStat.mtimeMs >= srcStat.mtimeMs);
  } catch {
    return true;
  }
}

async function makeDisplayJpeg(srcPath, displayDir) {
  const ext = path.extname(srcPath).toLowerCase();
  if (ext === ".svg") return null;
  const destName = path.parse(srcPath).name + ".jpg";
  const destPath = path.join(displayDir, destName);
  if (!(await needsUpdate(srcPath, destPath))) return destName;

  const meta = await sharp(srcPath, { animated: true }).metadata();
  if ((meta.pages || 1) > 1) return null;

  await fs.mkdir(displayDir, { recursive: true });
  let image = sharp(srcPath).rotate();
  const long = Math.max(meta.width || 0, meta.height || 0);
  if (long > LONG_EDGE) {
    image = image.resize(
      (meta.width || 0) >= (meta.height || 0)
        ? { width: LONG_EDGE, withoutEnlargement: true }
        : { height: LONG_EDGE, withoutEnlargement: true }
    );
  }
  await image.jpeg({ quality: QUALITY, progressive: true, mozjpeg: true }).toFile(destPath);
  return destName;
}

async function removeStaleDisplayFiles(displayDir, keepNames) {
  let names = [];
  try {
    names = await fs.readdir(displayDir);
  } catch {
    return;
  }
  const keep = new Set(keepNames);
  await Promise.all(
    names
      .filter((name) => !keep.has(name))
      .map((name) => fs.unlink(path.join(displayDir, name)).catch(() => {}))
  );
}

module.exports = {
  DISPLAY_DIR,
  makeDisplayJpeg,
  removeStaleDisplayFiles,
};
