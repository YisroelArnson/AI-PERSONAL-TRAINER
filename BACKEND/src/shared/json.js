function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableJsonStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const pairs = keys.map(key => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`);
  return `{${pairs.join(',')}}`;
}

module.exports = {
  stableJsonStringify
};
