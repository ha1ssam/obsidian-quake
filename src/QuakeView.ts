import { ItemView, Notice, ViewStateResult, WorkspaceLeaf } from "obsidian";
import frameHtml from "virtual:quake-frame";
import type QuakePlugin from "./main";
import { GameFiles, hasBaseGame, loadGameFiles, removeGameFile, writeGameFile } from "./gameFiles";

export const VIEW_TYPE_QUAKE = "quake-view";

interface QuakeViewState {
	args?: string;
}

/** What the engine (src/engine/platform.js) gets from the plugin. */
interface QuakeBridge {
	files: GameFiles;
	args: string[];
	debug: boolean;
	write(path: string, data: string | Uint8Array): void;
	remove(path: string): void;
	quit(): void;
	error(text: string): void;
}

interface QuakeWindow extends Window {
	QuakeStart?: (bridge: QuakeBridge) => void;
	QuakeShutdown?: () => void;
}

function gameWindow(frame: HTMLIFrameElement): QuakeWindow | null {
	return frame.contentWindow;
}

/** Splits a Quake command line, keeping "quoted strings" together. */
export function parseArgs(text: string): string[] {
	const args: string[] = [];
	const re = /"([^"]*)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) args.push(m[1] ?? m[2]);
	return args;
}

export class QuakeView extends ItemView {
	private frame: HTMLIFrameElement | null = null;
	private args = "";
	private running = false;
	private ended = false;
	/** Bumped on every start/stop so a slow, outdated start() gives up. */
	private generation = 0;

	constructor(leaf: WorkspaceLeaf, private plugin: QuakePlugin) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_QUAKE;
	}

	getDisplayText(): string {
		return "Quake";
	}

	getIcon(): string {
		return "skull";
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), args: this.args };
	}

	async setState(state: QuakeViewState, result: ViewStateResult): Promise<void> {
		const args = typeof state?.args === "string" ? state.args : "";
		const changed = args !== this.args;
		this.args = args;
		await super.setState(state, result);
		if (changed || !this.running) await this.start();
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("quake-view");
		// setState() runs right after this when the tab is opened with arguments;
		// only start here if it did not.
		window.setTimeout(() => {
			if (!this.running) void this.start();
		}, 0);
	}

	async onClose(): Promise<void> {
		this.stop();
	}

	/** (Re)starts the game from the files currently in the vault. */
	async start(): Promise<void> {
		this.stop();
		const generation = this.generation;
		this.running = true;
		this.ended = false;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quake-view-message");
		const loading = contentEl.createDiv({ cls: "quake-message", text: "Loading Quake data files…" });

		const folder = this.plugin.settings.folder;
		const files = await loadGameFiles(this.app.vault.adapter, folder);
		if (generation !== this.generation) return;
		loading.remove();
		contentEl.removeClass("quake-view-message");

		if (!hasBaseGame(files)) {
			this.showSetup();
			return;
		}

		const args = parseArgs(`${this.plugin.settings.args} ${this.args}`);
		const frame = contentEl.createEl("iframe", { cls: "quake-frame" });
		frame.setAttribute("allow", "fullscreen; autoplay");
		this.frame = frame;

		frame.addEventListener(
			"load",
			() => {
				const win = gameWindow(frame);
				const doc = frame.contentDocument;
				if (!win || !doc || this.frame !== frame) return;

				const bridge: QuakeBridge = {
					files,
					args,
					debug: this.plugin.settings.debug,
					write: (path: string, data: string | Uint8Array) => {
						writeGameFile(this.app.vault.adapter, folder, path, data).catch((e) => {
							console.error("Quake: could not save", path, e);
							new Notice(`Quake: could not save ${path}`);
						});
					},
					remove: (path: string) => {
						removeGameFile(this.app.vault.adapter, folder, path).catch((e) => {
							console.error("Quake: could not delete", path, e);
							new Notice(`Quake: could not delete ${path}`);
						});
					},
					quit: () => {
						this.ended = true;
						window.setTimeout(() => this.leaf.detach(), 0);
					},
					error: (text: string) => {
						this.ended = true;
						window.setTimeout(() => this.showError(text), 0);
					},
				};

				try {
					if (!win.QuakeStart) throw new Error("The game engine did not load.");
					win.QuakeStart(bridge);
				} catch (e) {
					// Sys.Error/Sys.Quit throw after reporting through the bridge.
					if (!this.ended) {
						console.error("Quake:", e);
						this.showError(e instanceof Error ? e.message : String(e));
					}
					return;
				}
				win.focus();
				doc.getElementById("mainwindow")?.focus();
			},
			{ once: true }
		);
		frame.srcdoc = frameHtml;
	}

	focusGame(): void {
		this.frame?.contentWindow?.focus();
	}

	private stop(): void {
		this.running = false;
		this.generation++;
		if (!this.frame) return;
		try {
			gameWindow(this.frame)?.QuakeShutdown?.();
		} catch (e) {
			console.error("Quake: error while shutting down", e);
		}
		this.frame.remove();
		this.frame = null;
	}

	private showSetup(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quake-view-message");
		const box = contentEl.createDiv({ cls: "quake-message" });
		const folder = this.plugin.settings.folder;
		box.createEl("h2", { text: "Quake data files not found" });
		box.createEl("p", {
			text: "This plugin includes the Quake engine, but not the game data. You need the pak files from a copy of Quake 1 (the free shareware episode works).",
		});
		const steps = box.createEl("ol");
		steps.createEl("li").appendText("Find pak0.pak (and pak1.pak if you own the full game) in the id1 folder of your Quake install.");
		const li = steps.createEl("li");
		li.appendText("Copy them into ");
		li.createEl("code", { text: `${folder}/id1/` });
		li.appendText(" in this vault, or use the import button below.");
		steps.createEl("li", { text: "Optional: put the soundtrack in id1/media/quake02.ogg … quake11.ogg." });

		const buttons = box.createDiv({ cls: "quake-buttons" });
		const importBtn = buttons.createEl("button", { text: "Import pak files…", cls: "mod-cta" });
		importBtn.addEventListener("click", () => {
			void this.plugin.importPakFiles().then((imported) => {
				if (imported) void this.start();
			});
		});
		buttons.createEl("button", { text: "Try again" }).addEventListener("click", () => void this.start());
	}

	private showError(text: string): void {
		this.stop();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("quake-view-message");
		const box = contentEl.createDiv({ cls: "quake-message" });
		box.createEl("h2", { text: "Quake stopped with an error" });
		box.createEl("p", { text, cls: "quake-error" });
		const buttons = box.createDiv({ cls: "quake-buttons" });
		buttons.createEl("button", { text: "Restart", cls: "mod-cta" }).addEventListener("click", () => void this.start());
	}
}
