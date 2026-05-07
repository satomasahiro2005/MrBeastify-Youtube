const fs = require("node:fs/promises");
const path = require("node:path");

const NON_REPEAT_WINDOW = 8;

function sortNumericAscending(left, right) {
  return left - right;
}

function parseOverlayIndex(filename) {
  const match = /^(\d+)\.png$/i.exec(filename);
  return match ? Number(match[1]) : null;
}

async function readFlipConfig(imagesDirectory) {
  const configPath = path.join(imagesDirectory, "flip_blacklist.json");

  try {
    const raw = await fs.readFile(configPath, "utf8");
    const data = JSON.parse(raw);

    return {
      useAlternativeImages: Boolean(data.useAlternativeImages),
      flipBlacklist: new Set(
        Array.isArray(data.blacklistedImages)
          ? data.blacklistedImages.map(Number).filter(Number.isInteger)
          : []
      ),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        useAlternativeImages: false,
        flipBlacklist: new Set(),
      };
    }

    throw error;
  }
}

async function readAlternativeImages(imagesDirectory) {
  const textFlippedDirectory = path.join(imagesDirectory, "textFlipped");

  try {
    const entries = await fs.readdir(textFlippedDirectory, { withFileTypes: true });
    const alternativeIndices = entries
      .filter((entry) => entry.isFile())
      .map((entry) => parseOverlayIndex(entry.name))
      .filter((value) => value !== null)
      .sort(sortNumericAscending);

    return new Set(alternativeIndices);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return new Set();
    }

    throw error;
  }
}

async function loadOverlayCatalog(imagesDirectory) {
  const entries = await fs.readdir(imagesDirectory, { withFileTypes: true });
  const overlayIndices = entries
    .filter((entry) => entry.isFile())
    .map((entry) => parseOverlayIndex(entry.name))
    .filter((value) => value !== null)
    .sort(sortNumericAscending);

  if (overlayIndices.length === 0) {
    throw new Error(`No overlay images were found in ${imagesDirectory}.`);
  }

  const [{ useAlternativeImages, flipBlacklist }, alternativeIndices] = await Promise.all([
    readFlipConfig(imagesDirectory),
    readAlternativeImages(imagesDirectory),
  ]);

  return {
    imagesDirectory,
    overlayIndices,
    flipBlacklist,
    useAlternativeImages,
    alternativeIndices,
    recentIndices: [],
  };
}

function rememberSelection(catalog, index) {
  const maxRecentSize = Math.min(
    NON_REPEAT_WINDOW,
    Math.max(0, catalog.overlayIndices.length - 1)
  );

  if (maxRecentSize === 0) {
    catalog.recentIndices.length = 0;
    return;
  }

  catalog.recentIndices.push(index);

  while (catalog.recentIndices.length > maxRecentSize) {
    catalog.recentIndices.shift();
  }
}

function pickOverlayIndex(catalog) {
  const eligibleIndices =
    catalog.recentIndices.length === 0
      ? catalog.overlayIndices
      : catalog.overlayIndices.filter((index) => !catalog.recentIndices.includes(index));

  const pool = eligibleIndices.length > 0 ? eligibleIndices : catalog.overlayIndices;
  const chosenIndex = pool[Math.floor(Math.random() * pool.length)];

  rememberSelection(catalog, chosenIndex);

  return chosenIndex;
}

function resolveOverlaySelection(catalog, flipChance) {
  const index = pickOverlayIndex(catalog);
  let flip = Math.random() < flipChance;
  let relativePath = `${index}.png`;

  if (flip && catalog.flipBlacklist.has(index)) {
    const hasAlternativeImage =
      catalog.useAlternativeImages && catalog.alternativeIndices.has(index);

    if (hasAlternativeImage) {
      relativePath = path.join("textFlipped", `${index}.png`);
      flip = false;
    } else {
      flip = false;
    }
  }

  return {
    index,
    flip,
    overlayPath: path.join(catalog.imagesDirectory, relativePath),
  };
}

module.exports = {
  loadOverlayCatalog,
  resolveOverlaySelection,
};
