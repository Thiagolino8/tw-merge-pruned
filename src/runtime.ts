// Gerado por tw-merge-pruned; não editar.
import {
	conflicts,
	groups,
	legacyGroups,
	orderedModifiers,
	patterns,
} from "./tailwind-merge-data.ts";

const classGroups = new Map<string, number>();
const prefixRules = new Map<string, readonly [number, number]>();
groups.forEach((row, group) => {
	const [classes = "", ...records] = row.split("\t");
	const [prefix = "", ...suffixes] = classes.split(" ");
	if (classes)
		for (const suffix of suffixes.length ? suffixes : [""])
			classGroups.set(prefix + suffix, group);
	for (const record of records) {
		const [pattern = "", ...prefixes] = record.split(" ");
		for (const prefix of prefixes) prefixRules.set(prefix, [group, +pattern]);
	}
});
const sensitiveModifiers = new Set(orderedModifiers);
const cache = new Map<string, string>();

// O contrato aceita apenas strings opcionais.
export const twMerge = (...inputs: (string | undefined | null | false)[]) => {
	const input = inputs.filter(Boolean).join(" ");
	const cached = cache.get(input);
	if (cached) return cached;
	const classes = input.trim().split(/\s+/);
	const seen = new Set<string>();
	let result = "";
	for (const original of classes.reverse()) {
		let group: number | string | undefined;
		let legacy = false;
		let modifiers = "";
		let start = 0;
		let brackets = 0;
		let parentheses = 0;
		let segment: string[] = [];
		for (let position = 0; position < original.length; position++) {
			const character = original[position];
			if (character === "[") brackets++;
			if (character === "]") brackets--;
			if (character === "(") parentheses++;
			if (character === ")") parentheses--;
			if (character !== ":" || brackets !== 0 || parentheses !== 0) continue;
			const modifier = original.slice(start, position);
			if (modifier[0] === "[" || sensitiveModifiers.has(modifier)) {
				modifiers += segment.sort().join(":") + ":" + modifier + ":";
				segment = [];
			} else segment.push(modifier);
			start = position + 1;
		}
		modifiers += segment.sort().join(":");
		let base = original.slice(start);
		if (base.endsWith("!")) {
			base = base.slice(0, -1);
			modifiers += "!";
		} else if (base[0] === "!") {
			legacy = true;
			base = base.slice(1);
			modifiers += "!";
		}
		group = classGroups.get(base);
		if (legacy && group !== undefined) group = legacyGroups[group] ?? group;
		if (group === undefined) {
			const match = /^(?:(\[[^:]+):.*\]|-?([a-z-]+)-(.+))$/.exec(base);
			const rule = prefixRules.get(match?.[2] ?? "");
			group =
				match?.[1] ??
				(rule && patterns[rule[1]]?.test(match?.[3] ?? "")
					? rule[0]
					: undefined);
		}
		if (group !== undefined && group !== -1) {
			const key = modifiers + ":";
			if (seen.has(key + group)) continue;
			seen.add(key + group);
			if (typeof group === "number")
				for (const conflict of conflicts[group] ?? []) seen.add(key + conflict);
		}
		result = result ? original + " " + result : original;
	}
	if (cache.size >= 1000) cache.clear();
	cache.set(input, result);
	return result;
};
