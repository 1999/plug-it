onmessage = function (evt) {
    postMessage(dataURItoBlob(evt.data));
};

function dataURItoBlob(dataURI) {
    var parts = dataURI.match(/data:([^;]*)(;base64)?,([0-9A-Za-z+/]+)/);
    var binaryStr = atob(parts[3]);
    var buffer = new ArrayBuffer(binaryStr.length);
    var view = new Uint8Array(buffer);

    for (var i = 0; i < view.length; i++) {
        view[i] = binaryStr.charCodeAt(i);
    }

    return new Blob([view], {type: parts[1]});
}
