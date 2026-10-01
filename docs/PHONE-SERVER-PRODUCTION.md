# Phone Server production deployment

## Domains

- Management domain: `openlist.mc520.top`
- Download domain: `dl.mc520.top`
- Frontend repository: `YYKX682436/OpenList-Frontend`
- Frontend production ref: `phone-server-v5`
- Frontend production commit: `5a53bdb80b4617161bd39ba2f840c89ce0ea257b`

## EdgeOne Makers build variables

Set these non-secret variables for the production environment:

```text
FRONTEND_BUILD_FROM_SOURCE=1
FRONTEND_GIT_URL=https://github.com/YYKX682436/OpenList-Frontend.git
FRONTEND_GIT_REF=phone-server-v5
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

## Historical v4 / R1 verification (superseded by v5 below)

- Frontend tag: `phone-server-v4` (annotated), points to `c003515f641cc5e31679cba1b34b20a3b852fff3`. The v4 UI change makes detail QR generation use `currentObjLink(true)`, the same encoded value used by the detail copy button.
- EdgeOne backend source commit: `f39e1454628e2e37e29b0a2ced0c9c17660676a0` (`getItem` requests metadata without an upstream raw URL; `Yun139Driver.get` still resolves upstream raw URLs on the actual `/d` path).
- `OpenList-Worker` mirror contract/139 commit: `caf0fad77660c2b9d5b4a914c97195605f3def36`.
- EdgeOne production deployment: `dpu5m8fc81qq` (production, successful; 2026-10-01 18:08 China Standard Time; EdgeOne source commit `f39e145...`). Its build log cloned Frontend ref `phone-server-v4` and checked out the exact commit `c003515f641cc5e31679cba1b34b20a3b852fff3`.
- The production browser smoke used the same guest principal for `/api/me`, `/fs/list`, `/fs/get`, and UI copy. `/api/me` returned `username=guest`, role `1`, `base_path=/`; production storage `mount_path=/中国移动云盘`. The actual UI/list folder route was `/中国移动云盘/安卓定制V`, and its `fs/list` response contained both APKs directly. The actual canonical paths were:
  - `/中国移动云盘/安卓定制V/8076多开_k_n.apk`
  - `/中国移动云盘/安卓定制V/AnyText_1.0.2.apk`
  For both files, `fs/list.raw_path`, successful `fs/get.raw_path`, encoded and unencoded folder copies, and detail copy agree exactly. The nested route `/中国移动云盘/安卓定制V/中国移动云盘` is not present in the live guest listing; requesting it returned `Item not found` from 139Yun.
- A repeated `中国移动云盘` segment remains valid when the principal and logical path produce it. The exact regression fixture uses `mount_path=/中国移动云盘`, `base_path=/中国移动云盘/安卓定制V`, and logical `/中国移动云盘/8076多开_k_n.apk`, yielding `/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk`. That fixture is separate from the current production guest tree; no path-segment de-duplication is allowed.
- Backend regression fixtures cover `mount_path=/中国移动云盘`, `base_path=/中国移动云盘/安卓定制V`, and logical `/中国移动云盘/8076多开_k_n.apk`. They assert that list/get/sign use `/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk`; `resolvePath.cleanPath` equals that canonical path, `relative=/安卓定制V/中国移动云盘/8076多开_k_n.apk`, and `physical` is the fixture root plus those relative segments.
- Frontend legacy-backend fallback audit: when `raw_path` is absent, link generation first derives one complete object path from router state, then applies `me().base_path` once. The router pathname is relative to that user-visible base. If an initial object lookup sees an already-prefixed pathname and fails with `object not found`, `usePath` strips the user base prefix and retries before an object is loaded into `State.File`; there is no current loaded-object call path that would prepend the base twice. No path-segment de-duplication was added.
- Both exact production download URLs returned GET `200`. `Range: bytes=0-1023` returned `206`, read 1024 bytes, and returned `Content-Range: bytes 0-1023/281393532` (8076) and `bytes 0-1023/1898775` (AnyText). HEAD first hop returned `302`; provider-followed HEAD returned `403` for both. The 139 provider does not support the redirected HEAD request; this is not an acceptance blocker when GET and Range succeed.
- Folder-to-file click opened 8076 detail with the expected metadata. AnyText's first detail request returned HTTP `200` with `provider=Virtual`, `name=root`, and `raw_path=/`, showing a listing under the file route; reloading the same route then returned the expected 139Yun metadata and loaded detail. Detail copy decoded exactly to the successful same-principal `fs/get.raw_path` for both files. Both QR dialogs rendered. Deployed v4 source calls `QRCode.toDataURL(currentObjLink(true))`, the same helper used by encoded detail copy; the QR pixels were not independently decoded in the browser.
- Historical v4 status: acceptance was pending because AnyText's first click returned Virtual-root metadata. The v5 request-body recovery below resolves this and its fresh production detail smoke passes.
- Validation: Frontend `pnpm test:links` passed (14/14) and `pnpm build` passed. EdgeOne targeted path/139 tests passed (12/12), `npm run test:all` passed, and the deployed EdgeOne build succeeded. Frontend lint still reports existing unrelated TypeScript errors; EdgeOne lint reports existing duplicate `DbCipher` declarations and missing `ADMIN_PASS` env typing. `OpenList-Worker` targeted tests passed (9/9) and its `npm run test:all` passed; its lint remains blocked by the pre-existing duplicate `DbCipher` declarations.

## Direct-link path v5 / R1 production verification

- Frontend production ref: annotated tag `phone-server-v5` -> `5a53bdb80b4617161bd39ba2f840c89ce0ea257b`. Tags `phone-server-v3` and `phone-server-v4` were not moved.
- EdgeOne backend code commit: `f8e0dc68045f82bb1e8796a71c5bf54007606562`.
- OpenList-Worker mirror commit: `be724ce5ae3706536ba41c990a4ed7a69df183c5`.
- Production EdgeOne deployment: `dpkn3629vror`, succeeded on 2026-10-01. Build logs show EdgeOne source commit `f8e0dc68045f82bb1e8796a71c5bf54007606562` and frontend checkout `phone-server-v5` at `5a53bdb80b4617161bd39ba2f840c89ce0ea257b`.
- Production environment: `FRONTEND_BUILD_FROM_SOURCE=1`, `FRONTEND_GIT_URL=https://github.com/YYKX682436/OpenList-Frontend.git`, `FRONTEND_GIT_REF=phone-server-v5`, and `VITE_DOWNLOAD_URL=https://dl.mc520.top`.
- Frontend `fsList` and `fsGet` send an ASCII-safe `X-OpenList-Path` alongside the JSON path. JSON remains authoritative. If EdgeOne omits the JSON body, the backend recovers the logical path from this header and applies the existing `getActualPath()` once.

