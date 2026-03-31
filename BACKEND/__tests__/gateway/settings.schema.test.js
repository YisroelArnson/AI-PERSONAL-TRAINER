const { parseUpdateLlmSettingsRequest } = require('../../src/gateway/schemas/settings.schema');

describe('parseUpdateLlmSettingsRequest', () => {
  it('accepts a nullable user default llm payload', () => {
    expect(parseUpdateLlmSettingsRequest({
      userDefaultLlm: null
    })).toEqual({
      userDefaultLlm: null
    });

    expect(parseUpdateLlmSettingsRequest({
      userDefaultLlm: {
        provider: 'xai',
        model: 'grok-4'
      }
    })).toEqual({
      userDefaultLlm: {
        provider: 'xai',
        model: 'grok-4'
      }
    });
  });

  it('rejects model-only payloads without a provider', () => {
    expect(() => parseUpdateLlmSettingsRequest({
      userDefaultLlm: {
        model: 'grok-4'
      }
    })).toThrow();
  });
});
