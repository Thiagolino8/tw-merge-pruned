export type GeneratorOptions = {
	/** Diretório do consumidor. Padrão: process.cwd(). */
	root?: string;
	/** Diretório de fontes, relativo a root. Padrão: src. */
	sourceDir?: string;
	/** Módulo TypeScript gerado, relativo a root. Padrão: src/lib/tailwind-merge.ts. */
	output?: string;
};

export type MergeData = {
	version: string;
	classes: string[];
	graphClasses: string[];
	rulePrefixes: string[];
	content: string;
	conflicts: number[][];
};

export declare const createGenerator: (options?: GeneratorOptions) => {
	collectClasses: () => string[];
	generateMergeData: () => MergeData;
	root: string;
	sourceDir: string;
	output: string;
	dataOutput: string;
};
