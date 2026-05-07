function trimTrailingSlashes(value) {
  return String(value).replace(/\/+$/, "");
}

function buildShadowrocketModule(backendUrl) {
  const normalizedBackendUrl = trimTrailingSlashes(backendUrl);
  const backendHost = new URL(normalizedBackendUrl).hostname;
  const directRules = [`DOMAIN,${backendHost},DIRECT`];

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(backendHost)) {
    directRules.push(`IP-CIDR,${backendHost}/32,DIRECT,no-resolve`);
  }

  return `#!name=ytimg response replace
#!desc=Replace i.ytimg.com image response body with processed image from ${normalizedBackendUrl}

[Rule]
${directRules.join("\n")}

[Script]
ytimg_replace = type=http-response,pattern=^https:\\/\\/(?:i\\d*\\.ytimg\\.com|i\\.ytimg\\.com)\\/.*\\.(?:jpg|jpeg|png|webp)(?:\\?.*)?$,requires-body=true,binary-body-mode=1,max-size=-1,timeout=30,engine=webview,script-path=${normalizedBackendUrl}/ytimg-replace.js

[MITM]
hostname = %APPEND%, i.ytimg.com, i0.ytimg.com, i1.ytimg.com, i2.ytimg.com, i3.ytimg.com, i4.ytimg.com, i5.ytimg.com, i6.ytimg.com, i7.ytimg.com, i8.ytimg.com, i9.ytimg.com
h2 = true
`;
}

module.exports = {
  buildShadowrocketModule,
};
