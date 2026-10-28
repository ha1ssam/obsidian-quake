import { readFileSync } from "fs";

// Engine scripts, in the same order as WebQuake's index.htm.
const ENGINE_FILES = [
	"CDAudio", "Chase", "CL", "Cmd", "COM", "Console", "CRC", "Cvar", "Def", "Draw",
	"ED", "GL", "Host", "IN", "Key", "M", "Mod", "MSG", "NET", "NET_Loop", "NET_WEBS",
	"PF", "PR", "Protocol", "Q", "R", "S", "Sbar", "SCR", "SV", "Sys", "SZ", "V",
	"Vec", "VID", "W",
];

// The engine relies on sloppy-mode globals, so it is not bundled as modules:
// it is embedded as plain text and injected into the game iframe at runtime.
export const quakeEngine = {
	name: "quake-engine",
	setup(build) {
		build.onResolve({ filter: /^virtual:quake-(engine|frame)$/ }, (args) => ({
			path: args.path,
			namespace: "quake",
		}));
		build.onLoad({ filter: /.*/, namespace: "quake" }, (args) => {
			let text;
			if (args.path === "virtual:quake-engine") {
				text = ENGINE_FILES
					.map((name) => readFileSync(`vendor/webquake/${name}.js`, "utf8"))
					.concat(readFileSync("src/engine/platform.js", "utf8"))
					.join("\n;\n");
			} else {
				text = readFileSync("src/engine/frame.html", "utf8")
					.replace("<!--SHADERS-->", readFileSync("vendor/webquake/shaders.html", "utf8"));
			}
			return { contents: `export default ${JSON.stringify(text)};`, loader: "js" };
		});
	},
};

