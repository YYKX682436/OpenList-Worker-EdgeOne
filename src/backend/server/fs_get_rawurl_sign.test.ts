import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { Hono } from "hono"
import { fsRouter } from "./fs"
import { rawRouter } from "./raw"
import { Yun139Driver } from "../drivers/139/driver"
import { Yun139ApiClient } from "../drivers/139/util"
import { resolvePath, saveDb } from "../internal/model/db"
import { verifyDownloadSign } from "../pkg/sign"

/**
 * Issue #66 回归测试：[BUG] sign verify failed（下载 401，预览正常）。
 *
 * 现象（issue 原文）：
 *   GET https://xxx/api/p/存储1/7z2602-x64.exe → HTTP/2 401
 *   「下载文件出现 sign verify failed，不下载文件直接预览是正常的」
 *
 * 根因：/fs/get 返回的 raw_url 形如 `/api/p/<path>`，指向的正是需要验签的
 * /p 端点，但**从来没带 ?sign=**；而前端把 raw_url 直接当下载地址用
 *   - 预览页的下载按钮：<a href={objStore.raw_url}>（previews/download.tsx）
 *   - 图片/视频预览：<img src={objStore.raw_url}> / <video src={...}>
 * 不会再自己拼签名（只有文件列表里的 /d、/p 链接才会用 fs/list 返回的 sign）。
 *
 * 于是 sign_all / 存储级 enable_sign / 密码 meta 覆盖时：
 *   - .exe 这类「预览页只是元信息 + 下载按钮」的文件，页面能正常打开，
 *     一点下载就 401 —— 正是 issue 描述的现象；
 * 而 Go 版 server/handles/fsread.go FsGet 会显式补上：
 *   if isEncrypt(meta, reqPath) || setting.GetBool(conf.SignAll) {
 *       query = "?sign=" + sign.Sign(reqPath)
 *   }
 */

const tmpRoots: string[] = []

/** 建一个临时目录并放入一个真实文件，挂成 Local 存储的根。 */
function makeLocalRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-rawurl-sign-"))
  fs.writeFileSync(path.join(root, "a.exe"), "MZ")
  tmpRoots.push(root)
  return root
}

const dbWith = (
  root: string,
  settings: Array<{ key: string; value: string }> = [],
  basePath = "/",
  mountPath = "/local",
) => ({
  settings,
  users: [
    {
      id: 1,
      username: "guest",
      password: "xxx",
      role: 1,
      permission: 0,
      base_path: basePath,
      disabled: false,
    },
  ],
  storages: [
    {
      id: "s1",
      driver: "Local",
      mount_path: mountPath,
      addition: JSON.stringify({ root_folder_path: root }),
      modified: "2026-01-01T00:00:00.000Z",
      disabled: false,
    },
  ],
  shares: [],
  metas: [],
})

const appOf = () => {
  const app = new Hono()
  app.route("/api/fs", fsRouter)
  app.route("/api/p", rawRouter)
  app.route("/api/d", rawRouter)
  return app
}

const signOf = (rawUrl: string) =>
  new URL(rawUrl, "http://localhost").searchParams.get("sign") || ""

test("fs/get: raw_url 自带签名，且该签名能通过 /p 验签（Issue #66）", async () => {
  const env: any = {}
  const root = makeLocalRoot()
  await saveDb(dbWith(root, [{ key: "sign_all", value: "true" }]), env)

  const app = appOf()
  const res = await app.request("/api/fs/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/local/a.exe" }),
  })
  const body: any = await res.json()
  assert.equal(body.code, 200, `fs/get failed: ${JSON.stringify(body)}`)

  const rawUrl: string = body.data.raw_url
  assert.ok(
    rawUrl.startsWith("/api/p/local/a.exe"),
    `raw_url should stay a proxy url, got ${rawUrl}`,
  )
  // 缺这一条就是 bug 本体：前端直接跳 raw_url，服务器却没拿到签名
  assert.ok(
    /[?&]sign=/.test(rawUrl),
    `raw_url must carry the download sign, got ${rawUrl}`,
  )
  // 客户端用的 sign 字段与 raw_url 里的必须一致（前端另一处用它拼 /d 链接）
  assert.equal(signOf(rawUrl), body.data.sign)
  assert.equal(await verifyDownloadSign(env, "/local/a.exe", body.data.sign), true)

  // 端到端：浏览器直接打开 raw_url 不能再 401（issue 里就是这一步）
  const hit = await app.request(rawUrl, { method: "GET" })
  assert.notEqual(
    hit.status,
    401,
    "raw_url returned by /fs/get must be accepted by /p (was 401 before the fix)",
  )
})

