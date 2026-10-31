//
//  GeoWatch_Watch_AppTests.swift
//  GeoWatch Watch AppTests
//
//  Created by Jae Hyeon on 8/2/26.
//

import Testing
import Foundation
@testable import GeoWatch_Watch_App

struct GeoWatch_Watch_AppTests {
    @Test func intentDeduplicatorRejectsImmediateReplay() throws {
        let suiteName = "IntentMemoDeduplicatorTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let deduplicator = IntentMemoDeduplicator(defaults: defaults, interval: 30, keyPrefix: "test")
        let now = Date(timeIntervalSince1970: 1_000)

        #expect(deduplicator.shouldAdd(text: "같은 메모", now: now))
        #expect(!deduplicator.shouldAdd(text: "같은 메모", now: now.addingTimeInterval(5)))
    }

    @Test func intentDeduplicatorAllowsDifferentTextAndExpiredReplay() throws {
        let suiteName = "IntentMemoDeduplicatorTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suiteName))
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let deduplicator = IntentMemoDeduplicator(defaults: defaults, interval: 30, keyPrefix: "test")
        let now = Date(timeIntervalSince1970: 1_000)

        #expect(deduplicator.shouldAdd(text: "첫 메모", now: now))
        #expect(deduplicator.shouldAdd(text: "다른 메모", now: now.addingTimeInterval(5)))
        #expect(deduplicator.shouldAdd(text: "첫 메모", now: now.addingTimeInterval(40)))
    }

    @Test func memoDateUsesMilliseconds() {
        #expect(memoDate(1_500).timeIntervalSince1970 == 1.5)
    }

    @Test func memoWithoutAccuracyStillDecodes() throws {
        let data = Data(#"{"id":"memo-1","text":"기존 메모","ts":1500,"lat":37.5,"lng":127.0,"place":"서울","synced":false}"#.utf8)

        let memo = try JSONDecoder().decode(Memo.self, from: data)

        #expect(memo.accuracy == nil)
    }
}