### Canonical path contract and production identity

- The production smoke used the same anonymous principal for `/api/me`, `/api/fs/list`, `/api/fs/get`, and UI copy: `username=guest`, `role=1`, `base_path=/`. No authenticated-admin path was compared to a guest path.
- Production storage `mount_path=/中国移动云盘`; guest `base_path=/`; UI folder pathname and list request path were `/中国移动云盘/安卓定制V`.
- For both target files, `fs/list item.name` was the filename and `fs/list item.raw_path` was `/中国移动云盘/安卓定制V/<filename>`. `fs/get` request path was that same UI file pathname, and `fs/get.raw_path` matched the list item's `raw_path` exactly.
- For the observed production guest, `resolvePath.cleanPath` is `/中国移动云盘/安卓定制V/<filename>`, `resolvePath.relative` is `/安卓定制V/<filename>`, and the 139 resolver's physical path is `/安卓定制V/<filename>` (no configured `root_folder_path`; the driver resolves catalog IDs/content IDs from this path).
- A second `中国移动云盘` segment is valid in the production-shape fixture: `storage.mount_path=/中国移动云盘`, guest `base_path=/中国移动云盘/安卓定制V`, and guest logical path `/中国移动云盘/8076多开_k_n.apk` produce `/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk`. Each segment belongs to a different input namespace. List raw path, get raw path, and signing path preserve the same canonical path. The invalid appended form `.../8076多开_k_n.apk/中国移动云盘/8076多开_k_n.apk` is not produced.
- A guest/admin discrepancy is expected when their `base_path` values differ: `getActualPath(user, reqPath)` applies the requesting principal's base path. Comparing authenticated UI paths with anonymous API paths crosses principals and is not a valid raw-path equality check.

### Same-principal production smoke matrix

All entries below were checked as `guest` with the same browser principal and `base_path=/`.

