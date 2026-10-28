// Obsidian platform layer for WebQuake.
// Runs inside the game iframe, after the engine scripts. It replaces the parts
// of the engine that expect a web server (XHR file loading, the URL as command
// line, alert() on errors) with calls to a bridge object that the plugin passes
// to window.QuakeStart().
(function ()
{
	var bridge = null;
	var files = {}; // lowercase path relative to the Quake folder -> ArrayBuffer

	var startEngine = window.onload;
	window.onload = null;

	var print = Sys.Print;
	Sys.Print = function(text)
	{
		if ((bridge != null) && (bridge.debug === true))
			print(text);
	};

	// In-memory replacement for the browser's web storage (the build points the
	// engine at QuakeStorage). It is filled from the vault at start, and every
	// change is mirrored back into the vault.
	var store = {};
	window.QuakeStorage = {
		getItem: function(key)
		{
			return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
		},
		setItem: function(key, value)
		{
			store[key] = String(value);
		},
		removeItem: function(key)
		{
			if (!Object.prototype.hasOwnProperty.call(store, key))
				return;
			delete store[key];
			if (key.indexOf('Quake.') === 0)
			{
				delete files[key.substring(6)];
				bridge.remove(key.substring(6));
			}
		}
	};

	// Sounds are restarted all the time (pause, then play again); the browser
	// rejects the pending play() promise when that happens, which is expected.
	var play = HTMLMediaElement.prototype.play;
	HTMLMediaElement.prototype.play = function()
	{
		var result = play.apply(this, arguments);
		if ((result != null) && (typeof result.catch === 'function'))
			result.catch(function() {});
		return result;
	};

	// Never block closing Obsidian with a "leave page?" prompt.
	Sys.events = Sys.events.filter(function(name) {return name !== 'onbeforeunload';});

	COM.InitArgv = (function(original)
	{
		return function(argv)
		{
			original.call(COM, [argv[0]].concat(bridge.args));
		};
	})(COM.InitArgv);

	// Same as the original, minus the http:/https: protocol check.
	COM.Init = function()
	{
		var swaptest = new ArrayBuffer(2);
		var swaptestview = new Uint8Array(swaptest);
		swaptestview[0] = 1;
		swaptestview[1] = 0;
		if ((new Uint16Array(swaptest))[0] === 1)
			COM.LittleLong = (function(l) {return l;});
		else
			COM.LittleLong = (function(l) {return (l >>> 24) + ((l & 0xff0000) >>> 8) + (((l & 0xff00) << 8) >>> 0) + ((l << 24) >>> 0);});

		COM.registered = Cvar.RegisterVariable('registered', '0');
		Cvar.RegisterVariable('cmdline', COM.cmdline, false, true);
		Cmd.AddCommand('path', COM.Path_f);
		COM.InitFilesystem();
		COM.CheckRegistered();
	};

	COM.LoadPackFile = function(packfile)
	{
		var buf = files[packfile.toLowerCase()];
		if ((buf == null) || (buf.byteLength < 12))
			return;
		var header = new DataView(buf);
		if (header.getUint32(0, true) !== 0x4b434150)
			Sys.Error(packfile + ' is not a packfile');
		var dirofs = header.getUint32(4, true);
		var dirlen = header.getUint32(8, true);
		var numpackfiles = dirlen >> 6;
		if (numpackfiles !== 339)
			COM.modified = true;
		var pack = [];
		pack.data = buf;
		if (numpackfiles !== 0)
		{
			var info = buf.slice(dirofs, dirofs + dirlen);
			// Directory CRCs of the official pak0.pak in Quake 1.06, 1.01 and
			// 1.00 (WebQuake only knew 1.06, so older shareware copies were
			// rejected as "modified"; QuakeSpasm accepts the same three).
			if ([32981, 62751, 61986].indexOf(CRC.Block(new Uint8Array(info))) < 0)
				COM.modified = true;
			var view = new DataView(info), i;
			for (i = 0; i < numpackfiles; ++i)
			{
				pack[pack.length] =
				{
					name: Q.memstr(new Uint8Array(info, i << 6, 56)).toLowerCase(),
					filepos: view.getUint32((i << 6) + 56, true),
					filelen: view.getUint32((i << 6) + 60, true)
				};
			}
		}
		Con.Print('Added packfile ' + packfile + ' (' + numpackfiles + ' files)\n');
		return pack;
	};

	COM.LoadFile = function(filename)
	{
		filename = filename.toLowerCase();
		var i, j, k, search, netpath, pak, file, data;
		Draw.BeginDisc();
		for (i = COM.searchpaths.length - 1; i >= 0; --i)
		{
			search = COM.searchpaths[i];
			netpath = search.filename + '/' + filename;
			data = QuakeStorage.getItem('Quake.' + netpath);
			if (data != null)
			{
				Draw.EndDisc();
				return Q.strmem(data);
			}
			for (j = search.pack.length - 1; j >= 0; --j)
			{
				pak = search.pack[j];
				for (k = 0; k < pak.length; ++k)
				{
					file = pak[k];
					if (file.name !== filename)
						continue;
					Draw.EndDisc();
					return pak.data.slice(file.filepos, file.filepos + file.filelen);
				}
			}
			data = files[netpath.toLowerCase()];
			if (data != null)
			{
				Draw.EndDisc();
				return data.slice(0);
			}
		}
		Sys.Print('FindFile: can\'t find ' + filename + '\n');
		Draw.EndDisc();
	};

	// Writes still go to QuakeStorage (the save menu reads from there), and are
	// mirrored into the vault so they survive restarts and stay with the vault.
	function gamePath(filename)
	{
		return COM.searchpaths[COM.searchpaths.length - 1].filename + '/' + filename.toLowerCase();
	}

	COM.WriteFile = (function(original)
	{
		return function(filename, data, len)
		{
			if (original.call(COM, filename, data, len) !== true)
				return;
			var bytes = new Uint8Array(len), i;
			for (i = 0; i < len; ++i)
				bytes[i] = data[i];
			files[gamePath(filename)] = bytes.buffer;
			bridge.write(gamePath(filename), bytes);
			return true;
		};
	})(COM.WriteFile);

	COM.WriteTextFile = (function(original)
	{
		return function(filename, data)
		{
			if (original.call(COM, filename, data) !== true)
				return;
			files[gamePath(filename)] = Q.strmem(data);
			bridge.write(gamePath(filename), data);
			return true;
		};
	})(COM.WriteTextFile);

	// Music: <game>/media/quakeNN.ogg (or .mp3) inside the Quake folder.
	CDAudio.Init = function()
	{
		Cmd.AddCommand('cd', CDAudio.CD_f);
		if (COM.CheckParm('-nocdaudio') != null)
			return;
		var i, j, k, track, buf, exts = [['.ogg', 'audio/ogg'], ['.mp3', 'audio/mpeg']];
		for (i = 1; i <= 99; ++i)
		{
			track = null;
			for (j = COM.searchpaths.length - 1; (j >= 0) && (track == null); --j)
			{
				for (k = 0; k < exts.length; ++k)
				{
					buf = files[COM.searchpaths[j].filename + '/media/quake' + (i <= 9 ? '0' : '') + i + exts[k][0]];
					if (buf != null)
					{
						track = URL.createObjectURL(new Blob([buf], {type: exts[k][1]}));
						break;
					}
				}
			}
			if (track == null)
				break;
			CDAudio.known[i - 1] = track;
		}
		if (CDAudio.known.length === 0)
			return;
		CDAudio.initialized = CDAudio.enabled = true;
		CDAudio.Update();
		Con.Print('CD Audio Initialized\n');
	};

	function stop()
	{
		if (Sys.frame != null)
			clearInterval(Sys.frame);
		Sys.frame = null;
		var i;
		for (i = 0; i < Sys.events.length; ++i)
			window[Sys.events[i]] = null;
		if (document.exitPointerLock != null)
			document.exitPointerLock();
	}

	Sys.Quit = function()
	{
		stop();
		Host.Shutdown();
		bridge.quit();
		throw new Error('Quake has quit');
	};

	Sys.Error = function(text)
	{
		stop();
		if (Host.initialized === true)
		{
			try {Host.Shutdown();} catch (e) {}
		}
		bridge.error(text);
		throw new Error(text);
	};

	// Called by the plugin when the tab closes.
	window.QuakeShutdown = function()
	{
		if (Host.isdown === true)
			return;
		stop();
		try {Host.Shutdown();} catch (e) {}
	};

	window.QuakeStart = function(b)
	{
		bridge = b;
		files = b.files;
		// Saves found in the vault go into the store so the menu can delete them.
		var path, bytes, i, text;
		for (path in files)
		{
			if (!/\.sav$/.test(path))
				continue;
			bytes = new Uint8Array(files[path]);
			text = [];
			for (i = 0; i < bytes.length; ++i)
				text[i] = String.fromCharCode(bytes[i]);
			store['Quake.' + path] = text.join('');
		}
		startEngine();
	};
})();
