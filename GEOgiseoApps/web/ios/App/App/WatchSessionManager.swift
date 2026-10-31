import Foundation
import WatchConnectivity

/**
 * 애플워치에서 보낸 음성 메모를 받아 로컬 큐(UserDefaults)에 쌓아둔다.
 *
 * 워치는 `WCSession.transferUserInfo`로 보내므로 폰 앱이 꺼져 있어도 iOS가 앱을
 * 백그라운드로 깨워 전달한다. 그 시점엔 Capacitor 웹뷰/JS가 아직 안 떠 있을 수 있어,
 * 수신·저장은 웹뷰와 무관하게 항상 실행되는 AppDelegate에서 이 싱글턴을 활성화해 처리한다.
 * 실제 노트 파일 저장은 폰 앱(JS)이 열릴 때 큐를 비우며 이뤄진다. (누락 방지 우선)
 */
final class WatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = WatchSessionManager()

    /// 큐를 담는 UserDefaults 키. WatchBridgePlugin과 공유한다.
    static let queueKey = "watchPendingNotes"
    /// 새 항목 도착 시 앱 내부에 알리는 노티피케이션 이름.
    static let didReceiveNotification = Notification.Name("WatchDidReceiveNote")

    private let pendingQueue = DispatchQueue(label: "app.geogiseo.watchPendingNotes")

    /// AppDelegate에서 한 번 호출해 세션을 켠다.
    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        print("[PhoneWatch] activating state=\(session.activationState.rawValue) paired=\(session.isPaired) watchInstalled=\(session.isWatchAppInstalled)")
        session.activate()
    }

    // MARK: - 즐겨찾기 장소 → 워치

    /// 마지막으로 받은 장소 목록. 세션 활성화 전에 들어오면 활성화 직후 보낸다.
    private var latestPlaces: [[String: Any]]?

    /// 즐겨찾기 장소를 applicationContext로 보낸다. 항상 최신 상태 하나만 유지되고,
    /// 워치 앱이 꺼져 있어도 다음 실행 때 받는다.
    func updatePlaces(_ places: [[String: Any]]) {
        pendingQueue.sync { latestPlaces = places }
        pushPlacesIfPossible()
    }

    private func pushPlacesIfPossible() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        guard session.activationState == .activated, session.isPaired, session.isWatchAppInstalled,
              let places = pendingQueue.sync(execute: { latestPlaces }) else { return }
        do {
            try session.updateApplicationContext(["places": places])
            print("[PhoneWatch] places synced count=\(places.count)")
        } catch {
            print("[PhoneWatch] places sync failed error=\(error)")
        }
    }

    // MARK: - 큐 적재

    func pendingNotes() -> [[String: Any]] {
        pendingQueue.sync {
            UserDefaults.standard.array(forKey: Self.queueKey) as? [[String: Any]] ?? []
        }
    }

    func ackPending(ids: Set<String>) {
        guard !ids.isEmpty else { return }

        pendingQueue.sync {
            let defaults = UserDefaults.standard
            var queue = defaults.array(forKey: Self.queueKey) as? [[String: Any]] ?? []
            queue.removeAll { item in
                guard let id = item["id"] as? String else { return false }
                return ids.contains(id)
            }
            defaults.set(queue, forKey: Self.queueKey)
        }
    }

    private func enqueue(_ payload: [String: Any]) {
        guard let text = payload["text"] as? String,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }

        var didInsert = false
        pendingQueue.sync {
            let defaults = UserDefaults.standard
            var queue = defaults.array(forKey: Self.queueKey) as? [[String: Any]] ?? []

            var item = payload
            // 중복/누락 없는 ack를 위해 고유 id 부여 (워치가 안 넣었으면 생성)
            if item["id"] == nil { item["id"] = UUID().uuidString }
            // 도착 시각 보정 — 워치가 ts를 안 넣었으면 현재 시각(ms)
            if item["ts"] == nil { item["ts"] = Date().timeIntervalSince1970 * 1000 }

            if let id = item["id"] as? String,
               queue.contains(where: { $0["id"] as? String == id }) {
                return
            }

            queue.append(item)
            defaults.set(queue, forKey: Self.queueKey)
            didInsert = true
        }

        guard didInsert else { return }
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: Self.didReceiveNotification, object: nil)
        }
    }

    // MARK: - WCSessionDelegate

    // 큐 전송(앱이 꺼져 있어도 보장 전달) — 주 경로
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        print("[PhoneWatch] received userInfo id=\(userInfo["id"] as? String ?? "missing")")
        enqueue(userInfo)
    }

    // 앱이 살아있을 때의 즉시 메시지 — 보조 경로
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        print("[PhoneWatch] received message id=\(message["id"] as? String ?? "missing")")
        enqueue(message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any],
                 replyHandler: @escaping ([String: Any]) -> Void) {
        print("[PhoneWatch] received message with reply id=\(message["id"] as? String ?? "missing")")
        enqueue(message)
        replyHandler(["ok": true])
    }

    // 필수 스텁
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        print("[PhoneWatch] activation state=\(activationState.rawValue) error=\(String(describing: error)) paired=\(session.isPaired) watchInstalled=\(session.isWatchAppInstalled) reachable=\(session.isReachable)")
        pushPlacesIfPossible()
    }

    // 워치 앱이 새로 설치되는 등 상태가 바뀌면 장소 목록을 다시 보낸다.
    func sessionWatchStateDidChange(_ session: WCSession) {
        pushPlacesIfPossible()
    }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
