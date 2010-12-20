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



// This is designed to be a completly seperate module from the main bulk of Download Statusbar's code
// Only changes in the main code are in the options window
// That way it could be a seperate add-on in the future  
// Replaces many original Download Statusbar functions with versions that do the same thing for both firefox downloads and DTA downloads

// Works in conjunction with included dtaOverlay.js
// In progress DTA downloads are discovered in dtaOverlay.js
// Finished DTA downloads are put into a custom json database and stored in the profile directory at dlsb_downloads.json
	// The DTA window is not asked for info on finished downloads
	// This way download statusbar can keep record of finished downloads that are removed from DTA window  


window.addEventListener("load", db_dtaIntegrationInit, true);

var db_dtaSavedFinished = new Array();  // list of the DTA finished downloads that we are displaying on downbar

// holders for original download statusbar functions
var ORIGdb_populateDownloads, ORIGdb_showMiniPopup, ORIGdb_clearOne, ORIGdb_clearAll, ORIGdb_pauseAll, 
	ORIGdb_resumeAll, ORIGdb_cancelAll, ORIGdb_cancelprogress, 	ORIGdb_pause, ORIGdb_resume, 
	ORIGdb_redirectTooltip, ORIGdb_makeFinTip, ORIGdb_makeTooltip, ORIGdb_updateMini, ORIGdb_renameFinished;


function db_dtaIntegrationInit() {
	
	// Check if integration is enabled and that DTA is installed
	if(db_pref.getBoolPref("downbar.integration.enableDTA")) {
		
		var ext = Components.classes['@mozilla.org/extensions/manager;1'].getService(Components.interfaces.nsIExtensionManager);
		var dtaExt = ext.getItemForID("{DDC359D1-844A-42a7-9AA1-88A850A938A8}");

		if(dtaExt) {
			window.setTimeout(function() {
				db_dtaInitDelay();
			}, 10);
		}
	}
}

function db_dtaInitDelay() {

	// Replace some of download statusbar's default functions, mostly calling the original, then the DTA version
	
	ORIGdb_populateDownloads = window.db_populateDownloads;
	var NEWdb_populateDownloads = function() {
		
									ORIGdb_populateDownloads();
									db_dtaAddFinished();
									
									window.setTimeout(function(){
										var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
										var dtaWin = wm.getMostRecentWindow("DTA:Manager");
										if(dtaWin)
											dtaWin.db_dtaAddProgressDownloads();
									}, 10);
									};
	window.db_populateDownloads = NEWdb_populateDownloads;
	window.db_populateDownloads();  // Call it in case this wasn't set up before original call in downbar main init
	
	ORIGdb_showMiniPopup = window.db_showMiniPopup;
	var NEWdb_showMiniPopup = window.db_dtaShowMiniPopup;
	window.db_showMiniPopup = NEWdb_showMiniPopup;
		
	ORIGdb_clearOne = window.db_clearOne;
	var NEWdb_clearOne = function(idtoclear) {ORIGdb_clearOne(idtoclear); db_dtaRemoveIdFromDatabase(idtoclear);};
	window.db_clearOne = NEWdb_clearOne;
	
	// DTA stuff should be first, else it will conflict on trying to remove twice 
	//       and DTA stuff will get put in the recently cleared list
	ORIGdb_clearAll = window.db_clearAll;
	var NEWdb_clearAll = function() {db_dtaRemoveAllFromDatabase(); ORIGdb_clearAll();};  
	window.db_clearAll = NEWdb_clearAll;
	
	ORIGdb_pauseAll = window.db_pauseAll;
	var NEWdb_pauseAll = window.db_dtaPauseAll;  // replace entire function
	window.db_pauseAll = NEWdb_pauseAll;
	
	ORIGdb_resumeAll = window.db_resumeAll;
	var NEWdb_resumeAll = window.db_dtaResumeAll;  // replace entire function
	window.db_resumeAll = NEWdb_resumeAll;
	
	ORIGdb_cancelAll = window.db_cancelAll;
	var NEWdb_cancelAll = window.db_dtaCancelAll;  // replace entire function
	window.db_cancelAll = NEWdb_cancelAll;
	
	ORIGdb_cancelprogress = window.db_cancelprogress;
	var NEWdb_cancelprogress = function(elemtocancel){
									if (elemtocancel.substr(0,3) == "db_")   // It's a firefox download
										ORIGdb_cancelprogress(elemtocancel);
									else 
										db_dtaCancel(elemtocancel);      // It's a DTA download
								};
	window.db_cancelprogress = NEWdb_cancelprogress;
	
	ORIGdb_pause = window.db_pause;
	var NEWdb_pause = function(elemid, aEvent){
							if (elemid.substr(0,3) == "db_")   // It's a firefox download
								ORIGdb_pause(elemid, aEvent);
							else 
								db_dtaPause(elemid);      // It's a DTA download
						};
	window.db_pause = NEWdb_pause;
	
	ORIGdb_resume = window.db_resume;
	var NEWdb_resume = function(elemid, aEvent){
							if (elemid.substr(0,3) == "db_")   // It's a firefox download
								ORIGdb_resume(elemid, aEvent);
							else 
								db_dtaResume(elemid);      // It's a DTA download
						};
	window.db_resume = NEWdb_resume;	
	
	ORIGdb_redirectTooltip = window.db_redirectTooltip;
	var NEWdb_redirectTooltip = window.db_dtaRedirectTooltip;  // replace entire function
	window.db_redirectTooltip = NEWdb_redirectTooltip;

	ORIGdb_makeFinTip = window.db_makeFinTip;
	var NEWdb_makeFinTip = function(idtoview) {
								if (idtoview.substr(0,3) == "db_")   // It's a firefox download
									ORIGdb_makeFinTip(idtoview);
								else 
									db_dtaMakeFinTip(idtoview);      // It's a DTA download
							};
	window.db_makeFinTip = NEWdb_makeFinTip;
	
	ORIGdb_makeTooltip = window.db_makeTooltip;
	var NEWdb_makeTooltip = function(dlElemID) {
								if (dlElemID.substr(0,3) == "db_")   // It's a firefox download
									ORIGdb_makeTooltip(dlElemID);
								else 
									db_dtaMakeTooltip(dlElemID);      // It's a DTA download
							};
	window.db_makeTooltip = NEWdb_makeTooltip;
	
	ORIGdb_updateMini = window.db_updateMini;
	var NEWdb_updateMini = db_dtaUpdateMini;       // replace entire function
	window.db_updateMini = NEWdb_updateMini;
	
	ORIGdb_renameFinished = window.db_renameFinished;
	var NEWdb_renameFinished = function(elemid){ORIGdb_renameFinished(elemid); db_dtaFixDatabaseAfterRename(elemid);};
	window.db_renameFinished = NEWdb_renameFinished;
}

