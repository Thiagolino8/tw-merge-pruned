import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { findPackageJSON } from "node:module";
import { createGenerator } from "tw-merge-pruned";
import { tailwindMergePlugin } from "tw-merge-pruned/vite";

const inventory = [
  "p-0 p-2 p-4 p-6 px-2 px-4 py-2 w-4 h-4 size-4 w-8",
  "text-sm text-lg text-sm/5 text-base/6 text-red-500 text-brand-red leading-none leading-tight",
  "bg-red-500 bg-blue-500 bg-black/50 border border-2 border-red-500",
  "rounded rounded-md rounded-lg shadow-sm flex grid hidden block gap-2 gap-4",
  "[--widget:a] [--widget:b] text-(--fixture) hover:p-2 focus:p-4 !text-sm/5",
  "custom custom constructor __proto__ toString icon-check",
].join(" ");

const createProject = (options = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), "tw merge pruned-"));
  const sourceDir = path.join(root, options.sourceDir ?? "src");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  const source = path.join(sourceDir, "component.tsx");
  writeFileSync(source, `export const classes = ${JSON.stringify(inventory)};`);
  return { root, source, generator: createGenerator({ root, ...options }) };
};

await test("isola projetos, aceita caminhos com espaços e recria cache corrompido", () => {
  const first = createProject();
  const second = createProject({
    sourceDir: "frontend",
    output: "generated/merge.ts",
  });
  try {
    writeFileSync(second.source, 'export const classes = "p-2 text-(--second)";');
    const initial = first.generator.generateMergeData();
    const alternate = second.generator.generateMergeData();
    assert.ok(alternate.classes.includes("text-(--second)"));
    assert.ok(!initial.classes.includes("text-(--second)"));
    const cold = createGenerator({ root: first.root }).generateMergeData();
    assert.equal(cold.content, initial.content);
    writeFileSync(path.join(first.root, ".cache/tw-merge-pruned.json"), "{");
    assert.equal(
      createGenerator({ root: first.root }).generateMergeData().content,
      initial.content,
    );
    assert.equal(readFileSync(second.generator.output, "utf8").includes('"./merge-data.ts"'), true);
    assert.ok(!second.generator.collectClasses().includes("modifiers"));
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});

await test("coleta JS/JSX e literais sem ler declarações nem módulos gerados", () => {
  const { root, generator } = createProject();
  try {
    writeFileSync(
      path.join(root, "src/view.jsx"),
      'export const View = () => <div className="p-8" />;',
    );
    writeFileSync(path.join(root, "src/values.js"), "export const classes = `p-10 ${value} p-12`;");
    writeFileSync(
      path.join(root, "src/legacy.js"),
      'export const Legacy = () => <div className="p-14" />;',
    );
    writeFileSync(path.join(root, "src/types.d.ts"), 'export type Classes = "p-999";');
    writeFileSync(path.join(root, "src/routes.gen.ts"), 'export const generated = "p-888";');
    generator.generateMergeData();
    const tokens = generator.collectClasses();
    for (const token of ["p-8", "p-10", "p-12", "p-14"]) assert.ok(tokens.includes(token));
    for (const token of ["p-999", "p-888", "./tailwind-merge-data.ts"])
      assert.ok(!tokens.includes(token));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("preserva escapes, templates aninhados e literais de tipos sem coletar comentários", () => {
  const { root, source, generator } = createProject();
  try {
    writeFileSync(source, [
      String.raw`const escaped = "p-2\u0020p-4";`,
      'const nested = `p-6 ${condition ? `p-8 ${"p-10"} p-12` : "p-14"} p-16`;',
      'const cooked = `p-18\\u0020p-20`;',
      'const tagged = tag`p-22 \\unicode p-24`;',
      'type Classes = "p-26";',
      'const View = () => <div className="p-28">p-998</div>;',
      '// "p-999"',
      'const ignored = /p-997/;',
    ].join("\n"));
    const tokens = generator.collectClasses();
    for (const token of [
      "p-2", "p-4", "p-6", "p-8", "p-10", "p-12", "p-14", "p-16", "p-18", "p-20",
      "p-22", "p-24", "p-26", "p-28",
    ])
      assert.ok(tokens.includes(token), token);
    for (const token of ["p-997", "p-998", "p-999"])
      assert.ok(!tokens.includes(token), token);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("rejeita fonte inválida sem substituir a tabela e retoma após correção", () => {
  const { root, source, generator } = createProject();
  try {
    const initial = generator.generateMergeData();
    writeFileSync(source, 'const classes = "p-8"; const broken =');
    assert.throws(() => generator.generateMergeData(), /Sintaxe inválida em component\.tsx/);
    assert.equal(readFileSync(generator.dataOutput, "utf8"), initial.content);
    writeFileSync(source, 'const classes = "p-8";');
    assert.deepEqual(generator.generateMergeData().classes, ["p-8"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("regenera no Vite com root resolvido e remove listeners ao fechar", async () => {
  const { root, source, generator } = createProject();
  const plugin = tailwindMergePlugin();
  const watcher = new EventEmitter();
  const errors = [];
  try {
    plugin.configResolved({ root });
    plugin.configureServer({
      watcher,
      config: { logger: { error: (error) => errors.push(error) } },
    });
    await plugin.buildStart();
    const initial = readFileSync(generator.dataOutput, "utf8");
    const extra = path.join(root, "src/extra.ts");
    writeFileSync(extra, 'export const classes = "text-(--added)";');
    watcher.emit("add", extra);
    await plugin.buildStart();
    assert.ok(readFileSync(generator.dataOutput, "utf8").includes("--added"));
    writeFileSync(extra, 'export const classes = "text-(--edited)";');
    assert.equal(plugin.handleHotUpdate({ file: extra }), undefined);
    await plugin.buildStart();
    assert.ok(readFileSync(generator.dataOutput, "utf8").includes("--edited"));
    assert.ok(!readFileSync(generator.dataOutput, "utf8").includes("--added"));
    rmSync(extra);
    watcher.emit("unlink", extra);
    await plugin.buildStart();
    assert.equal(readFileSync(generator.dataOutput, "utf8"), initial);
    assert.deepEqual(errors, []);
    assert.equal(plugin.handleHotUpdate({ file: generator.output }), undefined);
    assert.equal(plugin.handleHotUpdate({ file: source + ".d.ts" }), undefined);
  } finally {
    plugin.closeBundle();
    assert.equal(watcher.listenerCount("add"), 0);
    assert.equal(watcher.listenerCount("unlink"), 0);
    rmSync(root, { recursive: true, force: true });
  }
});

await test("CLI gera módulos e rejeita saída inválida", () => {
  const { root, generator } = createProject();
  try {
    const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [cli, "--root", root], {
      encoding: "utf8",
      cwd: tmpdir(),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(readFileSync(generator.output, "utf8"), /export const twMerge/);
    const contract = path.join(root, "contract.mts");
    writeFileSync(
      contract,
      `import { twMerge } from "./src/lib/tailwind-merge.ts";
const result: string = twMerge("p-2", false, null, undefined);
// @ts-expect-error -- Arrays não fazem parte do contrato.
twMerge(["p-2"]);
// @ts-expect-error -- Objetos não fazem parte do contrato.
twMerge({ "p-2": true });
// @ts-expect-error -- Números não fazem parte do contrato.
twMerge(2);
void result;`,
    );
    const compiler = path.join(
      path.dirname(findPackageJSON("tsrs", import.meta.url)),
      "bin/tsrs",
    );
    const checked = spawnSync(
      process.execPath,
      [
        compiler,
        "--noEmit",
        "--strict",
        "--module",
        "nodenext",
        "--target",
        "es2023",
        "--allowImportingTsExtensions",
        "--skipLibCheck",
        "--checkers",
        "1",
        contract,
      ],
      { encoding: "utf8" },
    );
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    const invalid = spawnSync(process.execPath, [cli, "--root", root, "--output", "src/merge.js"], {
      encoding: "utf8",
    });
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /output deve apontar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
