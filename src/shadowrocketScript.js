function trimTrailingSlashes(value) {
  return String(value).replace(/\/+$/, "");
}

function buildShadowrocketScript(backendUrl) {
  const normalizedBackendUrl = trimTrailingSlashes(backendUrl);

  return `const BACKEND = ${JSON.stringify(normalizedBackendUrl)};

const originalUrl = $request.url;
const original = new URL(originalUrl);

// GET /__ytimg_replace?url=<original_url>
const apiUrl =
  BACKEND +
  "/__ytimg_replace?url=" +
  encodeURIComponent(originalUrl);

$httpClient.get(
  {
    url: apiUrl,
    headers: {
      Accept: "application/json",
      "X-Original-URL": originalUrl,
      "X-Original-Path": original.pathname + original.search
    }
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
      const json = JSON.parse(data);

      if (!json.base64) {
        console.log("[ytimg_replace] missing base64");
        $done({});
        return;
      }

      const mime = json.mime || "image/jpeg";
      const bytes = base64ToUint8Array(json.base64);

      $done({
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "Access-Control-Allow-Origin": "*"
        },
        body: bytes,
        bodyBytes: bytes
      });
    } catch (e) {
      console.log("[ytimg_replace] parse/decode error: " + e);
      $done({});
    }
  }
);

function base64ToUint8Array(base64) {
  base64 = base64
    .replace(/^data:[^,]+,/, "")
    .replace(/\\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let buffer = 0;
  let bits = 0;
  const out = [];

  for (let i = 0; i < base64.length; i++) {
    const c = base64[i];

    if (c === "=") break;

    const value = chars.indexOf(c);
    if (value === -1) continue;

    buffer = (buffer << 6) | value;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(out);
}
`;
}

module.exports = {
  buildShadowrocketScript,
};