function db_dtaDisable() {

	// Remove inprogress and finished DTA downloads from the downbar
	var downbar = document.getElementById("downbar");
	var dbelems = downbar.childNodes;
	
	var i = dbelems.length - 1;    // Go backwards so that removing a download doesn't mess up the sequence
	while (i >= 0) {
		
		if (dbelems[i].id.substr(0,3) == "dta") {
			downbar.removeChild(dbelems[i]);
		}
		
		i = i - 1;
	}
	
	// removes everything from the database - do I really want to nuke these?
	//db_dtaSavedFinished.length = 0;
	//db_dtaWriteDatabaseToFile();

	// Set these Download Statusbar functions back to the originals
	window.db_populateDownloads = ORIGdb_populateDownloads;
	window.db_showMiniPopup = ORIGdb_showMiniPopup;
	window.db_clearOne = ORIGdb_clearOne;
	window.db_clearAll = ORIGdb_clearAll;
	window.db_pauseAll = ORIGdb_pauseAll;
	window.db_resumeAll = ORIGdb_resumeAll;
	window.db_cancelAll = ORIGdb_cancelAll;
	window.db_cancelprogress = ORIGdb_cancelprogress;
	window.db_pause = ORIGdb_pause;
	window.db_resume = ORIGdb_resume;	
	window.db_redirectTooltip = ORIGdb_redirectTooltip;
	window.db_makeFinTip = ORIGdb_makeFinTip;
	window.db_makeTooltip = ORIGdb_makeTooltip;
	window.db_updateMini = ORIGdb_updateMini;
	window.db_renameFinished = ORIGdb_renameFinished;

	db_checkShouldShow();
	db_startUpdateMini();
}

function db_dtaInsertNewDownload(aId, aTarget, aName, aSource, aState, aStartTime, aReferrer) {
	
	// Check if that download item already exists on the downbar
	if(document.getElementById(aId)) {
		db_dtaSetStateSpecific(aId, aState);
		return;
	}
	
	var newDownloadElem = document.getElementById("db_downloadTemplate").cloneNode(true);
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
	
	db_dtaSetStateSpecific(newDownloadElem.id, aState);
	
	newDownloadElem.hidden = false;
	
	db_checkShouldShow();
	db_startUpdateMini();
	
}

