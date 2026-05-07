const path = require("node:path");

const express = require("express");

const { loadOverlayCatalog, resolveOverlaySelection } = require("./overlayCatalog");
const {
  encodeSourceImage,
  normalizeRequestedFormat,
  renderThumbnailWithOverlay,
} = require("./thumbnailService");
const { buildShadowrocketScript } = require("./shadowrocketScript");
const { buildShadowrocketModule } = require("./shadowrocketModule");

const DEFAULT_APPEAR_CHANCE = 1;
const DEFAULT_FLIP_CHANCE = 0.25;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const DEFAULT_PORT = 3000;
const YTIMG_HOST_PATTERN = /(^|\.)ytimg\.com$/i;
const RESERVED_QUERY_KEYS = new Set(["appearChance", "flipChance", "format"]);

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isAllowedThumbnailHost(hostname) {
  return YTIMG_HOST_PATTERN.test(hostname);
}

function parseProbability(value, fallback, fieldName) {
  if (value === undefined) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0 || parsedValue > 1) {
    throw createHttpError(400, `${fieldName} must be a number between 0 and 1.`);
  }

  return parsedValue;
}

function parseThumbnailUrl(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, "The url query parameter is required.");
  }

  let thumbnailUrl;

  try {
    thumbnailUrl = new URL(value);
  } catch {
    throw createHttpError(400, "The url query parameter must be a valid absolute URL.");
  }

  if (!["http:", "https:"].includes(thumbnailUrl.protocol)) {
    throw createHttpError(400, "Only http and https thumbnail URLs are allowed.");
  }

  if (!isAllowedThumbnailHost(thumbnailUrl.hostname)) {
    throw createHttpError(400, "Only ytimg.com thumbnail URLs are allowed.");
  }

  return thumbnailUrl;
}

function parseRequestedFormat(value) {
  if (value === undefined) {
    return null;
  }

  const format = normalizeRequestedFormat(value);

  if (!format) {
    throw createHttpError(400, "format must be one of jpeg, jpg, png, or webp.");
  }

  return format;
}

