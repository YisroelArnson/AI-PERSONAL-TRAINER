//
//  AI_Personal_Trainer_AppUITestsLaunchTests.swift
//  AI Personal Trainer AppUITests
//
//  Created by ISWA on 8/21/25.
//

// Contains automated tests for the ai personal trainer app ui tests launch tests behavior.
//
// Main functions in this file:
// - setUpWithError: Sets Up with error for later use.
// - testLaunch: Verifies that Launch behaves as expected.

import XCTest

final class AI_Personal_Trainer_AppUITestsLaunchTests: XCTestCase {

    override class var runsForEachTargetApplicationUIConfiguration: Bool {
        true
    }

    /// Sets Up with error for later use.
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Verifies that Launch behaves as expected.
    func testLaunch() throws {
        let app = XCUIApplication()
        app.launch()

        // Insert steps here to perform after app launch but before taking a screenshot,
        // such as logging into a test account or navigating somewhere in the app

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Launch Screen"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
