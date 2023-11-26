import prettier from "npm:prettier";
import * as path from "https://deno.land/std@0.204.0/path/mod.ts";
import { transpile } from "https://deno.land/x/ts_transpiler@v0.0.2/mod.ts";

import { outputtedFiles } from "./outputted-files.ts";

export async function compileAndOutput(
  source: string,
  declarations: string,
  to: string,
) {
  const transpiled = await transpile(source, { jsx: "react" });
  const jsPath = to + ".js";
  await Deno.writeTextFile(jsPath, transpiled);
  const declarationsPath = to + ".d.ts";
  const formattedDeclarations = await prettier.format(declarations, {
    parser: "typescript",
  });
  await Deno.writeTextFile(declarationsPath, formattedDeclarations);

  outputtedFiles.push(jsPath, declarationsPath);
}

export async function makeTsIndex(outDirectory: string) {
  const exports = outputtedFiles
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const relativePath = path.relative(outDirectory, file);
      const name = path.basename(relativePath, ".js");
      return `export * from "./${name}";`;
    });

  const out = exports.join("\n") + "\n";
  await compileAndOutput(out, out, path.resolve(outDirectory, "index"));
}