async function fetchThumbnailBuffer(thumbnailUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(thumbnailUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "MrBeastify-Youtube Server",
      },
    });

    if (!response.ok) {
      throw createHttpError(
        502,
        `The upstream thumbnail request failed with status ${response.status}.`
      );
    }

    const finalUrl = new URL(response.url);

    if (!isAllowedThumbnailHost(finalUrl.hostname)) {
      throw createHttpError(502, "The upstream thumbnail redirect left ytimg.com.");
    }

    const sourceContentType = response.headers.get("content-type") || "";

    if (!sourceContentType.toLowerCase().startsWith("image/")) {
      throw createHttpError(
        502,
        `The upstream response is not an image. Received: ${sourceContentType || "unknown"}.`
      );
    }

    const announcedLength = Number(response.headers.get("content-length"));

    if (Number.isFinite(announcedLength) && announcedLength > MAX_SOURCE_BYTES) {
      throw createHttpError(413, "The upstream thumbnail is larger than the allowed limit.");
    }

    const thumbnailBuffer = Buffer.from(await response.arrayBuffer());

    if (thumbnailBuffer.length > MAX_SOURCE_BYTES) {
      throw createHttpError(413, "The upstream thumbnail is larger than the allowed limit.");
    }

    return {
      thumbnailBuffer,
      sourceContentType,
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw createHttpError(504, "Timed out while fetching the upstream thumbnail.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildUpstreamUrlFromPathRequest(request) {
  const upstreamUrl = new URL(request.originalUrl, "https://i.ytimg.com");

  for (const reservedKey of RESERVED_QUERY_KEYS) {
    upstreamUrl.searchParams.delete(reservedKey);
  }

  return upstreamUrl;
}

function getRequestOrigin(request) {
  const forwardedProtocol = request.get("x-forwarded-proto");
  const forwardedHost = request.get("x-forwarded-host");
  const protocol = forwardedProtocol ? forwardedProtocol.split(",")[0].trim() : request.protocol;
  const host = forwardedHost ? forwardedHost.split(",")[0].trim() : request.get("host");

  return `${protocol}://${host}`;
}

function getShadowrocketBackendUrl(request) {
  const configuredBackendUrl = process.env.SHADOWROCKET_BACKEND_URL;

  if (configuredBackendUrl) {
    return configuredBackendUrl.replace(/\/+$/, "");
  }

  return getRequestOrigin(request).replace(/\/+$/, "");
}

async function buildMrBeastifiedThumbnail({
  thumbnailUrl,
  appearChance,
  flipChance,
  requestedFormat,
  overlayCatalog,
}) {
  const { thumbnailBuffer, sourceContentType } = await fetchThumbnailBuffer(
    thumbnailUrl.toString()
  );
  const shouldApplyOverlay = Math.random() < appearChance;

  if (!shouldApplyOverlay) {
    const passthroughImage = requestedFormat
      ? await encodeSourceImage({
          sourceBuffer: thumbnailBuffer,
          requestedFormat,
          sourceContentType,
        })
      : {
          buffer: thumbnailBuffer,
          contentType: sourceContentType.split(";")[0] || "application/octet-stream",
        };

    return {
      buffer: passthroughImage.buffer,
      contentType: passthroughImage.contentType,
      applied: false,
      flipped: false,
      overlayIndex: null,
      sourceUrl: thumbnailUrl.toString(),
    };
  }

  const overlaySelection = resolveOverlaySelection(overlayCatalog, flipChance);
  const transformedImage = await renderThumbnailWithOverlay({
    sourceBuffer: thumbnailBuffer,
    sourceContentType,
    requestedFormat,
    overlayPath: overlaySelection.overlayPath,
    flip: overlaySelection.flip,
  });

  return {
    buffer: transformedImage.buffer,
    contentType: transformedImage.contentType,
    applied: true,
    flipped: overlaySelection.flip,
    overlayIndex: overlaySelection.index,
    sourceUrl: thumbnailUrl.toString(),
  };
}

async function respondWithMrBeastifiedThumbnail({
  thumbnailUrl,
  appearChance,
  flipChance,
  requestedFormat,
  overlayCatalog,
  response,
}) {
  const image = await buildMrBeastifiedThumbnail({
    thumbnailUrl,
    appearChance,
    flipChance,
    requestedFormat,
    overlayCatalog,
  });

  response.set("Cache-Control", "no-store");
  response.set("X-MrBeastify-Source", image.sourceUrl);
  response.set("Content-Type", image.contentType);
  response.set("X-MrBeastify-Applied", String(image.applied));

  if (image.overlayIndex !== null) {
    response.set("X-MrBeastify-Overlay-Index", String(image.overlayIndex));
    response.set("X-MrBeastify-Flipped", String(image.flipped));
  }

  response.send(image.buffer);
}

async function main() {
  const app = express();
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const imagesDirectory = path.join(__dirname, "..", "images");
  const overlayCatalog = await loadOverlayCatalog(imagesDirectory);

  app.disable("x-powered-by");

  app.use((request, response, next) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  });

  app.get("/", (request, response) => {
    response.json({
      name: "MrBeastify Thumbnail Server",
      forkedFrom: "https://github.com/MagicJinn/MrBeastify-Youtube",
      usage: {
        hostReplacement:
          "/vi/<VIDEO_ID>/hq720.jpg?sqp=...&rs=...  (replace i.ytimg.com with this server)",
        queryProxy: "/mrbeastify?url=https://i.ytimg.com/vi/<VIDEO_ID>/hqdefault.jpg",
        shadowrocketScript: "/ytimg-replace.js",
        shadowrocketModule: "/ytimg-replace.sgmodule",
        shadowrocketApi: "/__ytimg_replace?url=https://i.ytimg.com/vi/<VIDEO_ID>/hq720.jpg",
      },
      optionalQuery: {
        appearChance: "0.0 - 1.0",
        flipChance: "0.0 - 1.0",
        format: "jpeg | png | webp",
      },
    });
  });

  app.get("/healthz", (request, response) => {
    response.json({
      ok: true,
      overlays: overlayCatalog.overlayIndices.length,
    });
  });

  app.get("/ytimg-replace.js", (request, response) => {
    response.type("application/javascript");
    response.set("Cache-Control", "no-store");
    response.send(buildShadowrocketScript(getShadowrocketBackendUrl(request)));
  });

  app.get("/ytimg-replace.sgmodule", (request, response) => {
    response.type("text/plain; charset=utf-8");
    response.set("Cache-Control", "no-store");
    response.send(buildShadowrocketModule(getShadowrocketBackendUrl(request)));
  });

  app.get("/__ytimg_replace", async (request, response, next) => {
    try {
      const thumbnailUrl = parseThumbnailUrl(request.query.url);
      const appearChance = parseProbability(
        request.query.appearChance,
        DEFAULT_APPEAR_CHANCE,
        "appearChance"
      );
      const flipChance = parseProbability(
        request.query.flipChance,
        DEFAULT_FLIP_CHANCE,
        "flipChance"
      );
      const requestedFormat = parseRequestedFormat(request.query.format);
      const image = await buildMrBeastifiedThumbnail({
        thumbnailUrl,
        appearChance,
        flipChance,
        requestedFormat,
        overlayCatalog,
      });

      response.set("Cache-Control", "no-store");
      response.json({
        mime: image.contentType,
        base64: image.buffer.toString("base64"),
        applied: image.applied,
        overlayIndex: image.overlayIndex,
        flipped: image.flipped,
        sourceUrl: image.sourceUrl,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/mrbeastify", async (request, response, next) => {
    try {
      const thumbnailUrl = parseThumbnailUrl(request.query.url);
      const appearChance = parseProbability(
        request.query.appearChance,
        DEFAULT_APPEAR_CHANCE,
        "appearChance"
      );
      const flipChance = parseProbability(
        request.query.flipChance,
        DEFAULT_FLIP_CHANCE,
        "flipChance"
      );
      const requestedFormat = parseRequestedFormat(request.query.format);
      await respondWithMrBeastifiedThumbnail({
        thumbnailUrl,
        appearChance,
        flipChance,
        requestedFormat,
        overlayCatalog,
        response,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(/^\/.+/, async (request, response, next) => {
    try {
      const appearChance = parseProbability(
        request.query.appearChance,
        DEFAULT_APPEAR_CHANCE,
        "appearChance"
      );
      const flipChance = parseProbability(
        request.query.flipChance,
        DEFAULT_FLIP_CHANCE,
        "flipChance"
      );
      const requestedFormat = parseRequestedFormat(request.query.format);
      const thumbnailUrl = buildUpstreamUrlFromPathRequest(request);

      await respondWithMrBeastifiedThumbnail({
        thumbnailUrl,
        appearChance,
        flipChance,
        requestedFormat,
        overlayCatalog,
        response,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, next) => {
    const status = error && Number.isInteger(error.status) ? error.status : 500;
    const message =
      status >= 500 ? "Failed to produce a MrBeastified thumbnail." : error.message;

    if (status >= 500) {
      console.error(error);
    }

    response.status(status).json({
      error: message,
      details: status >= 500 ? error.message : undefined,
    });
  });

  app.listen(port, () => {
    console.log(`MrBeastify server listening on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
