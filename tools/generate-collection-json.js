const fs = require("fs").promises;
const path = require("path");

const { WORK_DIR, WORK_URL } = require("./paths");
const { DISPLAY_DIR, makeDisplayJpeg, removeStaleDisplayFiles } = require("./display-photo");
// 환경변수로 전달 시 # 등 특수문자가 Windows에서도 안전하게 전달됨
const COLLECTION_NAME = process.env.COLLECTION_ID || process.argv[2];

if (!COLLECTION_NAME) {
  console.error("❌ 사용법: node generate-collection-json.js [컬렉션명] 또는 COLLECTION_ID 환경변수 설정");
  console.error('예: node generate-collection-json.js "통신보안"');
  process.exit(1);
}

const COLLECTION_DIR = path.join(WORK_DIR, COLLECTION_NAME);
const OUTPUT_FILE = path.join(COLLECTION_DIR, "images.json");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];

function isBackgroundFile(name) {
  const stem = path.parse(name).name.toLowerCase();
  return stem === "background" || stem === "bsckground";
}

function isSceneAssetFile(name) {
  const stem = path.parse(name).name.toLowerCase();
  return stem.startsWith("bg-");
}

function isGalleryExcludedFile(name) {
  return isBackgroundFile(name) || isSceneAssetFile(name);
}

async function main() {
  try {
    // 컬렉션 폴더가 없으면 생성
    try {
      await fs.access(COLLECTION_DIR);
    } catch {
      await fs.mkdir(COLLECTION_DIR, { recursive: true });
      console.log(`✅ 컬렉션 폴더 생성: ${COLLECTION_DIR}`);
    }

    const entries = await fs.readdir(COLLECTION_DIR, { withFileTypes: true });

    const files = entries
      .filter((entry) => entry.isFile() && entry.name !== "images.json")
      .map((entry) => entry.name)
      .filter((name) =>
        IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase())
      )
      .filter((name) => !isGalleryExcludedFile(name));
    files.sort((a, b) => a.trim().localeCompare(b.trim(), "en", { numeric: true }));

    const backgroundFile = entries
      .filter((entry) => entry.isFile() && isBackgroundFile(entry.name))
      .map((entry) => entry.name)[0];

    const images = [];
    for (const file of files) {
      const stem = path.parse(file).name;
      const caption = stem.match(/^\d+_(.*)$/);
      const alt = caption && caption[1].trim() ? caption[1].trim() : stem;
      let src = `${WORK_URL}/${COLLECTION_NAME}/${file}`;
      try {
        const displayName = await makeDisplayJpeg(
          path.join(COLLECTION_DIR, file),
          path.join(COLLECTION_DIR, DISPLAY_DIR)
        );
        if (displayName) src = `${WORK_URL}/${COLLECTION_NAME}/${DISPLAY_DIR}/${displayName}`;
      } catch (err) {
        console.error(`⚠️ 화면용 사진 실패 "${file}":`, err.message);
      }
      images.push({ src, alt });
    }
    await removeStaleDisplayFiles(
      path.join(COLLECTION_DIR, DISPLAY_DIR),
      images.map((item) => path.basename(item.src))
    );

    const data = {
      background: backgroundFile
        ? `${WORK_URL}/${COLLECTION_NAME}/${backgroundFile}`
        : null,
      images,
    };

    await fs.writeFile(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

    console.log(
      `✅ ${WORK_URL}/${COLLECTION_NAME}/images.json 생성 완료 (${images.length}개 이미지` +
        (backgroundFile ? `, 배경 ${backgroundFile}` : "") +
        `)\n` +
        ` - 폴더: ${COLLECTION_DIR}\n` +
        ` - 파일: ${OUTPUT_FILE}`
    );
  } catch (error) {
    console.error("❌ images.json 생성 중 오류:", error);
    process.exit(1);
  }
}

main();