(function (exports) {
    "use strict";

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

    exports.dataURItoBlob = function (dataURI) {
        var parts = dataURI.match(/data:([^;]*)(;base64)?,([0-9A-Za-z+/]+)/);
        var binaryStr = atob(parts[3]);
        var buffer = new ArrayBuffer(binaryStr.length);
        var view = new Uint8Array(buffer);

        for (var i = 0; i < view.length; i++) {
            view[i] = binaryStr.charCodeAt(i);
        }

        return new Blob([view], {type: parts[1]});
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

    exports.restoreExifData = function (origBase64, resizedBase64) {
        var magicBase64 = ExifRestorer.restore(origBase64, resizedBase64);
        var magicBlob = dataURItoBlob(magicBase64);

        return magicBlob;
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
        getAllDirectoryFileEntries(fs.root, function (entries) {
            var parseMimeTasks = [];
            var output = [];
            var allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];

            entries.forEach(function (entry) {
                parseMimeTasks.push(function (cb) {
                    entry.file(function (fileBlob) {
                        if (allowedMimeTypes.indexOf(fileBlob.type) !== -1) {
                            output.push(entry);
                        }

                        cb();
                    });
                });
            });

            parallel(parseMimeTasks, function () {
                cb(output);
            });
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

                var newBlob = restoreExifData(dataUri, resizedDataUri);
                cb(newBlob);
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







    exports.strpad = function (str) {
        str = str + "";
        return (str.length === 1) ? "0" + str : str;
    };

    exports.getCurrentLocale = function () {
        return chrome.i18n.getMessage("@@ui_locale").split("_")[0];
    };

    /**
     * Копирование свойств объекта from в объект to
     * @param {Object} from
     * @param {Object} to
     * @return {Object} to
     */
    exports.copyOwnProperties = function (from, to) {
        if (typeof from !== "object" || typeof to !== "object")
            throw new TypeError("Not an object");

        for (var prop in from) {
            if (from.hasOwnProperty(prop)) {
                to[prop] = from[prop];
            }
        }

        return to;
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

    exports.loadResource = function(url, options, ctx) {
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

                var responseXML = null;

                if (isXML && !xhr.responseXML) {
                    // VK can response with invalid characters, replace them
                    // @see http://msdn.microsoft.com/en-us/library/k1y7hyy9(v=vs.71).aspx
                    var invalidCharCodes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 65534, 65535].map(function (charCode) {
                        return String.fromCharCode(charCode);
                    });

                    var invalidSymbolsRegex = new RegExp("[" + invalidCharCodes.join("|") + "]", "gm");
                    var responseText = xhr.responseText.replace(/[\x00-\x1f]/, "").replace(invalidSymbolsRegex, "");

                    // re-create XMLDocument
                    var parser = new DOMParser;
                    var doc = parser.parseFromString(responseText, "text/xml");

                    if (!doc || !(doc instanceof XMLDocument))
                        throw new Error("URL was not valid: " + url);

                    var parseError = doc.querySelector("parsererror");
                    if (parseError)
                        throw new Error("Parse error for " + url + ": " + parseError.innerText);

                    responseXML = doc;
                }

                var arg = isXML ? (xhr.responseXML || responseXML) : xhr.response;
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
