# Phone Server production deployment

## Domains

- Management domain: `openlist.mc520.top`
- Download domain: `dl.mc520.top`
- Frontend repository: `YYKX682436/OpenList-Frontend`
- Frontend production ref: `phone-server-v2`
- Frontend production commit: `24a14ca5a5a3a6aae39690e037e7209b91915a09`

## EdgeOne Makers build variables

Set these non-secret variables for the production environment:

```text
FRONTEND_BUILD_FROM_SOURCE=1
FRONTEND_GIT_URL=https://github.com/YYKX682436/OpenList-Frontend.git
FRONTEND_GIT_REF=phone-server-v2
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
