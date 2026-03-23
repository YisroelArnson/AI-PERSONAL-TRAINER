function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function formatField(path) {
  return path ? `Field "${path}"` : 'Tool input';
}

function makeIssue(path, code, message, meta = {}) {
  return {
    path,
    code,
    message,
    ...meta
  };
}

function validateString(value, schema, path) {
  if (typeof value !== 'string') {
    return makeIssue(path, 'invalid_type', `${formatField(path)} must be a string.`);
  }

  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    return makeIssue(
      path,
      'min_length',
      `${formatField(path)} must be at least ${schema.minLength} character${schema.minLength === 1 ? '' : 's'} long.`
    );
  }

  if (schema.pattern) {
    const pattern = new RegExp(schema.pattern);

    if (!pattern.test(value)) {
      return makeIssue(path, 'pattern', `${formatField(path)} must match pattern "${schema.pattern}".`);
    }
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return makeIssue(
      path,
      'enum',
      `${formatField(path)} must be one of: ${schema.enum.join(', ')}.`
    );
  }

  return null;
}

function validateInteger(value, schema, path) {
  if (!Number.isInteger(value)) {
    return makeIssue(path, 'invalid_type', `${formatField(path)} must be an integer.`);
  }

  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    return makeIssue(path, 'minimum', `${formatField(path)} must be greater than or equal to ${schema.minimum}.`);
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    return makeIssue(path, 'maximum', `${formatField(path)} must be less than or equal to ${schema.maximum}.`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return makeIssue(
      path,
      'enum',
      `${formatField(path)} must be one of: ${schema.enum.join(', ')}.`
    );
  }

  return null;
}

function validateArray(value, schema, path) {
  if (!Array.isArray(value)) {
    return makeIssue(path, 'invalid_type', `${formatField(path)} must be an array.`);
  }

  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    return makeIssue(path, 'min_items', `${formatField(path)} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}.`);
  }

  if (schema.uniqueItems) {
    const seen = new Set();

    for (const item of value) {
      const serialized = JSON.stringify(item);

      if (seen.has(serialized)) {
        return makeIssue(path, 'unique_items', `${formatField(path)} must not contain duplicate values.`);
      }

      seen.add(serialized);
    }
  }

  if (schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = path ? `${path}[${index}]` : `[${index}]`;
      const nestedIssue = validateValue(value[index], schema.items, nestedPath);

      if (nestedIssue) {
        return nestedIssue;
      }
    }
  }

  return null;
}

function validateObject(value, schema, path) {
  if (!isPlainObject(value)) {
    return makeIssue(path, 'invalid_type', `${formatField(path)} must be an object.`);
  }

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (!hasOwn(value, key) || typeof value[key] === 'undefined') {
      return makeIssue(key, 'required', `Missing required field "${key}".`, {
        field: key
      });
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!hasOwn(properties, key)) {
        return makeIssue(key, 'additional_properties', `Unexpected field "${key}".`, {
          field: key
        });
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!hasOwn(value, key) || typeof value[key] === 'undefined') {
      continue;
    }

    const nestedIssue = validateValue(value[key], propertySchema, key);

    if (nestedIssue) {
      return nestedIssue;
    }
  }

  return null;
}

function validateValue(value, schema, path = '') {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  if (schema.type === 'object') {
    return validateObject(value, schema, path);
  }

  if (schema.type === 'string') {
    return validateString(value, schema, path);
  }

  if (schema.type === 'integer') {
    return validateInteger(value, schema, path);
  }

  if (schema.type === 'array') {
    return validateArray(value, schema, path);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return makeIssue(path, 'enum', `${formatField(path)} must be one of: ${schema.enum.join(', ')}.`);
  }

  return null;
}

function validateToolInput(schema, input) {
  return validateValue(input, schema, '');
}

function buildToolValidationError(toolDefinition, issue) {
  return {
    status: 'validation_error',
    error: {
      code: 'INVALID_TOOL_INPUT',
      explanation: `Invalid input for ${toolDefinition.name}: ${issue.message}`,
      agent_guidance: 'Retry the same tool using the declared schema, including all required fields and valid field values.',
      suggested_fix: {
        field: issue.field || issue.path || null,
        required_fields: Array.isArray(toolDefinition.inputSchema && toolDefinition.inputSchema.required)
          ? toolDefinition.inputSchema.required
          : []
      },
      retryable_in_run: true
    }
  };
}

module.exports = {
  buildToolValidationError,
  validateToolInput
};