function db_dtaSetStateSpecific(aDLElemID, aState) {
	
	var dlElem = document.getElementById(aDLElemID);
	
	try {
		var styleDefault = db_pref.getBoolPref("downbar.style.default");
	} catch (e){}
	
	switch(aState) {
		
		case 4:  // In progress
				
			dlElem.setAttribute("class", "db_progressStack");
			dlElem.setAttribute("context", "progresscontext");  // make DTA specific progresscontext
			dlElem.setAttribute("onclick", "db_dtaProgressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = false;  // Progress indicators
			
			if(!styleDefault) {
				try {
					var progressStyle = db_pref.getCharPref("downbar.style.db_progressStack");
					dlElem.setAttribute("style", progressStyle);
				} catch (e){}	
			}
		
		break;
			
		case 2:  // Paused

			dlElem.setAttribute("class", "db_pauseStack");
			dlElem.setAttribute("context", "pausecontext");
			dlElem.setAttribute("onclick", "db_dtaProgressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = false;  // Progress indicators
			
			if(!styleDefault) {
				try {
					var pausedStyle = db_pref.getCharPref("downbar.style.db_pausedHbox");
					dlElem.setAttribute("style", pausedStyle);
				} catch (e){}	
			}
			
		break;
		
		// XXX make queued downloads look different so they don't look stuck
		case 64:  // Queued
			dlElem.setAttribute("class", "db_progressStack");
			dlElem.setAttribute("context", "progresscontext");
			dlElem.setAttribute("onclick", "db_dtaProgressClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "");
			dlElem.setAttribute("ondraggesture", "");
			
			dlElem.firstChild.hidden = false;            // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = true;  // Icon stack
			dlElem.lastChild.lastChild.hidden = true;  // Progress indicators - these won't have anything useful while queued
			
			if(!styleDefault) {
				try {
					var progressStyle = db_pref.getCharPref("downbar.style.db_progressStack");
					dlElem.setAttribute("style", progressStyle);
				} catch (e){}
			}
			
		break;
		
		case 8:  // Finished
			
			// if the state is 8, it will not open in db_startOpenFinished - I could change this function but this is easier
			dlElem.setAttribute("state", 16);
			// Don't break, continue on to finished 16 state
		case 16:
			
			// set endTime on download element??? need this?
				
			//dlElem.setAttribute("endTime", endTime);

			dlElem.setAttribute("class", "db_finishedHbox");
			dlElem.setAttribute("context", "donecontext");
			dlElem.setAttribute("onclick", "db_dtaFinishedClickHandle(this, event); event.stopPropagation();");
			dlElem.setAttribute("ondblclick", "db_startOpenFinished(this.id); event.stopPropagation();");
			//dlElem.setAttribute("ondragstart", "db_startDLElemDrag(this, event);");
			dlElem.setAttribute("ondragstart", "nsDragAndDrop.startDrag(event, db_dragDropObserver);");
			//dlElem.setAttribute("ondragend", "db_endDLElemDrag(this, event);");
			
			// Get icon, fx dlmgr uses contentType to bypass cache, but I've found specifying a size will also bypass cache, 
			//     - just can't specify same icon size in the inprogress tooltips or that will be cached here
			// this way allows custom executable icons
			dlElem.lastChild.firstChild.firstChild.setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=16");
    
			dlElem.firstChild.hidden = true;              // Progress bar and remainder
			dlElem.lastChild.firstChild.hidden = false;   // Icon stack
			dlElem.lastChild.lastChild.hidden = true;     // Progress indicators
			
			if(!styleDefault) {
				try {
					var finishedStyle = db_pref.getCharPref("downbar.style.db_finishedHbox");
					dlElem.setAttribute("style", finishedStyle);
				} catch (e){}	
			}
			
		break;
	}
	
}

function db_dtaUpdateDLrepeat(dtaQueueItem) {
	
	var progElem = document.getElementById("dta_" + dtaQueueItem.dbId);
	
	// Check to make sure that DTA is still open and has record of this download
	try {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var dtaWin = wm.getMostRecentWindow("DTA:Manager");
		if(!dtaWin) {
			// can't get updates while the DTA window is closed, just remove this download
			document.getElementById('downbar').removeChild(progElem);
			return;
		}
		
		// The name and file target may change if the download was behind a redirect 
		// xxx prob a better way of doing this, only look for first name change?
		var currName = dtaQueueItem._destinationName;
		if(progElem.getAttribute("name") != currName) {
			//d('changing name');
			progElem.lastChild.firstChild.nextSibling.setAttribute("value", currName);
			progElem.setAttribute("name", currName);
			progElem.setAttribute("target", dtaQueueItem._destinationFile);
		}
		
		//d(dtaQueueItem.state);
		
		var currState = dtaQueueItem.state;
		if(progElem.getAttribute("state") != currState) {
			progElem.setAttribute("state", currState);
			db_dtaSetStateSpecific(progElem.id, currState);
		}
				
	} catch(e) {return;}
	
		// In progress
	if(currState == 4) {
		db_dtaCalcAndSetProgress(dtaQueueItem);
		progElem.pTimeout = window.setTimeout(function(){db_dtaUpdateDLrepeat(dtaQueueItem);}, 300);
		return;
	}
		// Paused
	if(currState == 2) {
		db_dtaCalcAndSetProgress(dtaQueueItem);
		progElem.pTimeout = window.setTimeout(function(){db_dtaUpdateDLrepeat(dtaQueueItem);}, 300);
		return;
	}
	
		// Queued
	if(currState == 64) {
		progElem.pTimeout = window.setTimeout(function(){db_dtaUpdateDLrepeat(dtaQueueItem);}, 1000);
		return;
	}
	
		// Finished, change the download item on downbar and add this to my custom database so it persists
	if(currState == 8 | currState == 16) {
				
		db_dtaAddFinishedToDatabase(progElem);
		
		db_dtaProcessFinished(progElem);
	}
	
		// Canceled,  Just remove it
	if(currState == 32) {
		
		// Clear the download item in all browser windows
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var e = wm.getEnumerator("navigator:browser");
		var win, winElem;
	
		while (e.hasMoreElements()) {
			win = e.getNext();
			
			winElem = win.document.getElementById(progElem.id);
			win.document.getElementById("downbar").removeChild(winElem);
			
			win.db_checkShouldShow();
			win.db_updateMini();
		}
	
	}
}

function db_dtaCalcAndSetProgress(dtaQueueItem) {
	
	var progElem = document.getElementById("dta_" + dtaQueueItem.dbId);
	
	var currpercent = parseInt(dtaQueueItem.percent);
	
	var newWidth = parseInt(currpercent/100 *  progElem.firstChild.boxObject.width);  // progElem.firstChild = inner width, not incl borders of DL element
	progElem.firstChild.firstChild.minWidth = newWidth;
	progElem.lastChild.lastChild.firstChild.setAttribute("value", (currpercent + "%"));
	
	progElem.pTotalKBytes = parseInt(dtaQueueItem._totalSize / 1024);
	
	//d("size " + dtaQueueItem.partialSize);
	//d("speed " + dtaQueueItem.speeds[dtaQueueItem.speeds.length - 1]);
	//d("remain " + dtaQueueItem.status);
	//d("-----------------------------");
	
	// Speed
	var newrate;
	var currSpeed = dtaQueueItem.speeds[dtaQueueItem.speeds.length - 1];
	if (currSpeed == null)	
		newrate = "0";
	else {
		currSpeed = currSpeed / 1024;
		var fraction = parseInt( ( currSpeed - ( currSpeed = parseInt( currSpeed ) ) ) * 10);
		newrate = currSpeed + "." + fraction;
	}
		 
	progElem.lastChild.lastChild.firstChild.nextSibling.value = newrate;
		
	
	// Size
	var currkb = parseInt(dtaQueueItem.partialSize / 1024); // KBytes
	if(currkb > 1024)
		var currSize = db_convertToMB(currkb) + " " + db_strings.getString("MegaBytesAbbr");
	else
		var currSize = currkb + " " + db_strings.getString("KiloBytesAbbr");
	progElem.lastChild.lastChild.lastChild.previousSibling.value = currSize;
	
	
	// Remaining time
	var remainTime = dtaQueueItem.status;
	if (remainTime == "Starting")
		remainTime = "--:--";
	progElem.lastChild.lastChild.lastChild.value = remainTime;
	
	
}

function db_dtaShowMiniPopup(miniElem, event) {

	if(event.button == 1)
		db_modeToggle();

	if(event.button == 0)
		document.getElementById("downbarPopup").showPopup(miniElem,  -1, -1, 'popup', 'topright' , 'bottomright');

	var dbelems = document.getElementById("downbar").childNodes;
	for (var i = 1; i <= dbelems.length - 1; ++i) {
		contextAttr = dbelems[i].getAttribute("context");
		if (contextAttr == "progresscontext") {
			
			window.clearTimeout(dbelems[i].pTimeout);
			
			if(dbelems[i].id.substr(0,3) == "db_")
				db_updateDLrepeat(dbelems[i].id);
			else
				db_dtaUpdateDLrepeat(db_dtaGetQueueItemFromID(dbelems[i].id));
		}
	}
}

// Get downloads from the custom DTA finished database and display them on downbar
function db_dtaAddFinished() {

	// get database file in profile directory
	var databaseFile = Components.classes["@mozilla.org/file/directory_service;1"].
					getService(Components.interfaces.nsIProperties).
					get("ProfD", Components.interfaces.nsIFile);
					
	databaseFile.append("dlsb_downloads.json");
	
	if (!databaseFile.exists())
		return;

	// Read the file
	var data = "";
	var fstream = Components.classes["@mozilla.org/network/file-input-stream;1"].
	                        createInstance(Components.interfaces.nsIFileInputStream);
	var cstream = Components.classes["@mozilla.org/intl/converter-input-stream;1"].
	                        createInstance(Components.interfaces.nsIConverterInputStream);
	fstream.init(databaseFile, -1, 0, 0);
	cstream.init(fstream, "UTF-8", 0, 0);
	
	let (str = {}) {
	  cstream.readString(-1, str); // read the whole file and put it in str.value
	  data = str.value;
	}
	cstream.close(); // this closes fstream
	
	//d(data);
	try {
		db_dtaSavedFinished = JSON.parse(data);
	} catch(e) {return;}  // there may not be anything in the file
	
	//d(db_dtaSavedFinished);
	//d(db_dtaSavedFinished[0].target);
	
	for (var i = 0; i <= db_dtaSavedFinished.length - 1; ++i) {
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
		var browsers = wm.getEnumerator("navigator:browser");
		var win, winElem;
		
		while (browsers.hasMoreElements()) {
			win = browsers.getNext();
			
			win.db_dtaInsertNewDownload(db_dtaSavedFinished[i].id,    db_dtaSavedFinished[i].target, 
									 	db_dtaSavedFinished[i].name,  db_dtaSavedFinished[i].source, 
									 	parseInt(db_dtaSavedFinished[i].state), parseInt(db_dtaSavedFinished[i].startTime), 
									 	db_dtaSavedFinished[i].referrer);
		}
	}
}

function db_dtaAddFinishedToDatabase(finElem) {
	
	var newFinDownload = {};
	newFinDownload.id = finElem.id;
	newFinDownload.target = finElem.getAttribute("target");
	newFinDownload.name = finElem.getAttribute("name");
	newFinDownload.source = finElem.getAttribute("source");
	newFinDownload.state = finElem.getAttribute("state");
	newFinDownload.startTime = finElem.getAttribute("startTime");
	newFinDownload.referrer = finElem.getAttribute("referrer");
	
	db_dtaSavedFinished[db_dtaSavedFinished.length] = newFinDownload;
	db_dtaWriteDatabaseToFile();
}

function db_dtaFinishedClickHandle(aElem, aEvent) {
	
	var elemID = aElem.id;
	
	if(aEvent.button == 0 && aEvent.shiftKey)
		db_renameFinished(aElem.id);

	if(aEvent.button == 1) {
		// Hide the tooltip if present, otherwise it shifts to top left corner of the screen
		document.getElementById("db_finTip").hidePopup();
		
		if(aEvent.ctrlKey)
			db_startDelete(aElem.id, aEvent);
		else
			db_animateDecide(aElem.id, "clear", aEvent);
			
	}
	
	if(aEvent.button == 2) {
		// Hide the tooltip if present, otherwise both right-click menu and tooltip will disappear together
		document.getElementById("db_finTip").hidePopup();
	}
	
}

function db_dtaRemoveIdFromDatabase(idToRemove) {
		
	var posToRemove = -1;
	var length = db_dtaSavedFinished.length;
	
	// Iterate through and look for the id that was removed
	for (var i = 0; i <= db_dtaSavedFinished.length - 1; ++i) {
		if(idToRemove == db_dtaSavedFinished[i].id)
			posToRemove = i;
	}

	if(posToRemove > -1) {

		db_dtaSavedFinished.splice(posToRemove, 1);
			
		// Write new array to file
		db_dtaWriteDatabaseToFile();
		
	}
}

function db_dtaRemoveAllFromDatabase() {
	
	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
	var e = wm.getEnumerator("navigator:browser");
	var win, winElem;
	
	while (e.hasMoreElements()) {
		
		win = e.getNext();
		
		for (var i = 0; i <= db_dtaSavedFinished.length - 1; ++i) {
			try {
				winElem = win.document.getElementById(db_dtaSavedFinished[i].id);
				win.document.getElementById("downbar").removeChild(winElem);
			} catch(e) {}  // Might have be duplicated in database and not showing on bar, just ignore
		}
			
		win.db_checkShouldShow();
		win.db_updateMini();
		
	}
	
	// removes everything from the database
	db_dtaSavedFinished.length = 0;
	
	db_dtaWriteDatabaseToFile();
}


function db_dtaWriteDatabaseToFile() {
	
	var jsonString = JSON.stringify(db_dtaSavedFinished);
	
	// Save this new database to disk
	// get database file in profile directory
	var databaseFile = Components.classes["@mozilla.org/file/directory_service;1"].
					getService(Components.interfaces.nsIProperties).
					get("ProfD", Components.interfaces.nsIFile);
					
	databaseFile.append("dlsb_downloads.json");
	
	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
                         createInstance(Components.interfaces.nsIFileOutputStream);

	// https://developer.mozilla.org/en/PR_Open#Parameters
	// 0x02  Open for writing only.
	// 0x08  If the file does not exist, the file is created. If the file exists, this flag has no effect.
	// 0x20  If the file exists, its length is truncated to 0.
	
	foStream.init(databaseFile, 0x02 | 0x08 | 0x20, 0666, 0); 
	
	var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"].
	                          createInstance(Components.interfaces.nsIConverterOutputStream);
	converter.init(foStream, "UTF-8", 0, 0);
	converter.writeString(jsonString);
	converter.close(); // this closes foStream

}

function db_dtaProgressClickHandle(aElem, aEvent) {
	
	var state = aElem.getAttribute("state");

	if(aEvent.button == 0) {  // left click
		if(state == 4 | state == 64) {
			db_dtaPause(aElem.id); 
		}
			
		if(state == 2) {
			db_dtaResume(aElem.id);
		}
	}
		
	if(aEvent.button == 1) {  // middle click
		
		// Hide the tooltip if present, otherwise it shifts to top left corner of the screen
   		document.getElementById("db_progTip").hidePopup();
		db_dtaCancel(aElem.id);
	}
	
	if(aEvent.button == 2) {
		// Hide the tooltip if present, otherwise both right-click menu and tooltip will disappear together
   		document.getElementById("db_progTip").hidePopup();
	}
	
}

function db_dtaPause(aElemID) {
	
	// Get reference to the DTA QueueItem for this download id
	var dtaQueueItem = db_dtaGetQueueItemFromID(aElemID);
	dtaQueueItem.pause();
	
	// Let the state info and appearance naturally flow through db_dtaUpdateDLrepeat
	
}

function db_dtaResume(aElemID) {
	
	// Get reference to the DTA QueueItem for this download id
	var dtaQueueItem = db_dtaGetQueueItemFromID(aElemID);

	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
	var dtaWin = wm.getMostRecentWindow("DTA:Manager");
	dtaWin.Dialog.run(dtaQueueItem);
	
	// Let the state info and appearance naturally flow through db_dtaUpdateDLrepeat
}

function db_dtaCancel(aElemID) {
	
	try {
		// Get reference to the DTA QueueItem for this download id
		var dtaQueueItem = db_dtaGetQueueItemFromID(aElemID);
		dtaQueueItem.cancel("");
		// Let the state info and appearance naturally flow through db_dtaUpdateDLrepeat (will be removed from downbar)
		
	} catch(e) {
		// DTA window might be closed, just remove this download from the bar
		document.getElementById('downbar').removeChild(document.getElementById(aElemID));
	}
	
}

function db_dtaPauseAll() {
	
	var dbelems = document.getElementById("downbar").childNodes;
	var i = 0;
	// I don't know why a for loop won't work here but okay
	while (i < dbelems.length) {
		
		if (dbelems[i].id.substr(0,3) == "db_" && (dbelems[i].getAttribute("state") == 0 | dbelems[i].getAttribute("state") == 5)) {
			db_pause(dbelems[i].id, null);
		}
		
		else if (dbelems[i].id.substr(0,3) == "dta" && (dbelems[i].getAttribute("state") == 4 | dbelems[i].getAttribute("state") == 64)) {
			db_dtaPause(dbelems[i].id);
		}
		
		i = i + 1;
	}
	
	
}

function db_dtaResumeAll() {
	var dbelems = document.getElementById("downbar").childNodes;
	var i = 0;
	while (i < dbelems.length) {
		
		if (dbelems[i].id.substr(0,3) == "db_" && dbelems[i].getAttribute("state") == 4) {
			db_resume(dbelems[i].id, null);
		}
		
		else if (dbelems[i].id.substr(0,3) == "dta" && dbelems[i].getAttribute("state") == 2) {
			db_dtaResume(dbelems[i].id);
		}
		
		i = i + 1;
	}
}

function db_dtaCancelAll() {

	var dbelems = document.getElementById("downbar").childNodes;
	var cancPos = new Array(); // hold the child id of elements that are canceled, so that they can be removed in the 2nd for loop
	var posCount = 1;
	var state;
	for (var i = 0; i <= dbelems.length - 1; ++i) {
		
			state = dbelems[i].getAttribute("state");
			
			if (dbelems[i].id.substr(0,3) == "db_" && (state == 0 | state == 4 | state == 5)) {
				db_gDownloadManager.cancelDownload(dbelems[i].id.substring(3));
				cancPos[posCount] = dbelems[i];
				++posCount;
			}
			
			else if (dbelems[i].id.substr(0,3) == "dta" && (state == 2 | state == 4 | state == 64)) {
				db_dtaCancel(dbelems[i].id);
			}
	}

	var localFile;
	// Need to clear them after the first for loop is complete
	for (var j = 1; j < posCount; ++j) {
		try {  // canceling queued downloads will cause and error (b/c there isn't a local file yet i think?)
			db_clearOne(cancPos[j].id);
			localFile = db_getLocalFileFromNativePathOrUrl(cancPos[j].getAttribute("target"));
			if (localFile.exists());
				localFile.remove(false);		
		} catch(e) {}
	}
	db_checkShouldShow();
	
}

function db_dtaGetQueueItemFromID(aElemID) {
	
	var dtaID = aElemID.substring(4);
	
	// There might be a better way to do this, rather than iterating over all in the tree
	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
	var dtaWin = wm.getMostRecentWindow("DTA:Manager");
	
	for (var e in dtaWin.Tree.all) {
		if(e.dbId == dtaID)
			break;
	}
	
	return e;
}

function db_dtaProcessFinished(finElem) {
	
	// Takes care of complete sound, anti-virus scan, autoclear
	
	var db_downbarComp = Components.classes['@devonjensen.com/downbar/downbar;1'].getService().wrappedJSObject;
	
	var elmpath = finElem.getAttribute("target");
	//var fixedelmpath = elmpath.replace(/\\/g, "\\\\");  // The \ and ' get messed up in the command if they are not fixed
	//fixedelmpath = fixedelmpath.replace(/\'/g, "\\\'");
	var db_fileext = elmpath.split(".").pop().toLowerCase();
	
	db_downbarComp.db_dlCompleteSound(db_fileext);
	
	db_downbarComp.db_AntiVirusScan(elmpath, db_fileext);
	
	//var db_pref = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	var clearTime = db_pref.getIntPref("downbar.function.timeToClear");
	var clearRaw = db_pref.getCharPref("downbar.function.clearFiletypes");
	var db_clearList = new Array ( );
	
	clearRaw = clearRaw.toLowerCase().replace(/\s/g,'');  // remove all whitespace
	db_clearList = clearRaw.split(",");
	
	// check if it's on the list of autoclear
	var autoClear = false;
	if(db_clearList[0] == "all" | db_clearList[0] == "*")
		autoClear = true;
	else {
		for (var i=0; i<=db_clearList.length; ++i) {
			if (db_fileext == db_clearList[i])
				autoClear = true;
		}
	}
					
	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
	var e = wm.getEnumerator("navigator:browser");
	var win;
	
	// For delayed actions, like autoclear, enumerating each window and calling timeout doesn't work 
	// (all the timeouts are triggered on one window), so need to call a function in the window and have it do the timeout 
	while (e.hasMoreElements()) {
		win = e.getNext();
		
		//var acs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		//acs.logStringMessage(win.self._content.location.href);
		
		if(autoClear) {
			win.db_startAutoClear(finElem.id, clearTime*1000);
		}
		
		win.db_startUpdateMini();
	}
	
}

function db_dtaRedirectTooltip(elem) {

	// Find base download element
    var popupAnchor = elem;
    while(!popupAnchor.id) {
		popupAnchor = popupAnchor.parentNode;
	}
	
	var elemID = popupAnchor.id;
	var dlstate = popupAnchor.getAttribute("state");
	
	if (elemID.substr(0,3) == "db_") {  // It's a firefox download
		
		if(dlstate == 1 | dlstate == 2 | dlstate == 3 | dlstate == 6 | dlstate == 7| dlstate == 8)
    		document.getElementById("db_finTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');

    	if(dlstate == 0 | dlstate == 4 | dlstate == 5)
    		document.getElementById("db_progTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');
	}
	
	else {  // It's a DTA download
		
		if(dlstate == 8 | dlstate == 16)
	    	document.getElementById("db_finTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');
	
	    if(dlstate == 2 | dlstate == 4 | dlstate == 64)
	    	document.getElementById("db_progTip").showPopup(popupAnchor,  -1, -1, 'popup', 'topleft' , 'bottomleft');
	}

    // holds a ref to this anchor node so we can remove the onmouseout later
    db_currTooltipAnchor = popupAnchor;
    //document.popupNode = popupAnchor;
    
    // xxx In linux, a mouseout event is sent right away and the popup never shows, delay to avoid that
    // unless I can get rid of the special case below "if(!relTarget && (db_currTooltipAnchor.id == expOriTarget.id)) {"
    window.setTimeout(function(){
    	popupAnchor.setAttribute("onmouseout", "db_hideRedirPopup(event);");
    }, 50);
	
    return false;  // don't show the default tooltip

}

function db_dtaMakeFinTip(idtoview) {
	
	var dlElem = document.getElementById(idtoview);
	
	var localFile = db_getLocalFileFromNativePathOrUrl(dlElem.getAttribute("target"));
	var url = dlElem.getAttribute("source");
	var localFilename = dlElem.getAttribute("name");
	
	// for some reason the last char is getting cut off by about 2px, adding a trailing space fixes it
	document.getElementById("db_finTipFileName").value = localFilename + " ";

	// Get icon, fx dlmgr uses contentType to bypass cache, but I've found specifying a size will also bypass cache, 
	//     - just can't specify same icon size in the inprogress tooltips or that will be cached here
	// this way allows custom executable icons
	// Actually this doesn't work on linux - not sure why b/c the size attribute is fine in the dlmgr implementation, and size=16 work fine for the finished dl item in setStateSpecific
	//document.getElementById("db_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32");
	
	
    // Keeping fx dlmgr implementation here for now - just in case
	// Set icon - Tacking on contentType in moz-icon bypasses cache, allows custom .exe icons
	try {
		const kExternalHelperAppServContractID = "@mozilla.org/uriloader/external-helper-app-service;1";
		var mimeService = Components.classes[kExternalHelperAppServContractID].getService(Components.interfaces.nsIMIMEService);
		var contentType = mimeService.getTypeFromFile(localFile);  // getting 'component not available' error, but I'm getting back a good value - not sure why the error

		document.getElementById("db_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32&contentType=" + contentType);
		
	} catch(e) {
		//document.getElementById("db_finTipIcon").setAttribute("src", "moz-icon:" + dlElem.getAttribute("target") + "?size=32");
	}
	
/**/
	
	var localFileSplit = localFilename.split(".");
	var fileext = localFileSplit[localFileSplit.length-1].toLowerCase();
	
	if(fileext == "gif" | fileext == "jpg" | fileext == "png" | fileext == "jpeg") {
		db_getImgSize(localFile);
		document.getElementById("db_finTipImgPreviewBox").hidden = false;
	}
	
	// Don't set an endtime on DTA downloads so this will be unknown
	completeTime = db_strings.getString("unknown");
	seconds = -1;
/*	try {
		var startTime = dlElem.getAttribute("startTime");
		var endTime = dlElem.getAttribute("endTime");
		seconds = (endTime-startTime)/1000000;
		var completeTime = db_formatSeconds(seconds);
		if (completeTime == "00:00")
			completeTime = "<00:01";
		
	} catch(e) {
		seconds = -1;
		completeTime = db_strings.getString("unknown");
	}
*/	
	// Get DL size from the filesystem
	try {
		var dlSize = parseInt(localFile.fileSize / 1024);  // convert bytes to kilobytes
		var sizeString = dlSize;
		
		if (sizeString > 1024) {
			sizeString = db_convertToMB(sizeString);
			sizeString = sizeString + " " + db_strings.getString("MegaBytesAbbr");
		}
		else
			sizeString = sizeString + " " + db_strings.getString("KiloBytesAbbr");
		
	} catch(e) {
		// File doesn't exist
		dlSize = -1;
		var sizeString = db_strings.getString("fileNotFound");
	}

	try {
		if(dlSize != -1 && seconds != -1) {
			if(seconds == 0) 
				seconds = 1;
			var avgSpeed = dlSize / seconds;
			avgSpeed = Math.round(avgSpeed*100)/100;  // two decimal points
			avgSpeed = avgSpeed + " " + db_strings.getString("KBperSecond");
		}
		else {
			var avgSpeed = db_strings.getString("unknown");
		}
	} catch(e) {}

	document.getElementById("db_finTipSource").value = url;
	document.getElementById("db_finTipTarget").value = " " + localFile.path + " ";
	document.getElementById("db_finTipSize").value = " " + sizeString + " ";
	document.getElementById("db_finTipTime").value = " " + completeTime + " "; // for some reason the first and last number is getting cut off by about 2px, these spaces fix it
	document.getElementById("db_finTipSpeed").value = " " + avgSpeed + " ";

}

// Calls a timeout to itself at the end so the tooltip keeps updating with in progress info
function db_dtaMakeTooltip(dlElemID) {
	//d("in makeTooltip: " + dlElemID);
	try {
		var elem = document.getElementById(dlElemID);
		
		var state = elem.getAttribute("state");
		if(state != 2 && state != 4 && state != 64) {  // if it isn't inprog, paused, or queued, return 
			document.getElementById("db_progTip").hidePopup();
			return;
		}
		
		var additionalText = " ";  // status text to be added after filename
		var db_unkStr = db_strings.getString("unknown");
		
		// if the state is queued, we won't know these
		if (state == 64) {
			percent = db_unkStr;
			totalSize = db_unkStr;
			remainTime = "--:--";
			currSize = "0 " + db_strings.getString("KiloBytesAbbr");
			speed = "0.0"
			additionalText = " - " + db_strings.getString("starting") + " ";
		}
		else { // state is inprog or paused
			
			try {
				var percent = elem.lastChild.lastChild.firstChild.value;
				var speed = elem.lastChild.lastChild.firstChild.nextSibling.value;
				var currSize = elem.lastChild.lastChild.lastChild.previousSibling.value;
				var remainTime = elem.lastChild.lastChild.lastChild.value;
				var totalSize = elem.pTotalKBytes;
			} catch(e) {} 	
			
			if (state == 2) {
				additionalText = " - " + db_strings.getString("paused") + " ";
			}
			
			// If the mode is undetermined, we won't know these - should totalsize be -1?
			if (parseInt(currSize) > parseInt(totalSize)) {
				percent = db_unkStr;
				totalSize = db_unkStr;
				remainTime = db_unkStr;
			}
			else {
				if (totalSize > 1024)
					totalSize = db_convertToMB(totalSize) + " " + db_strings.getString("MegaBytesAbbr");
				else
					totalSize = totalSize + " " + db_strings.getString("KiloBytesAbbr");
			}
		}
		
		document.getElementById("db_progTipFileName").value = elem.getAttribute("name") + additionalText;   // for some reason the last char is getting cut off by about 2px, adding a space after fixes it
		document.getElementById("db_progTipStatus").value = " " + currSize + " of " + totalSize + " (at " + speed + " " + db_strings.getString("KBperSecond") + ") ";
		document.getElementById("db_progTipTimeLeft").value = " " + remainTime + " ";   // for some reason the first and last number is getting cut off by about 2px, this fixes it
		document.getElementById("db_progTipPercentText").value = " " + percent + " ";
		
		elem.setAttribute("pTimeCode", window.setTimeout(function(){db_makeTooltip(dlElemID);}, 1000));
	} catch(e) {
		document.getElementById("db_progTip").hidePopup();
	}
}

function db_dtaUpdateMini() {
	
	try {
		var activeDownloads = 0;
		var contextAttr;
		var dbelems = document.getElementById("downbar").childNodes;

		for (var i = 1; i <= dbelems.length - 1; ++i) {
			contextAttr = dbelems[i].getAttribute("context");
			if (contextAttr == "progresscontext") {
				activeDownloads++;
			}
		}
		
		var finishedDownloads = dbelems.length - activeDownloads;
		document.getElementById("downbarMiniText").value = activeDownloads + ":" + finishedDownloads;
		//downbarMini:  Collapsed if it isn't being used, hidden if it is being used but there is nothing in it
		if(activeDownloads + finishedDownloads == 0)
			document.getElementById("downbarMini").hidden = true;
		else
			document.getElementById("downbarMini").hidden = false;
		
	} catch(e){}
}

function db_dtaFixDatabaseAfterRename(elemid) {
	
	var elem = document.getElementById(elemid);
	var newName = elem.getAttribute('name');
	var newTarget = elem.getAttribute('target');
	
	var posToRemove = -1;
	var length = db_dtaSavedFinished.length;
	
	try {
		// Iterate through database and look for the id that was renamed
		for (var i = 0; i <= db_dtaSavedFinished.length - 1; ++i) {
			if(elemid == db_dtaSavedFinished[i].id){
				posToChange = i;
				break;
			}	
		}
		
		db_dtaSavedFinished[posToChange].name = newName;
		db_dtaSavedFinished[posToChange].target = newTarget;
		db_dtaWriteDatabaseToFile();
		
	} catch(e) {}
	
}