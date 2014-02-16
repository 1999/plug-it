// Based on MinifyJpeg
// http://elicon.blog57.fc2.com/blog-entry-206.html
// Originally taken from http://www.perry.cz/files/ExifRestorer.js
var ExifRestorer = (function () {
    var KEY_STR = [
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "abcdefghijklmnopqrstuvwxyz",
        "0123456789",
        "+/="
    ].join("");


    function encode64(input) {
        var output = [],
            chr1, chr2, chr3 = "",
            enc1, enc2, enc3, enc4 = "",
            i = 0;

        do {
            chr1 = input[i++];
            chr2 = input[i++];
            chr3 = input[i++];

            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
               enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
               enc4 = 64;
            }

            output.push(
                KEY_STR.charAt(enc1),
                KEY_STR.charAt(enc2),
                KEY_STR.charAt(enc3),
                KEY_STR.charAt(enc4)
            );

            chr1 = chr2 = chr3 = "";
            enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);

        return output.join("");
    }

    function exifManipulation(resizedFileBase64, segments) {
        var exifArray = getExifArray(segments);
        var newImageArray = insertExif(resizedFileBase64, exifArray);

        return new Uint8Array(newImageArray);
    }

    function getExifArray(segments) {
        var seg;

        for (var x = 0, len = segments.length; x < len; x++) {
            seg = segments[x];

            //(ff e1)
            if (seg[0] === 255 & seg[1] === 225) {
                return seg;
            }
        }

        return [];
    }

    function insertExif(resizedFileBase64, exifArray) {
        var imageData = resizedFileBase64.replace("data:image/jpeg;base64,", ""),
            buf = decode64(imageData),
            separatePoint = buf.indexOf(255, 3),
            mae = buf.slice(0, separatePoint),
            ato = buf.slice(separatePoint),
            array = mae;

        array = array.concat(exifArray);
        array = array.concat(ato);

        return array;
    }

    function slice2Segments(rawImageArray) {
        var head = 0;
        var segments = [];
        var length, endPoint, seg;

        while (true) {
            if (rawImageArray[head] === 255 & rawImageArray[head + 1] === 218) {
                break;
            }

            if (rawImageArray[head] === 255 & rawImageArray[head + 1] === 216) {
                head += 2;
            } else {
                length = rawImageArray[head + 2] * 256 + rawImageArray[head + 3];
                endPoint = head + length + 2;
                seg = rawImageArray.slice(head, endPoint);

                segments.push(seg);
                head = endPoint;
            }

            if (head > rawImageArray.length){
                break;
            }
        }

        return segments;
    }

    function decode64(input) {
        var chr1, chr2, chr3 = "",
            enc1, enc2, enc3, enc4 = "",
            i = 0,
            buf = [];

        // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
        var base64test = /[^A-Za-z0-9\+\/\=]/g;
        if (base64test.exec(input)) {
            console.error("There were invalid base64 characters in the input text. Expect errors in decoding.");
        }

        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        do {
            enc1 = KEY_STR.indexOf(input.charAt(i++));
            enc2 = KEY_STR.indexOf(input.charAt(i++));
            enc3 = KEY_STR.indexOf(input.charAt(i++));
            enc4 = KEY_STR.indexOf(input.charAt(i++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            buf.push(chr1);

            if (enc3 != 64) {
               buf.push(chr2);
            }

            if (enc4 != 64) {
               buf.push(chr3);
            }

            chr1 = chr2 = chr3 = "";
            enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);

        return buf;
    }


    return {
        restore: function ExifRestorer_restore(origFileBase64, resizedFileBase64) {
            if (!origFileBase64.match("data:image/jpeg;base64,"))
                return resizedFileBase64;

            var rawImage = decode64(origFileBase64.replace("data:image/jpeg;base64,", ""));
            var segments = slice2Segments(rawImage);

            var image = exifManipulation(resizedFileBase64, segments);
            return "data:image/jpeg;base64," + encode64(image);
        }
    };
})();
