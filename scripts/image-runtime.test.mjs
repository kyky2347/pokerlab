import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { assertVersionAtLeast } from "./assert-version.mjs";

// This path works in both the checkout and the final standalone Docker image.
const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const nextRequire = createRequire(webRequire.resolve("next/package.json"));
const sharp = nextRequire("sharp");
const { imageOptimizer } = nextRequire("./dist/server/image-optimizer");
const { defaultConfig } = nextRequire("./dist/server/config-shared");

function optimize(buffer) {
  return imageOptimizer(
    // A deliberately misleading MIME label must never override byte detection.
    {
      buffer,
      contentType: "image/png",
      cacheControl: "max-age=60",
      etag: "fixture",
    },
    { href: "/fixture.png", width: 2, quality: 75, mimeType: "image/webp" },
    {
      ...defaultConfig,
      images: { ...defaultConfig.images, dangerouslyAllowSVG: false },
    },
    { isDev: false, silent: true },
  );
}

for (const brand of ["avif", "heic"]) {
  test(`image optimizer rejects SVG disguised by ${brand} brand bytes`, async () => {
    // Inert, tiny SVG: no scripts, links, entities, large dimensions or network.
    // Before 16.4.5 the comment matched unchecked ISO-BMFF signature offsets.
    const svg = Buffer.from(
      `<!--ftyp${brand}--><svg xmlns="http://www.w3.org/2000/svg" width="4" height="6">` +
        '<rect width="4" height="6" fill="#ff0000"/></svg>',
    );
    await assert.rejects(optimize(svg), (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /image type is not allowed/);
      return true;
    });
  });
}

for (const format of ["png", "avif"]) {
  test(`image optimizer still resizes valid ${format} input`, async () => {
    const source = await sharp({
      create: {
        width: 4,
        height: 6,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .toFormat(format)
      .toBuffer();
    const result = await optimize(source);
    assert.equal(result.contentType, "image/webp");
    const metadata = await sharp(result.buffer).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 2);
    assert.equal(metadata.height, 3);
  });
}

test("Next.js loads patched sharp and the actual patched native librsvg", (context) => {
  assertVersionAtLeast(sharp.versions.sharp, "0.35.5", "sharp");
  assertVersionAtLeast(sharp.versions.rsvg, "2.63.2", "librsvg");
  context.diagnostic(
    `sharp=${sharp.versions.sharp}, librsvg=${sharp.versions.rsvg}`,
  );
});

test("native SVG decoding produces the expected PNG pixels", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3">' +
      '<rect width="2" height="3" fill="#ff0000"/></svg>',
  );
  const { data: png, info } = await sharp(svg)
    .png()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.format, "png");
  assert.equal(info.width, 2);
  assert.equal(info.height, 3);
  const raw = await sharp(png).ensureAlpha().raw().toBuffer();
  assert.deepEqual(
    raw,
    Buffer.from(Array.from({ length: 6 }, () => [255, 0, 0, 255]).flat()),
  );
});

test("native lossless WebP encoding and resizing remain functional", async () => {
  const input = {
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 0, g: 128, b: 255, alpha: 1 },
    },
  };
  const { data, info } = await sharp(input)
    .resize(4, 6, { kernel: "nearest" })
    .webp({ lossless: true })
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.format, "webp");
  assert.equal(info.width, 4);
  assert.equal(info.height, 6);
  const raw = await sharp(data).ensureAlpha().raw().toBuffer();
  assert.deepEqual(
    raw,
    Buffer.from(Array.from({ length: 24 }, () => [0, 128, 255, 255]).flat()),
  );
});

test("unsupported image input is rejected", async () => {
  await assert.rejects(sharp(Buffer.from("not an image")).metadata());
});
