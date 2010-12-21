/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Download Statusbar.
 *
 * The Initial Developer of the Original Code is
 * Devon Jensen.
 *
 * Portions created by the Initial Developer are Copyright (C) 2003
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): Devon Jensen <velcrospud@hotmail.com>
 *
 * download_manager.png from Crystal_SVG by everaldo - kde-look.org
 *
 * Uninstall observer code adapted from Ook? Video Ook! extension by tnarik
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var gDownBarLite = {};

(function(inc) {
	inc("resource://gre/modules/Services.jsm");
	inc("resource://downbarlite/downbar.jsm");
})(Components.utils.import);

(function() {

//var _dlbar_queueNum;
var _dlbar_miniMode = false;
var _dlbar_useGradients = true;
var _dlbar_speedColorsEnabled = false;
var _dlbar_speedDivision1, _dlbar_speedDivision2, _dlbar_speedDivision3;
var _dlbar_speedColor0, _dlbar_speedColor1, _dlbar_speedColor2, _dlbar_speedColor3;
var _dlbar_strings;
var _dlbar_currTooltipAnchor;

var _dlbar_init = gDownBarLite.init = function _dlbar_init() {
	window.removeEventListener("load", arguments.callee, true);

	_dlbar_strings = document.getElementById("downbarbundle");
	
	// Keeping this first run stuff here instead of downbar component because I need a browser window anyway to show the about page
	try {
		var firstRun = Services.prefs.getBoolPref("downbar.function.firstRun");
//		var oldVersion = Services.prefs.getCharPref("downbar.function.version"); // needs to be last because it's likely not there (throws error)
	} catch (e) {}

	if (firstRun) {
		Services.prefs.setBoolPref("browser.download.manager.showWhenStarting", false);
		Services.prefs.setBoolPref("browser.download.manager.showAlertOnComplete", false);
		Services.prefs.setBoolPref("downbar.function.firstRun", false);

		// Give first runner time before the donate text shows up in the add-ons manager
		var now = ( new Date() ).getTime();
		Services.prefs.setCharPref("downbar.function.donateTextInterval", now);
		
		try {
			_dlbar_showSampleDownload();
		} catch(e){}
		
		try {
			// Set "keep download history" pref
			// browser.download.manager.retention must be 2, set their downbar history pref, based on their previous setting
			var retenPref = Services.prefs.getIntPref('browser.download.manager.retention');
			if(retenPref == 2)  // "Remember what I've downloaded"
				Services.prefs.setBoolPref('downbar.function.keepHistory', true);
			else
				Services.prefs.setBoolPref('downbar.function.keepHistory', false);
			Services.prefs.setIntPref('browser.download.manager.retention', 2);  // must be 2
		} catch(e){}
		
	}

	// The default hide key is CTRL+SHIFT+z for hide,  CRTL+SHIFT+, (comma) for undo clear
	// Doing it this way should allow the user to change it with the downbar pref, or with the keyconfig extension
	try {
		var hideKey = Services.prefs.getCharPref("downbar.function.hideKey");
		if(hideKey != "z")
			document.getElementById("key_togDownbar").setAttribute("key", hideKey);

		var undoClearKey = Services.prefs.getCharPref("downbar.function.undoClearKey");
		if(undoClearKey != "VK_INSERT")
			document.getElementById("key_undoClearDownbar").setAttribute("keycode", undoClearKey);
	} catch(e) {}

	// Delayed initialization
	window.setTimeout(function(){
		_dlbar_readPrefs();
		_dlbar_setStyles();
		_dlbar_checkMiniMode();
		_dlbar_populateDownloads();
		_dlbar_startInProgress();
		_dlbar_checkShouldShow();

		// Tooltips needs a delayed startup because for some reason it breaks the back button in Linux and Mac when run in line, see bug 17384
		// Also do integration load here
		_dlbar_setupTooltips();

		// xxx this doesn't work for some reason - function calls to this script are not found, put in xul overlay instead
	/*	
		// XXX test if integration is enabled
		// Load DownThemAll integration
		var scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
		var srvScope = {};
		scriptLoader.loadSubScript("chrome://downbarlite/content/dtaIntegration.js", srvScope);
	*/

		try {
			// Don't show Firefox's built-in status notification
			document.getElementById("download-monitor").collapsed = true;
		} catch(e){}

		// Listen for the switch to/from private browsing
		Services.obs.addObserver(_dlbar_privateBrowsingObs, "private-browsing", false);
	}, 10);

	// Developer features to be disabled on release
	//toJavaScriptConsole();
	//BrowserOpenExtensions('extensions');
	//document.getElementById("menu_FilePopup").parentNode.setAttribute("onclick", "if(event.button == 1) goQuitApplication();");
}

var _dlbar_close = gDownBarLite.close = function _dlbar_close() {
	
	// Make sure download statusbar popups up in another browser window if one is available
	//   or if that was the last browser window, check if we need to open the download manager to continue downloads                  
	var recentBrowser = Services.wm.getMostRecentWindow("navigator:browser");
	if(recentBrowser)
		recentBrowser._dlbar_newWindowFocus();
		
	else {  // That was the last browser window

		try {
			var launchDLWin = Services.prefs.getBoolPref("downbar.function.launchOnClose");
		} catch(e){}

        // Check if a DLwin is already open, if so don't open it again
        if(wm.getMostRecentWindow("Download:Manager"))
            var dlwinExists = true;
        else
            var dlwinExists = false;
            
		// xxx paused downloads are included in activeDownloadCount, should I ignore paused downloads?
		if(launchDLWin && DownBar.downloadManager.activeDownloadCount > 0 && !dlwinExists) {
			var dlWin = Services.ww.openWindow(null, 'chrome://mozapps/content/downloads/downloads.xul', null, 'chrome,dialog=no,resizable', null);
		}
	}

}

// Called on browser open to get all downloads from database that are supposed to show on the downbar
var _dlbar_populateDownloads = gDownBarLite.populateDownloads = function _dlbar_populateDownloads() {
	
	// Remove all current downloads if any (if Options window was just applied, styles may have been changed and need to be reset)
	var downbar = document.getElementById("downbar");
	while (downbar.firstChild) {
    	downbar.removeChild(downbar.firstChild);
 	}

	var dbase = DownBar.downloadManager.DBConnection;
	try {
		// XXX save this statement for later reuse?
		var stmt = dbase.createStatement("SELECT id, target, name, source, state, startTime, referrer " + 
                         "FROM moz_downloads " +
                         "WHERE DownbarShow = 1");
	}
	catch(e) {
		// The downbarshow column hasn't been added to the database yet, add it now
		dbase.executeSimpleSQL("ALTER TABLE moz_downloads ADD COLUMN DownbarShow INTEGER");
		return;
	}
	
	try {
		var id;
		while (stmt.executeStep()) {
			id = "db_" + stmt.getInt32(0);
			_dlbar_insertNewDownload(id, stmt.getString(1), stmt.getString(2), stmt.getString(3), 
								 stmt.getInt32(4), stmt.getInt64(5), stmt.getString(6));
		}
	}
	finally {
		stmt.reset();
	}
}

var _dlbar_insertNewDownload = gDownBarLite.insertNewDownload = function _dlbar_insertNewDownload(aId, aTarget, aName, aSource, aState, aStartTime, aReferrer) {
	
	// Check if that download item already exists on the downbar
	if(document.getElementById(aId)) {
		_dlbar_setStateSpecific(aId, aState);
		return;
	}
	
	var newDownloadElem = document.getElementById("_dlbar_downloadTemplate").cloneNode(true);
	newDownloadElem.id = aId;
	newDownloadElem.lastChild.firstChild.nextSibling.setAttribute("value", aName);
	newDownloadElem.setAttribute("state", aState);
	newDownloadElem.setAttribute("referrer", aReferrer);
	newDownloadElem.setAttribute("startTime", aStartTime);  // Don't have this yet when download is still queued, but need this while populating downloads at beginning
	newDownloadElem.setAttribute("target", aTarget);
	newDownloadElem.setAttribute("source", aSource);
	newDownloadElem.setAttribute("name", aName);
	
	var downbar = document.getElementById("downbar");
	downbar.appendChild(newDownloadElem);
	
	_dlbar_setStateSpecific(newDownloadElem.id, aState);
	
	newDownloadElem.hidden = false;
	
}

var _dlbar_setStateSpecific = gDownBarLite.setStateSpecific = function _dlbar_setStateSpecific(aDLElemID, aState) {

	var dlElem = document.getElementById(aDLElemID);
	
	var dl = DownBar.downloadManager.getDownload(aDLElemID.substring(3));
	try {
		var styleDefault = Services.prefs.getBoolPref("downbar.style.default");
	} catch (e){}
	
	dlElem.setAttribute("state", dl.state);

	switch(aState) {
		
		case -1: // Not started
		break;
		
		case 0:  // In progress
		
			// Set startTime and referrer on download element
			dlElem.setAttribute("startTime", dl.startTime);
			try {
				dlElem.setAttribute("referrer", dl.referrer.spec);  // some downloads don't have referrers and return an error here, attribute will be left as ""
			} catch(e){}
			
			
			dlElem.setAttribute("class", "db_progressStack");
			dlElem.setAttribute("context", "_dlbar_progresscontext");
			dlElem.setAttribute("onclick", "gDownBarLite.progressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = false;  // Progress indicators
			
			if(!styleDefault) {
				try {
					var progressStyle = Services.prefs.getCharPref("downbar.style._dlbar_progressStack");
					dlElem.setAttribute("style", progressStyle);
				} catch (e){}	
			}
		
		break;
			
		case 4:  // Paused

			dlElem.setAttribute("class", "db_pauseStack");
			dlElem.setAttribute("context", "_dlbar_pausecontext");
			dlElem.setAttribute("onclick", "gDownBarLite.progressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = false;  // Progress indicators
			
			if(!styleDefault) {
				try {
					var pausedStyle = Services.prefs.getCharPref("downbar.style.db_pausedHbox");
					dlElem.setAttribute("style", pausedStyle);
				} catch (e){}	
			}
			
		break;
		
		// XXX make queued downloads look different so they don't look stuck
		case 5:  // Queued
			dlElem.setAttribute("class", "db_progressStack");
			dlElem.setAttribute("context", "_dlbar_progresscontext");
			dlElem.setAttribute("onclick", "gDownBarLite.progressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = true;  // Progress indicators - these won't have anything useful while queued
			
			if(!styleDefault) {
				try {
					var progressStyle = Services.prefs.getCharPref("downbar.style.db_progressStack");
					dlElem.setAttribute("style", progressStyle);
				} catch (e){}
			}
			
		break;
		
		case 1:  // Finished
		case 6:  // Parental Blocked
		case 7:  // AV Scanning
		case 8:  // AV Dirty
			
			// Put on the correct overlay icon based on the state
			if(aState == 6 | aState == 8)
				dlElem.lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.setAttribute("src", "chrome://downbarlite/skin/blocked.png");
			else if(aState == 7)
				dlElem.lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.setAttribute("src", "chrome://downbarlite/skin/scanAnimation.png");
			else
				dlElem.lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.setAttribute("src", "");
		
			// set endTime on download element
			var dbase = DownBar.downloadManager.DBConnection;
			try {
				// XXX save this statement for later reuse? (bind parameters at run)
				var stmt = dbase.createStatement("SELECT endTime " + 
		                         "FROM moz_downloads " +
		                         "WHERE id = " + aDLElemID.substring(3));
		        
				stmt.executeStep();
				var endTime = stmt.getInt64(0);
				stmt.reset();
			} catch(e) {}
			
			dlElem.setAttribute("endTime", endTime);

			dlElem.setAttribute("class", "db_finishedHbox");
			dlElem.setAttribute("context", "_dlbar_donecontext");
			dlElem.setAttribute("onclick", "gDownBarLite.finishedClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "gDownBarLite.startOpenFinished(this.id); event.stopPropagation();");
			dlElem.setAttribute("ondragstart", "gDownBarLite.startDLElemDrag(this, event);");
			dlElem.setAttribute("ondragend", "gDownBarLite.DLElemDragEnd(this, event);");
			//dlElem.setAttribute("ondragover", "gDownBarLite.DLElemDragOver(event);");
			//dlElem.setAttribute("ondrop", "gDownBarLite.DLElemOnDrop(event);");
			
			// Get icon, fx dlmgr uses contentType to bypass cache, but I've found specifying a size will also bypass cache, 
			//     - just can't specify same icon size in the inprogress tooltips or that will be cached here
			// this way allows custom executable icons
			dlElem.lastChild.firstChild.firstChild.setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=16");
			
		/*	
		    // Keeping fx dlmgr implementatation here for now - just in case
			// Set icon - Tacking on contentType in moz-icon bypasses cache, allows custom .exe icons
			try {
				//const kExternalHelperAppServContractID = "@mozilla.org/uriloader/external-helper-app-service;1";
				//var mimeService = Components.classes[kExternalHelperAppServContractID].getService(Components.interfaces.nsIMIMEService);
				//var contentType = mimeService.getTypeFromFile(dl.targetFile);  // getting 'component not available' error, but I'm getting back a good value - not sure why the error
				
				//dlElem.lastChild.firstChild.firstChild.setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32&contentType=" + contentType);
				
			} catch(e) {
				//dlElem.lastChild.firstChild.firstChild.setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32");
			}
		*/
    
			dlElem.firstChild.hidden = true;              // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = false;   // Icon stack
			dlElem.lastChild.lastChild.hidden = true;     // Progress indicators
			
			if(!styleDefault) {
				try {
					var finishedStyle = Services.prefs.getCharPref("downbar.style.db_finishedHbox");
					dlElem.setAttribute("style", finishedStyle);
				} catch (e){}	
			}
			
		break;
		
		case 2:  // Failed
		case 3:  // Canceled
			
			// set endTime on download element
			var dbase = DownBar.downloadManager.DBConnection;
			try {
				// XXX save this statement for later reuse? (bind parameters at run)
				var stmt = dbase.createStatement("SELECT endTime " + 
		                         "FROM moz_downloads " +
		                         "WHERE id = " + aDLElemID.substring(3));
		        
				stmt.executeStep();
				var endTime = stmt.getInt64(0);
				stmt.reset();
			} catch(e) {}
			
			dlElem.setAttribute("endTime", endTime);
		
			dlElem.setAttribute("class", "db_notdoneHbox");
			dlElem.setAttribute("context", "_dlbar_notdonecontext");
			dlElem.setAttribute("onclick", "gDownBarLite.finishedClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "gDownBarLite.startit(this.id); event.stopPropagation();");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = true;  // Do canceled downloads keep the percent done?  keep the progress bar there?
			dlElem.lastChild.firstChild.hidden = false;
			dlElem.lastChild.lastChild.hidden = true;
			
			if(!styleDefault) {
				try {
					var notdoneStyle = Services.prefs.getCharPref("downbar.style.db_notdoneHbox");
					dlElem.setAttribute("style", notdoneStyle);
				} catch (e){}	
			}
			
		break;
	}
	
}

var _dlbar_newWindowFocus = gDownBarLite.newWindowFocus = function _dlbar_newWindowFocus() {

	_dlbar_checkShouldShow();
	_dlbar_updateMini();

	if (_dlbar_miniMode)
		window.document.getElementById("downbarMini").collapsed = false;
	else
		window.document.getElementById("downbarHolder").collapsed = false;

}

// When a new window is opened, wait, then test if it is a browser window.  If so, collapse the downbar in the old window.  (It won't get updated anyway)
var _dlbar_hideOnBlur = gDownBarLite.hideOnBlur = function _dlbar_hideOnBlur() {
	window.setTimeout(_dlbar_blurWait, 100);
}

var _dlbar_blurWait = gDownBarLite.blurWait = function _dlbar_blurWait() {
		
	var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].getService(Components.interfaces.nsIWindowWatcher);

	if (window != ww.activeWindow && ww.activeWindow != null) {
		var wintype = ww.activeWindow.document.documentElement.getAttribute('windowtype');
		if (wintype == "navigator:browser") {
			if (_dlbar_miniMode)
				window.document.getElementById("downbarMini").collapsed = true;
			else
				window.document.getElementById("downbarHolder").collapsed = true;
		}
	}
}
/*
// if there are more downloads than the queue allows, return false
var _dlbar_checkQueue = gDownBarLite.checkQueue = function _dlbar_checkQueue() {
	var currDLs = DownBar.downloadManager.activeDownloadCount;
	//d(currDLs);
	//d(_dlbar_queueNum);
	if (currDLs > _dlbar_queueNum)
		return false;
	else
		return true;
}*/

// Update inprogress downloads every sec, calls a timeout to itself at the end
var _dlbar_updateDLrepeat = gDownBarLite.updateDLrepeat = function _dlbar_updateDLrepeat(progElemID) {
	var progElem = document.getElementById(progElemID);
	try {
		var state = progElem.getAttribute("state");  // just check if it's a valid element
	} catch(e) {return;}

	// xxx do i really need to keep repeating paused downloads now that elements are static (not on rdf template)
	if(state == 0 | state == 4) {  // now see if it's an in progress element
		_dlbar_calcAndSetProgress(progElemID);
		progElem.pTimeout = window.setTimeout(function(){_dlbar_updateDLrepeat(progElemID);}, 1000);
		return;
	}
	
	if(state == 5) {  // queued downloads won't have any progress yet, come back later
		progElem.pTimeout = window.setTimeout(function(){_dlbar_updateDLrepeat(progElemID);}, 300);
	}
}

var _dlbar_calcAndSetProgress = gDownBarLite.calcAndSetProgress = function _dlbar_calcAndSetProgress(progElemID) {

	var progElem = document.getElementById(progElemID);
	var aDownload = DownBar.downloadManager.getDownload(progElemID.substring(3));
	
	var newsize = parseInt(aDownload.amountTransferred / 1024);
	var totalsize = parseInt(aDownload.size / 1024);
	progElem.pTotalKBytes = totalsize;
	var oldsize = progElem.pOldSavedKBytes;
	if (!oldsize) oldsize = 0;

	// If download stops, Download manager will incorrectly tell us the last positive speed, this fixes that - speed can go to zero
	// Count up to 3 intervals of no progress and only set speed to zero if we hit that
	var dlRate = aDownload.speed  / 1024;
	var noProgressIntervals = progElem.noProgressIntervals;
	if(!noProgressIntervals)
		noProgressIntervals = 0;

	if(newsize - oldsize > 0) {
		progElem.noProgressIntervals = 0;
	}
	else {
		// There was no progress
		noProgressIntervals++;
		progElem.noProgressIntervals = noProgressIntervals;
		if(noProgressIntervals > 3) {
			dlRate = 0;
		}
	}

	// XXX setting the progress for a paused download after a refresh or new window should get easier
	// https://bugzilla.mozilla.org/show_bug.cgi?id=394548
	
	// Firefox download manager doesn't set the speed to zero when the download is paused
	if(progElem.getAttribute("state") == 4)
		dlRate = 0;
	
	progElem.pOldSavedKBytes = newsize;

	// Fix and set the size downloaded so far
	if(newsize > 1024)
		var currSize = _dlbar_convertToMB(newsize) + " " + _dlbar_strings.getString("MegaBytesAbbr");
	else
		var currSize = newsize + " " + _dlbar_strings.getString("KiloBytesAbbr");
	progElem.lastChild.lastChild.lastChild.previousSibling.value = currSize;
	
	// Fix and set the speed
	var fraction = parseInt( ( dlRate - ( dlRate = parseInt( dlRate ) ) ) * 10);
	var newrate = dlRate + "." + fraction;
	progElem.lastChild.lastChild.firstChild.nextSibling.value = newrate;
	newrate = parseFloat(newrate);

	// If the mode is undetermined, just count up the MB
	// Firefox bug - totalsize should be -1 when the filesize is unknown?
	if (parseInt(newsize) > parseInt(totalsize) ) {

		var _dlbar_unkAbbr = _dlbar_strings.getString("unknownAbbreviation");  // "Unk." in english

		// Percent and remaining time will be unknown
		progElem.lastChild.lastChild.firstChild.value = _dlbar_unkAbbr;
		progElem.lastChild.lastChild.lastChild.value = _dlbar_unkAbbr;

	}
	else {
		// Get and set percent
		var currpercent = aDownload.percentComplete;
		var newWidth = parseInt(currpercent/100 *  progElem.firstChild.boxObject.width);  // progElem.firstChild = inner width, not incl borders of DL element
		progElem.firstChild.firstChild.minWidth = newWidth;
		progElem.lastChild.lastChild.firstChild.setAttribute("value", (currpercent + "%"));

		// Calculate and set the remaining time
		var remainingkb = parseInt(totalsize - newsize);
		if(dlRate != 0) {
			var secsleft = (1 / newrate) * remainingkb;
			var remaintime = _dlbar_formatSeconds(secsleft);
			progElem.lastChild.lastChild.lastChild.value = remaintime;
		}
		else {
			var _dlbar_unkAbbr = _dlbar_strings.getString("unknownAbbreviation");  // "Unk." in english
			progElem.lastChild.lastChild.lastChild.value = "--:--";
		}
	}
	
//d(remaintime + "   " + (currpercent + "%") + "   " + currSize + "   " + newrate);
	
	// Speed sensitive color
	if(_dlbar_speedColorsEnabled) {
		// Incremental
		var newcolor = _dlbar_speedColor0;
		if(newrate > _dlbar_speedDivision3)
			newcolor = _dlbar_speedColor3;
		else if (newrate > _dlbar_speedDivision2)
			newcolor = _dlbar_speedColor2;
		else if (newrate > _dlbar_speedDivision1)
			newcolor = _dlbar_speedColor1;

		if(_dlbar_useGradients)
			progElem.firstChild.firstChild.setAttribute("style", "background-color:" + newcolor + ";background-image:url(chrome://downbarlite/skin/whiteToTransGrad.png);border-right:0px solid transparent");
		else
			progElem.firstChild.firstChild.setAttribute("style", "background-color:" + newcolor + ";background-image:url();border-right:0px solid transparent");

		/*// Continuously Variable
		var baseRed = 0;
		var baseGreen = 0;
		var baseBlue = 254;
		var finalRed = 90;
		var finalGreen = 90;
		var finalBlue = 255;

		var maxSpeed = 700;
		var conversionRed = maxSpeed / (finalRed - baseRed);
		var conversionGreen = maxSpeed / (finalGreen - baseGreen);
		var conversionBlue = maxSpeed / (finalBlue - baseBlue);
		d("convR " + conversionRed);
		d("convG " + conversionGreen);
		d("convB " + conversionBlue);
		var newRed = parseInt(baseRed + newrate / conversionRed);
		var newGreen = parseInt(baseGreen + newrate / conversionGreen);
		var newBlue = parseInt(baseBlue + newrate / conversionBlue);
		if(newRed > 255)
			newRed = 255;
		if(newGreen > 255)
			newGreen = 255;
		if(newBlue > 255)
			newBlue = 255;

		d("newGreen: " + newGreen + "   " + "newRed: " + newRed);
		progElem.firstChild.firstChild.setAttribute("style", "background-color:rgb("+ newRed + "," + newGreen + "," + newBlue + ");");
	*/
	}
}

// The clicked-on node could be a child of the actual download element we want
// The child nodes won't have an id
var _dlbar_findDLNode = gDownBarLite.findDLNode = function _dlbar_findDLNode(origElem, popupElem) {

	if(origElem == null) {
		// Get the menuPopup 
		while(popupElem.localName != "menuPopup") {
			popupElem = popupElem.parentNode;
		}
		var popupAnchor = popupElem.triggerNode;  // popup.triggerNode was introduced in Firefox 4.0beta4 (per popup) - replaces document.popupNode (per document)
	}	
	else
		var popupAnchor = origElem;
		
	while(!popupAnchor.id) {
		popupAnchor = popupAnchor.parentNode;
	}
	return(popupAnchor.id);
}

var _dlbar_startOpenFinished = gDownBarLite.startOpenFinished = function _dlbar_startOpenFinished(idtoopen) {

	var dlElem = document.getElementById(idtoopen);
	var localFile = dlElem.getAttribute("target");
	var state = dlElem.getAttribute("state");
	
	if(state == 6 | state == 8) {  // Don't open Anti-virus Blocked downloads
		var browserStrings = document.getElementById("bundle_browser");
		document.getElementById("statusbar-display").label = "Download Statusbar: " + _dlbar_strings.getString("avCannotOpen");
    	window.setTimeout(function(){document.getElementById("statusbar-display").label = browserStrings.getString("nv_done");}, 4000);
		return;
	}
		
	if(_dlbar_useAnimation) {
		document.getElementById(idtoopen).lastChild.firstChild.firstChild.src = "chrome://downbarlite/skin/greenArrow16.png";
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.id = "slidePic";
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.lastChild.flex = "0";

		// Do shift to right, after right is done, it calls shift from left
		_dlbar_openFinishedContRight(idtoopen, 16, localFile);
		window.setTimeout(function(){_dlbar_finishOpen(idtoopen);}, 150);
	}
	else {
		_dlbar_finishOpen(idtoopen);
	}
}

var _dlbar_openFinishedContRight = gDownBarLite.openFinishedContRight = function _dlbar_openFinishedContRight(idtoopen, currshift, localFile) {

	if(currshift < 0) {
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.lastChild.flex = "1";
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.flex = "0";
		_dlbar_openFinishedContLeft(idtoopen, 16, localFile)
	}
	else {
		var styleAttr = "list-style-image:url('moz-icon:" + localFile + "');-moz-image-region:rect(0px " + currshift + "px 16px 0px);";
		document.getElementById("slidePic").setAttribute("style", styleAttr);
		window.setTimeout(function(){_dlbar_openFinishedContRight(idtoopen, currshift-2, localFile);}, 10);
	}
}

var _dlbar_openFinishedContLeft = gDownBarLite.openFinishedContLeft = function _dlbar_openFinishedContLeft(idtoopen, currshift, localFile) {

	if(currshift < 0) {
		//d("exiting");
		//_dlbar_finishOpen(idtoopen);
		document.getElementById(idtoopen).lastChild.firstChild.firstChild.src = "moz-icon:" + localFile;
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.id = "";
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.setAttribute("style", "");
		document.getElementById(idtoopen).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.flex = "1";
	}
	else {
		var styleAttr = "list-style-image:url('moz-icon:" + localFile + "');-moz-image-region:rect(0px 16px 16px " + currshift + "px);";
		document.getElementById("slidePic").setAttribute("style", styleAttr);
		window.setTimeout(function(){_dlbar_openFinishedContLeft(idtoopen, currshift-2, localFile);}, 10);
	}
}

var _dlbar_finishOpen = gDownBarLite.finishOpen = function _dlbar_finishOpen(idtoopen) {
	
	var file = document.getElementById(idtoopen).getAttribute("target");
	file = _dlbar_getLocalFileFromNativePathOrUrl(file);
	if(!file.exists()) {
		var browserStrings = document.getElementById("bundle_browser");
		document.getElementById("statusbar-display").label = "Download Statusbar: " + _dlbar_strings.getString("fileNotFound");
    	window.setTimeout(function(){document.getElementById("statusbar-display").label = browserStrings.getString("nv_done");}, 4000);
		return;
	}

	try {
    	file.launch();
    } catch (ex) {
    	// if launch fails, try sending it through the system's external
    	// file: URL handler
    	_dlbar_openExternal(file);
    }

	try {
		var removeOnOpen = Services.prefs.getBoolPref("downbar.function.removeOnOpen");
		if (removeOnOpen) {
			_dlbar_animateDecide(idtoopen, "clear", {shiftKey:false});
		}
	} catch (e) {}

}

var _dlbar_startShowFile = gDownBarLite.startShowFile = function _dlbar_startShowFile(idtoshow) {

	if(_dlbar_useAnimation) {
		document.getElementById(idtoshow).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.id = "picToShrink";
		document.getElementById("picToShrink").src = "moz-icon:" + document.getElementById(idtoshow).getAttribute("target");
		document.getElementById(idtoshow).lastChild.firstChild.firstChild.src = "chrome://downbarlite/skin/folder.png";
		document.getElementById("picToShrink").style.MozOpacity = .5;
		_dlbar_showAnimateCont(idtoshow, 16);
		window.setTimeout(function(){_dlbar_finishShow(idtoshow);}, 50);
	}
	else {
		_dlbar_finishShow(idtoshow);
	}
}

var _dlbar_showAnimateCont = gDownBarLite.showAnimateCont = function _dlbar_showAnimateCont(idtoshow, newsize) {

	if(newsize < 8) {

		// put the icon back how it's supposed to be after 1 sec.
		window.setTimeout(function(){	try{
											document.getElementById("picToShrink").src = "";
											document.getElementById("picToShrink").setAttribute("style", "height:16px;width:16px;");
											document.getElementById(idtoshow).lastChild.firstChild.firstChild.src = "moz-icon:" + document.getElementById(idtoshow).getAttribute("target");
											document.getElementById("picToShrink").id = "";
										} catch(e){}
									}, 1000);
	}
	else {
		document.getElementById("picToShrink").setAttribute("style", "height:" + newsize + "px;width:" + newsize + "px;");
		window.setTimeout(function(){_dlbar_showAnimateCont(idtoshow, newsize-2);}, 25);
	}
}

var _dlbar_finishShow = gDownBarLite.finishShow = function _dlbar_finishShow(idtoshow) {

	var file = document.getElementById(idtoshow).getAttribute("target");
	file = _dlbar_getLocalFileFromNativePathOrUrl(file);
	try {
		file.reveal();
	} catch(e) {
		var parent = file.parent;
      if (parent) {
        _dlbar_openExternal(parent);
      }
	}

	try {
		var removeOnShow = Services.prefs.getBoolPref("downbar.function.removeOnShow");
		if (removeOnShow) {
			_dlbar_animateDecide(idtoshow, "clear", {shiftKey:false});
		}
	} catch (e) {}
}

// This is needed to do timeouts in multiple browser windows from the downbar.js component, (enumerating each window and calling timeout doesn't work)
var _dlbar_startAutoClear = gDownBarLite.startAutoClear = function _dlbar_startAutoClear(idtoclear, timeout) {

	window.setTimeout(function(){_dlbar_animateDecide(idtoclear, "clear", {shiftKey:false});}, timeout)

}

var _dlbar_animateDecide = gDownBarLite.animateDecide = function _dlbar_animateDecide(elemid, doWhenDone, event) {

	if(_dlbar_useAnimation && !event.shiftKey) {
		if(_dlbar_miniMode)
			_dlbar_clearAnimate(elemid, 1, 20, "height", doWhenDone);
		else
			_dlbar_clearAnimate(elemid, 1, 125, "width", doWhenDone);
	}

   	else {
   		if(doWhenDone == "clear")
   			_dlbar_clearOne(elemid);
   		//else if(doWhenDone == "remove")
   		//	_dlbar_removeit(elemid);
   		else
   			_dlbar_startDelete(elemid, event);
   	}
}

var _dlbar_clearAnimate = gDownBarLite.clearAnimate = function _dlbar_clearAnimate(idtoanimate, curropacity, currsize, heightOrWidth, doWhenDone) {

	if(curropacity < .05) {
		if(doWhenDone == "clear")
			_dlbar_clearOne(idtoanimate);
		else
			_dlbar_finishDelete(idtoanimate);
		return;
	}
	document.getElementById(idtoanimate).style.MozOpacity = curropacity-.04;
	if(heightOrWidth == "width") {
		document.getElementById(idtoanimate).maxWidth = currsize-5.2;
		window.setTimeout(function(){_dlbar_clearAnimate(idtoanimate, curropacity-.04, currsize-5.2, "width", doWhenDone);}, 10);
	}
	else {
		document.getElementById(idtoanimate).maxHeight = currsize-0.8;
		window.setTimeout(function(){_dlbar_clearAnimate(idtoanimate, curropacity-.04, currsize-0.8, "height", doWhenDone);}, 10);
	}

}

// xxx move this to the downbar component
var _dlbar_clearOne = gDownBarLite.clearOne = function _dlbar_clearOne(idtoclear) {
		
	// Clear the download item in all browser windows
	var e = Services.wm.getEnumerator("navigator:browser");
	var win, winElem;

	while (e.hasMoreElements()) {
		win = e.getNext();
		
		try {
			winElem = win.document.getElementById(idtoclear);
			win.document.getElementById("downbar").removeChild(winElem);
			
			win._dlbar_checkShouldShow();
			win._dlbar_updateMini();
		} catch(e){}
	}
	
	var DLid = idtoclear.substring(3);
	try {
		var keepHist = Services.prefs.getBoolPref('downbar.function.keepHistory');
		if(keepHist) {
			var dbase = DownBar.downloadManager.DBConnection;
			dbase.executeSimpleSQL("UPDATE moz_downloads SET DownbarShow=0 WHERE id=" + DLid);
			
			DownBar.recentCleared.push(DLid);
		}
		else {
			DownBar.downloadManager.removeDownload(DLid);
		}
	} catch(e){}
}

var _dlbar_clearAll = gDownBarLite.clearAll = function _dlbar_clearAll() {
	DownBar.clearAllFinished();
}

var _dlbar_undoClear = gDownBarLite.undoClear = function _dlbar_undoClear() {
	DownBar.undoClearOne();
}

var _dlbar_startDelete = gDownBarLite.startDelete = function _dlbar_startDelete(elemIDtodelete, event) {

	// Get the nsiFile.path representation so the path is formatted pretty (rather than "file:///...")
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(document.getElementById(elemIDtodelete).getAttribute("target"))
	var localFilePath = localFile.path;
	try {
		var askOnDelete = Services.prefs.getBoolPref("downbar.function.askOnDelete");
	} catch (e) {}
	
	if (askOnDelete) {
		var _dlbar_confirmMsg = _dlbar_strings.getString("deleteConfirm") + "\n\n" + localFilePath + "\n ";
		
		var promptSer = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		if(!promptSer.confirm(null, "Download Statusbar",_dlbar_confirmMsg))
			return;
	}

	if(_dlbar_useAnimation && !event.shiftKey) {
		document.getElementById(elemIDtodelete).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.src = "chrome://downbarlite/skin/delete1.png";
		window.setTimeout(function(){_dlbar_deleteAnimateCont(elemIDtodelete);}, 150);
	}
	else
		_dlbar_finishDelete(elemIDtodelete);

}

var _dlbar_deleteAnimateCont = gDownBarLite.deleteAnimateCont = function _dlbar_deleteAnimateCont(elemIDtodelete) {

	document.getElementById(elemIDtodelete).lastChild.firstChild.lastChild.firstChild.nextSibling.firstChild.nextSibling.src = "chrome://downbarlite/skin/delete2.png";

	if(_dlbar_miniMode)
		_dlbar_clearAnimate(elemIDtodelete, 1, 20, "height", "delete");
	else
		_dlbar_clearAnimate(elemIDtodelete, 1, 125, "width", "delete");
}

var _dlbar_finishDelete = gDownBarLite.finishDelete = function _dlbar_finishDelete(elemIDtodelete) {
	
	var file = document.getElementById(elemIDtodelete).getAttribute("target");
	file = _dlbar_getLocalFileFromNativePathOrUrl(file);
	_dlbar_clearOne(elemIDtodelete);

	if (file.exists()) {
		try {
			file.remove(false); // false is the recursive setting
			
		} catch (e) {
			try {
				// May have failed because of file permissions, set some permissions and try to delete again
				file.permissions = 438;
				file.remove(false);
			} catch(e){}
		}

	}
}

var _dlbar_cancelprogress = gDownBarLite.cancelprogress = function _dlbar_cancelprogress(elemtocancel) {
	
	var localFileUrl = document.getElementById(elemtocancel).getAttribute("target");
	DownBar.downloadManager.cancelDownload(elemtocancel.substring(3));
	_dlbar_checkShouldShow();
	_dlbar_clearOne(elemtocancel);

	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(localFileUrl);
	if (localFile.exists())
		localFile.remove(false);
}

var _dlbar_cancelAll = gDownBarLite.cancelAll = function _dlbar_cancelAll() {
	
	var dbelems = document.getElementById("downbar").childNodes;
	var cancPos = new Array(); // hold the child id of elements that are canceled, so that they can be removed in the 2nd for loop
	var posCount = 1;
	var state;
	for (var i = 0; i <= dbelems.length - 1; ++i) {
			state = dbelems[i].getAttribute("state");
			if (state == 0 | state == 4 | state == 5) {
				DownBar.downloadManager.cancelDownload(dbelems[i].id.substring(3));
				cancPos[posCount] = dbelems[i];
				++posCount;
			}
	}

	var localFile;
	// Need to clear them after the first for loop is complete
	for (var j = 1; j < posCount; ++j) {
		try {  // canceling queued downloads will cause and error (b/c there isn't a local file yet i think?)
			_dlbar_clearOne(cancPos[j].id);
			localFile = _dlbar_getLocalFileFromNativePathOrUrl(cancPos[j].getAttribute("target"));
			localFile.remove(false);		
		} catch(e) {}
	}
	_dlbar_checkShouldShow();
}

var _dlbar_pause = gDownBarLite.pause = function _dlbar_pause(elemid, aEvent) {
		
	// Stop repeating tooltip updates and close tooltip if present
	_dlbar_stopTooltip(elemid);
	document.getElementById("_dlbar_progTip").hidePopup();
	
	
	DownBar.downloadManager.pauseDownload(elemid.substring(3));
	// Update display now so there is no lag time without good values
	_dlbar_calcAndSetProgress(elemid);
}

var _dlbar_resume = gDownBarLite.resume = function _dlbar_resume(elemid, aEvent) {
	
	// Stop repeating tooltip updates and close tooltip if present
	_dlbar_stopTooltip(elemid);
	document.getElementById("_dlbar_progTip").hidePopup();
	
	DownBar.downloadManager.resumeDownload(elemid.substring(3));
	// Update display now so there is no lag time without good values
	_dlbar_calcAndSetProgress(elemid);
}

var _dlbar_pauseAll = gDownBarLite.pauseAll = function _dlbar_pauseAll() {
	var dbelems = document.getElementById("downbar").childNodes;
	var i = 0;
	// I don't know why a for loop won't work here but okay
	while (i < dbelems.length) {

		if (dbelems[i].getAttribute("state") == 0 | dbelems[i].getAttribute("state") == 5) {
			_dlbar_pause(dbelems[i].id, null);
		}
		i = i + 1;
	}
}

var _dlbar_resumeAll = gDownBarLite.resumeAll = function _dlbar_resumeAll() {
	var dbelems = document.getElementById("downbar").childNodes;
	var i = 0;
	while (i < dbelems.length) {
		if (dbelems[i].getAttribute("state") == 4) {
			_dlbar_resume(dbelems[i].id, null);
		}
		i = i + 1;
	}
}

var _dlbar_copyURL = gDownBarLite.copyURL = function _dlbar_copyURL(elemtocopy) {

	const gClipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
														.getService(Components.interfaces.nsIClipboardHelper);
	gClipboardHelper.copyString(document.getElementById(elemtocopy).getAttribute("source"));
}

var _dlbar_setupReferrerContextMenuItem = gDownBarLite.setupReferrerContextMenuItem = function _dlbar_setupReferrerContextMenuItem(aMenuItem, dlElemID) {
	document.getElementById(aMenuItem).disabled =
		document.getElementById(dlElemID).getAttribute("referrer") == "";
}

var _dlbar_visitRefWebsite = gDownBarLite.visitRefWebsite = function _dlbar_visitRefWebsite(dlElemID) {

	var refURL = document.getElementById(dlElemID).getAttribute("referrer");
	
	if(refURL != "") {
		// Open page in new tab
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService();
	    var wmed = wm.QueryInterface(Components.interfaces.nsIWindowMediator);
	    
	    var win = wmed.getMostRecentWindow("navigator:browser");
	    if (!win)
	    	win = window.openDialog("chrome://browser/content/browser.xul", "_blank", "chrome,all,dialog=no", refURL, null, null);
	    else {
	    	var content = win.document.getElementById("content");
	    	content.selectedTab = content.addTab(refURL);	
	    }
		
	}
}

var _dlbar_startit = gDownBarLite.startit = function _dlbar_startit(elemid) {
	
	DownBar.downloadManager.retryDownload(elemid.substring(3));
}
/*
var _dlbar_stopit = gDownBarLite.stopit = function _dlbar_stopit(elemtostop) {
	DownBar.downloadManager.cancelDownload(elemtostop.substring(3));
	var DLelem = document.getElementById(elemtostop);
	var f = _dlbar_getLocalFileFromNativePathOrUrl(DLelem.getAttribute("target"));
	if (f.exists())
		f.remove(false); // false is the recursive setting

	window.setTimeout("gDownBarLite.updateMini()", 444);
}

var _dlbar_stopAll = gDownBarLite.stopAll = function _dlbar_stopAll() {

	var dbelems = document.getElementById("downbar").childNodes;
	for (i = 1; i <= dbelems.length - 1; ++i) {
		if (dbelems[i].getAttribute("context") == "_dlbar_progresscontext") {  // just using context as an indicator of that type of element
			DownBar.downloadManager.cancelDownload(dbelems[i].id);
		}
	}
}
*/

// Determine if downbar holder should be shown based on presence of downloads
var _dlbar_checkShouldShow = gDownBarLite.checkShouldShow = function _dlbar_checkShouldShow() {

	var downbarelem = document.getElementById("downbar");

	if(!_dlbar_miniMode) {

		if (downbarelem.childNodes.length > 0) {
			document.getElementById("downbarHolder").hidden = false;
		}
		else {
			document.getElementById("downbarHolder").hidden = true;
		}
	}
}

var _dlbar_setStyles = gDownBarLite.setStyles = function _dlbar_setStyles() {

	var downbarelem = document.getElementById("downbar");
	var dlItemTemplate = document.getElementById("_dlbar_downloadTemplate");

	try {
		var styleDefault = Services.prefs.getBoolPref("downbar.style.default");
		var showMainButton = Services.prefs.getBoolPref("downbar.display.mainButton");
		var showClearButton = Services.prefs.getBoolPref("downbar.display.clearButton");
		var showToMiniButton = Services.prefs.getBoolPref("downbar.display.toMiniButton");
	} catch (e){}

	document.getElementById("downbarMainMenuButton").hidden = !showMainButton;

	if(showClearButton) {
		document.getElementById("downbarClearButton").hidden = false;
		document.getElementById("downbarClearButtonMini").hidden = false;
	}
	else {
		document.getElementById("downbarClearButton").hidden = true;
		document.getElementById("downbarClearButtonMini").hidden = true;
	}
		

	if(showToMiniButton) {
		document.getElementById("downbarToMiniButton").hidden = false;
		document.getElementById("downbarToFullButton").hidden = false;
	}
	else {
		document.getElementById("downbarToMiniButton").hidden = true;
		document.getElementById("downbarToFullButton").hidden = true;
	}
		

	if(styleDefault) {
		// Set style to nothing ("") so that class css will be used
		downbarelem.setAttribute("style", "");
		
		dlItemTemplate.firstChild.firstChild.setAttribute("style", "");
		dlItemTemplate.firstChild.lastChild.setAttribute("style", "");
		dlItemTemplate.lastChild.firstChild.nextSibling.setAttribute("style", "");
		
		for(var i=0; i<4; ++i)
			dlItemTemplate.lastChild.lastChild.childNodes[i].setAttribute("style", "");
		
		document.getElementById("_dlbar_widthSpacer").setAttribute("style", "min-width:135px;");
		
		document.getElementById("downbarMainMenuButton").setAttribute("style", "");
		document.getElementById("downbarClearButton").setAttribute("style", "");
		document.getElementById("downbarToMiniButton").setAttribute("style", "");
		document.getElementById("downbarHolder").setAttribute("style", "");

		if(_dlbar_useGradients) {
			dlItemTemplate.firstChild.firstChild.setAttribute("style", "background-image:url(chrome://downbarlite/skin/whiteToTransGrad.png);");
			dlItemTemplate.setAttribute("style", "background-image:url(chrome://downbarlite/skin/whiteToTransGrad.png);");
		}
		else {
			dlItemTemplate.firstChild.firstChild.setAttribute("style", "");
			dlItemTemplate.setAttribute("style", "");
		}

	}
	else {
		// Read custom prefs
		try {
			var downbarStyle = Services.prefs.getCharPref("downbar.style.db_downbar");
			var downbarPopupStyle = Services.prefs.getCharPref("downbar.style.db_downbarPopup");
			var finishedHboxStyle = Services.prefs.getCharPref("downbar.style.db_finishedHbox");
			var progressbarStyle = Services.prefs.getCharPref("downbar.style.db_progressbar");
			var progressremainderStyle = Services.prefs.getCharPref("downbar.style.db_progressremainder");
			var filenameLabelStyle = Services.prefs.getCharPref("downbar.style.db_filenameLabel");
			var progressIndicatorStyle = Services.prefs.getCharPref("downbar.style.db_progressIndicator");
			var buttonStyle = Services.prefs.getCharPref("downbar.style.db_buttons");
		} catch (e){}

		// Set styles to the new style - automatically overrides the class css rules
		if(_dlbar_miniMode)
			downbarelem.setAttribute("style", downbarPopupStyle);
		else
			downbarelem.setAttribute("style", downbarStyle);
		
		dlItemTemplate.firstChild.firstChild.setAttribute("style", progressbarStyle);
		dlItemTemplate.firstChild.lastChild.setAttribute("style", progressremainderStyle);
		dlItemTemplate.lastChild.firstChild.nextSibling.setAttribute("style", filenameLabelStyle);
		
		for(var i=0; i<4; ++i)
			dlItemTemplate.lastChild.lastChild.childNodes[i].setAttribute("style", progressIndicatorStyle);

		var spacerW = parseInt(finishedHboxStyle.split(":")[2]);  // This is for getting the minimode popup the correct custom width
		document.getElementById("_dlbar_widthSpacer").setAttribute("style", "min-width:" + spacerW + "px;");
		
		document.getElementById("downbarMainMenuButton").setAttribute("style", buttonStyle);
		document.getElementById("downbarClearButton").setAttribute("style", buttonStyle);
		document.getElementById("downbarToMiniButton").setAttribute("style", buttonStyle);
		
		// Set the background of the buttons to the same color as the downbar) background (using the downbar mini popup style color which is the same)
		//  (partially transparent buttons show the downbarHolder behind)
		document.getElementById("downbarHolder").setAttribute("style", downbarPopupStyle);
	}
}

var _dlbar_setupTooltips = gDownBarLite.setupTooltips = function _dlbar_setupTooltips() {
	
	// Setup whether to use default partially transparent tooltips (windows) or opaque solid backed tooltips (linux, mac)
	try {
		var useOpTooltips = Services.prefs.getBoolPref("downbar.function.useTooltipOpacity"); // Null on first install
	} catch (e) {}

	if(useOpTooltips == null) {
/*			// xxx this should probably go with the "first run" stuff in the future
		var os = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULRuntime).OS;
		if(os != "WINNT") {
			Services.prefs.setBoolPref("downbar.function.useTooltipOpacity", false);
			useOpTooltips = false;
		}
		else {
			Services.prefs.setBoolPref("downbar.function.useTooltipOpacity", true);
			useOpTooltips = true;
		}*/	
		
		// Trying out semi-Transparent tooltips for all OS
		Services.prefs.setBoolPref("downbar.function.useTooltipOpacity", true);
		useOpTooltips = true;
	}

	

	// Because tooltip background transparency cannot be set on the fly, 
	//   (not sure why this is, seems like the background is cached or 
	//    set permanently to opaque if is not explicitly transparent at startup)
	// There are two tooltips each for "finshed" downloads and "progress" downloads. 
	// We decide which to use, then move the tooltip content from a temporary tooltip
	// onto the one we want.
	// Right now, tooltip background transparency is crashing linux (June 2007)
	
	if(useOpTooltips) {
		
		var finTooltipContent = document.getElementById("_dlbar_finTipContent");
		var fintip_tr = document.getElementById("_dlbar_fintip_transparent");
		fintip_tr.removeChild(fintip_tr.firstChild);
		fintip_tr.appendChild(finTooltipContent);
		fintip_tr.setAttribute("id", "_dlbar_finTip");
		
		var progTooltipContent = document.getElementById("_dlbar_progTipContent");
		var progtip_tr = document.getElementById("_dlbar_progresstip_transparent");
		progtip_tr.removeChild(progtip_tr.firstChild);
		progtip_tr.appendChild(progTooltipContent);
		progtip_tr.setAttribute("id", "_dlbar_progTip");
		
	}
	else {
		var finTooltipContent = document.getElementById("_dlbar_finTipContent");
		var fintip_op = document.getElementById("_dlbar_fintip_opaque");
		fintip_op.removeChild(fintip_op.firstChild);
		fintip_op.appendChild(finTooltipContent);
		fintip_op.setAttribute("id", "_dlbar_finTip");
		
		var progTooltipContent = document.getElementById("_dlbar_progTipContent");
		var progtip_op = document.getElementById("_dlbar_progresstip_opaque");
		progtip_op.removeChild(progtip_op.firstChild);
		progtip_op.appendChild(progTooltipContent);
		progtip_op.setAttribute("id", "_dlbar_progTip");
		
		// Set the proper background images for opaque tooltips, (default is for transparent)
		document.getElementById("_dlbar_finTipLeftImg").setAttribute("style", "list-style-image: url('chrome://downbarlite/skin/leftTooltip_white_square.png');");
		document.getElementById("_dlbar_finTipRightImg").setAttribute("style", "list-style-image: url('chrome://downbarlite/skin/rightTooltip_white_square.png');");
		document.getElementById("_dlbar_finTipMiddle").setAttribute("style", "background-image: url('chrome://downbarlite/skin/middleTooltip_white_160.png');");
		document.getElementById("_dlbar_progTipLeftImg").setAttribute("style", "list-style-image: url('chrome://downbarlite/skin/leftTooltip_white_square.png');");
		document.getElementById("_dlbar_progTipRightImg").setAttribute("style", "list-style-image: url('chrome://downbarlite/skin/rightTooltip_white_square.png');");
		document.getElementById("_dlbar_progTipMiddle").setAttribute("style", "background-image: url('chrome://downbarlite/skin/middleTooltip_white_160.png');");
		document.getElementById("_dlbar_finTipImgPreviewBox").setAttribute("style", "background-image: url('chrome://downbarlite/skin/middleTooltip_white_160.png');");
		
	}
}

var _dlbar_stopTooltip = gDownBarLite.stopTooltip = function _dlbar_stopTooltip(dlElem) {
	//d("in stopTooltip");
	try {
		var elem = document.getElementById(dlElem);
		window.clearTimeout(elem.getAttribute("pTimeCode"));
		elem.removeAttribute("pTimeCode");  // Remove it so we can detect and prevent duplicate update repeats
	} catch(e) {}
}

var _dlbar_setupProgTooltip = gDownBarLite.setupProgTooltip = function _dlbar_setupProgTooltip(progElem) {
	//d("in setupProgTooltip");
	
	var elem = document.getElementById(progElem);
	
	// If there is already a timeout for continuing this tooltip, don't start another one
	if(elem.getAttribute("pTimeCode"))
		return;
	
	document.getElementById("_dlbar_progTipIcon").setAttribute("src", "moz-icon:" + elem.getAttribute("target") + "?size=64"); // ask for a different size than the finished tooltips so that it will bypass cache
	document.getElementById("_dlbar_progTipSource").value = elem.getAttribute("source");
	
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(elem.getAttribute("target"));
	document.getElementById("_dlbar_progTipTarget").value = " " + localFile.path;  // This way it is formatted without the 'file:///'

	_dlbar_makeTooltip(progElem);
}


// Calls a timeout to itself at the end so the tooltip keeps updating with in progress info
var _dlbar_makeTooltip = gDownBarLite.makeTooltip = function _dlbar_makeTooltip(dlElemID) {
	//d("in makeTooltip: " + dlElemID);
	try {
		var elem = document.getElementById(dlElemID);
		
		var state = elem.getAttribute("state");
		if(state != 0 && state != 4 && state != 5) {  // if it isn't inprog, paused, or queued, return 
			document.getElementById("_dlbar_progTip").hidePopup();
			return;
		}
		
		var additionalText = " ";  // status text to be added after filename
		var _dlbar_unkStr = _dlbar_strings.getString("unknown");
		
		// if the state is queued, we won't know these
		if (state == 5) {
			percent = _dlbar_unkStr;
			totalSize = _dlbar_unkStr;
			remainTime = "--:--";
			currSize = "0 " + _dlbar_strings.getString("KiloBytesAbbr");
			speed = "0.0";
			additionalText = " - " + _dlbar_strings.getString("starting") + " ";
		}
		else { // state is inprog or paused
			
			try {
				var percent = elem.lastChild.lastChild.firstChild.value;
				var speed = elem.lastChild.lastChild.firstChild.nextSibling.value;
				var currSize = elem.lastChild.lastChild.lastChild.previousSibling.value;
				var remainTime = elem.lastChild.lastChild.lastChild.value;
				var totalSize = elem.pTotalKBytes;
			} catch(e) {} 	
			
			if (state == 4) {
				additionalText = " - " + _dlbar_strings.getString("paused") + " ";
			}
			
			// If the mode is undetermined, we won't know these - should totalsize be -1?
			if (parseInt(currSize) > parseInt(totalSize)) {
				percent = _dlbar_unkStr;
				totalSize = _dlbar_unkStr;
				remainTime = _dlbar_unkStr;
			}
			else {
				if (totalSize > 1024)
					totalSize = _dlbar_convertToMB(totalSize) + " " + _dlbar_strings.getString("MegaBytesAbbr");
				else
					totalSize = totalSize + " " + _dlbar_strings.getString("KiloBytesAbbr");
			}
		}
		
		document.getElementById("_dlbar_progTipFileName").value = elem.getAttribute("name") + additionalText;   // for some reason the last char is getting cut off by about 2px, adding a space after fixes it
		document.getElementById("_dlbar_progTipStatus").value = " " + currSize + " of " + totalSize + " (at " + speed + " " + _dlbar_strings.getString("KBperSecond") + ") ";
		document.getElementById("_dlbar_progTipTimeLeft").value = " " + remainTime + " ";   // for some reason the first and last number is getting cut off by about 2px, this fixes it
		document.getElementById("_dlbar_progTipPercentText").value = " " + percent + " ";
		
		elem.setAttribute("pTimeCode", window.setTimeout(function(){_dlbar_makeTooltip(dlElemID);}, 1000));
	} catch(e) {
		document.getElementById("_dlbar_progTip").hidePopup();
	}
}

var _dlbar_makeFinTip = gDownBarLite.makeFinTip = function _dlbar_makeFinTip(idtoview) {

	var dlElem = document.getElementById(idtoview);
	var dl = DownBar.downloadManager.getDownload(idtoview.substring(3));
	
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(dlElem.getAttribute("target"));
	var url = dlElem.getAttribute("source");
	var localFilename = dlElem.getAttribute("name");
	
	// if the download is cancelled or failed, indicate after the filename, otherwise, only print the filename
	// for some reason the last char is getting cut off by about 2px, adding a trailing space fixes it
	var state = dlElem.getAttribute("state");
	var additionalText = " ";
	
	if (state == 2)
		additionalText = " - " + _dlbar_strings.getString("failed") + " ";
	else if (state == 3)
		additionalText = " - " + _dlbar_strings.getString("cancelled") + " ";
	else if (state == 6 | state == 8)
		additionalText = " - " + _dlbar_strings.getString("avBlocked") + " ";
	else if (state == 7)
		additionalText = " - " + _dlbar_strings.getString("avScanning") + " ";
	
	document.getElementById("_dlbar_finTipFileName").value = localFilename + additionalText;

	if (state == 6 | state == 8) {  // antivirus blocked - use the firefox error icon like the download manager
		document.getElementById("_dlbar_finTipIcon").setAttribute("src", "chrome://global/skin/icons/Error.png");
	}
	else {
		// Get icon, fx dlmgr uses contentType to bypass cache, but I've found specifying a size will also bypass cache, 
		//     - just can't specify same icon size in the inprogress tooltips or that will be cached here
		// this way allows custom executable icons
		// Actually this doesn't work on linux - not sure why b/c the size attribute is fine in the dlmgr implementation, and size=16 work fine for the finished dl item in setStateSpecific
		//document.getElementById("_dlbar_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32");
		
		
	    // Keeping fx dlmgr implementation here for now - just in case
		// Set icon - Tacking on contentType in moz-icon bypasses cache, allows custom .exe icons
		try {
			const kExternalHelperAppServContractID = "@mozilla.org/uriloader/external-helper-app-service;1";
			var mimeService = Components.classes[kExternalHelperAppServContractID].getService(Components.interfaces.nsIMIMEService);
			var contentType = mimeService.getTypeFromFile(dl.targetFile);  // getting 'component not available' error, but I'm getting back a good value - not sure why the error
	
			document.getElementById("_dlbar_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32&contentType=" + contentType);
			
		} catch(e) {
			//document.getElementById("_dlbar_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32");
		}
	}
	
/**/
	
	var localFileSplit = localFilename.split(".");
	var fileext = localFileSplit[localFileSplit.length-1].toLowerCase();
	
	if(fileext == "gif" | fileext == "jpg" | fileext == "png" | fileext == "jpeg") {
		_dlbar_getImgSize(localFile);
		document.getElementById("_dlbar_finTipImgPreviewBox").hidden = false;
	}
	
	try {
		var startTime = dlElem.getAttribute("startTime");
		var endTime = dlElem.getAttribute("endTime");
		seconds = (endTime-startTime)/1000000;
		var completeTime = _dlbar_formatSeconds(seconds);
		if (completeTime == "00:00")
			completeTime = "<00:01";
		
	} catch(e) {
		seconds = -1;
		completeTime = _dlbar_strings.getString("unknown");
	}
	
	// Get DL size from the filesystem
	try {
		var dlSize = parseInt(localFile.fileSize / 1024);  // convert bytes to kilobytes
		var sizeString = dlSize;
		
		if (sizeString > 1024) {
			sizeString = _dlbar_convertToMB(sizeString);
			sizeString = sizeString + " " + _dlbar_strings.getString("MegaBytesAbbr");
		}
		else
			sizeString = sizeString + " " + _dlbar_strings.getString("KiloBytesAbbr");
		
	} catch(e) {
		// File doesn't exist
		dlSize = -1;
		var sizeString = _dlbar_strings.getString("fileNotFound");
	}

	try {
		if(dlSize != -1 && seconds != -1) {
			if(seconds == 0) 
				seconds = 1;
			var avgSpeed = dlSize / seconds;
			avgSpeed = Math.round(avgSpeed*100)/100;  // two decimal points
			avgSpeed = avgSpeed + " " + _dlbar_strings.getString("KBperSecond");
		}
		else {
			var avgSpeed = _dlbar_strings.getString("unknown");
		}
	} catch(e) {}

	document.getElementById("_dlbar_finTipSource").value = url;
	document.getElementById("_dlbar_finTipTarget").value = " " + localFile.path + " ";
	document.getElementById("_dlbar_finTipSize").value = " " + sizeString + " ";
	document.getElementById("_dlbar_finTipTime").value = " " + completeTime + " "; // for some reason the first and last number is getting cut off by about 2px, these spaces fix it
	document.getElementById("_dlbar_finTipSpeed").value = " " + avgSpeed + " ";

}

var _dlbar_getImgSize = gDownBarLite.getImgSize = function _dlbar_getImgSize(localFile) {
	//d("in getImgSize");
	
	// xxx Test if image is still in filesystem and display a "file not found" if it isn't
	
	var aImage = new Image();
	aImage.onload = function() {
		_dlbar_resizeShowImg(aImage.width, aImage.height, localFile);
	}
	aImage.src = "file://" + localFile.path;

}

var _dlbar_resizeShowImg = gDownBarLite.resizeShowImg = function _dlbar_resizeShowImg(width, height, localFile) {
	//d("in resizeShowImg");

	//d(width + " x " + height);
	var newHeight = 100;
	var newWidth = 100;
	
	if(width>height) {
		ratio = width / 100;
		newHeight = parseInt(height / ratio);
	//	d(newHeight);
		
	}
	if(height>width) {
		ratio = height / 100;
		newWidth = parseInt(width / ratio);
	//	d(newWidth);
		
	}
	
	document.getElementById("_dlbar_finTipImgPreview").setAttribute("width", newWidth);
	document.getElementById("_dlbar_finTipImgPreview").setAttribute("height", newHeight);
	
	document.getElementById("_dlbar_finTipImgPreview").setAttribute("src", "file://" + localFile.path);
	
}

var _dlbar_closeFinTip = gDownBarLite.closeFinTip = function _dlbar_closeFinTip() {
	//d("in closeFinTip");
	document.getElementById("_dlbar_finTipImgPreview").setAttribute("src", "");
	document.getElementById("_dlbar_finTipImgPreviewBox").hidden = true;
	document.getElementById("_dlbar_finTipIcon").setAttribute("src", "");
	
}

// Intercept the tooltip and show my fancy tooltip (placed at the correct corner) instead
var _dlbar_redirectTooltip = gDownBarLite.redirectTooltip = function _dlbar_redirectTooltip(origElem, popupElem) {
	
	if(origElem == null)
		var popupAnchor = popupElem.triggerNode;  // popup.triggerNode was introduced in Firefox 4.0beta4 (per popup) - replaces document.popupNode (per document)
	else
		var popupAnchor = origElem;
	
	// Find base download element
    while(!popupAnchor.id) {
		popupAnchor = popupAnchor.parentNode;
	}
	
	// holds a ref to this anchor node so we can remove the onmouseout later
    _dlbar_currTooltipAnchor = popupAnchor;

	var dlstate = popupAnchor.getAttribute("state");
	if(dlstate == 1 | dlstate == 2 | dlstate == 3 | dlstate == 6 | dlstate == 7| dlstate == 8)
    	document.getElementById("_dlbar_finTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');
    else if(dlstate == 0 | dlstate == 4 | dlstate == 5)
    	document.getElementById("_dlbar_progTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');
    
    // xxx In linux, a mouseout event is sent right away and the popup never shows, delay to avoid that
    // unless I can get rid of the special case below "if(!relTarget && (_dlbar_currTooltipAnchor.id == expOriTarget.id)) {"
    window.setTimeout(function(){
    	popupAnchor.setAttribute("onmouseout", "gDownBarLite.hideRedirPopup(event);");
    }, 50);
	
    return false;  // don't show the default tooltip

}

var _dlbar_hideRedirPopup = gDownBarLite.hideRedirPopup = function _dlbar_hideRedirPopup(aEvent) {
	
	//d("in hideRedir");
	//d("tooltipanchor " + _dlbar_currTooltipAnchor.id);
	try {
		if(aEvent) {
	/*		
		try {
			var target = aEvent.target;
		    while(!target.id) {
				target = target.parentNode;
			}
			d('      tar - ' + aEvent.target.id + " : " + target.id);	
		} catch(e){}
	*/		
		try {
			var relTarget = aEvent.relatedTarget;
			// Find a parent node with an id so that I know which element I'm on
		    while(!relTarget.id) {
				relTarget = relTarget.parentNode;
			}
			//d('   reltar - ' + aEvent.relatedTarget.id + " : " + relTarget.id);	
		} catch(e){
			//d('errorinreltarget');
		}
	/*		
		try {	
			var currtarget = aEvent.currentTarget;
		    while(!currtarget.id) {
				currtarget = currtarget.parentNode;
			}
			d('  currtar - ' + aEvent.currentTarget.id + " : " + currtarget.id);
		} catch(e){}		
		
		try {
			var oritarget = aEvent.originalTarget;
		    while(!oritarget.id) {
				oritarget = oritarget.parentNode;
			}
			d('   oritar - ' + aEvent.originalTarget.id + " : " + oritarget.id);	
		} catch(e){}
	*/	
		try {
			var expOriTarget = aEvent.explicitOriginalTarget;
		    while(!expOriTarget.id) {
				expOriTarget = expOriTarget.parentNode;
			}
			//d('expOritar - ' + aEvent.explicitOriginalTarget.id + " : " + expOriTarget.id);		
		} catch(e){}
		
		
		// These event targets are quirky - basically I want to not close the tooltip if I'm on another part of the same download element, 
		// or if I mouse up onto the popup
		try {
			var matchTarget;
			if(relTarget)
				matchTarget = relTarget.id;
			else
				matchTarget = expOriTarget.id;

			//d('matchingto: ' + matchTarget);
			//d(" ");
			// Allow cursor to go up on the tooltip and not close, Note: transparent tooltip background images have a 2px transparent
				// bottom so that the cursor can move directly between DL elem and tooltip
				// Opaque tooltips are flush with the dl element
			if(matchTarget.substring(0,13) == "_dlbar_finTip" | matchTarget.substring(0,14) == "_dlbar_progTip")
				return;	

			// xxx Can i do this in a differnet way so that linux works correctly?	without needing the timeout at the end of _dlbar_redirectTooltip()
			// Sometimes events don't work right, this is a special case where it messes up
			// This needs to be before the next if statement
			if(!relTarget && (_dlbar_currTooltipAnchor.id == expOriTarget.id)) {
				document.getElementById("_dlbar_finTip").hidePopup();
   				document.getElementById("_dlbar_progTip").hidePopup();
   				return;
			}
		
			// we are still on the same elem
			if(_dlbar_currTooltipAnchor.id == matchTarget)
				return;	
			
		} catch(e){}
		}
		
	} catch(e) {
		//d("error in hideredir");
	}
	
	// If there was no proper event, hide the popup by default anyway
	document.getElementById("_dlbar_finTip").hidePopup();
   	document.getElementById("_dlbar_progTip").hidePopup();
}

var _dlbar_mouseOutPopup = gDownBarLite.mouseOutPopup = function _dlbar_mouseOutPopup(aEvent) {

	// need to close the popup if the mouse goes outside the popup

/*	
	try {
		var target = aEvent.target;
	    while(!target.id) {
			target = target.parentNode;
		}
		d('     popup tar - ' + aEvent.target.id + " : " + target.id);	
	} catch(e){}
*/		
	try {
		var relTarget = aEvent.relatedTarget;
	    while(!relTarget.id) {
			relTarget = relTarget.parentNode;
		}
		//d('  popup reltar - ' + aEvent.relatedTarget.id + " : " + relTarget.id);	
	} catch(e){
		//d('errorinreltarget');
	}
/*
	try {	
		var currtarget = aEvent.currentTarget;
	    while(!currtarget.id) {
			currtarget = currtarget.parentNode;
		}
		d(' popup currtar - ' + aEvent.currentTarget.id + " : " + currtarget.id);
	} catch(e){}		
	
	try {
		var oritarget = aEvent.originalTarget;
	    while(!oritarget.id) {
			oritarget = oritarget.parentNode;
		}
		d('  popup oritar - ' + aEvent.originalTarget.id + " : " + oritarget.id);	
	} catch(e){}
	
	try {
		var expOriTarget = aEvent.explicitOriginalTarget;
	    while(!expOriTarget.id) {
			expOriTarget = expOriTarget.parentNode;
		}
		d('popup expOritar - ' + aEvent.explicitOriginalTarget.id + " : " + expOriTarget.id);		
	} catch(e){}

	d(' ');
*/	
	// These rules are weird I know... there are all kinda of quirky things here
	// I just had to study they outputs of each target type and find something that 
	// works when I want to close it and doesn't close when I don't want it to. 
	try {
		if(!relTarget && (aEvent.explicitOriginalTarget.id == "")) {
			return;
		}
		
		if(relTarget.id.substring(0,13) == "_dlbar_finTip" | relTarget.id.substring(0,14) == "_dlbar_progTip") {
			return;
		}
			
	} catch(e) {}
	
	document.getElementById("_dlbar_finTip").hidePopup();
   	document.getElementById("_dlbar_progTip").hidePopup();
}

var _dlbar_convertToMB = gDownBarLite.convertToMB = function _dlbar_convertToMB(size) {
	size = size/1024;
	size = Math.round(size*100)/100;  // two decimal points
	return size;
}

var _dlbar_formatSeconds = gDownBarLite.formatSeconds = function _dlbar_formatSeconds(secs) {
// Round the number of seconds to remove fractions.
	secs = parseInt( secs + .5 );
	var hours = parseInt( secs/3600 );
	secs -= hours*3600;
	var mins = parseInt( secs/60 );
	secs -= mins*60;
	var result;

    if ( mins < 10 )
        mins = "0" + mins;
    if ( secs < 10 )
        secs = "0" + secs;

    if (hours) {
    	if ( hours < 10 ) hours = "0" + hours;
    	result = hours + ":" + mins + ":" + secs;
	}
	else result = mins + ":" + secs;

    return result;
}

var _dlbar_readPrefs = gDownBarLite.readPrefs = function _dlbar_readPrefs() {
	// Get and save display prefs
	try {
		var percentDisp = Services.prefs.getBoolPref("downbar.display.percent");
		var speedDisp = Services.prefs.getBoolPref("downbar.display.speed");
		var sizeDisp = Services.prefs.getBoolPref("downbar.display.size");
		var timeDisp = Services.prefs.getBoolPref("downbar.display.time");
	} catch (e){}

	var dlTemplate = document.getElementById("_dlbar_downloadTemplate");
	// set which progress notifications are set to display on the download element template
	dlTemplate.lastChild.lastChild.firstChild.hidden = !percentDisp;
	dlTemplate.lastChild.lastChild.firstChild.nextSibling.hidden = !speedDisp;
	dlTemplate.lastChild.lastChild.lastChild.previousSibling.hidden = !sizeDisp;
	dlTemplate.lastChild.lastChild.lastChild.hidden = !timeDisp;

	// Get the anti-virus filetype exclude list and num for queue
	try {
		var excludeRaw = Services.prefs.getCharPref("downbar.function.virusExclude");
		excludeRaw = excludeRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		_dlbar_excludeList = excludeRaw.split(",");
		//_dlbar_queueNum = Services.prefs.getIntPref("downbar.function.queueNum");
	} catch(e){}

	// Get autoClear and ignore filetypes
	try {
		var clearRaw = Services.prefs.getCharPref("downbar.function.clearFiletypes");
		clearRaw = clearRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		_dlbar_clearList = clearRaw.split(",");

		var ignoreRaw = Services.prefs.getCharPref("downbar.function.ignoreFiletypes");
		ignoreRaw = ignoreRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
		_dlbar_ignoreList = ignoreRaw.split(",");
	} catch(e){}

	//Get SpeedColor settings
	try{
		_dlbar_speedColorsEnabled = Services.prefs.getBoolPref("downbar.style.speedColorsEnabled");
		if(_dlbar_speedColorsEnabled) {
			var speedRaw0 = Services.prefs.getCharPref("downbar.style.speedColor0");
			_dlbar_speedColor0 = speedRaw0.split(";")[1];
			// no division necessary should always be 0
			var speedRaw1 = Services.prefs.getCharPref("downbar.style.speedColor1");
			_dlbar_speedDivision1 = speedRaw1.split(";")[0];
			_dlbar_speedColor1 = speedRaw1.split(";")[1];
			var speedRaw2 = Services.prefs.getCharPref("downbar.style.speedColor2");
			_dlbar_speedDivision2 = speedRaw2.split(";")[0];
			_dlbar_speedColor2 = speedRaw2.split(";")[1];
			var speedRaw3 = Services.prefs.getCharPref("downbar.style.speedColor3");
			_dlbar_speedDivision3 = speedRaw3.split(";")[0];
			_dlbar_speedColor3 = speedRaw3.split(";")[1];
		}
	} catch(e){}

	// Open dlmgr onclose settings
	// If I'm launching the download manager with in-prog downloads onclose, then the download manager doesn't need to ask the cancel or exit prompt, so remove that observer from the download manager
	// first remove the observer to avoid adding duplicate observers
	try{
		Services.obs.removeObserver(DownBar.downloadManager, "quit-application-requested");
	} catch(e){}
	try{
		var launchDLWin = Services.prefs.getBoolPref("downbar.function.launchOnClose");
	} catch(e){}
	// Add back the download manager observer if we don't want to control onclose downloads
	if(!launchDLWin)
		 Services.obs.addObserver(DownBar.downloadManager, "quit-application-requested", false);
	// Animation setting
	try{
		_dlbar_useAnimation = Services.prefs.getBoolPref("downbar.function.useAnimation");
	} catch(e){}
	// Color Gradients Setting
	try{
		_dlbar_useGradients = Services.prefs.getBoolPref("downbar.style.useGradients");
	} catch(e){}
	try {
		_dlbar_miniMode = Services.prefs.getBoolPref("downbar.function.miniMode");
	} catch(e){}
}

var _dlbar_finishedClickHandle = gDownBarLite.finishedClickHandle = function _dlbar_finishedClickHandle(aElem, aEvent) {

	if(aEvent.button == 0 && aEvent.shiftKey)
		_dlbar_renameFinished(aElem.id);

	if(aEvent.button == 1) {
		// Hide the tooltip if present, otherwise it shifts to top left corner of the screen
		document.getElementById("_dlbar_finTip").hidePopup();
		
		if(aEvent.ctrlKey)
			_dlbar_startDelete(aElem.id, aEvent);
		else
			_dlbar_animateDecide(aElem.id, "clear", aEvent);
	}
	
	if(aEvent.button == 2) {
		// Hide the tooltip if present, otherwise both right-click menu and tooltip will disappear together
		document.getElementById("_dlbar_finTip").hidePopup();
	}
	
}

var _dlbar_progressClickHandle = gDownBarLite.progressClickHandle = function _dlbar_progressClickHandle(aElem, aEvent) {
	
	var state = aElem.getAttribute("state");

	if(aEvent.button == 0) {  // left click
		if(state == 0 | state == 5) {
			_dlbar_pause(aElem.id); 
		}
			
		if(state == 4) {
			_dlbar_resume(aElem.id);
		}
	}
		
	if(aEvent.button == 1) {  // middle click
		
		// Hide the tooltip if present, otherwise it shifts to top left corner of the screen
   		document.getElementById("_dlbar_progTip").hidePopup();
		_dlbar_cancelprogress(aElem.id);
	}
	
	if(aEvent.button == 2) {
		// Hide the tooltip if present, otherwise both right-click menu and tooltip will disappear together
   		document.getElementById("_dlbar_progTip").hidePopup();
	}
	
}

var _dlbar_clearButtonClick = gDownBarLite.clearButtonClick = function _dlbar_clearButtonClick(aEvent) {
	
	if(aEvent.button == 0) {  // left click
		_dlbar_clearAll();
	}
	
	if(aEvent.button == 1) {  // middle click
		_dlbar_undoClear();
	}
	
	if(aEvent.button == 2) {  // right click
	  // do nothing	
	}
	
}

var _dlbar_aPromptObj = {value:""};

var _dlbar_renameFinished = gDownBarLite.renameFinished = function _dlbar_renameFinished(elemid) {

	var dlElem = document.getElementById(elemid);
	
	var rename = _dlbar_strings.getString("rename");
	var to = _dlbar_strings.getString("to");
	var promptTitle = _dlbar_strings.getString("renameTitle");
	
	var oldfilename = dlElem.getAttribute("name");
	var ext = "";
	var oldArray = oldfilename.split(".");
	if(oldArray.length > 1)
		ext = oldArray.pop();
	var oldname = oldArray.join(".");
	if(ext != "")
		ext = "." + ext;

	var promptText = rename + "\n" + oldname + "\n" + to;
	_dlbar_aPromptObj.value = oldname;
	var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
	var nameChanged = ps.prompt(window, promptTitle, promptText, _dlbar_aPromptObj, null, {value: null});

	if(nameChanged) {
		var file = _dlbar_getLocalFileFromNativePathOrUrl(dlElem.getAttribute("target"));
		var newfilename = _dlbar_aPromptObj.value + ext;
		if(oldfilename == newfilename)
			return;
			
		// Check if the filename already exists	
		var newFile = file.parent;
		newFile.append(newfilename);
		if(newFile.exists()) {
			// ask to replace or cancel instead? or go back to rename prompt?
			var promptSer = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
			promptSer.alert(null, "Download Statusbar", _dlbar_strings.getString("fileExists"));
			return;
		}
			
		try {
			file.moveTo(null, newfilename);
		} catch(e) {
			// File not found
			var browserStrings = document.getElementById("bundle_browser");
			document.getElementById("statusbar-display").label = _dlbar_strings.getString("fileNotFound");
    		window.setTimeout(function(){document.getElementById("statusbar-display").label = browserStrings.getString("nv_done");}, 3000);
			return;
		}
		
		try {
			// Fix the database
			// Convert filepath to its URI representation as it is stored in the database
			var nsIIOService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
			var fileURI = nsIIOService.newFileURI(newFile,null,null).spec;
			
			var dbase = DownBar.downloadManager.DBConnection;
			dbase.executeSimpleSQL("UPDATE moz_downloads SET name='" + newfilename + "' WHERE id=" + elemid.substring(3));
			dbase.executeSimpleSQL("UPDATE moz_downloads SET target='" + fileURI + "' WHERE id=" + elemid.substring(3));
		} catch(e) {}
		
		// Change the download item data in all windows
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var e = wm.getEnumerator("navigator:browser");
		var win, winElem;

		while (e.hasMoreElements()) {
			win = e.getNext();
			winElem = win.document.getElementById(elemid);

			winElem.setAttribute("name", newfilename);
			winElem.setAttribute("target", fileURI);
			winElem.lastChild.firstChild.nextSibling.value = newfilename;
		}
		
		// make the filename text bold for 2 sec - this way works for both default and custom styles
		var origStyle = dlElem.lastChild.getAttribute("style");
		var tempStyle = origStyle + "font-weight:bold;";

		dlElem.lastChild.firstChild.nextSibling.setAttribute("style", tempStyle);
		window.setTimeout(function(){
			dlElem.lastChild.firstChild.nextSibling.setAttribute("style", origStyle);
		}, 2000);
	}
}

// xxx still needed?
var _dlbar_toggleDownbar = gDownBarLite.toggleDownbar = function _dlbar_toggleDownbar() {

	var downbarHoldElem = document.getElementById("downbarHolder");
	if (downbarHoldElem.hidden) {
		downbarHoldElem.hidden = false;
		_dlbar_checkShouldShow();
	}
	else
		downbarHoldElem.hidden = true;
}

var _dlbar_checkMiniMode = gDownBarLite.checkMiniMode = function _dlbar_checkMiniMode() {

	var currDownbar = document.getElementById("downbar").localName;
	var downbarHolder = document.getElementById("downbarHolder");

	if(_dlbar_miniMode) {

		if(currDownbar == "hbox") { // convert to miniMode
			
			document.getElementById("downbar").id = "downbarHboxTemp";
			document.getElementById("downbarPopupTemp").id = "downbar";
			
			// Remove all current downloads if any
			var oldDownbar = document.getElementById("downbarHboxTemp");
			while (oldDownbar.firstChild) {
		    	oldDownbar.removeChild(oldDownbar.firstChild);
		 	}

			downbarHolder.hidden = true;
			document.getElementById("downbarMini").collapsed = false;

		}
		document.getElementById("_dlbar_changeModeContext").label = _dlbar_strings.getString("toFullMode");
		document.getElementById("_dlbar_changeModeContext2").label = _dlbar_strings.getString("toFullMode");
	}
	else {
		if(currDownbar == "vbox") { // convert to fullMode
			document.getElementById("downbar").id = "downbarPopupTemp";
			document.getElementById("downbarHboxTemp").id = "downbar";
			
			// Remove all current downloads if any
			var oldDownbar = document.getElementById("downbarPopupTemp");
			while (oldDownbar.firstChild) {
		    	oldDownbar.removeChild(oldDownbar.firstChild);
		 	}
			
			document.getElementById("downbarMini").collapsed = true;
			downbarHolder.hidden = false;
		}
		document.getElementById("_dlbar_changeModeContext").label = _dlbar_strings.getString("toMiniMode");
		document.getElementById("_dlbar_changeModeContext2").label = _dlbar_strings.getString("toMiniMode");
	}
}

var _dlbar_startUpdateMini = gDownBarLite.startUpdateMini = function _dlbar_startUpdateMini() {

	window.setTimeout(function(){_dlbar_updateMini();}, 444);

}

var _dlbar_updateMini = gDownBarLite.updateMini = function _dlbar_updateMini() {
	
	try {
		var activeDownloads = DownBar.downloadManager.activeDownloadCount;
		var dbelems = document.getElementById("downbar").childNodes;
		var finishedDownloads = dbelems.length - activeDownloads;
		document.getElementById("downbarMiniText").value = activeDownloads + ":" + finishedDownloads;
		//downbarMini:  Collapsed if it isn't being used, hidden if it is being used but there is nothing in it
		if(activeDownloads + finishedDownloads == 0)
			document.getElementById("downbarMini").hidden = true;
		else
			document.getElementById("downbarMini").hidden = false;
		
	} catch(e){}
}

var _dlbar_showMiniPopup = gDownBarLite.showMiniPopup = function _dlbar_showMiniPopup(miniElem, event) {

	if(event.button == 1)
		_dlbar_modeToggle();

	if(event.button == 0)
		document.getElementById("downbarPopup").showPopup(miniElem,  -1, -1, 'popup', 'topright' , 'bottomright');

	var dbelems = document.getElementById("downbar").childNodes;
	for (var i = 1; i <= dbelems.length - 1; ++i) {
		contextAttr = dbelems[i].getAttribute("context");
		if (contextAttr == "_dlbar_progresscontext") {
			window.clearTimeout(dbelems[i].pTimeout);
			_dlbar_updateDLrepeat(dbelems[i].id);
		}
	}
}

var _dlbar_modeToggle = gDownBarLite.modeToggle = function _dlbar_modeToggle() {

	Services.prefs.setBoolPref("downbar.function.miniMode", !_dlbar_miniMode);
	_dlbar_miniMode = !_dlbar_miniMode;

	_dlbar_checkMiniMode();
	_dlbar_populateDownloads();
	_dlbar_updateMini();
}

var _dlbar_showMainPopup = gDownBarLite.showMainPopup = function _dlbar_showMainPopup(buttonElem, event) {

	if(event.button == 0)
		document.getElementById("_dlbar_mainButtonMenu").showPopup(buttonElem,  -1, -1, 'popup', 'topleft' , 'bottomleft');

}

// This is in case a new window is opened while a download is already in progress - need to start the update repeat
var _dlbar_startInProgress = gDownBarLite.startInProgress = function _dlbar_startInProgress() {

	var dbelems = document.getElementById("downbar").childNodes;
	for (var i = 0; i <= dbelems.length - 1; ++i) {
		state = dbelems[i].getAttribute("state");
		if (state == 0 | state == 5 | state == 4) {   // in progress, queued, or paused
				_dlbar_updateDLrepeat(dbelems[i].id);
		}
	}
}

var _dlbar_checkHideMiniPopup = gDownBarLite.checkHideMiniPopup = function _dlbar_checkHideMiniPopup() {
	
	// This function will prevent an empty mini mode popup from showing after all the downloads are cleared
	// This is called from onDOMNodeRemoved from the mini mode, it executes before the element is actually gone, so check if there is 1 left
	if(document.getElementById('downbar').childNodes.length == 1) 
		_dlbar_hideDownbarPopup();
}

var _dlbar_hideDownbarPopup = gDownBarLite.hideDownbarPopup = function _dlbar_hideDownbarPopup() {
	try {
		// This is only for the miniDownbar - prevents the downbar popup from getting stuck after using the context menu on an item
		// gets called from the onpopuphidden of each download item context menu
		document.getElementById("downbarPopup").hidePopup();
	} catch(e){}
}

// this function and following comments from firefox 1.0.4 download manager
// we should be using real URLs all the time, but until
// bug 239948 is fully fixed, this will do...
var _dlbar_getLocalFileFromNativePathOrUrl = gDownBarLite.getLocalFileFromNativePathOrUrl = function _dlbar_getLocalFileFromNativePathOrUrl(aPathOrUrl) {
  if (aPathOrUrl.substring(0,7) == "file://") {

    // if this is a URL, get the file from that
    ioSvc = Components.classes["@mozilla.org/network/io-service;1"]
      .getService(Components.interfaces.nsIIOService);

    // XXX it's possible that using a null char-set here is bad
    const fileUrl = ioSvc.newURI(aPathOrUrl, null, null).
      QueryInterface(Components.interfaces.nsIFileURL);
    return fileUrl.file.clone().
      QueryInterface(Components.interfaces.nsILocalFile);

  } else {

    // if it's a pathname, create the nsILocalFile directly
    f = Components.classes["@mozilla.org/file/local;1"].
      createInstance(Components.interfaces.nsILocalFile);
    f.initWithPath(aPathOrUrl);

    return f;
  }
}

// This function from firefox 1.5beta2
var _dlbar_openExternal = gDownBarLite.openExternal = function _dlbar_openExternal(aFile)
{
  var uri = Components.classes["@mozilla.org/network/io-service;1"]
                      .getService(Components.interfaces.nsIIOService)
                      .newFileURI(aFile);

  var protocolSvc =
      Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                .getService(Components.interfaces.nsIExternalProtocolService);

  protocolSvc.loadUrl(uri);

  return;
}

var _dlbar_openDownloadWindow = gDownBarLite.openDownloadWindow = function _dlbar_openDownloadWindow() {
    
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
    
	var dlwin = wm.getMostRecentWindow("Download:Manager");
    if(dlwin)
            var dlwinExists = true;
        else
            var dlwinExists = false;
    if(!dlwinExists)
		window.open('chrome://mozapps/content/downloads/downloads.xul', '', 'chrome');
	else
		dlwin.focus();
}


var _dlbar_showSampleDownload = gDownBarLite.showSampleDownload = function _dlbar_showSampleDownload() {
	
	var dbase = DownBar.downloadManager.DBConnection;
	
	// Set the most recent download to show
	try {
		dbase.executeSimpleSQL("UPDATE moz_downloads SET DownbarShow=1 WHERE id IN (SELECT id FROM moz_downloads WHERE state=1 ORDER BY id DESC LIMIT 1)");
	} catch(e) {}
}

var _dlbar_privateBrowsingObs = {
  observe: function _dlbar_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "private-browsing":
        if (aData == "enter" || aData == "exit") {
         
          // Upon switching to/from private browsing, the download manager backend 
          // switches databases (nsDownloadManager.cpp) - switch is transparent to us  
          // but need to repopulate the download statusbar using the new database
          
           // Warning from built-in downloads.js:
          // "We might get this notification before the download manager
          // service, so the new database connection might not be ready
          // yet.  Defer this until all private-browsing notifications
          // have been processed."

          setTimeout(function() {
            _dlbar_populateDownloads();
			_dlbar_startInProgress();
			_dlbar_checkShouldShow();
          }, 0);
        }
        break;
    }
  }
};

var _dlbar_startDLElemDrag = gDownBarLite.startDLElemDrag = function _dlbar_startDLElemDrag(aElem, aEvent) {

	// need the base DL elem, go up to find it, it is the first with an id
	while(!aElem.id) {
		aElem = aElem.parentNode;
	}
	
	var fileUrl = aElem.getAttribute("target");
	//d("origfile: " + fileUrl);
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(fileUrl);
	if (!localFile.exists()) {
		var browserStrings = document.getElementById("bundle_browser");
		document.getElementById("statusbar-display").label = "Download Statusbar: " + _dlbar_strings.getString("fileNotFound");
    	window.setTimeout(function(){document.getElementById("statusbar-display").label = browserStrings.getString("nv_done");}, 1500);
		return;
	}

    var dt = aEvent.dataTransfer;
    dt.mozSetDataAt("application/x-moz-file", localFile, 0);
    dt.setDragImage(aElem, 30, 10);
    dt.effectAllowed = "copyMove";
}

var _dlbar_DLElemDragEnd = gDownBarLite.DLElemDragEnd = function _dlbar_DLElemDragEnd(aElem, aEvent) {
	
	//d('indragend');
	// Check if the file is still in the same location, if not, clear it from the bar
	// need the base DL elem, go up to find it, it is the first with an id
	while(!aElem.id) {
		aElem = aElem.parentNode;
	}
	
	var fileUrl = aElem.getAttribute("target");
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(fileUrl);
	
	window.setTimeout(function(){	
		if (!localFile.exists()){
			_dlbar_animateDecide(aElem.id, "clear", {shiftKey:false});
		}
	}, 500);

}


/*
// DragOver and onDrop would be useful for rearranging elements on the downbar, or dropping a download link onto the downbar to start a download
var _dlbar_DLElemDragOver = gDownBarLite.DLElemDragOver = function _dlbar_DLElemDragOver(aEvent) {
d('indragover');
    var types = aEvent.dataTransfer.types;
    if (types.contains("text/uri-list") ||
        types.contains("text/x-moz-url") ||
        types.contains("text/plain"))
      aEvent.preventDefault();
}

var _dlbar_DLElemOnDrop = gDownBarLite.DLElemOnDrop = function _dlbar_DLElemOnDrop(aEvent) {
d('inondrop');
    var dt = aEvent.dataTransfer;
    var url = dt.getData("URL");
    var name;
    if (!url) {
      url = dt.getData("text/x-moz-url") || dt.getData("text/plain");
      [url, name] = url.split("\n");
    }
    
    d("url - " + url);
    if (url)
      saveURL(url, name ? name : url, null, true, true);
}
*/





/*
// Supposed to be the *new* API to drag and drop but it's still crap...
var _dlbar_startDLElemDrag = gDownBarLite.startDLElemDrag = function _dlbar_startDLElemDrag(aElem, event) {

	d('here startDLELEMDRAG');
	var aElem = event.target;
		
	// need the base DL elem, go up to find it, it is the first with an id
	while(!aElem.id) {
		aElem = aElem.parentNode;
	}
	
	var fileUrl = aElem.getAttribute("target");
	d("url: " + fileUrl);
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(fileUrl);
	if (!localFile.exists()) 
		return;

	var dataT = event.dataTransfer;
	dataT.mozSetDataAt("application/x-moz-file", localFile, 0);
	dataT.effectAllowed = "copyMove";

	
	
	
	var mimeServ = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
	var contentType = mimeServ.getTypeFromFile(localFile);
	d("cont: " + contentType);
	d("leaf: " + encodeURIComponent(localFile.leafName));

	var info = fileUrl + "&type=" + contentType + "&filename=" + encodeURIComponent(localFile.leafName);
	var localFile = _dlbar_getLocalFileFromNativePathOrUrl(aElem.getAttribute("target"));


	// xxx check that file exists before proceeding
	event.dataTransfer.mozSetDataAt("application/x-moz-file-promise", new _dlbar_nsFlavorDataProvider(), 0);
	event.dataTransfer.mozSetDataAt("application/x-moz-file-promise-url", fileUrl, 1);
	event.dataTransfer.mozSetDataAt("text/x-moz-url", info + "\n" + localFile.leafName, 2);
	event.dataTransfer.mozSetDataAt("text/x-moz-url-data", fileUrl, 3);
	event.dataTransfer.mozSetDataAt("text/x-moz-url-desc", localFile.leafName, 4);

	var iconImage = aElem.lastChild.firstChild.firstChild;
	event.dataTransfer.setDragImage(iconImage, 8, 16);
	
	event.dataTransfer.effectAllowed = "move";

	d('end of startDLELEM');
}
*/

// Trying to get the destination directory, but it doesn't work like it does in thunderbird from the flavordataprovider
/*
var _dlbar_endDLElemDrag = gDownBarLite.endDLElemDrag = function _dlbar_endDLElemDrag(aElem, event) {
	
	d('inenddrag');
	d(event.dataTransfer);
	var dirPrimitive = {};
	var dataSize = {};
    var dir = event.dataTransfer.getData("application/x-moz-file-promise-dir");
    //var destDirectory = dirPrimitive.value.QueryInterface(Components.interfaces.nsILocalFile);
	d("dir: " + event.dataTransfer.types.item(0));

}
*/
/*
// Drag and drop TO the filesystem, Don't understand why this has to be so complicated.  
// Modeled after the thunderbird drag and drop of email attachments.  
// See msgHdrViewOverlay.js, but it doesn't work quite the same way
// This is a mess because mozilla doesn't support this properly...  flavordataprovider is not actually used 
// This will copy a file, not move it - asking it to move still copies
var _dlbar_dragDropObserver = {

	onDragStart: function (event, transferData, aDragAction) {

		//d('here');
		//d(event.dataTransfer);
		var aElem = event.target;
		
		// need the base DL elem, go up to find it, it is the first with an id
		while(!aElem.id) {
			aElem = aElem.parentNode;
		}
		
		var fileUrl = aElem.getAttribute("target");
		//d("url: " + fileUrl);
		var localFile = _dlbar_getLocalFileFromNativePathOrUrl(fileUrl);
		
		var mimeServ = Components.classes["@mozilla.org/mime;1"].getService(Components.interfaces.nsIMIMEService);
		var contentType = mimeServ.getTypeFromFile(localFile);
		//d("cont: " + contentType);
		//d("leaf: " + encodeURIComponent(localFile.leafName));
		
		
		var data = new TransferData();

		var info = fileUrl + "&type=" + contentType + "&filename=" + encodeURIComponent(localFile.leafName);
		//d("info: " + info);
		
		data.addDataForFlavour("text/x-moz-url", info + "\n" + localFile.leafName);
		//data.addDataForFlavour("text/x-moz-url", encodeURIComponent(localFile.path);
		//data.addDataForFlavour("text/x-moz-url-data", fileUrl);
		//data.addDataForFlavour("text/x-moz-url-desc", localFile.leafName);
		//data.addDataForFlavour("text/plain", localFile.path);
		data.addDataForFlavour("application/x-moz-file-promise-url", fileUrl);
		//data.addDataForFlavour("application/x-moz-file-promise", new _dlbar_nsFlavorDataProvider(), 0, Components.interfaces.nsISupports);
		
		// xxx This is stupid - it doesn't actually use the flavorDataProvider, but this flavor is still necessary, though it has bogus contents
		data.addDataForFlavour("application/x-moz-file-promise", "a");
		transferData.data = data;
		
		// This doesn't appear to do what it should - file gets copied
		aDragAction.action = Components.interfaces.nsIDragService.DRAGDROP_ACTION_MOVE;
		//event.dataTransfer.effectAllowed = "move";
		//d('got here');
				
	// need to remove file from bar after it is moved by dragging 
	//  or change the database if I could get the drag location (but I can't)
	//  but for now it is actually just copying the file, do nothing
	}

};
*/
/*
// Thunderbird uses this, but for some reason it is never actually called here
var _dlbar_nsFlavorDataProvider = gDownBarLite.nsFlavorDataProvider = function _dlbar_nsFlavorDataProvider()
{
}

_dlbar_nsFlavorDataProvider.prototype =
{
  QueryInterface : function(iid)
  {
  
      if (iid.equals(Components.interfaces.nsIFlavorDataProvider) ||
          iid.equals(Components.interfaces.nsISupports))
        return this;
      throw Components.results.NS_NOINTERFACE;
  },

  getFlavorData : function(aTransferable, aFlavor, aData, aDataLen)
  {
alert('here3');	
    // get the url for the attachment
    if (aFlavor == "application/x-moz-file-promise")
    {
      var urlPrimitive = { };
      var dataSize = { };
      aTransferable.getTransferData("application/x-moz-file-promise-url", urlPrimitive, dataSize);

      var srcUrlPrimitive = urlPrimitive.value.QueryInterface(Components.interfaces.nsISupportsString);

      // now get the destination file location from kFilePromiseDirectoryMime
      var dirPrimitive = {};
      aTransferable.getTransferData("application/x-moz-file-promise-dir", dirPrimitive, dataSize);
      var destDirectory = dirPrimitive.value.QueryInterface(Components.interfaces.nsILocalFile);
d(destDirectory);
      // now save the attachment to the specified location
      // XXX: we need more information than just the attachment url to save it, fortunately, we have an array
      // of all the current attachments so we can cheat and scan through them

      var attachment = null;
      for (index in currentAttachments)
      {
        attachment = currentAttachments[index];
        if (attachment.url == srcUrlPrimitive)
          break;
      }

      // call our code for saving attachments
      if (attachment)
      {
        var destFilePath = messenger.saveAttachmentToFolder(attachment.contentType, attachment.url, encodeURIComponent(attachment.displayName), attachment.uri, destDirectory);
        aData.value = destFilePath.QueryInterface(Components.interfaces.nsISupports);
        aDataLen.value = 4;
      }
	  
    }
  }

};
*/

/*
// Dump a message to Javascript Console
function d(msg){
	var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	acs.logStringMessage(msg);
}*/

window.addEventListener("load", _dlbar_init, true);
window.addEventListener('unload', _dlbar_close, false);
window.addEventListener("focus", _dlbar_newWindowFocus, true);
window.addEventListener("blur", _dlbar_hideOnBlur, true);

})();

