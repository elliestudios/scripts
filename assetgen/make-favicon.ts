import { fromPNGs as pngsToIco } from "https://raw.githubusercontent.com/dotellie/ICO/7b4ac8e0f9c58681d786a222bacd58cc9758b129/Source/mod.ts";
import { resolve } from "https://deno.land/std@0.204.0/path/resolve.ts";
import prettier from "npm:prettier";

import { compileAndOutput } from "./compile-ts.ts";
import { makePngs, makeQuickWriteFn } from "./utils.ts";
import { outputDirectory } from "./options.ts";

const ts = String.raw;

export async function makeFavicon(svgSource: string) {
  const pngs = makePngs(svgSource, [32, 180, 192, 512]);

  const w = makeQuickWriteFn(resolve(outputDirectory, "public"));

  const faviconBytes = await pngsToIco([pngs[32]]);

  if (faviconBytes == null) {
    throw new Error("Failed to create favicon");
  }

  await w("icon.svg", svgSource);
  await w("favicon.ico", faviconBytes);
  await w("apple_touch_icon.png", pngs[180]);
  await w("192.png", pngs[192]);
  await w("512.png", pngs[512]);
  await w(
    "manifest.webmanifest",
    await prettier.format(
      JSON.stringify({
        icons: [
          {
            src: "/192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      }),
      {
        parser: "json",
      },
    ),
  );

  await compileAndOutput(
    ts`
      import type { Metadata } from "next";

      export const faviconMetadata: Metadata = {
        manifest: "/manifest.webmanifest",
        icons: {
          icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/icon.svg", type: "image/svg+xml" },
          ],
          apple: {
            url: "/apple_touch_icon.png",
            type: "image/svg+xml",
          },
        },
      }
    `,
    ts`
      import type { Metadata } from "next";

      export const faviconMetadata: Metadata;
    `,
    resolve(outputDirectory, "favicon-metadata"),
  );
}
