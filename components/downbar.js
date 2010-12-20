const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
const Cr = Components.results;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function Downbar() {
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
				dump("downbar profile-after-change\n");
				DownBar.downloadManager.addListener(this);

				Services.obs.addObserver(this, "quit-application-granted", true);
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
				} catch(e) { Cu.reportError(e); }
				
				try {
					var clearOnClose = Services.prefs.getBoolPref("downbar.function.clearOnClose");
				} catch(e) { Cu.reportError(e); }
				
				DownBar.trimHistory();
				
				if (clearOnClose)
					DownBar.clearAllFinished();
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
	    		DownBar.startDownload(aDownload);
	    		return;  // setStateSpecific will already be called during insertNewDownload    		
	    	case 1:
	    		DownBar.finishDownload(aDownload);
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
    onSecurityChange: function(aWebProgress, aRequest, state, aDownload) {}
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Downbar]);
