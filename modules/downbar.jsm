var EXPORTED_SYMBOLS = ["DownBar"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

var DownBar = {
    startDownload : function(aDownload) {
		var elmpath = aDownload.targetFile.path;
		//var fixedelmpath = elmpath.replace(/\\/g, "\\\\");  // The \ and ' get messed up in the command if they are not fixed
		//fixedelmpath = fixedelmpath.replace(/\'/g, "\\\'");
		var fileext = elmpath.split(".").pop().toLowerCase();
		var ignoreList = Services.prefs.getCharPref("downbar.function.ignoreFiletypes").toLowerCase().replace(/\s/g, '').split(",");

		// If it's on the ignore list, don't show it on the downbar
		for (var i=0; i<=ignoreList.length; ++i) {
			if (fileext == ignoreList[i])
				return;
		}

		// Convert target to its URI representation so that icons work correctly (can get unique exe icons on windows)
		var target = Services.io.newFileURI(aDownload.targetFile,null,null).spec;

		var dbase = DownBar.downloadManager.DBConnection;
		dbase.executeSimpleSQL("UPDATE moz_downloads SET DownbarShow=1 WHERE id=" + aDownload.id);

		var e = Services.wm.getEnumerator("navigator:browser");
		var win;

		while (e.hasMoreElements()) {
			win = e.getNext();

			// Add Download to download bar in each window, and start updates
			win._dlbar_insertNewDownload("db_" + aDownload.id, target, aDownload.displayName,
				aDownload.source.spec, aDownload.state, aDownload.startTime, aDownload.referrer);
			win._dlbar_updateDLrepeat("db_" + aDownload.id);

			win.document.getElementById("downbar").hidden = false;
			win._dlbar_checkShouldShow();
			win._dlbar_startUpdateMini();
		}
    },

    finishDownload : function(dl) {

		var elmpath = dl.targetFile.path;
		//var fixedelmpath = elmpath.replace(/\\/g, "\\\\");  // The \ and ' get messed up in the command if they are not fixed
		//fixedelmpath = fixedelmpath.replace(/\'/g, "\\\'");
		var fileext = elmpath.split(".").pop().toLowerCase();

		this.dlCompleteSound(fileext);

		this.antiVirusScan(elmpath, fileext);

		var clearTime = Services.prefs.getIntPref("downbar.function.timeToClear");
		var clearRaw = Services.prefs.getCharPref("downbar.function.clearFiletypes");
		var clearList = [];

		clearRaw = clearRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		clearList = clearRaw.split(",");

		// check if it's on the list of autoclear
		var autoClear = false;
		if(clearList[0] == "all" | clearList[0] == "*")
			autoClear = true;
		else {
			for (var i=0; i<=clearList.length; ++i) {
				if (fileext == clearList[i])
					autoClear = true;
			}
		}

		var e = Services.wm.getEnumerator("navigator:browser");
		var win;

		// For delayed actions, like autoclear, enumerating each window and calling timeout doesn't work
		// (all the timeouts are triggered on one window), so need to call a function in the window and have it do the timeout
		while (e.hasMoreElements()) {
			win = e.getNext();

			//var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
			//acs.logStringMessage(win.self._content.location.href);

			if(autoClear) {
				win._dlbar_startAutoClear("db_" + dl.id, clearTime*1000);
			}

			win._dlbar_startUpdateMini();
		}

    },

    // List of the recently cleared downloads so that I can undo clear
    recentCleared : [],

    undoClearOne : function() {

    	var DLid = this.recentCleared.pop();

		if(DLid) {
			var dbase = DownBar.downloadManager.DBConnection;
			dbase.executeSimpleSQL("UPDATE moz_downloads SET DownbarShow=1 WHERE id=" + DLid);

			try {
				var stmt = dbase.createStatement("SELECT target, name, source, state, startTime, referrer " +
		                         "FROM moz_downloads " +
		                         "WHERE id = " + DLid);

				stmt.executeStep();

				// Insert the download item in all browser windows
				var e = Services.wm.getEnumerator("navigator:browser");
				var win;

				while (e.hasMoreElements()) {
					win = e.getNext();
					win._dlbar_insertNewDownload("db_" + DLid, stmt.getString(0), stmt.getString(1), stmt.getString(2),
									 stmt.getInt32(3), stmt.getInt64(4), stmt.getString(5));

					win._dlbar_checkShouldShow();
					win._dlbar_updateMini();
				}

				stmt.reset();
			} catch(e) { Cu.reportError(e); }
		}
    },

    clearAllFinished : function() {

    	// Remove the finished download elements in each browser window
    	try {
			var e = Services.wm.getEnumerator("navigator:browser");
			var win;
			var finishedIDs;

			while (e.hasMoreElements()) {
				win = e.getNext();
				finishedIDs = [];  // only want to end up with one copy of this
				var downbarelem = win.document.getElementById("downbar");

				var comparray = downbarelem.getElementsByAttribute("state", "1");
				for (i = 0; i <= comparray.length-1; i) {

					finishedIDs.push(comparray[i].id.substring(3));

					winElem = win.document.getElementById(comparray[i].id);
					downbarelem.removeChild(winElem);
				}

				win._dlbar_checkShouldShow();
				win._dlbar_updateMini();

    		}

    		// Add all these cleared ids to the recentCleared array
    		this.recentCleared = this.recentCleared.concat(finishedIDs);

    	} catch(e) { Cu.reportError(e); }

    	// Fix the database
    	try {
			var dbase = DownBar.downloadManager.DBConnection;
	    	var keepHist = Services.prefs.getBoolPref('downbar.function.keepHistory');

			if(keepHist) {
				var simpleStmt = "UPDATE moz_downloads SET DownbarShow=0 WHERE DownbarShow=1 AND state=1";
				dbase.executeSimpleSQL(simpleStmt);
			}
			else {
			// I could edit the database directly,
			//   but by calling removeDownload, observers are notified of the "download-manager-remove-download" topic automatically
				try {
					var stmt = dbase.createStatement("SELECT id FROM moz_downloads WHERE DownbarShow=1 AND state=1");
				}
				catch(e) {
					Cu.reportError(e);
					return;
				}
				try {
					while (stmt.executeStep()) {
						DownBar.downloadManager.removeDownload(stmt.getInt32(0));
					}
				}
				finally {
					stmt.reset();
				}
			}
    	} catch(e){ Cu.reportError(e); }

    },

	dlCompleteSound : function(fileExt) {
		try {
			var shouldSound = Services.prefs.getIntPref("downbar.function.soundOnComplete");  // 0:no sound, 1: default sound, 2: custom sound
			var ignoreListRaw = Services.prefs.getCharPref("downbar.function.soundCompleteIgnore");
		} catch(e){}

		if(shouldSound == 0)
			return;

		var soundIgnoreList = [];
		ignoreListRaw = ignoreListRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		soundIgnoreList = ignoreListRaw.split(",");

		var toIgnore = false;
		for (var i=0; i<=soundIgnoreList.length; ++i) {
			if (fileExt == soundIgnoreList[i])
				toIgnore = true;
		}
		if(toIgnore)
			return;

		try {
			var sound = Components.classes["@mozilla.org/sound;1"].createInstance(Ci.nsISound);

			var soundLoc;
			if (shouldSound == 1)
				soundLoc = "chrome://downbarlite/content/downbar_finished.wav";
			else if (shouldSound == 2)
				soundLoc = Services.prefs.getCharPref("downbar.function.soundCustomComplete");  //format of filesystem sound "file:///c:/sound1_final.wav"

			sound.play(Services.io.newURI(soundLoc,null,null));
		} catch(e) {
			//sound.beep;
		}

	},

	antiVirusScan : function(filepath, fileext) {

		//var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
		//acs.logStringMessage(filepath);

		var shouldScan = Services.prefs.getBoolPref("downbar.function.virusScan");
		if(shouldScan) {

			var dlPath = filepath;
			try {
				var defCharset = Services.prefs.getComplexValue("intl.charset.default", Ci.nsIPrefLocalizedString).data;
				var uniConv = Cc['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Ci.nsIScriptableUnicodeConverter);
				uniConv.charset = defCharset;
				dlPath = uniConv.ConvertFromUnicode(dlPath);
			}
			catch(e) {}

			var excludeList = [];
			var excludeRaw = Services.prefs.getCharPref("downbar.function.virusExclude");
			excludeRaw = excludeRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
			excludeList = excludeRaw.split(",");

			var excludeFiletype = false;
			for (var i=0; i<=excludeList.length; ++i) {
				if (fileext == excludeList[i])
					excludeFiletype = true;
			}

			if(!excludeFiletype) {
				try {
					var AVProgLoc = Services.prefs.getCharPref("downbar.function.virusLoc");
					var AVArgs = Services.prefs.getCharPref("downbar.function.virusArgs");
					var AVExecFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
					var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);

					// Arguments must be separated into an array
					var args = AVArgs.split(" ");
					// Put the path where it is supposed to be
					for (var i=0; i<args.length; ++i) {
						args[i] = args[i].replace(/%1/g, dlPath);
					}

					AVExecFile.initWithPath(AVProgLoc);
					if (AVExecFile.exists()) {
						process.init(AVExecFile);
						process.run(false, args, args.length);
					}
					else {
						Services.prompt.alert(null,"Download Statusbar", this.stringBundle.GetStringFromName("AVnotFound"));
					}
				} catch (e) {
					Services.prompt.alert(null,"Download Statusbar", this.stringBundle.GetStringFromName("failedAV"));
				}
			}
		}

	},

	trimHistory : function() {
		try {
			var shouldTrim = Services.prefs.getBoolPref("downbar.function.trimHistory");
			var trimOffset = Services.prefs.getIntPref("downbar.function.numToTrim");
			var downloadRetention = Services.prefs.getIntPref("browser.download.manager.retention");
		} catch (e){}

		if(!shouldTrim)
			return;
		if(downloadRetention != 2) // Then it is clearing on close or on successful download and this will have no effect
			return;

		var dbase = DownBar.downloadManager.DBConnection;

		// Delete the all but the last xx rows from the database, if it is done, canceled, or failed
		dbase.executeSimpleSQL("DELETE FROM moz_downloads " +
								"WHERE (state=1 OR state=2 OR state=3) " +
								"AND id NOT IN (select id from moz_downloads ORDER BY id DESC LIMIT " + trimOffset + ")");

	}
};

XPCOMUtils.defineLazyServiceGetter(DownBar, "downloadManager", "@mozilla.org/download-manager;1", "nsIDownloadManager");

XPCOMUtils.defineLazyGetter(DownBar, "stringBundle", function() Services.strings.createBundle("chrome://downbarlite/locale/downbar.properties"));
