# Phone Server production deployment

## Domains

- Management domain: `openlist.mc520.top`
- Download domain: `dl.mc520.top`
- Frontend repository: `YYKX682436/OpenList-Frontend`
- Frontend production ref: `phone-server-v3`
- Frontend production commit: `867eba81b409e23096a79b1e7e79e9b8a87cbe4f`

## EdgeOne Makers build variables

Set these non-secret variables for the production environment:

```text
FRONTEND_BUILD_FROM_SOURCE=1
FRONTEND_GIT_URL=https://github.com/YYKX682436/OpenList-Frontend.git
FRONTEND_GIT_REF=phone-server-v3
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

## Direct-link path v3 rollout

- Frontend tag: `phone-server-v3` (annotated), points to `867eba81b409e23096a79b1e7e79e9b8a87cbe4f`.
- EdgeOne backend source commit: `3f1ce1c907bd62d648a600ac7dc57ca4c2795528`.
- EdgeOne production deployment: `dpymdazodv49` (production, successful; 2026-10-01 13:31:36 China Standard Time).
- EdgeOne build log cloned `OpenList-Frontend` from `phone-server-v3` and checked out `867eba81b409e23096a79b1e7e79e9b8a87cbe4f`; the served production bundle contains the `raw_path` contract.
- Production `/fs/list` and `/fs/get` returned canonical `raw_path` values for both target APKs. The folder UI copied encoded direct links, and the observed 8076 link had one canonical path. Production GET returned 200 and Range `bytes=0-1023` returned 206 with the expected `Content-Range` for both files. The EdgeOne first hop returned 302 for GET and HEAD; following the provider redirect for HEAD returned 403.
- Acceptance remains pending: a fresh file-detail route stayed in a loading state, so file-detail copy and QR `currentObjLink` were not verified. The UI copied AnyText from a folder, but its copied path did not match the anonymous `/fs/get` route used for verification. Resolve that authenticated/guest route discrepancy and complete detail, QR, and matching-path smoke before marking v3 accepted.
