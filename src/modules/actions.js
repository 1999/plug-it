Actions = (function () {
    "use strict";

    var DATASET_ID_PLACEHOLDER = "place4id";

    var photosSelectedToResize = {}; // object (uuid: {FileEntry, dataUri}, ...)
    var deviceSelectedToUpload; // object (fs: FileSystem, entries: object)


    function selectLocalPhotos(entries, isLoadedAgain) {
        var wrapperElem = $(".global-wrapper").removeClass("hidden");
        var progress = $(wrapperElem, ".progress");

        // update header
        $$("header .text").each(function () {
            this.toggleClass("hidden", !this.hasClass("header-processing"));
        });

        // it's faster to render template for one photo and add dataset item N times
        // than to render template 100 times with different parameters
        Templates.render("photo", {id: DATASET_ID_PLACEHOLDER}, function (html) {
            var resultHtmlChunks = [];
            var loadImageTasks = {};

            var totalImagesLoaded = 0;
            var bar = $(progress, ".progress-bar");

            // set UUID to every FileEntry
            entries.forEach(function (fileEntry) {
                var id = uuid();
                photosSelectedToResize[id] = {
                    entry: fileEntry,
                    dataUri: ""
                };

                loadImageTasks[id] = function (callback) {
                    var photo = $(wrapperElem, "[data-id='" + id + "']");
                    if (!photo) {
                        callback();
                        return;
                    }

                    readChosenImageInfo(photosSelectedToResize[id].entry, function (res) {
                        photosSelectedToResize[id].dataUri = res.dataUri;

                        photo.addClass("img-selected");
                        $(photo, ".spinner").addClass("hidden");
                        $(photo, ".img-container").css("backgroundImage", "url(" + res.dataUri + ")");
                        $(photo, ".photos-dms").html(res.width + "x" + res.height);

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

            // remove search placeholder, render progressbar and photos
            progress.removeClass("hidden");
            $$(wrapperElem, ".status").addClass("hidden");
            wrapperElem.append(resultHtmlChunks.join(""));

            // load images
            parallel(loadImageTasks, 1, function () {
                progress.removeClass("progress-striped");

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("header-procede"));
                });

                $("header .new-done").toggleClass("hidden", isLoadedAgain);
            });
        });
    }

    function selectDevice(fs, meta) {
        var photosWrapper = $(".device-photos");
        var progress = $(".progress");

        if (!fs) {
            deviceSelectedToUpload = null;
            photosWrapper.empty();

            return;
        }

        var scanningDevice = $(".scanning-device").removeClass("hidden");

        getDevicePhotos(fs, function (entries) {
            entries.length = 3;

            if (!entries.length) {
                scanningDevice.addClass("hidden");
                $(".no-photos-found").removeClass("hidden");
                return;
            }

            deviceSelectedToUpload = {
                fs: fs,
                entries: {}
            };

            // it's faster to render template for one photo and add dataset item N times
            // than to render template 100 times with different parameters
            Templates.render("photo", {id: DATASET_ID_PLACEHOLDER}, function (html) {
                var resultHtmlChunks = [];
                var loadImageTasks = {};

                var totalImagesLoaded = 0;
                var bar = $(progress, ".progress-bar");

                // set UUID to every FileEntry
                entries.forEach(function (fileEntry) {
                    var id = uuid();
                    deviceSelectedToUpload.entries[id] = {
                        entry: fileEntry,
                        dataUri: ""
                    };

                    loadImageTasks[id] = function (callback) {
                        readChosenImageInfo(deviceSelectedToUpload.entries[id].entry, function (res) {
                            deviceSelectedToUpload.entries[id].dataUri = res.dataUri;

                            var photo = $(photosWrapper, "[data-id='" + id + "']").addClass("img-selected");
                            $(photo, ".spinner").addClass("hidden");
                            $(photo, ".img-container").css("backgroundImage", "url(" + res.dataUri + ")");
                            $(photo, ".photos-dms").html(res.width + "x" + res.height);

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

                // remove search placeholder, render progressbar and photos
                scanningDevice.addClass("hidden");
                progress.removeClass("hidden");
                photosWrapper.html(resultHtmlChunks.join(""));

                // load images
                parallel(loadImageTasks, 1, function () {
                    progress.removeClass("progress-striped");

                    $("header .device-select").addClass("hidden");
                    $("header .device-parsed").removeClass("hidden");
                });
            });
        });
    }

    function uploadPhotos(token, cb) {
        var needsFit = $("[name='fit']").checked;
        var progress = $(".progress").removeClass("hidden");
        var uploadProgressPrc = $(".upload-progress-prc");
        var bar = $(progress, ".progress-bar");
        var uploadTasks = {};
        var photosUploaded = 0;

        Object.keys(deviceSelectedToUpload.entries).forEach(function (id, index, totalIds) {
            uploadTasks[id] = function (callback) {
                var fileEntry = deviceSelectedToUpload.entries[id].entry;

                var uploadBlob = function (blob) {
                    upload(blob, fileEntry.name, token, function (link) {
                        var photo = $("[data-id='" + id + "']").addClass("img-container-done");
                        console.log(link);

                        photosUploaded += 1;
                        var percent = Math.floor(photosUploaded / totalIds.length * 100);

                        bar.attr("aria-valuenow", percent).css("width", percent + "%");
                        uploadProgressPrc.html(percent);

                        callback();
                    }, function (percent) {
                        var percentTotal = photosUploaded / totalIds.length * 100;
                        var percentCurrent = 1 / totalIds.length * percent;
                        var percentSum = Math.min(Math.floor(percentTotal + percentCurrent), 100);

                        bar.attr("aria-valuenow", percentSum).css("width", percentSum + "%");
                        uploadProgressPrc.html(percentSum);
                    }, function (err) {
                        // ...
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

            $("header .upload-done").removeClass("hidden");
            $("header .upload-options").addClass("hidden");
        });
    }

    function recheckGoogleProfile(token, onSuccess, onFail) {
        loadResource("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: "Bearer " + token
            },
            onload: function () {
                var json;

                try {
                    json = JSON.parse(this.responseText)
                } catch (ex) {
                    // TODO send message
                }

                if (json) {
                    onSuccess(json);
                } else {
                    onFail();
                }
            },
            onerror: function (evt) {
                // TODO evt.type
                onFail();
            }
        });
    }

    function authNewGoogleProfile(onSuccess, onFail) {
        chrome.identity.getAuthToken({
            interactive: true
        }, function (token) {
            if (chrome.runtime.lastError) {
                // TODO send message JSON.stringify(chrome.runtime.lastError)
                onFail();

                return;
            }

            recheckGoogleProfile(token, function (json) {
                json.token = token;

                var googleProfiles = Settings.get("googleProfiles");
                var isNewProfile = true;

                for (var i = 0; i < googleProfiles.length; i++) {
                    if (googleProfiles[i].id === json.id) {
                        googleProfiles[i] = json;
                        isNewProfile = false;

                        break;
                    }
                }

                if (isNewProfile) {
                    googleProfiles.push(json);
                }

                Settings.set("googleProfiles", googleProfiles);
                onSuccess(json);
            }, function (err) {
                console.error(err);
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

                if (!Object.keys(photosSelectedToResize).length)
                    return;

                // update body status
                $$(".global-wrapper .status").addClass("hidden");
                $(".global-wrapper .searching-photos").removeClass("hidden");

                var entries = Object.keys(photosSelectedToResize).map(function (id) {
                    return photosSelectedToResize[id].entry;
                });

                photosSelectedToResize = {};
                selectLocalPhotos(entries, true);
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

                $(wrapperElem, ".searching-photos").removeClass("hidden");
                selectLocalPhotos(entries);
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

                    selectLocalPhotos(entries);
                });
            });
        },

        localStep3: function Actions_localStep3(params) {
            // delete inactive photos
            Object.keys(photosSelectedToResize).forEach(function (id) {
                if (photosSelectedToResize[id].skip) {
                    delete photosSelectedToResize[id];
                }
            });

            var selectedPhotos = Object.keys(photosSelectedToResize);
            var fit = Settings.get("lastUsedFitType");

            params.numPhotosSelected = selectedPhotos.length;
            params.size = Settings.get("lastUsedSize");
            params.quality = Settings.get("lastUsedQuality");
            params.allowEnlarge = Settings.get("lastUsedAllowEnlarge");

            params.fitWidth = (fit === "width");
            params.fitHeight = (fit === "height");
            params.fitBiggest = (fit === "biggest");

            params.photos = selectedPhotos.map(function (id) {
                return {
                    id: id,
                    dataUri: photosSelectedToResize[id].dataUri
                };
            });

            Templates.render("local-step-3", params, function (html) {
                document.body.html(html);
            });
        },

        selectPhoto: function Actions_selectPhoto() {
            var id = this.data("id");
            var isProcessing = !$("header .header-processing").hasClass("hidden");

            if (this.toggleClass("img-selected")) {
                delete photosSelectedToResize[id].skip;
            } else {
                photosSelectedToResize[id].skip = true;
            }

            if (isProcessing)
                return;

            var noPhotosSelected = Object.keys(photosSelectedToResize).every(function (id) {
                return (photosSelectedToResize[id].skip === true);
            });

            if (noPhotosSelected) {
                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("header-no-active"));
                });
            } else {
                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("header-procede"));
                });
            }
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

            var writeTasks = {};
            var bar = $(resizeProgress, ".progress-bar");
            var resizeProgressPrc = $(".resize-progress-prc");
            var tasksDone = 0;

            Object.keys(photosSelectedToResize).forEach(function (id, index, totalIds) {
                writeTasks[id] = function (callback) {
                    var photo = $("[data-id='" + id + "']");

                    getBase64FromFileEntry(photosSelectedToResize[id].entry, function (dataUri) {
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

                            var newBlob = restoreExifData(dataUri, resizedDataUri);
                            overWriteEntry(photosSelectedToResize[id].entry, newBlob, function () {
                                tasksDone += 1;
                                var percentsDone = Math.floor(tasksDone / totalIds.length * 100);

                                bar.attr("aria-valuenow", percentsDone).css("width", percentsDone + "%");
                                resizeProgressPrc.html(percentsDone);
                                photo.addClass("img-container-done");

                                callback();
                            });
                        };

                        img.src = dataUri;
                    });
                };
            });

            parallel(writeTasks, 1, function () {
                photosSelectedToResize = {};

                resizeProgress.removeClass("progress-striped");

                // update header
                $$("header .text").each(function () {
                    this.toggleClass("hidden", !this.hasClass("resize-done"));
                });
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
                });
            });
        },

        serverStep2DeviceSelected: function Actions_serverStep2DeviceSelected(params) {
            if (this instanceof HTMLElement) {
                params.device = this.value;
            }

            requestRemovableFilesystems(function (filesystems) {
                var isUIDrawn = ($(".server-step-2") !== null);

                if (isUIDrawn) {
                    onUIReady();
                } else {
                    params.devices = filesystems.map(function (fs) {
                        return {
                            id: fs.id,
                            name: fs.name,
                            selected: (fs.id === params.device)
                        };
                    });

                    Templates.render("server-step-2", params, function (html) {
                        document.body.html(html);
                        onUIReady();
                    });
                }

                function onUIReady() {
                    var fs;
                    for (var i = 0; i < filesystems.length; i++) {
                        if (filesystems[i].id === params.device) {
                            fs = filesystems[i].fs;
                            break;
                        }
                    }

                    selectDevice(fs);
                }
            });
        },

        serverStep3: function Actions_serverStep3(params) {
            params.numPhotosSelected = Object.keys(deviceSelectedToUpload.entries).length;
            params.fit = true;
            params.profiles = Settings.get("googleProfiles");

            params.photos = Object.keys(deviceSelectedToUpload.entries).map(function (id) {
                return {
                    id: id,
                    dataUri: deviceSelectedToUpload.entries[id].dataUri
                };
            });

            Templates.render("server-step-3", params, function (html) {
                document.body.html(html);
            });
        },

        startUpload: function Actions_startUpload() {
            var googleProfiles = Settings.get("googleProfiles");
            var profilesAvailable = $(".upload-profi2le");
            var selectedProfileId = profilesAvailable ? profilesAvailable.val() : null;

            if (selectedProfileId) {
                var token;
                googleProfiles.forEach(function (profileData) {
                    if (profileData.id === selectedProfileId) {
                        token = profileData.token;
                    }
                });

                recheckGoogleProfile(token, function (json) {
                    uploadPhotos(token);
                }, function () {
                    // ...
                });
            } else {
                authNewGoogleProfile(function (profileData) {
                    uploadPhotos(profileData.token);
                }, function (err) {
                    // ...
                });
            }
        },

        enough: function Actions_enough() {
            window.close();
        },

        addNewProfile: function Actions_addNewProfile() {
            // authNewGoogleProfile(function (profileData) {
            //     uploadPhotos(profileData.token);
            // }, function (err) {
            //     // ...
            // });

            // update header
            // update selected value on end
        }
    };
})();
