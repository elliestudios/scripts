import { build, emptyDir } from "@deno/dnt";

await emptyDir("./npm");

await build({
  entryPoints: [
    {
      kind: "bin",
      path: "./assetgen/mod.ts",
      name: "assetgen",
    },
    {
      kind: "bin",
      path: "./envgen/mod.ts",
      name: "envgen",
    },
  ],
  outDir: "./npm",
  scriptModule: false,
  typeCheck: false,
  compilerOptions: {
    lib: ["ESNext", "DOM"],
  },
  shims: {
    deno: true,
    crypto: true,
  },
  package: {
    // package.json properties
    name: "@elliestudios/scripts",
    version: Deno.args[0]?.replace(/^v/, ""),
    description:
      "These are some scripts that I use to make websites a bit quicker.",
    license: "UNLICENSED",
    repository: {
      type: "git",
      url: "git+https://github.com/elliestudios/scripts.git",
    },
    bugs: {
      url: "https://github.com/elliestudios/scripts/issues",
    },
  },
  async postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
    const res = await fetch(
      "https://deno.land/x/ts_transpiler@v0.0.2/js/transpiler_bg.wasm",
    );
    await Deno.writeFile(
      "npm/esm/deps/deno.land/x/ts_transpiler@v0.0.2/js/transpiler_bg.wasm",
      new Uint8Array(await res.arrayBuffer()),
    );
  },
});
