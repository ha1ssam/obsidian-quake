import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { quakeEngine } from "./scripts/quake-engine-plugin.mjs";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian", "electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	minify: prod,
	outfile: "main.js",
	plugins: [quakeEngine],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
