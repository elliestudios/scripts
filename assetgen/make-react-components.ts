import { resolve } from "@std/path/resolve";

import { compileAndOutput } from "./compile-ts.ts";
import { svgToReact } from "./utils.ts";
import { outputDirectory } from "./options.ts";

const ts = String.raw;

async function makeAssetComponent(assetName: string, svgSource: string) {
  const n = assetName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const componentName = n[0].toUpperCase() + n.slice(1);

  const { svg, variables } = svgToReact(svgSource);

  const varDeclarations = Object.entries(variables)
    .map(([color, jsVar]) => `const ${jsVar} = getColor(color, "${color}");`)
    .join("\n");

  await compileAndOutput(
    ts`
      import React from "react";

      import { getColor } from "./colors";

      export function ${componentName}({ color = "default", ...rest } = {}) {
        ${varDeclarations}

        return (
          ${svg}
        );
      }
    `,
    ts`
      import type { SVGProps } from "react";

      type ${componentName}Props = { color?: "default" | "light" | "dark" | "currentColor" } & SVGProps<SVGSVGElement>;

      export function ${componentName}(props: ${componentName}Props): JSX.Element;
    `,
    resolve(outputDirectory, assetName),
  );
}

export async function makeReactComponents({
  assets,
  colors,
}: {
  assets: Record<string, string>;
  colors: unknown;
}) {
  await compileAndOutput(
    ts`
      export const colors = ${JSON.stringify(colors)};

      export function getColor(mode: string, color: string) {
        if (color === "currentColor") return "currentColor";

        return colors[mode]?.[color] ??
          colors.default?.[color] ??
          colors.light?.[color] ??
          colors.dark?.[color];
      }
    `,
    ts`
      export const colors: ${JSON.stringify(colors)};

      export function getColor(mode: string, color: string): string | undefined;
    `,
    resolve(outputDirectory, "colors"),
  );

  for (const [fileName, svgSource] of Object.entries(assets)) {
    const assetName = /source-(.*)\.svg/.exec(fileName)?.[1];
    if (assetName == null) {
      throw new Error(`Invalid asset name: ${fileName}`);
    }
    await makeAssetComponent(assetName, svgSource);
  }
}
