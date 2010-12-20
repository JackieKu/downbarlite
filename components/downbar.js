const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function Downbar() {
	// you can do |this.wrappedJSObject = this;| for the first version of the component
	// (in case you don't want to write IDL yet.)
	this.wrappedJSObject = this;
	Cu.import("resource://downbarlite/downbar.jsm");
}
Downbar.prototype = {
	classID: Components.ID("{D4EE4143-3560-44c3-B170-4AC54D7D8AC1}"),
	contractID: "@devonjensen.com/downbar/downbar;1",
	classDescription: "Window independent Download Statusbar functions",

	QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

	// nsIObserver implementation
	observe: function(aSubject, aTopic, aData) {
		switch(aTopic) {
			case "profile-after-change":
				DownBar.downloadManager.addListener(this);

				Services.obs.addObserver(this, "quit-application-granted", true);
				Services.obs.addObserver(this, "em-action-requested", true);
				Services.obs.addObserver(this, "download-manager-remove-download", true);
			break;

			case "quit-application-granted":
				try {
					if(Services.prefs.getBoolPref("downbar.toUninstall")) {
						// Put back the firefox download manager settings
						Services.prefs.setBoolPref("browser.download.manager.showWhenStarting", true);
						Services.prefs.setBoolPref("browser.download.manager.showAlertOnComplete", true);
						Services.prefs.setBoolPref("downbar.toUninstall", false);
						Services.prefs.setBoolPref("downbar.function.firstRun", true);
						if(!Services.prefs.getBoolPref("downbar.function.keepHistory"))
							Services.prefs.setIntPref("browser.download.manager.retention", 0);
							
						// xxx Remove DownbarShow column from download database? it takes a lot of code, dropping and copying entire tables, prob not worth it
												
					}
				} catch(e){}
				
				try {
					var clearOnClose = Services.prefs.getBoolPref("downbar.function.clearOnClose");
				} catch(e){}
				
				this._dlbar_trimHistory();
				
				if(clearOnClose) {
					this._dlbar_clearAllFinished();
				}
				
		
			break;
			
			case "em-action-requested":
						
				subject = aSubject.QueryInterface(Components.interfaces.nsIUpdateItem);
				if (subject.id == "{D4DD63FA-01E4-46a7-B6B1-EDAB7D6AD389}") {
					switch (aData) {
		    			case "item-uninstalled":
		     				Services.prefs.setBoolPref("downbar.toUninstall", true);
		    				break;
		    			case "item-cancel-action":
		     				Services.prefs.setBoolPref("downbar.toUninstall", false);
		    				break;
		    		}
					
				}
			break;
			
			case "download-manager-remove-download":
								
				// If subject is null, then download clean up was called and I need to repopulate downloads
				if(!aSubject) {
					var e = Services.wm.getEnumerator("navigator:browser");
					var win;
					while (e.hasMoreElements()) {
						win = e.getNext();
						win._dlbar_populateDownloads();
					}
				}
				// xxx if subject is not null, (only one download was removed), do I want to remove it from the download statusbar?
			
			break;
		
			default:
				//throw Components.Exception("Unknown topic: " + aTopic);
		}
	},
	
	// These are download listener functions
	onDownloadStateChange: function(aState, aDownload) {
		
		// var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		// acs.logStringMessage(aDownload.id + '  :  ' + aDownload.state);
		
		switch (aDownload.state) {
	    	//case -1:
			//case 0:
			case 5:   // Queued
	    		this._dlbar_startDownload(aDownload);
	    		return;  // setStateSpecific will already be called during insertNewDownload
	    	break;
	    		
	    	case 1:
	    		this._dlbar_finishDownload(aDownload);
	    	break;
	    }

		var e = Services.wm.getEnumerator("navigator:browser");
		var win;
		while (e.hasMoreElements()) {
			win = e.getNext();
			win._dlbar_setStateSpecific("db_" + aDownload.id, aDownload.state);
		}
	},
	onProgressChange: function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress, aDownload) {},
    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus, aDownload) {},
    onLocationChange: function(aWebProgress, aRequest, aLocation, aDownload) {},
    onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage, aDownload) {},
    onSecurityChange: function(aWebProgress, aRequest, state, aDownload) {},
    
    
    _dlbar_startDownload : function(aDownload) {
    	
		var elmpath = aDownload.targetFile.path;
		//var fixedelmpath = elmpath.replace(/\\/g, "\\\\");  // The \ and ' get messed up in the command if they are not fixed
		//fixedelmpath = fixedelmpath.replace(/\'/g, "\\\'");
		var _dlbar_fileext = elmpath.split(".").pop().toLowerCase();
	
		var _dlbar_ignoreList = new Array ( );
		
		var ignoreRaw = Services.prefs.getCharPref("downbar.function.ignoreFiletypes");
		ignoreRaw = ignoreRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		_dlbar_ignoreList = ignoreRaw.split(",");
		
		// If it's on the ignore list, don't show it on the downbar
		for (var i=0; i<=_dlbar_ignoreList.length; ++i) {
				if (_dlbar_fileext == _dlbar_ignoreList[i])	
					return;
		}
		
		var id = aDownload.id;
		var state = aDownload.state;
		var referrer = aDownload.referrer;
		var source = aDownload.source.spec;
		var startTime = aDownload.startTime;
		var name = aDownload.displayName;
		
		// Convert target to its URI representation so that icons work correctly (can get unique exe icons on windows)
		var target = Services.io.newFileURI(aDownload.targetFile,null,null).spec;
		
		var dbase = DownBar.downloadManager.DBConnection;
		dbase.executeSimpleSQL("UPDATE moz_downloads SET DownbarShow=1 WHERE id=" + id);
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var e = wm.getEnumerator("navigator:browser");
		var win;

		while (e.hasMoreElements()) {
			win = e.getNext();
			
			// Add Download to download bar in each window, and start updates
			win._dlbar_insertNewDownload("db_" + id, target, name, source, state, startTime, referrer);
			win._dlbar_updateDLrepeat("db_" + aDownload.id);
			
			win.document.getElementById("downbar").hidden = false;
			win._dlbar_checkShouldShow();
			win._dlbar_startUpdateMini();
		}
    },
    
    _dlbar_finishDownload : function(dl) {
    	
		var elmpath = dl.targetFile.path;
		//var fixedelmpath = elmpath.replace(/\\/g, "\\\\");  // The \ and ' get messed up in the command if they are not fixed
		//fixedelmpath = fixedelmpath.replace(/\'/g, "\\\'");
		var _dlbar_fileext = elmpath.split(".").pop().toLowerCase();
		
		this._dlbar_dlCompleteSound(_dlbar_fileext);
		
		this._dlbar_AntiVirusScan(elmpath, _dlbar_fileext);
		
		var clearTime = Services.prefs.getIntPref("downbar.function.timeToClear");
		var clearRaw = Services.prefs.getCharPref("downbar.function.clearFiletypes");
		var _dlbar_clearList = new Array ( );
		
		clearRaw = clearRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		_dlbar_clearList = clearRaw.split(",");
		
		// check if it's on the list of autoclear
		var autoClear = false;
		if(_dlbar_clearList[0] == "all" | _dlbar_clearList[0] == "*")
			autoClear = true;
		else {
			for (var i=0; i<=_dlbar_clearList.length; ++i) {
				if (_dlbar_fileext == _dlbar_clearList[i])
					autoClear = true;
			}
		}
						
		var e = Services.wm.getEnumerator("navigator:browser");
		var win;
		
		// For delayed actions, like autoclear, enumerating each window and calling timeout doesn't work 
		// (all the timeouts are triggered on one window), so need to call a function in the window and have it do the timeout 
		while (e.hasMoreElements()) {
			win = e.getNext();
			
			//var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
			//acs.logStringMessage(win.self._content.location.href);
			
			if(autoClear) {
				win._dlbar_startAutoClear("db_" + dl.id, clearTime*1000);
			}
			
			win._dlbar_startUpdateMini();
		}
    	
    },
    
    // List of the recently cleared downloads so that I can undo clear
    _dlbar_recentCleared : [],
    
    _dlbar_undoClearOne : function() {
    	
    	var DLid = this._dlbar_recentCleared.pop();
		
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
			} catch(e) {}
		}	
    },
    
    _dlbar_clearAllFinished : function() {
    	
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
    		this._dlbar_recentCleared = this._dlbar_recentCleared.concat(finishedIDs);
    		
    	} catch(e) {}
    	
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
    	} catch(e){}
    		
    },
    
	_dlbar_dlCompleteSound : function(fileExt) {
		try {
			var shouldSound = Services.prefs.getIntPref("downbar.function.soundOnComplete");  // 0:no sound, 1: default sound, 2: custom sound
			var ignoreListRaw = Services.prefs.getCharPref("downbar.function.soundCompleteIgnore");
		} catch(e){}
		
		if(shouldSound == 0)
			return;
		
		var soundIgnoreList = new Array ( );
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
			var sound = Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
			var nsIIOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
			
			var soundLoc;
			if(shouldSound == 1)
				soundLoc = "chrome://downbarlite/content/downbar_finished.wav";
			
			if(shouldSound == 2) {
				var soundLoc = Services.prefs.getCharPref("downbar.function.soundCustomComplete");  //format of filesystem sound "file:///c:/sound1_final.wav"
			}
			
			soundURIformat = nsIIOService.newURI(soundLoc,null,null);
			sound.play(soundURIformat);
		} catch(e) {
			sound.beep;
		}
		
	},
	
	_dlbar_AntiVirusScan : function(filepath, _dlbar_fileext) {
		
		//var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		//acs.logStringMessage(filepath);
		
		var shouldScan = Services.prefs.getBoolPref("downbar.function.virusScan");
		if(shouldScan) {
			
			var dlPath = filepath;
			try {
				var defCharset = Services.prefs.getComplexValue("intl.charset.default", Components.interfaces.nsIPrefLocalizedString).data;
				var uniConv = Components.classes['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				uniConv.charset = defCharset;
				var convertedPath = uniConv.ConvertFromUnicode(dlPath);
				dlPath = convertedPath;
			}
			catch(e) {}
			
			var _dlbar_excludeList = new Array ( );
			var excludeRaw = Services.prefs.getCharPref("downbar.function.virusExclude");
			excludeRaw = excludeRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
			_dlbar_excludeList = excludeRaw.split(",");
			
			var excludeFiletype = false;
			for (var i=0; i<=_dlbar_excludeList.length; ++i) {
				if (_dlbar_fileext == _dlbar_excludeList[i])
					excludeFiletype = true;
			}
			
			if(!excludeFiletype) {	
				try {
					var AVProgLoc = Services.prefs.getCharPref("downbar.function.virusLoc");
					var AVArgs = Services.prefs.getCharPref("downbar.function.virusArgs");
					var AVExecFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
					var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
					
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
						var bundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
						var stringBundle = bundleService.createBundle("chrome://downbarlite/locale/downbar.properties");
							
						var promptSvc = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
						promptSvc.alert(null,"Download Statusbar",stringBundle.GetStringFromName("AVnotFound"));
					}
				} catch (e) {
						var bundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
						var stringBundle = bundleService.createBundle("chrome://downbarlite/locale/downbar.properties");
							
						var promptSvc = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
						promptSvc.alert(null,"Download Statusbar",stringBundle.GetStringFromName("failedAV"));
					return;
				}
			}
		}
		
	},
	
	_dlbar_trimHistory : function() {
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
/*	
	var _dlbar_uninstallListen = {
  		onUninstalling: function(addon) {
  			var sound = Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
			var nsIIOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
			sound.play(nsIIOService.newURI("chrome://downbarlite/content/downbar_finished.wav",null,null));	
  		}
	},
*/

};

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Downbar]);