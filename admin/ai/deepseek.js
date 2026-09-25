// Samjho Admin - DeepSeek AI Provider (MICRO 13).
// Server-side ONLY. Never ships API key to browser/client.
//
// FLOW: RAW + categorized metadata -> DeepSeek -> Guide-schema draft.
// Guard rules:
//  - Only restructure information present in RAW/source.
//  - Missing facts/dates/amounts/eligibility/benefits/docs/procedures/URLs
//    -> "Not specified in the official source."
//  - Status always "draft". Never publish/approve/bypass verification.
//
// Provider contract: provide(raw, options) -> Promise<{ ok, guide?, error? }>
// Options may include: model, timeoutMs, headers (env-only on server).
//
// This is the secure server-side entry point. The browser bundle deliberately
// never includes this module — see admin/ai/provider.js for the provider
// interface boundary and SamjhoAIPipelineProviders.

'use strict';

var providerEnums = require('./deepseek/provider-enums.js');
var apiRequest = require('./deepseek/api-request.js');
var apiErrorHandler = require('./deepseek/api-error-handler.js');
var payloadBuilder = require('./deepseek/payload-builder.js');
var responseParser = require('./deepseek/response-parser.js');
var helpers = require('./deepseek/helpers.js');

function isEnabled() {
  return providerEnums.isEnabled();
}

function getApiKey() {
  return providerEnums.getApiKey();
}

function getModel(options) {
  return providerEnums.getModel(options);
}

function provide(raw, options) {
  options = options || {};

  if (!isEnabled()) {
    return Promise.resolve(
      apiErrorHandler.createApiError(
        providerEnums.ERROR_CODES.PROVIDER_DISABLED,
        'DeepSeek provider is not configured. Set DEEPSEEK_API_KEY on the server (Firebase config/secrets or env). RAW unchanged; nothing created.'
      )
    );
  }

  var apiKey = getApiKey();
  if (!apiKey || apiKey.trim() === '') {
    return Promise.resolve(
      apiErrorHandler.createApiError(
        providerEnums.ERROR_CODES.MISSING_API_KEY,
        'DeepSeek API key is not configured. RAW unchanged; nothing created.'
      )
    );
  }

  var model = getModel(options);
  var timeoutMs = options.timeoutMs || 30000;

  var categorization = raw && raw.categorization ? raw.categorization : null;
  var payload = payloadBuilder.buildDeepSeekPayload(raw, categorization, model);

  return apiRequest.makeApiRequest(payload, apiKey, timeoutMs, {
    fetchImpl: options.fetchImpl,
    baseUrl: options.baseUrl
  })
    .then(function (responseData) {
      return responseParser.parseDeepSeekResponse(responseData, raw.source_url);
    })
    .then(function (result) {
      if (!result.ok) {
        return result;
      }

      var guide = result.guide;
      guide.status = 'draft';
      guide.last_updated = helpers.today();
      guide.source_ids = [raw.source_url];

      var h = helpers;
      var wordSet = h.buildWordSet(raw.raw_content);

      var fieldsToCheck = ['summary', 'content'];
      for (var i = 0; i < fieldsToCheck.length; i++) {
        var field = fieldsToCheck[i];
        var value = h.text(guide[field] || '');
        if (value && value.trim() !== '') {
          if (!h.isGroundedText(wordSet, value)) {
            guide[field] = providerEnums.NOT_SPECIFIED;
          }
        }
      }

      var listFields = ['eligibility', 'benefits', 'required_documents', 'application_process', 'important_dates', 'common_mistakes'];
      for (var j = 0; j < listFields.length; j++) {
        var listField = listFields[j];
        var listValue = guide[listField];
        if (Array.isArray(listValue)) {
          var filtered = listValue.filter(function (item) {
            if (!item || !h.text(item).trim()) return false;
            return h.isGroundedText(wordSet, h.text(item));
          });
          guide[listField] = filtered.length > 0 ? filtered : [providerEnums.NOT_SPECIFIED];
        }
      }

      if (Array.isArray(guide.faqs)) {
        var validFaqs = [];
        for (var k = 0; k < guide.faqs.length; k++) {
          var faq = guide.faqs[k];
          if (!faq || typeof faq !== 'object') continue;
          var qText = h.text(faq.q || '');
          var aText = h.text(faq.a || '');
          if (qText.trim() && aText.trim() && h.isGroundedText(wordSet, qText) && h.isGroundedText(wordSet, aText)) {
            validFaqs.push({ q: qText, a: aText });
          }
        }
        guide.faqs = validFaqs.length > 0 ? validFaqs : [];
      }

      return {
        ok: true,
        guide: guide,
        model: model,
        provider: 'deepseek'
      };
    })
    .catch(function (err) {
      return apiErrorHandler.categorizeApiError(err);
    });
}

module.exports = {
  provide: provide,
  isEnabled: isEnabled,
  getApiKey: getApiKey,
  getModel: getModel,
  buildDeepSeekPayload: payloadBuilder.buildDeepSeekPayload,
  ERROR_CODES: providerEnums.ERROR_CODES,
  NOT_SPECIFIED: providerEnums.NOT_SPECIFIED
};