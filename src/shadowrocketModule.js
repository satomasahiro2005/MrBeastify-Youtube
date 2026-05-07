function trimTrailingSlashes(value) {
  return String(value).replace(/\/+$/, "");
}

const YTIMG_SUBDOMAINS = [
  "i",
  "i0",
  "i1",
  "i2",
  "i3",
  "i4",
  "i5",
  "i6",
  "i7",
  "i8",
  "i9",
];

function buildShadowrocketModule(backendUrl) {
  const normalizedBackendUrl = trimTrailingSlashes(backendUrl);
  const backendHost = new URL(normalizedBackendUrl).hostname;
  const directRules = [`DOMAIN,${backendHost},DIRECT`];

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(backendHost)) {
    directRules.push(`IP-CIDR,${backendHost}/32,DIRECT,no-resolve`);
  }

  const rewriteRules = YTIMG_SUBDOMAINS.map(
    (sub) => `^https:\\/\\/${sub}\\.ytimg\\.com\\/(.*)$ ${normalizedBackendUrl}/$1 header`
  ).join("\n");

  const mitmHosts = YTIMG_SUBDOMAINS.map((sub) => `${sub}.ytimg.com`).join(", ");

  return `#!name=ytimg rewrite to ${backendHost}
#!desc=Rewrite i*.ytimg.com image requests to ${normalizedBackendUrl} (header mode)

[Rule]
${directRules.join("\n")}

[URL Rewrite]
${rewriteRules}

[MITM]
hostname = %APPEND%, ${mitmHosts}
`;
}

module.exports = {
  buildShadowrocketModule,
};
