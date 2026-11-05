#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createGenerator } from "./generator.mjs";

const { values } = parseArgs({
	options: {
		root: { type: "string" },
		"source-dir": { type: "string" },
		output: { type: "string" },
		help: { type: "boolean", short: "h" },
	},
});

if (values.help) {
	console.log(
		"Uso: tw-merge-pruned [--root <diretório>] [--source-dir <src>] [--output <src/lib/tailwind-merge.ts>]",
	);
} else {
	const generator = createGenerator({
		root: values.root,
		sourceDir: values["source-dir"],
		output: values.output,
	});
	const result = generator.generateMergeData();
	console.log(`Merge gerado com ${result.classes.length} classes-base.`);
}
