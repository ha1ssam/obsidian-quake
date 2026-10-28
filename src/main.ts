import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { QuakeView, VIEW_TYPE_QUAKE } from "./QuakeView";

interface QuakeSettings {
	/** Vault folder that holds id1/ (and any mod folders). */
	folder: string;
	/** Extra command line arguments, e.g. "-game mymod" or "+map e1m1". */
	args: string;
	/** Log engine messages to the developer console. */
	debug: boolean;
}

const DEFAULT_SETTINGS: QuakeSettings = {
	folder: "Quake",
	args: "",
	debug: false,
};

export default class QuakePlugin extends Plugin {
	settings: QuakeSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE_QUAKE, (leaf) => new QuakeView(leaf, this));

		this.addRibbonIcon("skull", "Play Quake", () => this.openQuake());

		this.addCommand({
			id: "open",
			name: "Play in a new tab",
			callback: () => this.openQuake(),
		});
		this.addCommand({
			id: "open-window",
			name: "Play in a new window",
			callback: () => this.openQuake("", "window"),
		});
		this.addCommand({
			id: "import-paks",
			name: "Import pak files",
			callback: () => this.importPakFiles(),
		});

		// ```quake
		// +map e1m1 -game mymod
		// ```
		this.registerMarkdownCodeBlockProcessor("quake", (source, el) => {
			const args = source.trim().replace(/\s+/g, " ");
			const box = el.createDiv({ cls: "quake-launcher" });
			box.createEl("button", { text: "Play Quake", cls: "mod-cta" }).addEventListener("click", () =>
				this.openQuake(args)
			);
			if (args) box.createSpan({ cls: "quake-launcher-args", text: args });
		});

		this.addSettingTab(new QuakeSettingTab(this.app, this));
	}

	async openQuake(args = "", where: "tab" | "window" = "tab"): Promise<void> {
		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf(where);
		await leaf.setViewState({ type: VIEW_TYPE_QUAKE, active: true, state: { args } });
		this.app.workspace.revealLeaf(leaf);
		(leaf.view as QuakeView).focusGame?.();
	}

	/** Lets the user pick .pak files from disk and copies them into <folder>/id1. */
	importPakFiles(): Promise<boolean> {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.multiple = true;
			input.accept = ".pak,.PAK";
			input.addEventListener("change", async () => {
				const picked = Array.from(input.files ?? []);
				if (picked.length === 0) return resolve(false);
				const adapter = this.app.vault.adapter;
				const dir = normalizePath(`${this.settings.folder}/id1`);
				try {
					if (!(await adapter.exists(dir))) await adapter.mkdir(dir);
					for (const file of picked) {
						const name = file.name.toLowerCase();
						if (!/^pak\d+\.pak$/.test(name)) {
							new Notice(`Quake: skipped ${file.name} (expected pak0.pak, pak1.pak…)`);
							continue;
						}
						await adapter.writeBinary(`${dir}/${name}`, await file.arrayBuffer());
						new Notice(`Quake: imported ${name}`);
					}
					resolve(true);
				} catch (e) {
					console.error("Quake: import failed", e);
					new Notice("Quake: import failed, see the developer console.");
					resolve(false);
				}
			});
			input.click();
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

class QuakeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: QuakePlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Quake folder")
			.setDesc("Vault folder with the game data. It must contain id1/pak0.pak. Saves and config.cfg are written here too.")
			.addText((text) =>
				text
					.setPlaceholder("Quake")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						this.plugin.settings.folder = normalizePath(value.trim() || "Quake");
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Command line")
			.setDesc('Extra arguments, as in the original game. Examples: "-game mymod", "-hipnotic", "+map e1m1", "-nosound".')
			.addText((text) =>
				text.setValue(this.plugin.settings.args).onChange(async (value) => {
					this.plugin.settings.args = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Import pak files")
			.setDesc("Copy pak0.pak / pak1.pak from your Quake install into the Quake folder.")
			.addButton((button) => button.setButtonText("Import…").onClick(() => this.plugin.importPakFiles()));

		new Setting(containerEl)
			.setName("Debug log")
			.setDesc("Print engine messages to the developer console.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
					this.plugin.settings.debug = value;
					await this.plugin.saveSettings();
				})
			);
	}
}
