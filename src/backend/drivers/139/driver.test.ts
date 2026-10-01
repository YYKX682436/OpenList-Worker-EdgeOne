import test from "node:test"
import assert from "node:assert/strict"
import { Yun139Driver } from "./driver"
import { Yun139Addition } from "./types"
import { calSign } from "./util"

test("Yun139 calculation and signing", () => {
  const sign = calSign("{}", "2026-08-24 16:00:00", "1234567890abcdef")
  assert.ok(sign)
  assert.equal(typeof sign, "string")
  assert.equal(sign.length, 32)
})

test("Yun139Driver instantiation and methods", async () => {
  const addition: Yun139Addition = {
    authorization: Buffer.from(
      "Basic:13800138000:token123|1|1|1780000000000",
    ).toString("base64"),
    type: "personal_new",
  }

  const driver = new Yun139Driver(addition)
  assert.ok(driver)

  // Mock listFiles
  ;(driver as any).client.listFiles = async (catalogId: string) => {
    return {
      folders: [
        {
          catalogID: "cat_101",
          catalogName: "photos",
          updateTime: "2026-08-24T12:00:00Z",
        },
      ],
      files: [
        {
          contentID: "cnt_201",
          contentName: "photo.jpg",
          contentSize: 500000,
          updateTime: "2026-08-24T12:00:00Z",
        },
      ],
    }
  }

  const items = await driver.list("/", "/")
  assert.equal(items.length, 2)
  assert.equal(items[0].name, "photos")
  assert.equal(items[0].is_dir, true)
  assert.equal(items[1].name, "photo.jpg")
  assert.equal(items[1].is_dir, false)
  assert.equal(items[1].size, 500000)

  // Mock getDownloadUrl
  ;(driver as any).client.getDownloadUrl = async (contentId: string) =>
    "https://download.yun.139.com/photo.jpg"

  const link = await driver.link("/photo.jpg", "/photo.jpg")
  assert.equal(link.url, "https://download.yun.139.com/photo.jpg")
})

const makeLookupDriver = () => {
  const driver = new Yun139Driver({
    authorization: Buffer.from(
      "Basic:13800138000:token123|1|1|1780000000000",
    ).toString("base64"),
    type: "personal_new",
  })
  let downloadUrlCalls = 0
  ;(driver as any).client.listFiles = async (catalogId: string) => {
    if (catalogId === "/") {
      return {
        folders: [{ catalogID: "catalog-x", catalogName: "x" }],
        files: [],
      }
    }
    return {
      folders: [],
      files: [
        {
          contentID: "content-a",
          contentName: "a.apk",
          contentSize: "1234",
          createTime: "2026-09-30T00:00:00.000Z",
          updateTime: "2026-10-01T00:00:00.000Z",
          thumbnailURL: "https://thumb.example/a.jpg",
        },
      ],
    }
  }
  ;(driver as any).client.getDownloadUrl = async (id: string) => {
    downloadUrlCalls++
    assert.equal(id, "content-a")
    return "https://download.example/a.apk?token=test"
  }
  return { driver, downloadUrlCalls: () => downloadUrlCalls }
}

test("Yun139 metadata lookup skips upstream download URL", async () => {
  const { driver, downloadUrlCalls } = makeLookupDriver()
  const item = await driver.get("/x/a.apk", "/x/a.apk", {
    needRawUrl: false,
  })

  assert.equal(downloadUrlCalls(), 0)
  assert.equal(item.name, "a.apk")
  assert.equal(item.size, 1234)
  assert.equal(item.modified, "2026-10-01T00:00:00.000Z")
  assert.equal(item.sign, "content-a")
  assert.equal(item.thumb, "https://thumb.example/a.jpg")
  assert.equal(item.type, 0)
  assert.equal(item.raw_url, "")
})

test("Yun139 normal get still obtains the upstream download URL", async () => {
  const { driver, downloadUrlCalls } = makeLookupDriver()
  const item = await driver.get("/x/a.apk", "/x/a.apk")

  assert.equal(downloadUrlCalls(), 1)
  assert.equal(item.raw_url, "https://download.example/a.apk?token=test")
})
