function trimTrailingSlashes(value) {
  return String(value).replace(/\/+$/, "");
}

function buildShadowrocketScript(backendUrl) {
  const normalizedBackendUrl = trimTrailingSlashes(backendUrl);

  return `const BACKEND = ${JSON.stringify(normalizedBackendUrl)};

try {
  const originalUrl = $request.url;
  const parsed = new URL(originalUrl);
  const replacementUrl = BACKEND + parsed.pathname + parsed.search;

  console.log("[ytimg_replace] " + originalUrl + " -> " + replacementUrl);

  $done({ url: replacementUrl });
} catch (error) {
  console.log("[ytimg_replace] rewrite error: " + error);
  $done({});
}
`;
}

module.exports = {
  buildShadowrocketScript,
};
