var EXPORTED_SYMBOLS = ["DownBar"];

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

var DownBar = {};

XPCOMUtils.defineLazyServiceGetter(DownBar, "downloadManager", "@mozilla.org/download-manager;1", "nsIDownloadManager");
