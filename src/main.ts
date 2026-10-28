import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, SettingDefinitionItem, WorkspaceLeaf } from "obsidian";
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

		this.addRibbonIcon("skull", "Play Quake", () => void this.openQuake());

		this.addCommand({
			id: "open",
			name: "Play in a new tab",
			callback: () => void this.openQuake(),
		});
		this.addCommand({
			id: "open-window",
			name: "Play in a new window",
			callback: () => void this.openQuake("", "window"),
		});
		this.addCommand({
			id: "import-paks",
			name: "Import pak files",
			callback: () => void this.importPakFiles(),
		});

		// ```quake
		// +map e1m1 -game mymod
		// ```
		this.registerMarkdownCodeBlockProcessor("quake", (source, el) => {
			const args = source.trim().replace(/\s+/g, " ");
			const box = el.createDiv({ cls: "quake-launcher" });
			box.createEl("button", { text: "Play Quake", cls: "mod-cta" }).addEventListener("click", () => void this.openQuake(args));
			if (args) box.createSpan({ cls: "quake-launcher-args", text: args });
		});

		this.addSettingTab(new QuakeSettingTab(this.app, this));
	}

	async openQuake(args = "", where: "tab" | "window" = "tab"): Promise<void> {
		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf(where);
		await leaf.setViewState({ type: VIEW_TYPE_QUAKE, active: true, state: { args } });
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.view instanceof QuakeView) leaf.view.focusGame();
	}

	/** Lets the user pick .pak files from disk and copies them into <folder>/id1. */
	importPakFiles(): Promise<boolean> {
		return new Promise((resolve) => {
			const input = createEl("input", { type: "file", attr: { multiple: true, accept: ".pak,.PAK" } });
			input.addEventListener("change", () => void this.copyPakFiles(Array.from(input.files ?? [])).then(resolve));
			input.click();
		});
	}

	private async copyPakFiles(picked: File[]): Promise<boolean> {
		if (picked.length === 0) return false;
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
			return true;
		} catch (e) {
			console.error("Quake: import failed", e);
			new Notice("Quake: import failed, see the developer console.");
			return false;
		}
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<QuakeSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

const FOLDER_DESC = "Vault folder with the game data. It must contain id1/pak0.pak. Saves and config.cfg are written here too.";
const ARGS_DESC = 'Extra arguments, as in the original game. Examples: "-game mymod", "-hipnotic", "+map e1m1", "-nosound".';
const IMPORT_DESC = "Copy pak0.pak / pak1.pak from your Quake install into the Quake folder.";
const DEBUG_DESC = "Print engine messages to the developer console.";

class QuakeSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: QuakePlugin) {
		super(app, plugin);
	}

	// Obsidian 1.13+: settings rendered by Obsidian and included in settings search.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ name: "Quake folder", desc: FOLDER_DESC, control: { type: "folder", key: "folder", placeholder: "Quake" } },
			{ name: "Command line", desc: ARGS_DESC, control: { type: "text", key: "args" } },
			{ name: "Import pak files", desc: IMPORT_DESC, action: () => void this.plugin.importPakFiles() },
			{ name: "Debug log", desc: DEBUG_DESC, control: { type: "toggle", key: "debug" } },
		];
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof QuakeSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		if (key === "folder") settings.folder = normalizePath((typeof value === "string" ? value : "").trim() || "Quake");
		else if (key === "args") settings.args = typeof value === "string" ? value : "";
		else if (key === "debug") settings.debug = value === true;
		await this.plugin.saveSettings();
	}

	// Older Obsidian versions.
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Quake folder")
			.setDesc(FOLDER_DESC)
			.addText((text) =>
				text
					.setPlaceholder("Quake")
					.setValue(this.plugin.settings.folder)
					.onChange((value) => void this.setControlValue("folder", value))
			);

		new Setting(containerEl)
			.setName("Command line")
			.setDesc(ARGS_DESC)
			.addText((text) => text.setValue(this.plugin.settings.args).onChange((value) => void this.setControlValue("args", value)));

		new Setting(containerEl)
			.setName("Import pak files")
			.setDesc(IMPORT_DESC)
			.addButton((button) => button.setButtonText("Import…").onClick(() => void this.plugin.importPakFiles()));

		new Setting(containerEl)
			.setName("Debug log")
			.setDesc(DEBUG_DESC)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debug).onChange((value) => void this.setControlValue("debug", value))
			);
	}
}
