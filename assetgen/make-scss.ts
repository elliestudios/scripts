import prettier from "npm:prettier";
import { resolve } from "https://deno.land/std@0.204.0/path/resolve.ts";

import { outputDirectory } from "./options.ts";

const scss = String.raw;

async function output(fileName: string, contents: string) {
  const outputPath = resolve(outputDirectory, fileName);
  const formattedContents = await prettier.format(contents, { parser: "scss" });
  return await Deno.writeTextFile(outputPath, formattedContents);
}

export async function makeScss(colors: Record<string, Record<string, string>>) {
  const defaultColors = colors.default ?? {};
  const darkColors = colors.dark ?? {};
  const lightColors = colors.light ?? {};

  await output(
    "colors.scss",
    scss`
      /* SASS variables */
      ${
      Object.entries(defaultColors)
        .map(([name, value]) => `$${name}: ${value};`)
        .join("\n")
    }

      ${
      Object.entries(darkColors)
        .map(([name, value]) => `$${name}-dark: ${value};`)
        .join("\n")
    }

      ${
      Object.entries(lightColors)
        .map(([name, value]) => `$${name}-light: ${value};`)
        .join("\n")
    }

      :root {
        ${
      Object.entries(defaultColors)
        .map(([name, value]) => `--${name}: ${value};`)
        .join("\n")
    }
      }
    `,
  );

  const darkScss = scss`
    @media(prefers-color-scheme: dark) {
      :root { 
        ${
    Object.entries(darkColors)
      .map(([name, value]) => `--${name}: ${value};`)
      .join("\n")
  }
      }
    }
  `;

  const lightScss = scss`
    @media(prefers-color-scheme: light) {
      :root {
        ${
    Object.entries(lightColors)
      .map(([name, value]) => `--${name}: ${value};`)
      .join("\n")
  }
      }
    }
  `;

  output(
    "colors-automatic.scss",
    scss`
      :root {
        color-scheme: light dark;
      }

      ${darkScss}

      ${lightScss}
    `,
  );

  output(
    "colors-dark.scss",
    scss`
      :root {
        color-scheme: dark;
      }

      ${darkScss}
  `,
  );

  output(
    "colors-light.scss",
    scss`
      :root { 
        color-scheme: light;
      }

      ${lightScss}
  `,
  );
}
