import { readFileSync } from "fs";

// Engine scripts, in the same order as WebQuake's index.htm.
const ENGINE_FILES = [
	"CDAudio", "Chase", "CL", "Cmd", "COM", "Console", "CRC", "Cvar", "Def", "Draw",
	"ED", "GL", "Host", "IN", "Key", "M", "Mod", "MSG", "NET", "NET_Loop", "NET_WEBS",
	"PF", "PR", "Protocol", "Q", "R", "S", "Sbar", "SCR", "SV", "Sys", "SZ", "V",
	"Vec", "VID", "W",
];

function engineCode() {
	const code = ENGINE_FILES
		.map((name) => readFileSync(`vendor/webquake/${name}.js`, "utf8"))
		// Keep game data out of Obsidian's web storage: platform.js provides QuakeStorage.
		.map((source) => source.replace(/\blocalStorage\b/g, "QuakeStorage"))
		.concat(readFileSync("src/engine/platform.js", "utf8"))
		.join("\n;\n");
	if (/<\/script|<!--/i.test(code)) throw new Error("Engine code cannot be inlined in HTML");
	return code;
}

// The engine relies on sloppy-mode globals, so it is not bundled as modules:
// it is inlined as a plain script in the HTML page of the game iframe.
export const quakeEngine = {
	name: "quake-engine",
	setup(build) {
		build.onResolve({ filter: /^virtual:quake-frame$/ }, (args) => ({
			path: args.path,
			namespace: "quake",
		}));
		build.onLoad({ filter: /.*/, namespace: "quake" }, () => {
			// The engine is inlined in the frame page, so the plugin never has
			// to create script elements at runtime.
			const text = readFileSync("src/engine/frame.html", "utf8")
				.replace("<!--SHADERS-->", () => readFileSync("vendor/webquake/shaders.html", "utf8"))
				.replace("<!--ENGINE-->", () => `<script>\n${engineCode()}\n</script>`);
			return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
		});
	},
};

