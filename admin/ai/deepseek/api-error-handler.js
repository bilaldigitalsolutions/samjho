// DeepSeek Provider - Core API Module
// Server-side Node.js module ONLY
// Handles API communication with DeepSeek

'use strict';

var providerEnums = require('./provider-enums.js');

function createApiError(code, message, details) {
  return Object.assign({
    ok: false,
    code: code,
    message: message
  }, details || {});
}

function isNetworkError(err) {
  if (!err) return false;
  var msg = String(err.message || err || '').toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('abort') || 
         msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound');
}

function isTimeoutError(err) {
  if (!err) return false;
  var msg = String(err.message || err || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('abort');
}

function isRateLimitError(err) {
  if (!err) return false;
  var msg = String(err.message || err || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate') || msg.includes('too many');
}

function isAuthError(err) {
  if (!err) return false;
  var msg = String(err.message || err || '').toLowerCase();
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api');
}

function categorizeApiError(err) {
  if (isTimeoutError(err)) {
    return createApiError('API_TIMEOUT', 'Request timed out', { originalError: err });
  }
  if (isRateLimitError(err)) {
    return createApiError('API_RATE_LIMITED', 'Rate limit exceeded', { originalError: err });
  }
  if (isAuthError(err)) {
    return createApiError('INVALID_API_KEY', 'Authentication failed', { originalError: err });
  }
  if (isNetworkError(err)) {
    return createApiError('API_UNAVAILABLE', 'Network error', { originalError: err });
  }
  return createApiError('API_UNAVAILABLE', 'API request failed: ' + String(err), { originalError: err });
}

module.exports = {
  createApiError: createApiError,
  isNetworkError: isNetworkError,
  isTimeoutError: isTimeoutError,
  isRateLimitError: isRateLimitError,
  isAuthError: isAuthError,
  categorizeApiError: categorizeApiError
};
