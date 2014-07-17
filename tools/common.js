/*
 * Encode string en hex format
 * @param str String to encode.
 * @return Encoded string.
 */
var hexEncode = function(str) {
    var result = '';    
    var index = 0;

    while (index < str.length) {
        result += str.charCodeAt(index++).toString(16);
    }

    return result;
};

var urlDecode = function(str) {
    return unescape(str.replace(new RegExp('\\+','g'), ' '))
};

var descramble = function(str) {
    if (str == '' || typeof(str) === 'undefined') { 
        return '';
    }
    return hexEncode(urlDecode(str)).toLowerCase();
}