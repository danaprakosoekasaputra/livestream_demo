const getParam = function(fullURL, targetParamName) {
  var paramsString = fullURL.substring(fullURL.indexOf("?")+1, fullURL.length);
  var paramsSplit = paramsString.split("&");
  for (var i=0; i<paramsSplit.length; i++) {
    var paramSplit = paramsSplit[i];
    var paramName = paramSplit.split("=")[0];
    var paramValue = paramSplit.split("=")[1];
    if (paramName == targetParamName) {
      return paramValue;
    }
  }
  return null;
};

const detectBrowser = function() {
  var isFirefox = typeof InstallTrigger !== 'undefined';
  var isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);
  if (isFirefox) {
    return "firefox";
  } else if (isChrome) {
    return "chrome";
  }
  return "";
};

export { getParam, detectBrowser }