test("fs/get: returns one canonical raw_path including the user's base_path", async () => {
  const env: any = {}
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-base-path-get-"))
  fs.writeFileSync(path.join(root, "8076多开_k_n.apk"), "APK")
  tmpRoots.push(root)
  const basePath = "/中国移动云盘/安卓定制V"
  await saveDb(
    dbWith(root, [{ key: "sign_all", value: "true" }], basePath, basePath),
    env,
  )

  const res = await appOf().request("/api/fs/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/8076多开_k_n.apk" }),
  })
  const body: any = await res.json()
  assert.equal(body.code, 200, `fs/get failed: ${JSON.stringify(body)}`)
  const expected = `${basePath}/8076多开_k_n.apk`
  assert.equal(body.data.raw_path, expected)
  assert.equal(
    await verifyDownloadSign(env, expected, body.data.sign),
    true,
    "fs/get sign must be issued for the exact raw_path",
  )
  assert.equal(body.data.raw_path.split(basePath).length - 1, 1)
})

test("fs/list: item raw_path equals the one canonical path used for signing", async () => {
  const env: any = {}
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-base-path-list-"))
  fs.writeFileSync(path.join(root, "8076多开_k_n.apk"), "APK")
  tmpRoots.push(root)
  const basePath = "/中国移动云盘/安卓定制V"
  await saveDb(
    dbWith(root, [{ key: "sign_all", value: "true" }], basePath, basePath),
    env,
  )

  const res = await appOf().request("/api/fs/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/" }),
  })
  const body: any = await res.json()
  assert.equal(body.code, 200, `fs/list failed: ${JSON.stringify(body)}`)
  const item = body.data.content.find(
    (entry: any) => entry.name === "8076多开_k_n.apk",
  )
  assert.ok(item, "fs/list should return the fixture file")
  const expected = `${basePath}/8076多开_k_n.apk`
  assert.equal(item.raw_path, expected)
  assert.equal(
    await verifyDownloadSign(env, expected, item.sign),
    true,
    "fs/list sign must be issued for the exact raw_path",
  )
  assert.equal(item.raw_path.split(basePath).length - 1, 1)
})

test("production path shape preserves the second mount-name segment", async () => {
  const env: any = {}
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openlist-139-shape-"))
  const relativeDir = path.join("安卓定制V", "中国移动云盘")
  fs.mkdirSync(path.join(root, relativeDir), { recursive: true })
  fs.writeFileSync(path.join(root, relativeDir, "8076多开_k_n.apk"), "APK")
  tmpRoots.push(root)

  const basePath = "/中国移动云盘/安卓定制V"
  const mountPath = "/中国移动云盘"
  await saveDb(
    dbWith(
      root,
      [{ key: "sign_all", value: "true" }],
      basePath,
      mountPath,
    ),
    env,
  )

  const app = appOf()
  const listed = await app.request("/api/fs/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/中国移动云盘" }),
  })
  const listBody: any = await listed.json()
  assert.equal(listBody.code, 200, `fs/list failed: ${JSON.stringify(listBody)}`)
  const listItem = listBody.data.content.find(
    (entry: any) => entry.name === "8076多开_k_n.apk",
  )
  assert.ok(listItem, "fs/list should return the mounted file")

  const got = await app.request("/api/fs/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/中国移动云盘/8076多开_k_n.apk" }),
  })
  const getBody: any = await got.json()
  assert.equal(getBody.code, 200, `fs/get failed: ${JSON.stringify(getBody)}`)

  const expected =
    "/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk"
  assert.equal(listItem.raw_path, expected)
  assert.equal(getBody.data.raw_path, expected)
  assert.equal(listItem.raw_path, getBody.data.raw_path)
  assert.notEqual(
    getBody.data.raw_path,
    `${expected}/中国移动云盘/8076多开_k_n.apk`,
    "the canonical file path must not be appended to itself",
  )
  assert.equal(
    await verifyDownloadSign(env, expected, listItem.sign),
    true,
    "fs/list signs the same canonical path it returns",
  )
  assert.equal(
    await verifyDownloadSign(env, expected, getBody.data.sign),
    true,
    "fs/get signs the same canonical path it returns",
  )

  const resolved: any = await resolvePath(expected, env)
  assert.equal(resolved.cleanPath, expected)
  assert.equal(
    resolved.relative,
    "/安卓定制V/中国移动云盘/8076多开_k_n.apk",
  )
  assert.equal(
    resolved.physical,
    path.join(root, "安卓定制V", "中国移动云盘", "8076多开_k_n.apk").replace(/\\/g, "/"),
  )
})

