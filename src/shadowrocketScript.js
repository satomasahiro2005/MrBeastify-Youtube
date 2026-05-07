function trimTrailingSlashes(value) {
  return String(value).replace(/\/+$/, "");
}

function buildShadowrocketScript(backendUrl) {
  const normalizedBackendUrl = trimTrailingSlashes(backendUrl);

  return `const BACKEND = ${JSON.stringify(normalizedBackendUrl)};

const originalUrl = $request.url;
const original = new URL(originalUrl);
const replacementUrl = BACKEND + original.pathname + original.search;

$httpClient.get(
  {
    url: replacementUrl,
    headers: {
      Accept: "image/*,*/*;q=0.8",
      "X-Original-URL": originalUrl,
      "X-Original-Path": original.pathname + original.search
    },
    "binary-mode": true
  },
  function (error, response, data) {
    if (error) {
      console.log("[ytimg_replace] backend error: " + error);
      $done({});
      return;
    }

    if (!response || response.status !== 200) {
      console.log("[ytimg_replace] backend status: " + (response && response.status));
      $done({});
      return;
    }

    try {
      const headers = cloneHeaders(response.headers || {});
      const bytes = toUint8Array(data);
      const mime = getHeader(headers, "content-type") || "image/jpeg";

      deleteHeader(headers, "content-length");
      deleteHeader(headers, "content-encoding");
      deleteHeader(headers, "transfer-encoding");
      deleteHeader(headers, "etag");

      headers["Content-Type"] = mime;
      headers["Cache-Control"] = "no-store";
      headers.Pragma = "no-cache";
      headers["Access-Control-Allow-Origin"] = "*";

      $done({
        response: {
          status: response.status || 200,
          headers,
          bodyBytes: bytes
        }
      });
    } catch (e) {
      console.log("[ytimg_replace] parse/decode error: " + e);
      $done({});
    }
  }
);

function cloneHeaders(headers) {
  const out = {};

  for (const key in headers) {
    out[key] = headers[key];
  }

  return out;
}

function deleteHeader(headers, name) {
  const target = String(name).toLowerCase();

  for (const key in headers) {
    if (String(key).toLowerCase() === target) {
      delete headers[key];
    }
  }
}

function getHeader(headers, name) {
  const target = String(name).toLowerCase();

  for (const key in headers) {
    if (String(key).toLowerCase() === target) {
      return headers[key];
    }
  }

  return null;
}

function toUint8Array(data) {
  if (data instanceof Uint8Array) {
    return data;
  }

  if (Array.isArray(data)) {
    return new Uint8Array(data);
  }

  if (typeof data === "string") {
    const out = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      out[i] = data.charCodeAt(i) & 0xff;
    }

    return out;
  }

  throw new Error("Unsupported response body type: " + typeof data);
}
`;
}

module.exports = {
  buildShadowrocketScript,
};
