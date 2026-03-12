# Known Issues & Solutions — Prospection Tool

## Recurring Errors to NEVER Reproduce

### 1. Image Download 403 Forbidden
- **Cause**: External image hosts (Google Images, stock sites) block server-side downloads from cloud IPs (Vercel, AWS, etc.)
- **Wrong fix**: Adding User-Agent headers server-side — still blocked because IP is flagged
- **Correct fix**: 3-tier fallback strategy:
  1. **Canvas** (client-side): Load image via `<img crossOrigin="anonymous">`, draw to canvas, extract base64. Works when server sends CORS headers.
  2. **Proxy** (server-side): `/api/landing/image-proxy` fetches with browser-like headers. Works for servers that check User-Agent but not IP.
  3. **Multi-strategy server download**: Try Chrome UA, Googlebot UA, Facebook UA. Last resort.
- **Key rule**: Always send `imageBase64` from client when possible. Only send `imageUrl` as fallback.

### 2. FTP Connection Reset (ECONNRESET)
- **Cause**: `metagora-tech.fr` resolves to IPv6 which causes FTP connection reset
- **Wrong fix**: Using domain name `metagora-tech.fr` for FTP host
- **Correct fix**: Use IP `72.60.93.34` directly, `secure: false`
- **Key rule**: Always use FTP_HOST env var, default to IP not domain

### 3. Template Cache Serving Stale Content
- **Cause**: In-memory cache (was 10min, now 2min) serves old template after GitHub updates
- **Impact**: Logo changes, CSS fixes, HTML changes not reflected in preview
- **Key rule**: After template changes on GitHub, wait for cache TTL (2 min) before testing. New Vercel deploys reset the cache.

### 4. Relative Image Paths in Preview Iframe
- **Cause**: Template uses `../../assets/images` (relative), iframe served from Vercel domain can't resolve these
- **Fix**: `preview/route.ts` replaces `../../assets/images` → `https://metagora-tech.fr/{basePath}/assets/images`
- **Key rule**: NEVER change the `ASSETS_PATH` variable value in `computeVariables()`. The preview route depends on the exact string `../../assets/images` for regex replacement.

### 5. SVG Logos — Inline vs File
- **Wrong approach**: Inline SVG in HTML template — complex logos render incorrectly, paths get mangled
- **Correct approach**: Store SVG/JPG files in `retail-luxe/assets/images/logos AI/` and reference via `<img src>`. Files are vectorial, always sharp, and served correctly by Hostinger.
- **Key rule**: Never use inline SVGs for partner/client logos. Always use `<img src="{{ASSETS_PATH}}/...">`.

### 6. PowerShell `$$` in Passwords
- **Cause**: PowerShell interprets `$$` as a special variable
- **Impact**: FTP passwords or API keys containing `$$` get corrupted when set via PowerShell commands
- **Key rule**: Write passwords to files via Node.js or use single-quoted strings in PowerShell

## Architecture Notes

### Image Save Flow
```
User selects image → handleConfirmImage()
  ├── Try 1: Canvas base64 (client, no network call)
  ├── Try 2: Proxy fetch → base64 (client → /api/landing/image-proxy → external)
  └── Try 3: Send URL to /api/landing/save-image (server downloads with 3 UA strategies)
       └── sharp resize 1200×900 → GitHub + FTP upload
```

### Logo Files (definitive)
| Logo | File | Source |
|------|------|--------|
| Microsoft | `logos AI/microsoft.svg` | worldvectorlogo CDN |
| NVIDIA | `logos AI/nvidia.svg` | worldvectorlogo CDN |
| Google Cloud | `logos AI/google-cloud.svg` | worldvectorlogo CDN |
| ElevenLabs | `logos AI/elevenlabs.jpg` | User-provided, resized |
| LVMH | `logo-lvmh.svg` | worldvectorlogo CDN |
| Amazon | `logo-amazon.svg` | worldvectorlogo CDN |
| Carrefour | `logo-carrefour.svg` | worldvectorlogo CDN |

### FTP Config
- Host: `72.60.93.34` (NOT domain)
- User: `u222173711`
- Upload root: `/public_html/`
- Secure: `false`
