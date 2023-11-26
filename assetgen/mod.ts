import * as path from "https://deno.land/std@0.204.0/path/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";

import { makeTsIndex } from "./compile-ts.ts";
import { detectColors } from "./detect-color.ts";
import { makeFavicon } from "./make-favicon.ts";
import { makeReactComponents } from "./make-react-components.ts";
import { makeScss } from "./make-scss.ts";
import { getColor, transformSvgVariables } from "./utils.ts";
import { outputtedFiles } from "./outputted-files.ts";
import { inputDirectory, outputDirectory, setDirectories } from "./options.ts";

function isAsset(file: string) {
  return file.startsWith("source-") && file.endsWith(".svg");
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSources(inputFiles: Record<string, string>) {
  for (const [fileName, contents] of Object.entries(inputFiles)) {
    if (!isAsset(fileName)) continue;

    assert(
      !contents.includes("currentColor"),
      `${fileName} cannot contain currentColor`,
    );
    const colors = detectColors(contents);
    assert(
      colors.length === 0,
      `${fileName} cannot contain raw colors - use variables instead. (var(--color))\nFound: ${colors.join(
        ", ",
      )}`,
    );
  }
}

async function generate(inputFiles: Record<string, string>) {
  assert(inputFiles["source-favicon.svg"], "Missing source-favicon.svg");
  assert(inputFiles["colors.json"], "Missing colors.json");
  assertSources(inputFiles);

  // Clean up build directory
  await Deno.remove(outputDirectory, {
    recursive: true,
  }).catch(() => {});

  const outputtedFiles: string[] = [];

  const favicon = inputFiles["source-favicon.svg"];

  const colors: unknown = JSON.parse(inputFiles["colors.json"]);

  const coloredFavicon = transformSvgVariables(favicon, (variable) =>
    getColor(colors, "default", variable),
  );

  await Deno.mkdir(path.resolve(outputDirectory, "public"), {
    recursive: true,
  });
  await Deno.writeTextFile(
    path.resolve(outputDirectory, "favicon.svg"),
    coloredFavicon,
  );

  await makeFavicon(coloredFavicon);
  const assets = Object.fromEntries(
    Object.entries(inputFiles).filter(([fileName]) => isAsset(fileName)),
  );
  await makeScss(JSON.parse(inputFiles["colors.json"]));
  await makeReactComponents({ assets, colors });

  await makeTsIndex(outputDirectory);

  return outputtedFiles;
}

/**
 * Reads all input files present in the `inputFiles` array
 */
async function readInputFiles(
  inputFiles: string[],
): Promise<Record<string, string>> {
  const input: Record<string, string> = {};

  for (const file of inputFiles) {
    input[file] = await Deno.readTextFile(path.resolve(inputDirectory, file));
  }

  return input;
}

/*
 * [Entrypoint]
 *
 * --watch: Watch for changes in source.svg and rebuild
 * --listFiles: Output list of all files
 */

await new Command()
  .name("envgen")
  .version("0.1.0")
  .description("Generate asset files from SVGs and colors.json")
  .option("-w --watch", "Watch for changes and rebuild")
  .option("-l --listFiles", "Output list of all files")
  .option("-i --input <input:string>", "Input directory", {
    default: "source",
  })
  .option("-o --output <output:string>", "Output directory", {
    default: "build",
  })
  .action(async (options) => {
    setDirectories(path.resolve(options.input), path.resolve(options.output));

    const sourceFiles = (await Array.fromAsync(Deno.readDir(inputDirectory)))
      .map((entry) => entry.name)
      .filter(isAsset);
    const inputFiles = ["colors.json", ...sourceFiles];

    await generate(await readInputFiles(inputFiles));

    if (options.watch) {
      console.log("Assets built. Watching for changes...");

      const watcher = Deno.watchFs(
        inputFiles.map((file) => path.resolve(inputDirectory, file)),
      );
      for await (const _ of watcher) {
        try {
          await generate(await readInputFiles(inputFiles));
          console.log("Assets rebuilt!");
        } catch (e) {
          console.error("Assets failed to build: ", e);
        }
      }
    }

    console.log(`Outputted files to ${outputDirectory}`);

    if (options.listFiles) {
      // Output list of all files
      outputtedFiles.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      );
      for (const file of outputtedFiles) {
        console.log("==> " + file);
      }
    }
  })
  .parse(Deno.args);
