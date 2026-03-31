const { stableJsonStringify } = require('../../shared/json');

const KNOWN_PHASE_TAGS = [
  { tag: '<commentary>', kind: 'phase_start', phase: 'commentary' },
  { tag: '</commentary>', kind: 'phase_end', phase: 'commentary' },
  { tag: '<final>', kind: 'phase_start', phase: 'final' },
  { tag: '</final>', kind: 'phase_end', phase: 'final' },
  { tag: '<step>', kind: 'step_start', phase: 'commentary' },
  { tag: '</step>', kind: 'step_end', phase: 'commentary' }
];

const KNOWN_PHASE_TAG_STRINGS = KNOWN_PHASE_TAGS.map(entry => entry.tag);

function normalizeVisibleText(value) {
  return String(value || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function matchKnownPhaseTag(buffer, index) {
  return KNOWN_PHASE_TAGS.find(entry => buffer.startsWith(entry.tag, index)) || null;
}

function couldBePartialPhaseTag(buffer) {
  return KNOWN_PHASE_TAG_STRINGS.some(tag => tag.startsWith(buffer));
}

function createDisplayPhaseParser() {
  let buffer = '';
  let activePhase = null;
  let activePhaseSource = null;
  let currentPhaseText = '';
  let commentaryText = '';
  let finalText = '';
  let hasExplicitCommentary = false;
  let hasExplicitFinal = false;
  let hasExplicitPhase = false;

  function appendPhaseText(phase, text) {
    if (!text) {
      return [];
    }

    if (phase === 'commentary') {
      commentaryText += text;
    } else if (phase === 'final') {
      finalText += text;
    }

    currentPhaseText += text;

    return [
      {
        kind: 'delta',
        phase,
        text
      }
    ];
  }

  function completeActivePhase() {
    if (!activePhase) {
      return [];
    }

    const phase = activePhase;
    const source = activePhaseSource;
    const blockText = normalizeVisibleText(currentPhaseText);

    activePhase = null;
    activePhaseSource = null;
    currentPhaseText = '';

    if (!blockText && source !== 'implicit') {
      return [];
    }

    const completionText = blockText || normalizeVisibleText(
      phase === 'commentary' ? commentaryText : finalText
    );

    if (!completionText) {
      return [];
    }

    return [
      {
        kind: 'completed',
        phase,
        text: completionText
      }
    ];
  }

  function startPhase(phase, source) {
    const events = activePhase ? completeActivePhase() : [];

    activePhase = phase;
    activePhaseSource = source;
    currentPhaseText = '';

    if (source === 'explicit') {
      hasExplicitPhase = true;
      if (phase === 'commentary') {
        hasExplicitCommentary = true;
      } else if (phase === 'final') {
        hasExplicitFinal = true;
      }
    }

    return events;
  }

  function ensureImplicitFinalPhaseForText(text) {
    if (activePhase) {
      return [];
    }

    const normalizedIncomingText = normalizeVisibleText(text);

    if (hasExplicitPhase) {
      if (!hasExplicitFinal && normalizedIncomingText) {
        return startPhase('final', 'implicit');
      }

      return [];
    }

    if (!normalizedIncomingText && !normalizeVisibleText(finalText)) {
      return [];
    }

    return startPhase('final', 'implicit');
  }

  function emitVisibleText(text) {
    if (!text) {
      return [];
    }

    const events = ensureImplicitFinalPhaseForText(text);

    if (!activePhase) {
      return events;
    }

    return [
      ...events,
      ...appendPhaseText(activePhase, text)
    ];
  }

  function beginCommentaryStep() {
    if (activePhase !== 'commentary') {
      return [];
    }

    const visibleCommentaryText = currentPhaseText.length === 0 ? commentaryText : currentPhaseText;
    const prefix = visibleCommentaryText.length === 0
      ? '• '
      : visibleCommentaryText.endsWith('\n')
        ? '• '
        : '\n• ';

    return appendPhaseText('commentary', prefix);
  }

  function handlePhaseTag(matchedTag) {
    if (matchedTag.kind === 'phase_start') {
      return startPhase(matchedTag.phase, 'explicit');
    }

    if (matchedTag.kind === 'phase_end') {
      if (activePhase === matchedTag.phase) {
        return completeActivePhase();
      }

      return [];
    }

    if (matchedTag.kind === 'step_start') {
      return beginCommentaryStep();
    }

    return [];
  }

  function coalesceDeltaEvents(events) {
    return events.reduce((accumulator, event) => {
      const previous = accumulator[accumulator.length - 1];

      if (
        previous
        && previous.kind === 'delta'
        && event.kind === 'delta'
        && previous.phase === event.phase
      ) {
        previous.text += event.text;
        return accumulator;
      }

      accumulator.push({ ...event });
      return accumulator;
    }, []);
  }

  function processBuffer({ flush }) {
    const events = [];
    let index = 0;

    while (index < buffer.length) {
      const nextTagIndex = buffer.indexOf('<', index);

      if (nextTagIndex === -1) {
        events.push(...emitVisibleText(buffer.slice(index)));
        index = buffer.length;
        break;
      }

      if (nextTagIndex > index) {
        events.push(...emitVisibleText(buffer.slice(index, nextTagIndex)));
        index = nextTagIndex;
        continue;
      }

      const matchedTag = matchKnownPhaseTag(buffer, index);

      if (matchedTag) {
        events.push(...handlePhaseTag(matchedTag));
        index += matchedTag.tag.length;
        continue;
      }

      const tail = buffer.slice(index);
      if (!flush && couldBePartialPhaseTag(tail)) {
        break;
      }

      events.push(...emitVisibleText('<'));
      index += 1;
    }

    buffer = buffer.slice(index);
    return coalesceDeltaEvents(events);
  }

  return {
    consume(text) {
      buffer += String(text || '');
      return processBuffer({ flush: false });
    },
    flush() {
      const events = processBuffer({ flush: true });

      if (activePhase) {
        events.push(...completeActivePhase());
      }

      buffer = '';
      return coalesceDeltaEvents(events);
    },
    snapshot() {
      return {
        commentaryText: normalizeVisibleText(commentaryText),
        finalText: normalizeVisibleText(finalText),
        hasExplicitCommentary,
        hasExplicitFinal,
        hasExplicitPhase
      };
    }
  };
}

function extractDisplayText(rawText, options = {}) {
  const parser = createDisplayPhaseParser();

  parser.consume(rawText);
  parser.flush();

  const snapshot = parser.snapshot();
  let finalText = snapshot.finalText;

  if (!snapshot.hasExplicitFinal && options.preferCommentaryAsFinal && !finalText && snapshot.commentaryText) {
    finalText = snapshot.commentaryText;
  }

  return {
    commentaryText: snapshot.commentaryText,
    finalText,
    hasExplicitCommentary: snapshot.hasExplicitCommentary,
    hasExplicitFinal: snapshot.hasExplicitFinal,
    hasExplicitPhase: snapshot.hasExplicitPhase
  };
}

function blockToInternalContent(block) {
  if (!block) {
    return null;
  }

  if (block.type === 'text') {
    return {
      type: 'text',
      text: block.text
    };
  }

  if (block.type === 'tool_use') {
    return {
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input || {}
    };
  }

  return null;
}

function stringifyToolResultContent(result) {
  return typeof result === 'string' ? result : stableJsonStringify(result);
}

function buildToolResultMessage(toolCall, toolResult) {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        toolUseId: toolCall.id,
        content: stringifyToolResultContent(toolResult)
      }
    ]
  };
}

