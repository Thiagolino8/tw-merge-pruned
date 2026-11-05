import path from "node:path";
import { createGenerator } from "./generator.mjs";

export const tailwindMergePlugin = (options = {}) => {
	let generator;
	let pending = Promise.resolve();
	let cleanup = () => {};
	let reportError = error => {
		throw error;
	};
	const getGenerator = () => (generator ??= createGenerator(options));
	const regenerate = () => {
		pending = pending
			.catch(() => undefined)
			.then(() => getGenerator().generateMergeData())
			.then(() => undefined);
		return pending;
	};
	const isSource = file => {
		const { sourceDir, output, dataOutput } = getGenerator();
		const absolute = path.resolve(file);
		const relative = path.relative(sourceDir, absolute);
		return (
			relative !== ".." &&
			!relative.startsWith(".." + path.sep) &&
			!path.isAbsolute(relative) &&
			/\.[jt]sx?$/.test(relative) &&
			!/(?:\.d|\.gen)\.ts$/.test(relative) &&
			absolute !== output &&
			absolute !== dataOutput
		);
	};
	return {
		name: "tw-merge-pruned",
		configResolved(config) {
			generator = createGenerator({
				...options,
				root: options.root ?? config.root,
			});
		},
		buildStart: regenerate,
		configureServer(server) {
			reportError = error => server.config.logger.error(String(error));
			const update = file => {
				if (isSource(file)) void regenerate().catch(reportError);
			};
			server.watcher.on("add", update).on("unlink", update);
			cleanup = () => {
				server.watcher.off("add", update).off("unlink", update);
			};
		},
		handleHotUpdate(context) {
			if (isSource(context.file)) void regenerate().catch(reportError);
		},
		closeBundle() {
			cleanup();
		},
	};
};
