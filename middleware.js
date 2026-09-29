// EdgeOne Makers 边缘中间件：SPA 路由回退
//
// cloud-functions/[[default]].js（构建产物，见 scripts/build-edge.mjs）是根级
// catch-all，会接管所有未命中静态文件的
// 请求（包括 /add、/@manage/* 等前端路由），而 Node 函数内没有 ASSETS 绑定，
// Hono 兜底只能返回 404 —— 这就是「访问 /add 404 后整站打不开」的原因。
// 此中间件在边缘层先行拦截：浏览器导航请求（Accept: text/html）且不属于
// 后端路径时，透明改写为 /index.html，由静态 CDN 直接返回页面壳；
// /api、/d、/p、/sd、/health 等后端路径照常放行到云函数。
//
// 注意：EdgeOne 的 middleware 属于轻量中间件，context 仅提供
// request / next / redirect / rewrite / geo / clientIp，**没有 env**，
// 因此无法访问 KV 或环境变量。KV 代理请使用 functions/ 目录下的
// Edge Functions（见 functions/kv-get 等），那里才具备 KV 能力。
export function middleware(context) {
  const { request, next, rewrite } = context
  const requestUrl = new URL(request.url)
  const { pathname } = requestUrl
  const host = (request.headers.get("host") || requestUrl.hostname).split(":")[0].toLowerCase()
  const accept = request.headers.get("accept") || ""

  // The production download hostname is intentionally narrower than the
  // management/default deployment hostname.  Keep /d/* available for direct
  // redirects, while preventing casual public access to the admin UI/API and
  // WebDAV surface.  This is a deployment route-layer policy; it does not
  // alter OpenList application behavior on the management hostname.
  const isProductionDownloadHost = host === "dl.mc520.top"
  const isManagementPath = /^\/(?:@manage|@login|api\/(?:admin|auth)|dav)(?:\/|$)/.test(pathname)
  if (isProductionDownloadHost && isManagementPath) {
    return new Response("Not Found", { status: 404 })
  }

  const isBackend =
    pathname === "/health" || /^\/(api|d|p|sd|kv-get|kv-put|kv-delete|kv-list)(\/|$)/.test(pathname)

  if (
    !isBackend &&
    (request.method === "GET" || request.method === "HEAD") &&
    accept.includes("text/html")
  ) {
    return rewrite("/index.html")
  }

  return next()
}
