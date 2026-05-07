const sharp = require("sharp");

function normalizeRequestedFormat(requestedFormat) {
  if (!requestedFormat) {
    return null;
  }

  const format = String(requestedFormat).trim().toLowerCase();

  if (format === "jpg") {
    return "jpeg";
  }

  if (format === "jpeg" || format === "png" || format === "webp") {
    return format;
  }

  return null;
}

function inferOutputFormat(requestedFormat, sourceMetadata, sourceContentType) {
  const normalizedRequestedFormat = normalizeRequestedFormat(requestedFormat);

  if (normalizedRequestedFormat) {
    return normalizedRequestedFormat;
  }

  if (sourceMetadata && sourceMetadata.format) {
    const normalizedSourceFormat = normalizeRequestedFormat(sourceMetadata.format);

    if (normalizedSourceFormat) {
      return normalizedSourceFormat;
    }
  }

  if (typeof sourceContentType === "string") {
    const normalizedContentType = sourceContentType.toLowerCase();

    if (normalizedContentType.includes("png")) {
      return "png";
    }

    if (normalizedContentType.includes("webp")) {
      return "webp";
    }
  }

  return "jpeg";
}

function getContentTypeForFormat(format) {
  switch (format) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function applyOutputFormat(pipeline, format) {
  switch (format) {
    case "png":
      return pipeline.png();
    case "webp":
      return pipeline.webp({ quality: 90 });
    default:
      return pipeline.jpeg({ quality: 90, mozjpeg: true });
  }
}

async function encodeSourceImage({ sourceBuffer, requestedFormat, sourceContentType }) {
  const sourceMetadata = await sharp(sourceBuffer).metadata();
  const format = inferOutputFormat(requestedFormat, sourceMetadata, sourceContentType);
  const encodedBuffer = await applyOutputFormat(sharp(sourceBuffer), format).toBuffer();

  return {
    buffer: encodedBuffer,
    contentType: getContentTypeForFormat(format),
  };
}

async function renderThumbnailWithOverlay({
  sourceBuffer,
  sourceContentType,
  requestedFormat,
  overlayPath,
  flip,
}) {
  const sourceMetadata = await sharp(sourceBuffer).metadata();

  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error("The source thumbnail dimensions could not be determined.");
  }

  let overlayImage = sharp(overlayPath).resize(sourceMetadata.width, sourceMetadata.height, {
    fit: "fill",
  });

  if (flip) {
    overlayImage = overlayImage.flop();
  }

  const overlayBuffer = await overlayImage.png().toBuffer();
  const format = inferOutputFormat(requestedFormat, sourceMetadata, sourceContentType);
  const outputBuffer = await applyOutputFormat(
    sharp(sourceBuffer).composite([{ input: overlayBuffer, left: 0, top: 0 }]),
    format
  ).toBuffer();

  return {
    buffer: outputBuffer,
    contentType: getContentTypeForFormat(format),
  };
}

module.exports = {
  encodeSourceImage,
  normalizeRequestedFormat,
  renderThumbnailWithOverlay,
};
