Actions = (function () {
    "use strict";

    var DATASET_ID_PLACEHOLDER = "place4id";

    // object (uuid: {FileEntry, dataUri, skip}, ...)
    var selectedPhotosLocal = {};
    var selectedPhotosServer = {};


    function selectLocalPhotos(entriesData, isLoadedAgain) {
        var wrapperElem = $(".global-wrapper").removeClass("hidden");
        var progress = $(wrapperElem, ".progress");

        // update header
        $$("header .text").each(function () {
            this.toggleClass("hidden", !this.hasClass("header-processing"));
        });

        // update navigation
        $$("nav span[role='button']").addClass("tmp-disabled");

        // it's faster to render template for one photo and add dataset item N times
        // than to render template 100 times with different parameters
        Templates.render("photo", {
            id: DATASET_ID_PLACEHOLDER,
            type: "local"
        }, function (html) {
            var resultHtmlChunks = [];
            var loadImageTasks = {};

            var totalImagesLoaded = 0;
            var bar = $(progress, ".progress-bar");
            var anyPhotosActive = false;

            // set UUID to every FileEntry
            entriesData.forEach(function (entryData) {
                var id = uuid();
                selectedPhotosLocal[id] = {
                    entry: entryData.entry,
                    dataUri: "",
                    skip: entryData.skip
                };

                loadImageTasks[id] = function (callback) {
                    readChosenImageInfo(selectedPhotosLocal[id].entry, function (res) {
                        selectedPhotosLocal[id].dataUri = res.dataUri;

                        var photo = $(wrapperElem, "[data-id='" + id + "']");
                        photo.toggleClass("img-selected", !entryData.skip);
                        $(photo, ".spinner").addClass("hidden");
                        $(photo, ".img-container").css("backgroundImage", "url(" + res.dataUri + ")");
                        $(photo, ".photos-dms").html(res.width + "x" + res.height);

                        totalImagesLoaded += 1;
                        var barPercentsLoaded = Math.floor(totalImagesLoaded / entriesData.length * 100);
                        bar.css("width", barPercentsLoaded + "%").attr("aria-valuemin", barPercentsLoaded);

                        if (!entryData.skip)
                            anyPhotosActive = true;

                        callback();
                    });
                };

                // it's faster to just replace DATASET_ID_PLACEHOLDER in string
                // than to render DOM element from HTML string and replace dataset element in it
                var tmpFigureHTML = html.replace(DATASET_ID_PLACEHOLDER, id);
                resultHtmlChunks.push(tmpFigureHTML);
            });

            // remove search placeholder, render progressbar and photos
            progress.removeClass("hidden");
            $$(wrapperElem, ".status").addClass("hidden");
            wrapperElem.append(resultHtmlChunks.join(""));

            // load images
            parallel(loadImageTasks, 1, function () {
                progress.removeClass("progress-striped");

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass(anyPhotosActive ? "header-procede" : "header-no-active"));
                });

                $("header .new-done").toggleClass("hidden", isLoadedAgain);

                // update navigation
                $$("nav span[role='button']").removeClass("tmp-disabled");
            });
        });
    }

    function selectDevice(fs, deviceName) {
        var photosWrapper = $(".device-photos").empty();
        var progress = $(".progress");

        selectedPhotosServer = {};

        if (!fs)
            return;

        // update status
        $$(".global-wrapper .status").each(function () {
            this.toggleClass("hidden", !this.hasClass("scanning-device"));
        });

        getDevicePhotos(fs, function (entries) {
            if (!entries.length) {
                // update status
                $$(".global-wrapper .status").each(function () {
                    this.toggleClass("hidden", !this.hasClass("no-photos-found"));
                });

                return;
            }

            // update header
            $$("header .text").each(function () {
                this.toggleClass("hidden", !this.hasClass("header-processing"));
            });

            // update navigation
            $$("nav span[role='button']").addClass("tmp-disabled");

            // it's faster to render template for one photo and add dataset item N times
            // than to render template 100 times with different parameters
            Templates.render("photo", {
                id: DATASET_ID_PLACEHOLDER,
                type: "server"
            }, function (html) {
                var resultHtmlChunks = [];
                var loadImageTasks = {};

                var totalImagesLoaded = 0;
                var bar = $(progress, ".progress-bar");
                var processedDevicePhotos = Settings.get("devices")[deviceName] || [];
                var anyPhotosActive = false;

                // set UUID to every FileEntry
                entries.forEach(function (fileEntry) {
                    var id = uuid();
                    selectedPhotosServer[id] = {
                        entry: fileEntry,
                        dataUri: ""
                    };

                    loadImageTasks[id] = function (callback) {
                        readChosenImageInfo(fileEntry, function (res) {
                            selectedPhotosServer[id].dataUri = res.dataUri;

                            var photo = $(photosWrapper, "[data-id='" + id + "']");
                            var isNewFile = (processedDevicePhotos.indexOf(fileEntry.fullPath) === -1);

                            $(photo, ".spinner").addClass("hidden");
                            $(photo, ".img-container").css("backgroundImage", "url(" + res.dataUri + ")");
                            $(photo, ".photos-dms").html(res.width + "x" + res.height);

                            photo.toggleClass("img-selected", isNewFile);
                            if (isNewFile) {
                                anyPhotosActive = true;
                            } else {
                                selectedPhotosServer[id].skip = true;
                            }

                            totalImagesLoaded += 1;
                            var barPercentsLoaded = Math.floor(totalImagesLoaded / entries.length * 100);
                            bar.css("width", barPercentsLoaded + "%").attr("aria-valuemin", barPercentsLoaded);

                            callback();
                        });
                    };

                    // it's faster to just replace DATASET_ID_PLACEHOLDER in string
                    // than to render DOM element from HTML string and replace dataset element in it
                    var tmpFigureHTML = html.replace(DATASET_ID_PLACEHOLDER, id);
                    resultHtmlChunks.push(tmpFigureHTML);
                });

                // update status
                $$(".global-wrapper .status").addClass("hidden");

                // render progressbar and photos
                progress.removeClass("hidden");
                photosWrapper.html(resultHtmlChunks.join(""));

                // load images
                parallel(loadImageTasks, 1, function () {
                    progress.removeClass("progress-striped");

                    // update header
                    $$("header .text").each(function () {
                        this.toggleClass("hidden", !this.hasClass(anyPhotosActive ? "header-procede" : "header-no-active"));
                    });

                    // update navigation
                    $$("nav span[role='button']").removeClass("tmp-disabled");
                });
            });
        });
    }


    return {
        index: function Actions_index(params) {
            Templates.render("index", params, function (html) {
                document.body.html(html);
            });
        },

        localStep2: function Actions_localStep2(params) {
            Templates.render("local-step-2", params, function (html) {
                document.body.html(html);

                if (!Object.keys(selectedPhotosLocal).length)
                    return;

                // update body status
                $$(".global-wrapper .status").addClass("hidden");
                $(".global-wrapper .searching-photos").removeClass("hidden");

                var entriesData = Object.keys(selectedPhotosLocal).map(function (id) {
                    return {
                        entry: selectedPhotosLocal[id].entry,
                        skip: selectedPhotosLocal[id].skip
                    };
                });

                selectedPhotosLocal = {};
                selectLocalPhotos(entriesData, true);
            });
        },

        selectLocalPhotos: function Actions_selectLocalPhotos() {
            chrome.fileSystem.chooseEntry({
                type: 'openWritableFile',
                accepts: [{
                    mimeTypes: ['image/jpeg', 'image/gif', 'image/png']
                }],
                acceptsMultiple: true
            }, function (entries) {
                var wrapperElem = $(".global-wrapper").removeClass("hidden");
                $$(wrapperElem,  ".status").addClass("hidden");

                if (!entries) {
                    $(wrapperElem, ".no-photos-chosen").removeClass("hidden");
                    return;
                }

                var entriesData = entries.map(function (entry) {
                    return {
                        entry: entry
                    };
                });

                $(wrapperElem, ".searching-photos").removeClass("hidden");
                selectLocalPhotos(entriesData);
            });
        },

        selectLocalPhotosDir: function Actions_selectLocalPhotosDir() {
            chrome.fileSystem.chooseEntry({
                type: 'openDirectory'
            }, function (dirEntry) {
                var wrapperElem = $(".global-wrapper").removeClass("hidden");
                $$(wrapperElem,  ".status").addClass("hidden");

                if (!dirEntry) {
                    $(wrapperElem, ".no-photos-found").removeClass("hidden");
                    return;
                }

                var searching = $(wrapperElem, ".searching-dir-photos").removeClass("hidden");

                getAllDirectoryFileEntries(dirEntry, function (entries) {
                    if (!entries) {
                        $(wrapperElem, ".no-photos-found").removeClass("hidden");
                        searching.addClass("hidden");

                        return;
                    }

                    var entriesData = entries.map(function (entry) {
                        return {
                            entry: entry
                        };
                    });

                    selectLocalPhotos(entriesData);
                });
            });
        },

        localStep3: function Actions_localStep3(params) {
            var fit = Settings.get("lastUsedFitType");
            var selectedPhotosIds = Object.keys(selectedPhotosLocal).filter(function (id) {
                return !selectedPhotosLocal[id].skip;
            });

            params.numPhotosSelected = selectedPhotosIds.length;
            params.size = Settings.get("lastUsedSize");
            params.quality = Settings.get("lastUsedQuality");
            params.allowEnlarge = Settings.get("lastUsedAllowEnlarge");

            params.fitWidth = (fit === "width");
            params.fitHeight = (fit === "height");
            params.fitBiggest = (fit === "biggest");

            params.photos = selectedPhotosIds.map(function (id) {
                return {
                    id: id,
                    dataUri: selectedPhotosLocal[id].dataUri
                };
            });

            Templates.render("local-step-3", params, function (html) {
                document.body.html(html);
            });
        },

        selectPhoto: function Actions_selectPhoto() {
            var id = this.data("id");
            var isLocal = this.hasClass("local");
            var isProcessing = !$("header .header-processing").hasClass("hidden");
            var selectedPhotos = isLocal ? selectedPhotosLocal : selectedPhotosServer;

            if (this.toggleClass("img-selected")) {
                delete selectedPhotos[id].skip;
            } else {
                selectedPhotos[id].skip = true;
            }

            if (isProcessing)
                return;

            var noPhotosSelected = Object.keys(selectedPhotos).every(function (id) {
                return (selectedPhotos[id].skip === true);
            });

            // update header
            $$("header .text").each(function () {
                this.toggleClass("hidden", !this.hasClass(noPhotosSelected ? "header-no-active" : "header-procede"));
            });
        },

        releselectPhotos: function Actions_releselectPhotos() {
            Templates.render("local-step-2", {
                back: !$("nav span[data-action='click/back']").hasClass("disabled"),
                forward: !$("nav span[data-action='click/forward']").hasClass("disabled")
            }, function (html) {
                document.body.html(html);
            });
        },

        changeQualityLabel: function Actions_changeQualityLabel() {
            $(".quality-label").html(this.val());
        },

        startResize: function Actions_startResize() {
            $(".beware").addClass("hidden");

            var optionsForm = $(".form-resize-options");
            var resizeProgress = $(".resize-progress").removeClass("hidden");

            var quality = $(optionsForm, "[name='quality']").val();
            var fitType = $(optionsForm, ".fit-type").val();
            var fitSize = $(optionsForm, ".fit-num").val();
            var allowEnlarge = $(optionsForm, "[name='enlarge']").checked;

            // save selected params for future use
            Settings.set("lastUsedQuality", quality);
            Settings.set("lastUsedSize", fitSize);
            Settings.set("lastUsedAllowEnlarge", allowEnlarge);
            Settings.set("lastUsedSize", fitSize);
            Settings.set("lastUsedFitType", fitType);

            // update header
            $$("header .text").each(function () {
                this.toggleClass("hidden", !this.hasClass("resize-processing"));
            });

            // update navigation
            $$("nav span[role='button']").addClass("tmp-disabled");

            var writeTasks = [];
            var bar = $(resizeProgress, ".progress-bar");
            var resizeProgressPrc = $(".resize-progress-prc");
            var tasksDone = 0;

            var selectedPhotosIds = Object.keys(selectedPhotosLocal).filter(function (id) {
                return !selectedPhotosLocal[id].skip;
            });

            selectedPhotosIds.forEach(function (id) {
                writeTasks.push(function (callback) {
                    getBase64FromFileEntry(selectedPhotosLocal[id].entry, function (dataUri) {
                        var img = new Image;
                        img.onload = function () {
                            var resizedDataUri;
                            var options = {
                                force: allowEnlarge,
                                size: fitSize,
                                quality: quality / 100
                            };

                            switch (fitType) {
                                case "width":
                                    resizedDataUri = fitWidth.call(this, options);
                                    break;

                                case "height":
                                    resizedDataUri = fitHeight.call(this, options);
                                    break;

                                case "biggest":
                                    resizedDataUri = fitBiggest.call(this, options);
                                    break;
                            }

                            restoreExifData(dataUri, resizedDataUri, function (newBlob) {
                                overWriteEntry(selectedPhotosLocal[id].entry, newBlob, function () {
                                    var photo = $("[data-id='" + id + "']").addClass("img-container-done");

                                    tasksDone += 1;
                                    var percentsDone = Math.floor(tasksDone / selectedPhotosIds.length * 100);

                                    bar.attr("aria-valuenow", percentsDone).css("width", percentsDone + "%");
                                    resizeProgressPrc.html(percentsDone);

                                    callback();
                                });
                            });
                        };

                        img.src = dataUri;
                    });
                });
            });

            parallel(writeTasks, 1, function () {
                selectedPhotosLocal = {};

                resizeProgress.removeClass("progress-striped");

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("resize-done"));
                });

                // update navigation
                $$("nav span[role='button']").removeClass("tmp-disabled");
            });
        },

        serverStep2: function Actions_serverStep2Check(params) {
            requestRemovableFilesystems(function (filesystems) {
                params.devices = filesystems.map(function (fs) {
                    return {
                        id: fs.id,
                        name: fs.name
                    };
                });

                Templates.render("server-step-2", params, function (html) {
                    document.body.html(html);

                    if (!filesystems.length) {
                        // update header
                        $$("header .text").each(function () {
                            this.toggleClass("hidden", !this.hasClass("device-none"));
                        });

                        // update status
                        $$(".global-wrapper .status").each(function () {
                            this.toggleClass("hidden", !this.hasClass("no-devices"));
                        });

                        return;
                    }
                });
            });
        },

        serverStep2DeviceSelected: function Actions_serverStep2DeviceSelected(params) {
            requestRemovableFilesystems(function (filesystems) {
                var isUIDrawn = ($(".server-step-2") !== null);

                if (isUIDrawn) {
                    onUIReady();
                } else {
                    params.devices = filesystems.map(function (fs) {
                        return {
                            id: fs.id,
                            name: fs.name,
                            selected: (fs.id === params.value)
                        };
                    });

                    Templates.render("server-step-2", params, function (html) {
                        document.body.html(html);
                        onUIReady();
                    });
                }

                function onUIReady() {
                    var fsData;
                    for (var i = 0; i < filesystems.length; i++) {
                        if (filesystems[i].id === params.value) {
                            fsData = filesystems[i];
                            break;
                        }
                    }

                    $(".procede-step-3").data("device", fsData.name);
                    selectDevice(fsData.fs, fsData.name);
                }
            });
        },

        reselectDevice: function Actions_reselectDevice() {
            var params = {
                back: !$("nav span[data-action='click/back']").hasClass("disabled"),
                forward: !$("nav span[data-action='click/forward']").hasClass("disabled")
            };

            Actions.serverStep2(params);
        },

        serverStep3: function Actions_serverStep3(params) {
            var selectedPhotosIds = Object.keys(selectedPhotosServer).filter(function (id) {
                return !selectedPhotosServer[id].skip;
            });

            params.numPhotosSelected = selectedPhotosIds.length;
            params.fit = Settings.get("lastUsedFitUpload");

            params.photos = selectedPhotosIds.map(function (id) {
                return {
                    id: id,
                    dataUri: selectedPhotosServer[id].dataUri
                };
            });

            Templates.render("server-step-3", params, function (html) {
                document.body.html(html);
            });
        },

        startUpload: function Actions_startUpload(params) {
            var authFail = $(".auth-fail").addClass("hidden");

            // update header
            $$("header .text").each(function () {
                this.toggleClass("hidden", !this.hasClass("upload-auth"));
            });

            auth(function (token, jsonData) {
                Settings.set("profile", jsonData);

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("upload-processing"));
                });

                // update navigation
                $$("nav span[role='button']").addClass("tmp-disabled");

                var selectedPhotosIds = Object.keys(selectedPhotosServer).filter(function (id) {
                    return !selectedPhotosServer[id].skip;
                });

                var needsFit = $("[name='fit']").checked;
                var progress = $(".progress").removeClass("hidden");
                var uploadProgressPrc = $(".upload-progress-prc");
                var bar = $(progress, ".progress-bar");

                var uploadTasks = {};
                var photosUploaded = 0;

                // save selected params for future use
                Settings.set("lastUsedFitUpload", needsFit);

                selectedPhotosIds.forEach(function (id) {
                    uploadTasks[id] = function (cb) {
                        var fileEntry = selectedPhotosServer[id].entry;

                        var onUploadEnd = function (success) {
                            var photo = $("[data-id='" + id + "']").addClass(success ? "img-container-done" : "img-container-err");

                            photosUploaded += 1;
                            var percent = Math.floor(photosUploaded / selectedPhotosIds.length * 100);

                            bar.attr("aria-valuenow", percent).css("width", percent + "%");
                            uploadProgressPrc.html(percent);

                            cb();
                        };

                        var uploadBlob = function (blob) {
                            upload(blob, fileEntry.name, token, function (link) {
                                console.log(link);
                                onUploadEnd(true);
                            }, function (percent) {
                                var percentTotal = photosUploaded / selectedPhotosIds.length * 100;
                                var percentCurrent = 1 / selectedPhotosIds.length * percent;
                                var percentSum = Math.min(Math.floor(percentTotal + percentCurrent), 100);

                                bar.attr("aria-valuenow", percentSum).css("width", percentSum + "%");
                                uploadProgressPrc.html(percentSum);
                            }, function (err) {
                                onUploadEnd(false);
                            });
                        };

                        if (needsFit) {
                            fitTo2048(fileEntry, uploadBlob);
                        } else {
                            fileEntry.file(uploadBlob);
                        }
                    };
                });

                parallel(uploadTasks, 1, function () {
                    progress.removeClass("progress-striped");

                    // save device photos list for future
                    var devices = Settings.get("devices");
                    devices[params.device] = Object.keys(selectedPhotosServer).map(function (id) {
                        return selectedPhotosServer[id].entry.fullPath;
                    });

                    Settings.set("devices", devices);

                    // update header
                    $$("header .text").each(function () {
                        this.toggleClass("hidden", !this.hasClass("upload-done"));
                    });

                    // update navigation
                    $$("nav span[role='button']").removeClass("tmp-disabled");

                    // show "view photos" link
                    $(".see-it").removeClass("hidden");
                });
            }, function () {
                authFail.removeClass("hidden");

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("upload-options"));
                });
            });
        },

        viewUploadedPhotos: function Actions_viewUploadedPhotos() {
            var profileData = Settings.get("profile");
            window.open(Config.constants.dropbox_url.replace("ID", profileData.id));
        },

        enough: function Actions_enough() {
            window.close();
        }
    };
})();
