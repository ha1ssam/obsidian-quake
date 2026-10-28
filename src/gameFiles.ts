import { DataAdapter, normalizePath } from "obsidian";

/** Lowercase path relative to the Quake folder (e.g. "id1/pak0.pak") -> file contents. */
export type GameFiles = Record<string, ArrayBuffer>;

/** Reads every file under the Quake folder of the vault. */
export async function loadGameFiles(adapter: DataAdapter, folder: string): Promise<GameFiles> {
	const root = normalizePath(folder);
	const files: GameFiles = {};
	if (!(await adapter.exists(root))) return files;

	const walk = async (dir: string): Promise<void> => {
		const listing = await adapter.list(dir);
		await Promise.all(
			listing.files.map(async (path) => {
				const rel = path.slice(root.length + 1).toLowerCase();
				files[rel] = await adapter.readBinary(path);
			})
		);
		for (const sub of listing.folders) await walk(sub);
	};
	await walk(root);
	return files;
}

/** Writes a file coming from the game (save, config, demo) into the Quake folder. */
export async function writeGameFile(
	adapter: DataAdapter,
	folder: string,
	relPath: string,
	data: string | Uint8Array
): Promise<void> {
	const path = normalizePath(`${folder}/${relPath}`);
	const dir = path.slice(0, path.lastIndexOf("/"));
	if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
	if (typeof data === "string") {
		await adapter.write(path, data);
	} else {
		// Copy into this realm: the array comes from the game iframe.
		await adapter.writeBinary(path, new Uint8Array(data).buffer);
	}
}

/** True when the folder has the minimum data needed to start the game. */
export function hasBaseGame(files: GameFiles): boolean {
	return "id1/pak0.pak" in files;
}
