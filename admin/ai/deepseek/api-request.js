// DeepSeek API Wrapper - Core API communication module
// Server-side Node.js module ONLY
// Handles API communication with DeepSeek.
//
// Transport: uses the built-in global fetch (Node 18+) and falls back to the
// optional `node-fetch` package when present. No new dependency is required.
// The API key is supplied by the caller (read from the environment upstream)
// and is NEVER logged or stored here.

'use strict';

var providerEnums = require('./provider-enums.js');
var errorHandler = require('./api-error-handler.js');
var helpers = require('./helpers.js');

function resolveFetch(fetchImpl) {
  if (typeof fetchImpl === 'function') return fetchImpl;
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch;
  }
  if (typeof fetch === 'function') return fetch;
  try {
    var nodeFetch = require('node-fetch');
    if (typeof nodeFetch === 'function') return nodeFetch;
    if (nodeFetch && typeof nodeFetch.default === 'function') return nodeFetch.default;
  } catch (e) {}
  return null;
}

// makeApiRequest(payload, apiKey, timeoutMs, options)
//   options.fetchImpl -> injectable transport (used by tests; no network).
function makeApiRequest(payload, apiKey, timeoutMs, options) {
  options = options || {};
  var baseUrl = helpers.text(options.baseUrl || providerEnums.getBaseUrl());
  var url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  var doFetch = resolveFetch(options.fetchImpl);
  if (!doFetch) {
    return Promise.reject(
      errorHandler.createApiError(
        providerEnums.ERROR_CODES.API_UNAVAILABLE,
        'No fetch implementation available on this runtime. Use Node 18+ or install node-fetch.'
      )
    );
  }

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = null;

  var headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey
  };

  var requestOptions = {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  };
  if (controller) requestOptions.signal = controller.signal;

  var timeoutMsSafe = Number(timeoutMs) > 0 ? Number(timeoutMs) : 0;
  var timeoutPromise = null;
  if (timeoutMsSafe > 0) {
    timeoutPromise = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (controller) {
          try { controller.abort(); } catch (e) {}
        }
        var err = new Error('Request timeout after ' + timeoutMsSafe + 'ms');
        err.code = providerEnums.ERROR_CODES.API_TIMEOUT;
        reject(err);
      }, timeoutMsSafe);
    });
  }

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  var requestPromise = doFetch(url, requestOptions).then(function (response) {
    if (!response || typeof response.json !== 'function') {
      throw new Error('Invalid response object from fetch implementation.');
    }
    if (response.ok === false) {
      return response.json().catch(function () { return null; }).then(function (body) {
        var errorBody = body ? JSON.stringify(body) : String(response.statusText || '');
        var error = new Error('HTTP ' + response.status + ': ' + errorBody);
        error.statusCode = response.status;
        error.responseBody = errorBody;
        throw error;
      });
    }
    return response.json();
  });

  var raced = timeoutPromise ? Promise.race([requestPromise, timeoutPromise]) : requestPromise;
  return raced.then(function (data) {
    clearTimer();
    return data;
  }, function (err) {
    clearTimer();
    throw err;
  });
}

module.exports = {
  makeApiRequest: makeApiRequest
};
