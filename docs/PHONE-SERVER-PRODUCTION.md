# Phone Server production deployment

## Domains

- Management domain: `openlist.mc520.top`
- Download domain: `dl.mc520.top`
- Frontend repository: `YYKX682436/OpenList-Frontend`
- Frontend production ref: `phone-server-v4`
- Frontend production commit: `c003515f641cc5e31679cba1b34b20a3b852fff3`

## EdgeOne Makers build variables

Set these non-secret variables for the production environment:

```text
FRONTEND_BUILD_FROM_SOURCE=1
FRONTEND_GIT_URL=https://github.com/YYKX682436/OpenList-Frontend.git
FRONTEND_GIT_REF=phone-server-v4
VITE_DOWNLOAD_URL=https://dl.mc520.top
```

Leave `VITE_API_URL` unchanged. `scripts/fetch-frontend.mjs` forces it to `/` when building the frontend.

Leave `ASSET_URLS` empty so EdgeOne serves the assets from the same custom frontend build.

## EdgeOne build workaround

Keep `cloud-functions/[[default]].js` tracked in this repository. The deployment uses this workaround file.

## Download policy

The download host allows only `GET` and `HEAD` requests under `/d/*`. All other paths return `404`.

## 139Yun policy

```text
web_proxy=false
webdav_policy=302_redirect
proxy_range=true
```

## Direct-link path v3 history

- Frontend tag: `phone-server-v3` (annotated), points to `867eba81b409e23096a79b1e7e79e9b8a87cbe4f`.
- EdgeOne backend source at that rollout: `3f1ce1c907bd62d648a600ac7dc57ca4c2795528`.
- The `phone-server-v2` and `phone-server-v3` tags remain unchanged.

## Direct-link path v4 / R1 production verification

- Frontend tag: `phone-server-v4` (annotated), points to `c003515f641cc5e31679cba1b34b20a3b852fff3`. The v4 UI change makes detail QR generation use `currentObjLink(true)`, the same encoded value used by the detail copy button.
- EdgeOne backend source commit: `f39e1454628e2e37e29b0a2ced0c9c17660676a0` (`getItem` requests metadata without an upstream raw URL; `Yun139Driver.get` still resolves upstream raw URLs on the actual `/d` path).
- `OpenList-Worker` mirror contract/139 commit: `caf0fad77660c2b9d5b4a914c97195605f3def36`.
- EdgeOne production deployment: `dpu5m8fc81qq` (production, successful; 2026-10-01 18:08 China Standard Time; EdgeOne source commit `f39e145...`). Its build log cloned Frontend ref `phone-server-v4` and checked out the exact commit `c003515f641cc5e31679cba1b34b20a3b852fff3`.
- The production browser session used one principal throughout: `/api/me` returned `guest`, role `1`, `base_path=/`. Production storage `mount_path` is `/中国移动云盘`; the UI/list route was `/中国移动云盘/安卓定制V/中国移动云盘`. For each file, `/fs/list.raw_path`, successful `/fs/get.raw_path`, encoded folder copy, unencoded folder copy, and detail copy decoded to the same complete path:
  - `/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk`
  - `/中国移动云盘/安卓定制V/中国移动云盘/AnyText_1.0.2.apk`
  The repeated `中国移动云盘` segment is part of the mounted path and is valid.
- Backend regression fixtures cover `mount_path=/中国移动云盘`, `base_path=/中国移动云盘/安卓定制V`, and logical `/中国移动云盘/8076多开_k_n.apk`. They assert that list/get/sign use `/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk`; `resolvePath.cleanPath` equals that canonical path, `relative=/安卓定制V/中国移动云盘/8076多开_k_n.apk`, and `physical` is the fixture root plus those relative segments.
- Both exact production download URLs returned GET `200`. `Range: bytes=0-1023` returned `206`, read 1024 bytes, and returned `Content-Range: bytes 0-1023/281393532` (8076) and `bytes 0-1023/1898775` (AnyText). HEAD first hop returned `302`; provider-followed HEAD returned `403` for both. The 139 provider does not support the redirected HEAD request; this is not an acceptance blocker when GET and Range succeed.
- Both detail pages loaded after a same-path reload; detail copy decoded exactly to the corresponding `/fs/get.raw_path`, and each QR dialog rendered. Source in the deployed v4 Frontend calls `QRCode.toDataURL(currentObjLink(true))` while detail copy calls `copyCurrentRawLink(true)`.
- **Acceptance remains pending.** On the first folder-to-file click for each APK, `/fs/get` intermittently returned HTTP `200` with `provider=Virtual`, `name=root`, and `raw_path=/`, causing the UI to show a nested listing instead of file detail. Repeated identical guest `/fs/get` requests for 8076 alternated between this virtual-root result and the expected 139Yun file metadata; a reload then returned the expected metadata. The canonical link paths and GET/Range smoke pass, but this production response inconsistency must be resolved before marking the task `ACCEPTED`.
- Validation: Frontend `pnpm test:links` passed (14/14) and `pnpm build` passed. EdgeOne targeted path/139 tests passed (12/12), `npm run test:all` passed, and the deployed EdgeOne build succeeded. Frontend lint still reports existing unrelated TypeScript errors; EdgeOne lint reports existing duplicate `DbCipher` declarations and missing `ADMIN_PASS` env typing. `OpenList-Worker` targeted tests passed (9/9) and its `npm run test:all` passed; its lint remains blocked by the pre-existing duplicate `DbCipher` declarations.
