//
//  AddMemoIntent.swift
//  GeoWatch Watch App
//
//  Siri로 손 안 대고 기록: "거기서 메모" → Siri가 내용을 물어봄 → 말하면 저장.
//  앱 화면을 띄우지 않고 백그라운드에서 위치와 함께 저장한 뒤 폰으로 전송 큐에 넣는다.
//

import AppIntents
import CoreLocation
import MapKit
import WatchConnectivity

struct AddMemoIntent: AppIntent {
    static var title: LocalizedStringResource = "거기서 기록"
    static var description = IntentDescription("지금 있는 곳에서 음성 메모를 남깁니다.")

    @Parameter(title: "내용", requestValueDialog: "뭐라고 적을까요?")
    var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else {
            throw $text.needsValueError("뭐라고 적을까요?")
        }

        // perform()은 메인 액터가 아니므로 저장소 접근은 메인 액터로 넘긴다.
        await MainActor.run { WatchStore.shared.activate() }

        // 위치는 최대 몇 초만 기다린다. 못 구해도 메모는 저장.
        let location = await OneShotLocation.fetch(timeout: .seconds(4))
        let place = await OneShotLocation.placeName(for: location, timeout: .seconds(2))

        // 세션 활성화를 잠깐 기다려야 바로 전송 큐에 들어간다.
        // (못 기다려도 미전송 메모는 다음 활성화 때 자동 재전송됨)
        for _ in 0..<20 where WCSession.default.activationState != .activated {
            try? await Task.sleep(for: .milliseconds(100))
        }

        let (didAdd, favoriteName) = await MainActor.run {
            let store = WatchStore.shared
            return (store.addFromIntent(text: t, location: location, place: place),
                    store.favorite(at: location)?.name)
        }

        // 즐겨찾기 반경 안이면 "집에서", 아니면 동네 이름
        let where_ = (favoriteName ?? place).map { "\($0)에서 " } ?? ""
        return .result(dialog: didAdd ? "\(where_)기록했어요." : "이미 기록했어요.")
    }
}

struct GeoWatchShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddMemoIntent(),
            phrases: [
                "\(.applicationName) 메모",
                "\(.applicationName)에 메모",
                "\(.applicationName) 기록",
                "\(.applicationName) 적어",
                "\(.applicationName) 적어줘",
                "\(.applicationName)에 적어줘"
            ],
            shortTitle: "기록",
            systemImageName: "mic.fill"
        )
    }
}

// MARK: - 인텐트용 1회성 위치

/// 인텐트는 UI 없이 짧게 실행되므로, 제한 시간 안에서만 위치를 구한다.
enum OneShotLocation {
    static func fetch(timeout: Duration) async -> CLLocation? {
        let status = CLLocationManager().authorizationStatus
        guard status == .authorizedWhenInUse || status == .authorizedAlways else { return nil }

        return await withTaskGroup(of: CLLocation?.self) { group in
            group.addTask {
                do {
                    for try await update in CLLocationUpdate.liveUpdates() {
                        if let loc = update.location { return loc }
                    }
                } catch {}
                return nil
            }
            group.addTask {
                try? await Task.sleep(for: timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    static func placeName(for location: CLLocation?, timeout: Duration) async -> String? {
        guard let location else { return nil }
        return await withTaskGroup(of: String?.self) { group in
            group.addTask {
                guard let request = MKReverseGeocodingRequest(location: location),
                      let mapItem = try? await request.mapItems.first else { return nil }
                return mapItem.address?.shortAddress ?? mapItem.name
            }
            group.addTask {
                try? await Task.sleep(for: timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}
