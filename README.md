# MrBeastify Thumbnail Server

Forked from [MagicJinn/MrBeastify-Youtube](https://github.com/MagicJinn/MrBeastify-Youtube).

This is an HTTP server that:

- fetches a thumbnail from `i.ytimg.com`
- composites a random MrBeast asset from `images/` on top
- returns the transformed image
- can also serve a Shadowrocket sgmodule that transparently rewrites all `i.ytimg.com` thumbnail requests to this server (so YouTube on iOS Safari shows MrBeastified thumbnails)

The selection of overlay and flip is **deterministic per source URL** — the same thumbnail URL always produces the same composited image. This is required for browser fetches that may issue partial / Range / retry requests on the same URL.

## API

### Direct host replacement

```text
GET /vi/<VIDEO_ID>/hq720.jpg?sqp=...&rs=...
```

Replace the host part of any `i.ytimg.com` thumbnail URL with this server's origin.

Optional query parameters:

- `appearChance=0.0..1.0` — probability that the MrBeast overlay is applied
- `flipChance=0.0..1.0` — probability that the overlay is horizontally flipped
- `format=jpeg|png|webp` — force output format

These query keys are stripped before the upstream `i.ytimg.com` request.

### Explicit proxy endpoint

```text
GET /mrbeastify?url=https://i.ytimg.com/vi/<VIDEO_ID>/hq720.jpg?...
```

Same query parameters as above.

### Health check

```text
GET /healthz
```

### Shadowrocket sgmodule

```text
GET /ytimg-replace.sgmodule
```

Returns a Shadowrocket module that uses `[URL Rewrite] ... header` mode to transparently route all `i*.ytimg.com` thumbnail requests through this server. See [Shadowrocket setup](#shadowrocket-setup) below.

(Note: the legacy `/ytimg-replace.js` script endpoint and the `/__ytimg_replace` base64 JSON endpoint are still served for compatibility but are not used by the current sgmodule.)

## Shadowrocket setup

The sgmodule rewrites `i.ytimg.com` (and `i0`–`i9.ytimg.com`) image requests to this server using `header` mode, so Safari sees the response as if it still came from `i.ytimg.com`. This is **important** — `302` redirects to a different host get blocked by the YouTube page's `img-src` Content Security Policy. `header`-mode rewrite keeps the URL on `i.ytimg.com` from Safari's perspective and only Shadowrocket internally fetches from this backend.

### Steps

1. Have this server running and reachable from your iPhone (same WiFi LAN, or a public/HTTPS URL).
2. In Shadowrocket, **delete any previous version of this module** (Shadowrocket caches modules aggressively).
3. Modules → `+` → "Add from URL", paste:
   ```
   http://<your-backend-host>:3000/ytimg-replace.sgmodule
   ```
4. Enable the module.
5. Toggle Shadowrocket off and on so the new config loads.
6. Make sure the Shadowrocket MITM CA is installed and trusted on iOS (`Settings > General > VPN & Device Management` → trust the cert; also enable for SSL in `Settings > General > About > Certificate Trust Settings`).
7. Open Safari → YouTube. Thumbnails should be MrBeastified.

### Verifying it works

In Safari Web Inspector → Network, the thumbnail request URL still shows `i.ytimg.com/...`, but the response headers should include:

- `X-MrBeastify-Source`
- `X-MrBeastify-Applied: true`
- `X-MrBeastify-Overlay-Index: <n>`

If you see `Server: sffe` and no `X-MrBeastify-*` headers, the rewrite did not take effect — usually because Shadowrocket is still using a cached old module, or the iPhone can't reach the backend host.

## Development

```bash
npm install
npm start
```

Defaults to `http://localhost:3000`. Override with `PORT=8080 npm start`.

If you serve the sgmodule from a host that differs from the iPhone-facing URL (e.g. behind a reverse proxy), set `SHADOWROCKET_BACKEND_URL` before starting so the generated module embeds the correct backend URL.

## Notes

- Only `https` (and `http`) thumbnail URLs on the `ytimg.com` family of hosts are accepted.
- Output defaults to the source image format unless overridden via `format=`.
- `images/flip_blacklist.json` and `images/textFlipped/` are honored when picking flips.
- Overlay choice is seeded from the source URL — the same URL always produces the same image.