test("139 fs/get skips upstream link while /d resolves it on demand", async () => {
  const env: any = {}
  const storageId = `139-metadata-${Date.now()}-${Math.random()}`
  const basePath = "/中国移动云盘/安卓定制V"
  const mountPath = "/中国移动云盘"
  const canonicalPath =
    "/中国移动云盘/安卓定制V/中国移动云盘/8076多开_k_n.apk"
  const downloadUrl =
    "https://ykj-eos-wx2-01.eos-wuxi-3.cmecloud.cn/metadata-test.apk?mock=1"
  let downloadUrlCalls = 0

  const originalInit = Yun139ApiClient.prototype.init
  const originalListFiles = Yun139ApiClient.prototype.listFiles
  const originalGetDownloadUrl = Yun139ApiClient.prototype.getDownloadUrl
  Yun139ApiClient.prototype.init = async function () {}
  Yun139ApiClient.prototype.listFiles = async function (folderId = "/") {
    if (folderId === "/") {
      return {
        folders: [
          { catalogID: "catalog-v", catalogName: "安卓定制V" },
        ],
        files: [],
      }
    }
    if (folderId === "catalog-v") {
      return {
        folders: [
          { catalogID: "catalog-cloud", catalogName: "中国移动云盘" },
        ],
        files: [],
      }
    }
    return {
      folders: [],
      files: [
        {
          contentID: "content-8076",
          contentName: "8076多开_k_n.apk",
          contentSize: "281393532",
          createTime: "2026-09-28T12:48:53.885+08:00",
          updateTime: "2026-09-28T12:48:53.885+08:00",
        },
      ],
    }
  }
  Yun139ApiClient.prototype.getDownloadUrl = async function (contentId) {
    downloadUrlCalls++
    assert.equal(contentId, "content-8076")
    return downloadUrl
  }

  try {
    await saveDb(
      {
        settings: [],
        users: [
          {
            id: 1,
            username: "guest",
            password: "unused",
            role: 1,
            permission: 0,
            base_path: basePath,
            disabled: false,
          },
        ],
        storages: [
          {
            id: storageId,
            driver: "139Yun",
            mount_path: mountPath,
            addition: JSON.stringify({
              authorization: Buffer.from(
                "Basic:13800138000:token123|1|1|1780000000000",
              ).toString("base64"),
              type: "personal_new",
            }),
            modified: new Date().toISOString(),
            disabled: false,
          },
        ],
        shares: [],
        metas: [],
      } as any,
      env,
    )

    const app = appOf()
    const metadata = await app.request("/api/fs/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/中国移动云盘/8076多开_k_n.apk" }),
    })
    const metadataBody: any = await metadata.json()
    assert.equal(metadata.status, 200)
    assert.equal(metadataBody.code, 200)
    assert.equal(metadataBody.data.name, "8076多开_k_n.apk")
    assert.equal(metadataBody.data.raw_path, canonicalPath)
    assert.equal(
      metadataBody.data.raw_url,
      "/api/d/%E4%B8%AD%E5%9B%BD%E7%A7%BB%E5%8A%A8%E4%BA%91%E7%9B%98/%E5%AE%89%E5%8D%93%E5%AE%9A%E5%88%B6V/%E4%B8%AD%E5%9B%BD%E7%A7%BB%E5%8A%A8%E4%BA%91%E7%9B%98/8076%E5%A4%9A%E5%BC%80_k_n.apk",
    )
    assert.equal(
      downloadUrlCalls,
      0,
      "fs/get metadata must not request the 139 download URL",
    )

    const encodedPath = canonicalPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
    const download = await app.request(`/api/d${encodedPath}`, {
      method: "GET",
    })
    assert.equal(download.status, 302)
    assert.equal(download.headers.get("Location"), downloadUrl)
    assert.equal(downloadUrlCalls, 1, "/d must resolve the provider URL")
  } finally {
    Yun139ApiClient.prototype.init = originalInit
    Yun139ApiClient.prototype.listFiles = originalListFiles
    Yun139ApiClient.prototype.getDownloadUrl = originalGetDownloadUrl
  }
})

test("fs/get: 不需要签名时不追加 sign（保持公开直链语义）", async () => {
  const env: any = {}
  const root = makeLocalRoot()
  await saveDb(dbWith(root), env)

  const res = await appOf().request("/api/fs/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/local/a.exe" }),
  })
  const body: any = await res.json()
  assert.equal(body.code, 200)
  assert.equal(body.data.sign, "")
  assert.equal(
    body.data.raw_url,
    "/api/p/local/a.exe",
    "public path keeps a bare proxy url",
  )
})

test("/p 幂等：raw_url 中的签名被篡改即 401（对照，证明断言有效）", async () => {
  const env: any = {}
  const root = makeLocalRoot()
  await saveDb(dbWith(root, [{ key: "sign_all", value: "true" }]), env)

  const app = appOf()
  const res = await app.request("/api/fs/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "/local/a.exe" }),
  })
  const body: any = await res.json()
  const sign: string = body.data.sign
  const tampered = sign.slice(0, -1) + (sign.endsWith("a") ? "b" : "a")

  const hit = await app.request(
    `/api/p/local/a.exe?sign=${encodeURIComponent(tampered)}`,
    { method: "GET" },
  )
  assert.equal(hit.status, 401)
})

test("cleanup", () => {
  for (const root of tmpRoots) {
    try {
      fs.rmSync(root, { recursive: true, force: true })
    } catch {}
  }
})
