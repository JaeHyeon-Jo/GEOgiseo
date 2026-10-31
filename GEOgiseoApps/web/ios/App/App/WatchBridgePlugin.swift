import Foundation
import Capacitor

/**
 * 워치에서 받아 큐(UserDefaults)에 쌓인 음성 메모를 JS로 넘겨 저장하게 하는 브리지.
 *
 * 실제 수신은 WatchSessionManager(AppDelegate에서 활성화)가 담당하고, 이 플러그인은
 * 그 큐를 읽고(getPending) 저장이 끝난 항목을 지운다(ackPending). 앱이 떠 있는 동안
 * 새 메모가 도착하면 `watchNote` 이벤트로 JS에 알려 즉시 비우게 한다.
 */
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncPlaces", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        // 앱이 살아있는 동안 새 메모 도착을 JS로 전달
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(didReceiveWatchNote),
            name: WatchSessionManager.didReceiveNotification,
            object: nil
        )
    }

    @objc private func didReceiveWatchNote() {
        notifyListeners("watchNote", data: [:])
    }

    // MARK: - 큐 읽기/비우기

    @objc func getPending(_ call: CAPPluginCall) {
        call.resolve(["notes": WatchSessionManager.shared.pendingNotes()])
    }

    @objc func ackPending(_ call: CAPPluginCall) {
        let rawIds: [Any] = call.getArray("ids") ?? []
        let ids = Set(rawIds.compactMap { $0 as? String })
        guard !ids.isEmpty else { call.resolve(); return }

        WatchSessionManager.shared.ackPending(ids: ids)
        call.resolve()
    }

    // MARK: - 즐겨찾기 장소 → 워치

    @objc func syncPlaces(_ call: CAPPluginCall) {
        let rawPlaces: [Any] = call.getArray("places") ?? []
        // 워치로 보낼 수 있는 property list 값만 추린다.
        let places: [[String: Any]] = rawPlaces.compactMap { item in
            guard let dict = item as? [String: Any],
                  let id = dict["id"] as? String,
                  let name = dict["name"] as? String,
                  let lat = (dict["lat"] as? NSNumber)?.doubleValue,
                  let lng = (dict["lng"] as? NSNumber)?.doubleValue,
                  let radiusM = (dict["radiusM"] as? NSNumber)?.doubleValue else { return nil }
            var place: [String: Any] = ["id": id, "name": name, "lat": lat, "lng": lng, "radiusM": radiusM]
            if let emoji = dict["emoji"] as? String, !emoji.isEmpty { place["emoji"] = emoji }
            return place
        }
        WatchSessionManager.shared.updatePlaces(places)
        call.resolve()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }
}
