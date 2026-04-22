/**
 * File overview:
 * Contains automated tests for the coach surface schema behavior.
 *
 * This file is primarily composed of types, constants, or configuration rather than standalone functions.
 */

const { parseCoachSurfaceResponse } = require('../../src/gateway/schemas/coach-surface.schema');

describe('parseCoachSurfaceResponse', () => {
  it('accepts the current chat-first coach surface payload', () => {
    const parsed = parseCoachSurfaceResponse({
      generatedAt: '2026-03-23T12:00:00.000Z',
      sessionKey: 'user:123:main',
      sessionId: 'session-123',
      header: {
        title: 'Coach',
        subtitle: 'One calm surface for training, planning, and check-ins'
      },
      activeRun: null,
      workout: null,
      pinnedCard: null,
      feed: [
        {
          id: 'event-1',
          kind: 'message',
          role: 'assistant',
          text: 'Ready when you are.',
          eventType: 'assistant.notify',
          runId: null,
          seqNum: 1,
          occurredAt: '2026-03-23T12:00:00.000Z'
        }
      ],
      composer: {
        placeholder: 'Message your coach',
        supportsText: true,
        supportsVoice: true
      },
      quickActions: [
        {
          id: 'start_workout',
          label: 'Start workout',
          icon: 'figure.strengthtraining.traditional',
          triggerType: 'ui.action.start_workout',
          message: 'Start my workout.'
        }
      ]
    });

    expect(parsed.feed[0].kind).toBe('message');
    expect(parsed.workout).toBeNull();
  });

  it('accepts a workout-driven surface with a pinned workout card', () => {
    const parsed = parseCoachSurfaceResponse({
      generatedAt: '2026-03-23T12:10:00.000Z',
      sessionKey: 'user:123:main',
      sessionId: 'session-123',
      header: {
        title: 'Coach',
        subtitle: 'Current workout is live'
      },
      activeRun: {
        runId: 'run-123',
        status: 'running',
        triggerType: 'user.message',
        createdAt: '2026-03-23T12:09:00.000Z',
        startedAt: '2026-03-23T12:09:01.000Z',
        finishedAt: null,
        provider: 'anthropic',
        model: 'claude'
      },
      workout: {
        workoutSessionId: 'workout-1',
        sessionKey: 'user:123:main',
        stateVersion: 2,
        status: 'in_progress',
        currentPhase: 'exercise',
        title: 'Lower Body Strength',
        guidance: {},
        summary: {},
        currentExerciseIndex: 0,
        currentSetIndex: 1,
        startedAt: '2026-03-23T12:00:00.000Z',
        completedAt: null,
        currentExerciseId: 'exercise-instance-1',
        progress: {
          completedExercises: 0,
          totalExercises: 3,
          completedSets: 1,
          totalSets: 9,
          remainingExercises: 3
        },
        exercises: []
      },
      pinnedCard: {
        feedItemId: 'feed-2',
        reason: 'active_workout',
        placement: 'above_composer'
      },
      feed: [
        {
          id: 'feed-1',
          kind: 'message',
          role: 'assistant',
          text: 'Let’s get moving.',
          eventType: 'assistant.notify',
          runId: 'run-123',
          seqNum: 2,
          occurredAt: '2026-03-23T12:09:30.000Z'
        },
        {
          id: 'feed-2',
          kind: 'card',
          role: 'assistant',
          text: 'Start with your first squat set.',
          eventType: 'workout.card.current',
          runId: 'run-123',
          seqNum: 3,
          occurredAt: '2026-03-23T12:09:40.000Z',
          card: {
            type: 'workout_current',
            workoutSessionId: 'workout-1',
            title: 'Lower Body Strength',
            subtitle: 'Exercise 1 of 3',
            phase: 'exercise',
            progressLabel: '1 of 9 sets done',
            currentExerciseName: 'Back Squat',
            currentSetLabel: 'Set 2 of 3',
            coachCue: 'Brace before you descend.',
            metrics: [
              {
                id: 'target-load',
                label: 'Load',
                value: '135 lb',
                tone: 'neutral'
              }
            ],
            actions: [
              {
                id: 'complete_set',
                label: 'Complete set',
                icon: 'checkmark',
                actionType: 'complete_current_set',
                semanticAction: 'workout_complete_set',
                triggerType: 'ui.action.complete_set',
                message: null,
                style: 'primary',
                metadata: {
                  source: 'pinned_workout_card'
                }
              }
            ]
          }
        }
      ],
      composer: {
        placeholder: 'Tell your coach what happened',
        supportsText: true,
        supportsVoice: true
      },
      quickActions: []
    });

    expect(parsed.pinnedCard.feedItemId).toBe('feed-2');
    expect(parsed.feed[1].card.type).toBe('workout_current');
    expect(parsed.feed[1].card.actions[0].actionType).toBe('complete_current_set');
  });
});
