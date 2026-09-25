// Response Parser Module
var providerEnums = require('./provider-enums.js');
var apiErrorHandler = require('./api-error-handler.js');
var helpers = require('./helpers.js');

function parseDeepSeekResponse(responseData, sourceUrl) {
  if (!responseData || typeof responseData !== 'object') {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.INVALID_API_RESPONSE,
      'API response is not a valid object.'
    );
  }
  
  if (responseData.error) {
    var errorCode = responseData.error.code || responseData.error.message || '';
    var errorMessage = responseData.error.message || JSON.stringify(responseData.error);
    
    if (errorCode.toLowerCase().includes('rate') || errorCode.toLowerCase().includes('429')) {
      return apiErrorHandler.createApiError(
        providerEnums.ERROR_CODES.API_RATE_LIMITED,
        'API rate limit exceeded: ' + errorMessage
      );
    }
    if (errorCode.toLowerCase().includes('401') || errorCode.toLowerCase().includes('unauthorized') || 
        errorCode.toLowerCase().includes('invalid api')) {
      return apiErrorHandler.createApiError(
        providerEnums.ERROR_CODES.INVALID_API_KEY,
        'Invalid API key or unauthorized: ' + errorMessage
      );
    }
    if (errorCode.toLowerCase().includes('timeout')) {
      return apiErrorHandler.createApiError(
        providerEnums.ERROR_CODES.API_TIMEOUT,
        'API timeout: ' + errorMessage
      );
    }
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.API_UNAVAILABLE,
      'API error: ' + errorMessage
    );
  }
  
  if (!responseData.choices || !Array.isArray(responseData.choices) || responseData.choices.length === 0) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.INVALID_API_RESPONSE,
      'API response has no choices.'
    );
  }
  
  var choice = responseData.choices[0];
  if (!choice.message || !choice.message.content) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.INVALID_API_RESPONSE,
      'API response choice has no content.'
    );
  }
  
  var content = choice.message.content.trim();
  if (!content) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.MALFORMED_OUTPUT,
      'API response content is empty.'
    );
  }
  
  var parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.MALFORMED_OUTPUT,
      'API response is not valid JSON: ' + e.message + '. Content preview: ' + content.substring(0, 500)
    );
  }
  
  if (!parsed || typeof parsed !== 'object') {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.MALFORMED_OUTPUT,
      'Parsed JSON is not an object.'
    );
  }
  
  var validation = helpers.validateGuideFields(parsed);
  if (!validation.ok) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.INVALID_GUIDE_OUTPUT,
      'Guide schema validation failed: ' + validation.errors.join(', ')
    );
  }
  
  var sourceOk = helpers.assertSourcePreserved(parsed, sourceUrl);
  if (!sourceOk.ok) {
    return apiErrorHandler.createApiError(
      providerEnums.ERROR_CODES.INVALID_GUIDE_OUTPUT,
      'Source URL preservation check failed: ' + sourceOk.errors.join(', ')
    );
  }
  
  return {
    ok: true,
    guide: parsed
  };
}

module.exports = {
  parseDeepSeekResponse: parseDeepSeekResponse
};
