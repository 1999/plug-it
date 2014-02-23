window.onerror = function(msg, url, line, column, err) {
    var msgError = msg + " in " + url + " (line: " + line + ")";
    console.error(msgError, err && err.stack || "");

    chrome.storage.local.get({
        "settings.isDebug": Config.default_settings_local.isDebug
    }, function (records) {
        if (records["settings.isDebug"])
            return;

        CPA.sendEvent("Errors", chrome.runtime.getManifest().version, {
            msg: msg,
            url: url,
            line: line,
            trace: err && err.stack || ""
        });
    });
};

(function () {
    "use strict";

    // добавляем sandbox при загрузке DOM
    document.addEventListener("DOMContentLoaded", function () {
        var iframe = document.createElement("iframe");
        iframe.setAttribute("src", "/sandbox/page.html");
        iframe.setAttribute("id", "sandbox");
        document.body.appendChild(iframe);
    }, false);


    // install & update handling
    chrome.runtime.onInstalled.addListener(function (details) {
        var appName = chrome.runtime.getManifest().name;
        var currentVersion = chrome.runtime.getManifest().version;

        switch (details.reason) {
            case "install":
                // on install - without limit set
                CPA.changePermittedState(true);
                CPA.sendEvent("Lyfecycle", "Dayuse.New", "Install", 1);

                chrome.storage.local.set({"settings.appInstallDate": Date.now()});
                chrome.storage.sync.set({"settings.unlimited": true});
                break;

            case "update":
                if (currentVersion !== details.previousVersion) {
                    // ...
                }

                break;
        }

        chrome.alarms.get("dayuse", function (alarmInfo) {
            if (!alarmInfo) {
                chrome.alarms.create("dayuse", {
                    delayInMinutes: 24 * 60,
                    periodInMinutes: 24 * 60
                });
            }
        });

        // var uninstallUrl = Config.constants.goodbye_page_link + "?ver=" + currentVersion;
        // if (typeof chrome.runtime.setUninstallUrl === "function") {
        //     chrome.runtime.setUninstallUrl(uninstallUrl);
        // }
    });

    function openAppWindow(navigateData) {
        var height = 512;
        var goldenRatio = (1 + Math.sqrt(5)) / 2;
        var width = Math.round(height * goldenRatio) + 32;

        chrome.app.window.create("app.html", {
            id: uuid(),
            minWidth: width,
            minHeight: height,
            bounds: {
                width: width,
                height: height,
            }
        }, function (appWindow) {
            appWindow.contentWindow.addEventListener("load", function () {
                navigateData = navigateData || {};
                var state = navigateData.state || "index";
                var params = navigateData.params || {};

                appWindow.contentWindow.State.dispatch(state, params);
            });
        });
    }

    // app lifecycle
    chrome.app.runtime.onLaunched.addListener(function () {
        openAppWindow();
    });

    chrome.app.runtime.onRestarted.addListener(function () {
        openAppWindow();
    });

    // open app window when new device is attached
    chrome.system.storage.onAttached.addListener(function (storageInfo) {
        requestRemovableFilesystems(function (filesystems) {
            var needsOpenAppWindow = filesystems.some(function (fsData) {
                return (fsData.id === storageInfo.id);
            });

            if (needsOpenAppWindow) {
                openAppWindow({
                    state: "serverStep2DeviceSelected",
                    params: {
                        value: storageInfo.id
                    }
                });
            }
        });
    });

    // chrome.system.storage.onDetached.addListener(function (id) {
    //     chrome.runtime.sendMessage({type: "detached", data: id});
    // });

    // chrome.identity.onSignInChanged && chrome.identity.onSignInChanged.addListener(function (account, signedIn) {
    //     console.log(account.id, signedIn);
    // });

    // @see https://code.google.com/p/chromium/issues/detail?id=342169
    chrome.system.storage.getInfo(console.log.bind(console));
})();
