import prettier from "prettier";
import { relative } from "@std/path/relative";
import { basename } from "@std/path/basename";
import { resolve } from "@std/path/resolve";
import { transpile } from "ts-transpiler";

import { outputtedFiles } from "./outputted-files.ts";

export async function compileAndOutput(
  source: string,
  declarations: string,
  to: string,
) {
  const transpiled = await transpile(source, { jsx: "react" });
  const jsPath = to + ".js";
  const formattedCode = await prettier.format(transpiled, {
    parser: "typescript",
  });
  await Deno.writeTextFile(jsPath, formattedCode);
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
      const relativePath = relative(outDirectory, file);
      const name = basename(relativePath, ".js");
      return `export * from "./${name}";`;
    });

  const out = exports.join("\n") + "\n";
  await compileAndOutput(out, out, resolve(outDirectory, "index"));
}
