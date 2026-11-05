import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseSync, Visitor } from "oxc-parser";
import { classifyClass, parseClass } from "./classify.mjs";
import { conflictingGroups, generalizations, orderedModifiers } from "./rules.mjs";

// Uma instância por projeto: inventário e cache não se misturam entre roots.
export const createGenerator = (options = {}) => {
  const root = path.resolve(options.root ?? process.cwd());
  const sourceDir = path.resolve(root, options.sourceDir ?? "src");
  const output = path.resolve(root, options.output ?? "src/lib/tailwind-merge.ts");
  if (!output.endsWith(".ts") || output.endsWith(".d.ts"))
    throw new Error("output deve apontar para um módulo .ts.");
  const dataOutput = output.slice(0, -3) + "-data.ts";
  const sources = new Map();
  const cacheFile = path.join(root, ".cache/tw-merge-pruned.json");
  const version = createHash("sha256")
    .update(readFileSync(import.meta.filename))
    .update(readFileSync(new URL("./classify.mjs", import.meta.url)))
    .update(readFileSync(new URL("./rules.mjs", import.meta.url)))
    .update(readFileSync(new URL("./validators.mjs", import.meta.url)))
    .digest("hex");
  let previousClasses;
  let previousResult;
  try {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    if (cached.version === version) {
      const index = new Map(cached.graphClasses.map((className, index) => [className, index]));
      const matrix = cached.conflicts.map((targets) => new Set(targets));
      if (
        typeof cached.content !== "string" ||
        !Array.isArray(cached.rulePrefixes) ||
        matrix.length !== index.size
      )
        throw new Error("Cache de merge inválido.");
      previousClasses = JSON.stringify(cached.classes);
      previousResult = cached;
    }
  } catch {
    // Cache ausente ou corrompido: recalcular a partir das fontes.
  }

  const collectClasses = () => {
    const tokens = new Set();
    for (const file of readdirSync(sourceDir, { recursive: true })) {
      if (
        !/\.[jt]sx?$/.test(file) ||
        /(?:\.d|\.gen)\.ts$/.test(file) ||
        [output, dataOutput].includes(path.join(sourceDir, file))
      )
        continue;
      const text = readFileSync(path.join(sourceDir, file), "utf8");
      if (sources.get(file)?.text === text) {
        for (const token of sources.get(file).tokens) tokens.add(token);
        continue;
      }
      const fileTokens = new Set();
      const { program, errors } = parseSync(
        file,
        text,
        file.endsWith(".js") ? { lang: "jsx" } : undefined,
      );
      if (errors.length)
        throw new Error(
          `Sintaxe inválida em ${file}:\n${errors.map(error => error.message).join("\n")}`,
        );
      new Visitor({
        Literal: node => {
          if (typeof node.value === "string")
            for (const token of node.value.trim().split(/\s+/)) if (token) fileTokens.add(token);
        },
        TemplateElement: node => {
          for (const token of (node.value.cooked ?? node.value.raw).trim().split(/\s+/))
            if (token) fileTokens.add(token);
        },
      }).visit(program);
      sources.set(file, { text, tokens: fileTokens });
      for (const token of fileTokens) tokens.add(token);
    }
    return [...tokens].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  };

  const generateMergeData = () => {
    mkdirSync(path.dirname(output), { recursive: true });
    const runtime = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8").replace(
      "./tailwind-merge-data.ts",
      "./" + path.basename(dataOutput),
    );
    if (!existsSync(output) || readFileSync(output, "utf8") !== runtime)
      writeFileSync(output, runtime);
    const baseClasses = [
      ...new Set(collectClasses().map((token) => parseClass(token).baseClassName)),
    ]
      .filter((token) => token && classifyClass(token) !== undefined)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    const signature = JSON.stringify(baseClasses);
    if (signature === previousClasses) {
      if (!existsSync(dataOutput) || readFileSync(dataOutput, "utf8") !== previousResult.content)
        writeFileSync(dataOutput, previousResult.content);
      return previousResult;
    }
    // O ! inicial pode mudar a classificação de classes com sufixo /.
    const classes = [
      ...baseClasses,
      ...baseClasses
        .filter((token) => token.includes("/"))
        .map((token) => "!" + token)
        .filter((token) => classifyClass(token) !== undefined),
    ];
    const classified = classes.map(classifyClass);
    const conflicts = classified.map((later) =>
      classified.flatMap((earlier, index) =>
        earlier === later || conflictingGroups[later]?.includes(earlier) ? [index] : [],
      ),
    );
    const incoming = classes.map(() => []);
    for (const [source, targets] of conflicts.entries())
      for (const target of targets) incoming[target].push(source);
    const signatures = conflicts.map((outgoing, index) =>
      JSON.stringify([outgoing, incoming[index]]),
    );
    const classIndex = new Map(classes.map((token, index) => [token, index]));
    // Grupos também precisam concordar quando o ! inicial muda a classificação.
    const groupSignatures = signatures.map((signature, index) => {
      const token = classes[index];
      const alias = classIndex.get("!" + token);
      const legacy =
        token.includes("/") && !token.startsWith("!")
          ? alias === undefined
            ? null
            : signatures[alias]
          : signature;
      return JSON.stringify([signature, legacy]);
    });
    const unique = [...new Set(groupSignatures)];
    const groupIds = groupSignatures.map((signature) => unique.indexOf(signature));
    const matchesRule = (suffix, mask) =>
      (mask & 1 && /^\d+$/.test(suffix)) ||
      (mask & 2 && /^\d+(?:\.\d+)?$/.test(suffix)) ||
      (mask & 4 && /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/.test(suffix)) ||
      (mask & 8 && /^\[.+\]$/.test(suffix)) ||
      (mask & 16 && /^\(.+\)$/.test(suffix));
    const rules = {};
    const patterns = [];
    const generalized = new Set();
    for (const [prefix, mask] of generalizations) {
      const members = classes.flatMap((token, index) => {
        const positive = token.replace(/^!?-?/, "");
        return positive.startsWith(prefix + "-") &&
          matchesRule(positive.slice(prefix.length + 1), mask)
          ? [index]
          : [];
      });
      const ids = new Set(members.map((index) => groupIds[index]));
      if (ids.size !== 1) continue;
      const expression = [
        [1, "\\d+"],
        [2, "\\d+(?:\\.\\d+)?"],
        [4, "\\d+(?:\\.\\d+)?/\\d+(?:\\.\\d+)?"],
        [8, "\\[.+\\]"],
        [16, "\\(.+\\)"],
      ]
        .filter(([flag]) => mask & flag)
        .map(([, pattern]) => pattern)
        .join("|");
      if (!patterns.includes(expression)) patterns.push(expression);
      rules[prefix] = [groupIds[members[0]], patterns.indexOf(expression)];
      for (const index of members) generalized.add(classes[index]);
    }
    const removals = unique.map((_, id) =>
      [...new Set(conflicts[groupIds.indexOf(id)].map((index) => groupIds[index]))].filter(
        (target) => target !== id,
      ),
    );
    const legacyGroups = new Map();
    for (const [index, token] of baseClasses.entries()) {
      if (!token.includes("/")) continue;
      const alias = "!" + token;
      const aliasIndex = classes.indexOf(alias);
      const group = aliasIndex === -1 ? -1 : groupIds[aliasIndex];
      if (group !== groupIds[index]) legacyGroups.set(groupIds[index], group);
    }
    const groups = unique.map((_, id) => {
      const members = classes.filter(
        (token, index) =>
          groupIds[index] === id && !token.startsWith("!") && !generalized.has(token),
      );
      if (!members.length) return "";
      if (
        members.every((member) => /^!?\[[^:]+:.*\]$/.test(member)) &&
        !removals[id].length &&
        !removals.some((targets) => targets.includes(id))
      )
        return "";
      let prefix = members[0];
      for (const member of members) while (!member.startsWith(prefix)) prefix = prefix.slice(0, -1);
      if (!members.includes(prefix) && !prefix.endsWith("-"))
        prefix = prefix.slice(0, prefix.lastIndexOf("-") + 1);
      return members.length === 1
        ? members[0]
        : [prefix, ...members.map((member) => member.slice(prefix.length))].join(" ");
    });
    const ruleEntries = Object.entries(rules);
    const weights = groups.map((_, id) => ruleEntries.filter(([, [group]]) => group === id).length);
    const legacyTargets = new Set(legacyGroups.values());
    // Grupos com conflitos vêm primeiro, permitindo omitir as listas vazias finais.
    const order = groups
      .map((_, id) => id)
      .filter(
        (id) =>
          groups[id] ||
          weights[id] ||
          legacyTargets.has(id) ||
          removals[id].length ||
          removals.some((targets) => targets.includes(id)),
      )
      .sort(
        (left, right) =>
          Number(Boolean(removals[right].length)) - Number(Boolean(removals[left].length)) ||
          weights[right] - weights[left] ||
          Number(Boolean(groups[right])) - Number(Boolean(groups[left])) ||
          left - right,
      );
    const ids = new Map(order.map((id, index) => [id, index]));
    const rows = order.map((id) => {
      const records = new Map();
      for (const [prefix, [group, pattern]] of ruleEntries) {
        if (group !== id) continue;
        if (!records.has(pattern)) records.set(pattern, []);
        records.get(pattern).push(prefix);
      }
      return [
        groups[id],
        ...[...records].map(([pattern, prefixes]) => [pattern, ...prefixes].join(" ")),
      ].join("\t");
    });
    const compactConflicts = order.map((id) =>
      removals[id].map((target) => ids.get(target)).sort((left, right) => left - right),
    );
    while (compactConflicts.length && !compactConflicts.at(-1).length) compactConflicts.pop();
    const expressions = patterns.map((pattern) => `/^(?:${pattern.replaceAll("/", "\\/")})$/`);
    const legacyAliases = Object.fromEntries(
      [...legacyGroups].map(([source, group]) => [
        ids.get(source),
        group === -1 ? -1 : ids.get(group),
      ]),
    );
    const content = `// Gerado por tw-merge-pruned; não editar.\nexport const groups = ${JSON.stringify(rows.join("\n"))}.split("\\n");\nexport const patterns = [${expressions.join(",")}];\nexport const conflicts: number[][] = ${JSON.stringify(compactConflicts)};\nexport const legacyGroups: Record<number, number | undefined> = ${JSON.stringify(legacyAliases)};\nexport const orderedModifiers = ${JSON.stringify(orderedModifiers.join(" "))}.split(" ");\n`;
    if (!existsSync(dataOutput) || readFileSync(dataOutput, "utf8") !== content)
      writeFileSync(dataOutput, content);
    previousClasses = signature;
    previousResult = {
      version,
      classes: baseClasses,
      graphClasses: classes,
      rulePrefixes: Object.keys(rules),
      content,
      conflicts,
    };
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(previousResult));
    return previousResult;
  };

  return {
    collectClasses,
    generateMergeData,
    root,
    sourceDir,
    output,
    dataOutput,
  };
};
