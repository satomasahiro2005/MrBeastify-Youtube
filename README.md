# MrBeastify Thumbnail Server

Forked from [MagicJinn/MrBeastify-Youtube](https://github.com/MagicJinn/MrBeastify-Youtube).

This version is no longer a browser extension. It is an HTTP server that:

- fetches a thumbnail from `ytimg.com`
- overlays a random MrBeast asset from `images/`
- returns the transformed image to the caller
- can also serve a Shadowrocket response-replace script, module, and a base64 JSON API

## How It Works

Replace the host of an existing YouTube thumbnail URL with this server.

Original:

```text
https://i.ytimg.com/vi/pDDA7GkV7bk/hq720.jpg?sqp=...&rs=...
```

Server version:

```text
http://localhost:3000/vi/pDDA7GkV7bk/hq720.jpg?sqp=...&rs=...
```

The server downloads the original thumbnail from `https://i.ytimg.com`, composites a random overlay, and streams the result back.

## API

### Direct host replacement

```text
GET /vi/<VIDEO_ID>/hq720.jpg?sqp=...&rs=...
```

Optional query parameters handled by this server:

- `appearChance=0.0..1.0`
- `flipChance=0.0..1.0`
- `format=jpeg|png|webp`

These control parameters are stripped before the upstream `ytimg.com` request is made.

### Explicit proxy endpoint

```text
GET /mrbeastify?url=https://i.ytimg.com/vi/<VIDEO_ID>/hq720.jpg?sqp=...&rs=...
```

This endpoint supports the same optional query parameters.

### Shadowrocket script

```text
GET /ytimg-replace.js
GET /ytimg-replace.sgmodule
```

`ytimg-replace.js` serves the direct-fetch `http-response` script.
`ytimg-replace.sgmodule` serves the matching Shadowrocket module with the broad `ytimg` pattern, `requires-body=true`, `binary-body-mode=1`, `max-size=-1`, and `timeout=30`.

The server also exposes the base64 JSON API used by the alternate response flow:

```text
GET /__ytimg_replace?url=<original_ytimg_url>
```

The JSON response format is:

```json
{
  "mime": "image/jpeg",
  "base64": "<base64-encoded-image>",
  "applied": true,
  "overlayIndex": 48,
  "flipped": true,
  "sourceUrl": "https://i.ytimg.com/..."
}
```

By default, the script and module use the same origin that served them.
If needed, set `SHADOWROCKET_BACKEND_URL` before starting the server to force a different backend URL into the generated assets.

### Health check

```text
GET /healthz
```

## Development

```bash
npm install
npm start
```

The server starts on `http://localhost:3000` by default.

To change the port:

```bash
PORT=8080 npm start
```

## Notes

- Only `http` and `https` thumbnail URLs from `ytimg.com` are accepted by the explicit proxy endpoint.
- Path-based host replacement always proxies to `https://i.ytimg.com`.
- Output defaults to the source image format when possible.
- `images/flip_blacklist.json` and `images/textFlipped/` are still honored.