function normalizeAnthropicOutput(finalOutput) {
  const rawMessage = finalOutput.rawMessage || {};
  const content = Array.isArray(rawMessage.content) ? rawMessage.content : [];
  const assistantMessageContent = content
    .map(blockToInternalContent)
    .filter(Boolean);
  const toolCalls = assistantMessageContent.filter(block => block.type === 'tool_use');
  const textBlocks = assistantMessageContent.filter(block => block.type === 'text');
  const rawText = textBlocks.map(block => block.text).join('') || finalOutput.outputText || '';
  const extractedDisplayText = extractDisplayText(rawText, {
    preferCommentaryAsFinal: toolCalls.length === 0
  });
  const fallbackOutputText = extractedDisplayText.hasExplicitPhase && toolCalls.length > 0
    ? ''
    : normalizeVisibleText(rawText);
  const outputText = extractedDisplayText.finalText
    || (toolCalls.length === 0 ? extractedDisplayText.commentaryText : '')
    || fallbackOutputText;

  return {
    outputText,
    commentaryText: extractedDisplayText.commentaryText,
    finalText: extractedDisplayText.finalText || outputText,
    toolCalls,
    assistantMessage: {
      role: 'assistant',
      content: assistantMessageContent
    },
    stopReason: finalOutput.stopReason,
    usage: finalOutput.usage || {},
    rawText,
    rawMessage
  };
}

module.exports = {
  buildToolResultMessage,
  createDisplayPhaseParser,
  extractDisplayText,
  normalizeAnthropicOutput,
  normalizeVisibleText
};
