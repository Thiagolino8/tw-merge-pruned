import { createGenerator, type GeneratorOptions } from "tw-merge-pruned";
import { tailwindMergePlugin } from "tw-merge-pruned/vite";
import type { Plugin } from "vite";

const options = {
	root: "/project",
	sourceDir: "src",
	output: "src/lib/merge.ts",
} satisfies GeneratorOptions;
const generator = createGenerator(options);
const classes: string[] = generator.collectClasses();
const conflicts: number[][] = generator.generateMergeData().conflicts;
const plugin: Plugin = tailwindMergePlugin(options);
void [classes, conflicts, plugin];

// @ts-expect-error -- O diretório deve ser string.
createGenerator({ root: 1 });
// @ts-expect-error -- Só opções declaradas fazem parte da API.
tailwindMergePlugin({ unknown: true });
