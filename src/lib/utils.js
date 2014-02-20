(function (exports) {
    "use strict";
    
    var DEVICE_PHOTOS_DIR = "DCIM";
    

    // use one worker to generate blob from dataUri
    // it's intresting to know, but web worker does this 10x times faster
    // than UI thread. Whoa!
    var dataUriToBlobWorker;
    var dataUriToBlobTerminateTimeoutId;


    exports.parallel = function (tasks, concurrency, callback, ctx) {
        if (typeof concurrency === "function") {
            ctx = callback;
            callback = concurrency;
            concurrency = 0;
        }

        var isNamedQueue = !Array.isArray(tasks);
        var tasksKeys = isNamedQueue ? Object.keys(tasks) : new Array(tasks.length);
        var resultsData = isNamedQueue ? {} : [];

        if (!tasksKeys.length)
            return callback && callback.call(ctx, resultsData);

        var tasksProcessedNum = 0;
        var tasksBeingProcessed = 0;
        var tasksTotalNum = tasksKeys.length;

        (function processTasks() {
            if (!tasksKeys.length || (concurrency && concurrency <= tasksBeingProcessed))
                return;

            var taskIndex = tasksKeys.shift() || tasks.length - tasksKeys.length - 1;
            tasksBeingProcessed += 1;

            tasks[taskIndex].call(ctx, function (data) {
                resultsData[taskIndex] = data;
                tasksBeingProcessed -= 1;
                tasksProcessedNum += 1;

                if (tasksProcessedNum === tasksTotalNum)
                    return callback && callback.call(ctx, resultsData);

                processTasks();
            });

            processTasks();
        })();
    };

    exports.uuid = function () {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = (c == "x") ? r : (r&0x3|0x8);

            return v.toString(16);
        });
    };

    // force, size, quality
    exports.fitWidth = function (options) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var ratio = this.width / this.height;

        canvas.width = options.force ? options.size : Math.min(options.size, this.width);
        canvas.height = Math.round(canvas.width / ratio);

        ctx.drawImage(this, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", options.quality || 0.92);
    };

    exports.fitHeight = function (options) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var ratio = this.width / this.height;

        canvas.height = options.force ? options.size : Math.min(options.size, this.height);
        canvas.width = Math.round(canvas.height * ratio);

        ctx.drawImage(this, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", options.quality || 0.92);
    };

    exports.fitBiggest = function (options, callback) {
        return (this.width / this.height > 1)
            ? fitWidth.call(this, options) // horizontal
            : fitHeight.call(this, options); // vertical
    };

    exports.fitSmallest = function (options, callback) {
        return (this.width / this.height > 1)
            ? fitHeight.call(this, options) // horizontal
            : fitWidth.call(this, options); // vertical
    };

    exports.readChosenImageInfo = function (fileEntry, cb) {
        getBase64FromFileEntry(fileEntry, function (dataUri) {
            var image = new Image;
            image.onload = function () {
                cb({
                    dataUri: fitSmallest.call(this, {force: true, size: 150}),
                    width: this.width,
                    height: this.height
                });
            };

            image.src = dataUri;
        });
    };

    exports.dataURItoBlob = function (dataURI, cb) {
        // lifetime of web worker is 30 seconds
        // if it's lasting longer, kill it with <s>fire</s> terminate()
        if (dataUriToBlobTerminateTimeoutId) {
            clearTimeout(dataUriToBlobTerminateTimeoutId);
        } else if (!dataUriToBlobWorker) {
            dataUriToBlobWorker = new Worker("/lib/worker.js");

            dataUriToBlobWorker.addEventListener("message", function (evt) {
                dataUriToBlobTerminateTimeoutId = setTimeout(function () {
                    dataUriToBlobWorker.terminate();

                    dataUriToBlobWorker = null;
                    dataUriToBlobTerminateTimeoutId = null;
                }, 30000);
            }, false);
        }

        var id = uuid();

        dataUriToBlobWorker.addEventListener("message", function onMessageListener(evt) {
            if (evt.data.id === id) {
                cb(evt.data.blob);
                dataUriToBlobWorker.removeEventListener("message", onMessageListener, false);
            }
        }, false);

        dataUriToBlobWorker.postMessage({
            id: id,
            uri: dataURI
        });
    };

    exports.getAllDirectoryFileEntries = function (dir, cb) {
        var reader = dir.createReader();
        reader.readEntries(function (entries) {
            var output = [];
            var asyncTasks = [];

            entries.forEach(function (entry) {
                if (entry.isFile) {
                    asyncTasks.push(function (cb) {
                        var ext = entry.fullPath.split(".").pop().toLowerCase();
                        if (["gif", "jpg", "png"].indexOf(ext) !== -1) {
                            output.push(entry);
                        }

                        cb();
                    });
                } else {
                    asyncTasks.push(function (cb) {
                        getAllDirectoryFileEntries(entry, function (files) {
                            output = output.concat(files);
                            cb();
                        });
                    });
                }
            });

            parallel(asyncTasks, function () {
                cb(output);
            });
        });
    };

    exports.getBase64FromFileEntry = function (fileEntry, cb) {
        fileEntry.file(function (file) {
            var reader = new FileReader;
            reader.onloadend = function () {
                cb(reader.result);
            };

            reader.readAsDataURL(file);
        });
    };

    exports.overWriteEntry = function (fileEntry, newBlob, cb) {
        chrome.fileSystem.getWritableEntry(fileEntry, function (fileEntry) {
            fileEntry.createWriter(function (fileWriter) {
                // writeend listener for "truncate" action
                fileWriter.onwriteend = function () {
                    // writeend listener for "write" action
                    fileWriter.onwriteend = function () {
                        cb();
                    };

                    fileWriter.write(newBlob);
                };

                fileWriter.truncate(0);
            });
        });
    };

    exports.restoreExifData = function (origBase64, resizedBase64, cb) {
        var magicBase64 = ExifRestorer.restore(origBase64, resizedBase64);
        dataURItoBlob(magicBase64, cb);
    };

    exports.requestRemovableFilesystems = function (cb) {
        chrome.mediaGalleries.getMediaFileSystems({interactive: "no"}, function (fileSystems) {
            var output = [];

            fileSystems.forEach(function (fs) {
                var obj = chrome.mediaGalleries.getMediaFileSystemMetadata(fs);
                if (obj.isRemovable || obj.isMediaDevice) {
                    output.push({
                        fs: fs,
                        name: obj.name,
                        id: obj.deviceId
                    });
                }
            });

            cb(output);
        });
    };

    exports.getDevicePhotos = function (fs, cb) {
        function getDirEntriesRecursive(dir, cb) {
            getAllDirectoryFileEntries(dir, function (entries) {
                var allowedExtensions = ["jpg", "jpeg", "gif", "png"];
    
                // filtering by file extension is much faster than getting fileentry blob
                // and filtering by its "type" property
                entries = entries.filter(function (entry) {
                    var extension = entry.name.split(".").pop().toLowerCase();
                    return (allowedExtensions.indexOf(extension) !== -1);
                });
    
                cb(entries);
            });
        }
        
        fs.root.getDirectory(DEVICE_PHOTOS_DIR, {create: false}, function (photosDir) {
            getDirEntriesRecursive(photosDir, cb);
        }, function (err) {
            getDirEntriesRecursive(fs.root, cb);
        });
    };

    exports.fitTo2048 = function (fileEntry, cb) {
        getBase64FromFileEntry(fileEntry, function (dataUri) {
            var img = new Image;
            img.onload = function () {
                var resizedDataUri = fitBiggest.call(this, {
                    force: true,
                    size: 2048,
                    quality: 1
                });

                restoreExifData(dataUri, resizedDataUri, cb);
            };

            img.src = dataUri;
        });
    };

    exports.upload = function (blob, title, token, onLoad, onProgress, onError) {
        loadResource("https://picasaweb.google.com/data/feed/api/user/default/albumid/default", {
            method: "POST",
            headers: {
                Slug: title,
                Authorization: "Bearer " + token
            },
            data: blob,
            onUploadProgress: onProgress,
            onload: function () {
                var response = this.responseXML;
                var href = response.querySelector("link[rel='alternate']");

                onLoad(href.getAttribute("href"));
            },
            onerror: function (evt) {
                onError(evt.type);
            }
        });
    };

    exports.auth = function (onSuccess, onFail) {
        chrome.identity.getAuthToken({
            interactive: true
        }, function (token) {
            if (chrome.runtime.lastError) {
                onFail();
                return;
            }

            loadResource("https://www.googleapis.com/oauth2/v2/userinfo", {
                headers: {
                    Authorization: "Bearer " + token
                },
                onload: function () {
                    if (this.status === 401) { // token revoke
                        chrome.identity.removeCachedAuthToken({
                            token: token
                        }, function () {
                            auth(onSuccess, onFail);
                        });

                        return;
                    }

                    var json;

                    try {
                        json = JSON.parse(this.responseText)
                    } catch (ex) {}

                    if (json) {
                        onSuccess(token, json);
                    } else {
                        onFail();
                    }
                },
                onerror: function (evt) {
                    onFail();
                }
            });
        });
    };

    /**
     * Копирование объекта
     * @param {Object} src
     * @param {Boolean} deep
     * @return {Object}
     */
    exports.copyObj = function (src, deep) {
        if (typeof src !== "object" || !src)
            throw new TypeError("Not an object");

        if (Array.isArray(src)) {
            return src.map(function (el) {
                return deep ? copyObj(el, deep) : el;
            });
        }

        var result = {};
        for (var key in src) {
            result[key] = (deep && typeof src[key] === "object" && src[key] !== null)
                ? copyObj(src[key], deep)
                : src[key];
        }

        return result;
    };

    exports.createRequestParams = function (params) {
        var output = [];

        for (var key in params)
            output.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));

        return output.join("&");
    };

    exports.loadResource = function (url, options, ctx) {
        var xhr = new XMLHttpRequest;
        var method = options.method || "GET";
        var isXML = false;
        var sendData = null;

        if (method.toUpperCase() === "GET") {
            var getParams = createRequestParams(options.data);
            if (getParams.length) {
                url += "?" + getParams;
            }
        }

        xhr.open(method, url, true);
        xhr.timeout = (options.timeout !== undefined) ? options.timeout : 25000;

        if (options.headers) {
            for (var headerName in options.headers) {
                xhr.setRequestHeader(headerName, options.headers[headerName]);
            }
        }

        switch (options.responseType) {
            case "blob":
            case "document":
            case "arraybuffer":
                xhr.responseType = options.responseType;
                break;

            case "xml":
                isXML = true;
                break;
        }

        if (options.onload) {
            xhr.onload = function (evt) {
                if (/^5/.test(xhr.status)) {
                    options.onerror && options.onerror.call(ctx || xhr, evt);
                    return;
                }

                var arg = isXML ? xhr.responseXML : xhr.response;
                options.onload.call(ctx || xhr, arg);
            };
        }

        if (options.onprogress) {
            xhr.onprogress = function (evt) {
                var percents = Math.floor((evt.position / evt.totalSize) * 100);
                options.onprogress.call(ctx || xhr, percents);
            };
        }

        if (options.onUploadProgress) {
            xhr.upload.onprogress = function (evt) {
                var percents = Math.floor((evt.position / evt.totalSize) * 100);
                options.onUploadProgress.call(ctx || xhr, percents);
            };
        }

        if (options.onerror) {
            xhr.onerror = function (evt) {
                options.onerror.call(ctx || xhr, evt);
            };

            xhr.onabort = function (evt) {
                options.onerror.call(ctx || xhr, evt);
            }
        }

        if (method.toUpperCase() === "POST") {
            // for (var key in options.data) {
            //     sendData = sendData || new FormData;
            //     sendData.append(key, options.data[key]);
            // }
            sendData = options.data;
        }

        xhr.send(sendData);
        return xhr;
    };
})(window);
