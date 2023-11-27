import { Resvg } from "npm:@resvg/resvg-js";
import type { Buffer } from "node:buffer";
import { resolve } from "https://deno.land/std@0.204.0/path/resolve.ts";

import { outputtedFiles } from "./outputted-files.ts";

export function getColor(colors: unknown, mode: string, color: string) {
  if (typeof colors !== "object" || colors == null) {
    throw new Error("Expected colors to be an object");
  }
  if (
    !(mode in colors) &&
    !("default" in colors) &&
    !("light" in colors) &&
    !("dark" in colors)
  ) {
    throw new Error("Expected colors to have a default, light, or dark key");
  }
  const c = colors as Record<string, Record<string, string>>;
  return (
    c[mode]?.[color] ??
      c.default?.[color] ??
      c.light?.[color] ??
      c.dark?.[color]
  );
}

/**
 * Allows conversion of `"var(--variable)"` to something else
 *
 * @returns the resulting svg
 */
export function transformSvgVariables(
  svg: string,
  getReplacement: (variable: string) => string,
) {
  return svg.replace(/var\(--([a-z0-9-]+)\)/g, (_, variable) => {
    return getReplacement(variable);
  });
}

/**
 * Makes an SVG into JSX
 *
 * @param svg
 */
export function svgToReact(svg: string): {
  svg: string;
  variables: Record<string, string>;
} {
  const vars = new Map();

  const outSvg = svg
    .replace(
      // Replace attributes with camelCase
      /([a-z-]+)=/g,
      (_, attribute) =>
        attribute.replace(
          /-([a-z])/g,
          (_: unknown, letter: string) => letter.toUpperCase(),
        ) + "=",
    )
    .replace(/="var\(--(.+?)\)"/g, (_, varName) => {
      // Replace CSS variables with JS variables
      const camelCased = varName.replace(
        /-([a-z0-9])/g,
        (_: unknown, letter: string) => letter.toUpperCase(),
      );
      vars.set(varName, camelCased);
      return `={${camelCased}}`;
    })
    .replace(
      // Add {...rest} at the end of the svg tag
      /<svg([^>]+)>/,
      (_, c) => `<svg${c} {...rest}>`,
    );

  return { svg: outSvg, variables: Object.fromEntries(vars.entries()) };
}

/**
 * Converts an svg source to various sizes of pngs
 *
 * @param source svg source
 * @param sizes the sizes to generate
 */
export function makePngs(source: string, sizes: number[]) {
  const out: Record<number, Buffer> = {};

  for (const size of sizes) {
    const resvg = new Resvg(source, {
      fitTo: {
        mode: "width",
        value: size,
      },
      font: {
        loadSystemFonts: false,
      },
    });
    const data = resvg.render();
    out[size] = data.asPng();
  }

  return out;
}

/**
 * Creates a function that writes a file to a directory
 *
 * @param dir The directory to write to
 */
export function makeQuickWriteFn(dir: string) {
  return async (file: string, data: string | Buffer | Uint8Array) => {
    const outPath = resolve(dir, file);

    const bytes = typeof data === "string"
      ? new TextEncoder().encode(data)
      : new Uint8Array(data);

    return await Deno.writeFile(outPath, bytes).then((r) => {
      outputtedFiles.push(outPath);
      return r;
    });
  };
}