| File | fs/list raw_path | folder copy + encoded copy | fs/get raw_path | detail copy | direct URL |
| --- | --- | --- | --- | --- | --- |
| `8076多开_k_n.apk` | `/中国移动云盘/安卓定制V/8076多开_k_n.apk` | Both decoded paths exactly equal `fs/list.raw_path` | `/中国移动云盘/安卓定制V/8076多开_k_n.apk` | Decoded path exactly equals `fs/get.raw_path` | `https://dl.mc520.top/d/%E4%B8%AD%E5%9B%BD%E7%A7%BB%E5%8A%A8%E4%BA%91%E7%9B%98/%E5%AE%89%E5%8D%93%E5%AE%9A%E5%88%B6V/8076%E5%A4%9A%E5%BC%80_k_n.apk` |
| `AnyText_1.0.2.apk` | `/中国移动云盘/安卓定制V/AnyText_1.0.2.apk` | Both decoded paths exactly equal `fs/list.raw_path` | `/中国移动云盘/安卓定制V/AnyText_1.0.2.apk` | Decoded path exactly equals `fs/get.raw_path` | `https://dl.mc520.top/d/%E4%B8%AD%E5%9B%BD%E7%A7%BB%E5%8A%A8%E4%BA%91%E7%9B%98/%E5%AE%89%E5%8D%93%E5%AE%9A%E5%88%B6V/AnyText_1.0.2.apk` |

- Both folder -> file click -> detail routes loaded and returned HTTP 200 `fs/get` responses with the expected filename, provider `139Yun`, canonical `raw_path`, and `/api/d/...` `raw_url`. No repeated object path appeared in either copied URL.
- The detail QR dialog rendered for both files. Frontend source generates the QR with `QRCode.toDataURL(currentObjLink(true))`, the same helper used by detail encoded copy. The encoded detail copy's decoded path exactly matched the same-principal `fs/get.raw_path` for both. QR pixels were not independently decoded, so this validates the shared URL source and rendered QR, not a separate QR-image decode.
- Both direct URLs returned GET `200`: 8076 downloaded `281393532` bytes; AnyText downloaded `1898775` bytes. `Range: bytes=0-1023` returned `206` with 1024 bytes and respectively `Content-Range: bytes 0-1023/281393532` and `bytes 0-1023/1898775`.
- HEAD first hop returned `302`; following the 139 provider redirect returned `403`. The provider does not support this HEAD flow. This is recorded and is not an acceptance blocker because GET and Range succeed with the expected response.
- No path duplication was found in either production file's list path, get path, folder copy, encoded folder copy, detail copy, or direct URL.

### 139 metadata lookup and request-body recovery

- `getItem()` only needs metadata and creates the local `/api/d/...` or `/api/p/...` URL itself. Previously `Yun139Driver.get()` fetched an upstream download URL during that metadata lookup, making file-detail loading wait unnecessarily on the provider. `StorageDriver.get` now accepts the generic `needRawUrl` option; `getItem()` passes `false`, and the 139 driver skips `client.getDownloadUrl()` only in metadata-only mode. Raw `/d` calls keep the default and still retrieve the provider URL.
- A separate production failure was caused by EdgeOne intermittently omitting the POST JSON body: `/fs/get` then resolved its default logical path `/`, returning Virtual root metadata for a file route. The generic frontend path header plus backend missing-body fallback fixes this without a 139-specific branch or timeout. Fresh folder-to-detail smokes for both files now return their own metadata.

### Validation

- Frontend: `pnpm test:links` passed (15/15); `pnpm build` passed. `pnpm lint` remains red on existing unrelated Monaco/archive/storage-editor type errors.
- EdgeOne: `npm run test:all` passed (71/71); production build/deployment `dpkn3629vror` succeeded. Existing lint issues remain: duplicate `DbCipher` declaration and missing `ADMIN_PASS` environment typing.
- OpenList-Worker mirror: `npm run test:all` passed (71/71). Existing lint issue remains: duplicate `DbCipher` declaration.
- Regression tests cover omitted body paths for list/get, the exact production-shaped `mount_path` plus longer guest `base_path`, exact canonical list/get/sign agreement, preservation of the legal second `中国移动云盘`, and rejection of the duplicated appended object path.
- Acceptance: `ACCEPTED` for same-principal production list/get/copy/detail, GET, and Range. QR source identity was verified; QR pixels were not independently decoded.
