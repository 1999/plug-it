window.onerror = function (msg, url, line, column, err) {
    var msgError = msg + " in " + url + " (line: " + line + ")";
    console.error(msgError, err && err.stack || "");

    // if (!Settings.get("isDebug")) {
    //     CPA.sendEvent("Errors", chrome.runtime.getManifest().version, {
    //         msg: msg,
    //         url: url,
    //         line: line,
    //         trace: err && err.stack || ""
    //     });
    // }
};

parallel({
    dom: function (callback) {
        document.addEventListener("DOMContentLoaded", callback, false);
    },
    settings: function (callback) {
        Settings.load(callback);
    }
}, function (res) {
    "use strict";

    function bindActionHandler(evt) {
        var actionName = this.data("action").split("/", 2)[1];
        var isDispatchAction = (this.data("dispatch") === "1");
        var params = {};

        for (var key in this.dataset) {
            if (key !== "action" && key !== "dispatch") {
                params[key] = this.dataset[key];
            }
        }

        if (isDispatchAction) {
            switch (actionName) {
                case "back":
                    State.back();
                    break;

                case "forward":
                    State.forward();
                    break;

                case "home":
                    State.home();
                    break;

                default:
                    State.dispatch.call(this, actionName, params);
            }
        } else {
            Actions[actionName].call(this, params);
        }

        evt.stopImmediatePropagation();
        evt.preventDefault();
    }


    var mutationObserver = new MutationObserver(function (mutationRecords, observer) {
        mutationRecords.forEach(function (mutationRecord) {
            [].forEach.call(mutationRecord.addedNodes, function (node) {
                if (node.nodeType !== Node.ELEMENT_NODE)
                    return;

                // we can't check an empty node for querySelector/matchesSelector
                var moveParent = false;

                if (!node.hasChildNodes()) {
                    moveParent = true;
                } else {
                    moveParent = [].some.call(node.childNodes, function (childNode) {
                        return (childNode.nodeType === Node.ELEMENT_NODE);
                    });
                }

                if (moveParent) {
                    node = node.parentNode;
                }

                $$(node, "[data-action]").each(function () {
                    var evtType = this.data("action").split("/")[0];
                    this.bind(evtType, bindActionHandler);
                });
            });

            [].forEach.call(mutationRecord.removedNodes, function (node) {
                if (node.nodeType !== Node.ELEMENT_NODE)
                    return;

                // we can't check an empty node for querySelector/matchesSelector
                if (!node.hasChildNodes()) {
                    node = node.parentNode;
                }

                if (!node)
                    return;

                $$(node, "[data-action]").each(function () {
                    var evtType = this.data("action").split("/")[0];
                    this.unbind(evtType, bindActionHandler);
                });
            });
        });
    });

    mutationObserver.observe(document.body, {
        subtree: true,
        childList: true
    });

    Settings.set("appUsedToday", true);
});
