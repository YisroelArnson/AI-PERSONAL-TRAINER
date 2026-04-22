//
//  AI_Personal_Trainer_AppTests.swift
//  AI Personal Trainer AppTests
//
//  Created by ISWA on 8/21/25.
//

// Contains automated tests for the ai personal trainer app tests behavior.
//
// Main functions in this file:
// - testCoachRunStreamEventDecodesAssistantDeltaPayload: Verifies that Coach run stream event decodes assistant delta payload behaves as expected.
// - testCoachRunStreamEventDecodesToolNativeCompletionPayload: Verifies that Coach run stream event decodes tool native completion payload behaves as expected.
// - testCoachRunStreamEventDecodesTerminalAskPayload: Verifies that Coach run stream event decodes terminal ask payload behaves as expected.

import XCTest
@testable import AI_Personal_Trainer_App

final class AI_Personal_Trainer_AppTests: XCTestCase {
    /// Verifies that Coach run stream event decodes assistant delta payload behaves as expected.
    func testCoachRunStreamEventDecodesAssistantDeltaPayload() throws {
        let json = """
        {
          "runId": "run-123",
          "eventId": 17,
          "seqNum": 17,
          "createdAt": "2026-04-12T14:00:01.000Z",
          "type": "assistant.delta",
          "iteration": 2,
          "toolName": "message_notify_user",
          "toolUseId": "toolu_123",
          "delivery": "feed",
          "terminal": true,
          "text": "Working through"
        }
        """

        let event = try JSONDecoder().decode(CoachRunStreamEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.runId, "run-123")
        XCTAssertEqual(event.eventId, 17)
        XCTAssertEqual(event.type, "assistant.delta")
        XCTAssertEqual(event.iteration, 2)
        XCTAssertEqual(event.toolName, "message_notify_user")
        XCTAssertEqual(event.toolUseId, "toolu_123")
        XCTAssertEqual(event.delivery, "feed")
        XCTAssertEqual(event.terminal, true)
        XCTAssertEqual(event.text, "Working through")
    }

    /// Verifies that Coach run stream event decodes tool native completion payload behaves as expected.
    func testCoachRunStreamEventDecodesToolNativeCompletionPayload() throws {
        let json = """
        {
          "runId": "run-123",
          "eventId": 18,
          "seqNum": 18,
          "createdAt": "2026-04-12T14:00:03.000Z",
          "type": "tool.call.completed",
          "iteration": 2,
          "toolName": "message_notify_user",
          "toolUseId": "toolu_123",
          "delivery": "transient",
          "terminal": false,
          "resultStatus": "ok",
          "text": "Working through your plan now."
        }
        """

        let event = try JSONDecoder().decode(CoachRunStreamEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.runId, "run-123")
        XCTAssertEqual(event.eventId, 18)
        XCTAssertEqual(event.type, "tool.call.completed")
        XCTAssertEqual(event.iteration, 2)
        XCTAssertEqual(event.toolName, "message_notify_user")
        XCTAssertEqual(event.toolUseId, "toolu_123")
        XCTAssertEqual(event.delivery, "transient")
        XCTAssertEqual(event.terminal, false)
        XCTAssertEqual(event.resultStatus, "ok")
        XCTAssertEqual(event.text, "Working through your plan now.")
    }

    /// Verifies that Coach run stream event decodes terminal ask payload behaves as expected.
    func testCoachRunStreamEventDecodesTerminalAskPayload() throws {
        let json = """
        {
          "runId": "run-456",
          "eventId": 31,
          "seqNum": 31,
          "createdAt": "2026-04-12T14:05:00.000Z",
          "type": "tool.call.completed",
          "iteration": 3,
          "toolName": "message_ask_user",
          "toolUseId": "toolu_456",
          "delivery": "feed",
          "terminal": true,
          "resultStatus": "ok",
          "text": "Do you want the short version or the full workout?"
        }
        """

        let event = try JSONDecoder().decode(CoachRunStreamEvent.self, from: Data(json.utf8))

        XCTAssertEqual(event.type, "tool.call.completed")
        XCTAssertEqual(event.toolName, "message_ask_user")
        XCTAssertEqual(event.delivery, "feed")
        XCTAssertEqual(event.terminal, true)
        XCTAssertEqual(event.text, "Do you want the short version or the full workout?")
    }
}
