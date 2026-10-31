//
//  ContentView.swift
//  GeoWatch Watch App
//
//  페이지 1: 버튼을 누르면 시스템 받아쓰기로 음성을 텍스트로 받아 위치와 함께 폰으로 전송.
//  페이지 2: 내가 기록한 메모 리스트 — 탭하면 내용, 전송 전이면 삭제(전송 취소) 가능.
//  (watchOS는 Speech 프레임워크 미지원 → 시스템 받아쓰기 TextFieldLink 사용)
//

import SwiftUI
import Combine
import CoreLocation
import MapKit
import WatchConnectivity

// MARK: - 모델

/// 워치에서 기록한 메모 한 건. 로컬(UserDefaults)에 보관한다.
struct Memo: Identifiable, Codable {
    let id: String
    let text: String
    /// epoch milliseconds
    let ts: Double
    let lat: Double?
    let lng: Double?
    /// 기록 당시 위치 정확도(m). 재전송 때도 동일한 위치 정보를 보낸다.
    let accuracy: Double?
    /// 기록 당시 동네 이름(있으면).
    var place: String?
    /// 폰으로 전송 완료됐는지.
    var synced: Bool = false
}

/// 폰에서 받은 즐겨찾기 장소. 폰과 같은 기준으로 메모를 장소별로 묶는 데 쓴다.
struct FavoritePlace: Identifiable, Codable, Equatable {
    let id: String
    let name: String
    let emoji: String?
    let lat: Double
    let lng: Double
    let radiusM: Double

    /// 목록/화면 표시용 이름 (이모지가 있으면 앞에 붙인다).
    var label: String {
        if let emoji, !emoji.isEmpty { return "\(emoji) \(name)" }
        return name
    }

    init?(_ dict: [String: Any]) {
        guard let id = dict["id"] as? String,
              let name = dict["name"] as? String,
              let lat = (dict["lat"] as? NSNumber)?.doubleValue,
              let lng = (dict["lng"] as? NSNumber)?.doubleValue,
              let radiusM = (dict["radiusM"] as? NSNumber)?.doubleValue else { return nil }
        self.id = id
        self.name = name
        self.emoji = dict["emoji"] as? String
        self.lat = lat
        self.lng = lng
        self.radiusM = radiusM
    }

    func contains(lat: Double, lng: Double) -> Bool {
        CLLocation(latitude: self.lat, longitude: self.lng)
            .distance(from: CLLocation(latitude: lat, longitude: lng)) <= radiusM
    }
}

/// 리스트의 장소 그룹 하나.
struct MemoGroup: Identifiable {
    let id: String
    let title: String
    let memos: [Memo]
}

struct IntentMemoDeduplicator {
    private let defaults: UserDefaults
    private let interval: TimeInterval
    private let textKey: String
    private let dateKey: String

    init(
        defaults: UserDefaults = .standard,
        interval: TimeInterval = 30,
        keyPrefix: String = "watchRecentIntent"
    ) {
        self.defaults = defaults
        self.interval = interval
        textKey = "\(keyPrefix)Text"
        dateKey = "\(keyPrefix)Date"
    }

    func shouldAdd(text: String, now: Date = Date()) -> Bool {
        let previousText = defaults.string(forKey: textKey)
        let previousDate = defaults.object(forKey: dateKey) as? Date
        if previousText == text,
           let previousDate,
           now.timeIntervalSince(previousDate) < interval {
            return false
        }

        defaults.set(text, forKey: textKey)
        defaults.set(now, forKey: dateKey)
        return true
    }
}

// MARK: - 메모 저장소 + 폰 전송

@MainActor
final class WatchStore: NSObject, ObservableObject, WCSessionDelegate {
    static let shared = WatchStore()

    @Published var memos: [Memo] = []
    /// 폰의 즐겨찾기 장소 (applicationContext로 받아 보관).
    @Published private(set) var places: [FavoritePlace] = []

    private let key = "watchMemos"
    private let placesKey = "watchFavoritePlaces"
    private let intentDeduplicator = IntentMemoDeduplicator()
    /// 진행 중인 전송 — 삭제 시 취소하려고 id로 붙잡아 둔다. (영속화 안 함)
    private var transfers: [String: WCSessionUserInfoTransfer] = [:]

    override init() {
        super.init()
        load()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        print("[WatchTransfer] activate state=\(s.activationState.rawValue) companionInstalled=\(s.isCompanionAppInstalled) reachable=\(s.isReachable) outstanding=\(s.outstandingUserInfoTransfers.count)")
        // 이미 활성화돼 있으면 activationDidComplete 가 다시 오지 않으므로 바로 재전송을 시도한다.
        if s.activationState == .activated {
            applyPlaces(from: s.receivedApplicationContext)
            retryUnsynced(outstanding: s.outstandingUserInfoTransfers)
            return
        }
        s.activate()
    }

    /// 전송 대기 메모 중 진행 중인 전송이 없는 것을 다시 큐에 넣는다.
    /// (전송이 오류로 끝났거나, 세션 비활성 상태에서 기록된 메모 복구용)
    private func retryUnsynced(outstanding: [WCSessionUserInfoTransfer]) {
        var outstandingIDs = Set<String>()
        for t in outstanding {
            if let id = t.userInfo["id"] as? String {
                outstandingIDs.insert(id)
                transfers[id] = t
            }
        }
        for memo in memos where !memo.synced && !outstandingIDs.contains(memo.id) {
            queueTransfer(memo)
        }
    }

    // MARK: 기록/전송

    /// 새 메모를 만들고 폰으로 전송(큐잉, 폰이 꺼져 있어도 전달 보장).
    func add(text: String, location: CLLocation?, place: String?) {
        let id = UUID().uuidString
        let ts = Date().timeIntervalSince1970 * 1000
        let memo = Memo(id: id, text: text, ts: ts,
                        lat: location?.coordinate.latitude,
                        lng: location?.coordinate.longitude,
                        accuracy: location?.horizontalAccuracy,
                        place: place)
        memos.insert(memo, at: 0)
        persist()

        queueTransfer(memo)
    }

    /// App Intent는 한 번의 논리적 실행에서도 다시 호출될 수 있어 짧은 시간 내 같은 내용을 중복 저장하지 않는다.
    @discardableResult
    func addFromIntent(text: String, location: CLLocation?, place: String?) -> Bool {
        let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard intentDeduplicator.shouldAdd(text: normalizedText) else {
            return false
        }

        add(text: normalizedText, location: location, place: place)
        return true
    }

    private func queueTransfer(_ memo: Memo) {
        let session = WCSession.default
        print("[WatchTransfer] queue id=\(memo.id) state=\(session.activationState.rawValue) companionInstalled=\(session.isCompanionAppInstalled) reachable=\(session.isReachable)")
        guard session.activationState == .activated else { return }

        let info = transferInfo(for: memo)
        if session.isReachable {
            sendImmediately(memo, info: info, enqueueOnFailure: true)
        } else {
            enqueueBackgroundTransfer(info, id: memo.id)
        }
    }

    private func transferInfo(for memo: Memo) -> [String: Any] {
        var info: [String: Any] = ["id": memo.id, "text": memo.text, "ts": memo.ts]
        if let lat = memo.lat, let lng = memo.lng {
            info["lat"] = lat
            info["lng"] = lng
        }
        if let accuracy = memo.accuracy { info["accuracy"] = accuracy }
        if let place = memo.place { info["place"] = place }
        return info
    }

    private func sendImmediately(_ memo: Memo, info: [String: Any], enqueueOnFailure: Bool) {
        WCSession.default.sendMessage(info) { [weak self] reply in
            guard reply["ok"] as? Bool == true else {
                if enqueueOnFailure {
                    Task { @MainActor in self?.enqueueBackgroundTransfer(info, id: memo.id) }
                }
                return
            }
            Task { @MainActor in
                self?.cancelTransfer(memo.id)
                self?.markSynced(memo.id)
            }
        } errorHandler: { [weak self] error in
            print("[WatchTransfer] immediate failed id=\(memo.id) error=\(error)")
            if enqueueOnFailure {
                Task { @MainActor in self?.enqueueBackgroundTransfer(info, id: memo.id) }
            }
        }
    }

    private func enqueueBackgroundTransfer(_ info: [String: Any], id: String) {
        guard transfers[id] == nil else { return }
        print("[WatchTransfer] background enqueue id=\(id)")
        transfers[id] = WCSession.default.transferUserInfo(info)
    }

    // MARK: 삭제

    func deleteById(_ id: String) {
        cancelTransfer(id)
        memos.removeAll { $0.id == id }
        persist()
    }

    private func cancelTransfer(_ id: String) {
        // 재실행 직후 transfers 딕셔너리가 복구되기 전이어도 시스템 큐에서 찾아 취소한다.
        if WCSession.isSupported() {
            for transfer in WCSession.default.outstandingUserInfoTransfers
            where transfer.userInfo["id"] as? String == id {
                transfer.cancel()
            }
        }
        transfers[id]?.cancel()   // 아직 전달 전이면 전송 취소 (전달됐으면 무해)
        transfers[id] = nil
    }

    // MARK: 영속화

    private func load() {
        if let data = UserDefaults.standard.data(forKey: placesKey),
           let saved = try? JSONDecoder().decode([FavoritePlace].self, from: data) {
            places = saved
        }
        guard let data = UserDefaults.standard.data(forKey: key),
              let saved = try? JSONDecoder().decode([Memo].self, from: data) else { return }
        memos = saved
    }

    // MARK: 즐겨찾기 장소

    /// 폰과 같은 규칙: 목록 순서상 반경 안에 드는 첫 번째 장소.
    func favorite(lat: Double?, lng: Double?) -> FavoritePlace? {
        guard let lat, let lng else { return nil }
        return places.first { $0.contains(lat: lat, lng: lng) }
    }

    func favorite(at location: CLLocation?) -> FavoritePlace? {
        favorite(lat: location?.coordinate.latitude, lng: location?.coordinate.longitude)
    }

    /// 메모를 장소별로 묶는다. 즐겨찾기 밖은 "기타"로 모으고, 그룹은 최근 메모 순.
    var groups: [MemoGroup] {
        var order: [String] = []
        var titles: [String: String] = [:]
        var buckets: [String: [Memo]] = [:]
        for memo in memos.sorted(by: { $0.ts > $1.ts }) {
            let fav = favorite(lat: memo.lat, lng: memo.lng)
            let key = fav?.id ?? "_other"
            if buckets[key] == nil {
                order.append(key)
                titles[key] = fav?.label ?? "기타"
            }
            buckets[key, default: []].append(memo)
        }
        return order.map { MemoGroup(id: $0, title: titles[$0] ?? "기타", memos: buckets[$0] ?? []) }
    }

    private func applyPlaces(from context: [String: Any]) {
        guard let raw = context["places"] as? [[String: Any]] else { return }
        let received = raw.compactMap(FavoritePlace.init)
        guard received != places else { return }
        places = received
        if let data = try? JSONEncoder().encode(received) {
            UserDefaults.standard.set(data, forKey: placesKey)
        }
        print("[WatchTransfer] places updated count=\(received.count)")
    }

    /// 전송 완료된 메모는 최근 것만 남긴다. (원본은 폰에 있으므로 워치는 최근 확인용)
    private let keepSyncedCount = 30

    private func persist() {
        trimSynced()
        if let data = try? JSONEncoder().encode(memos) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    /// 전송 대기 메모는 절대 지우지 않고, 전송 완료 메모만 최신순으로 keepSyncedCount개까지 유지.
    private func trimSynced() {
        var syncedSeen = 0
        let trimmed = memos
            .sorted { $0.ts > $1.ts }
            .filter { memo in
                guard memo.synced else { return true }
                syncedSeen += 1
                return syncedSeen <= keepSyncedCount
            }
        if trimmed.count != memos.count { memos = trimmed }
    }

    private func markSynced(_ id: String) {
        guard let i = memos.firstIndex(where: { $0.id == id }) else { return }
        memos[i].synced = true
        transfers[id] = nil
        persist()
    }

    // MARK: WCSessionDelegate

    // 전송이 폰에 전달 완료되면 호출 — 전송됨 표시.
    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        guard let id = userInfoTransfer.userInfo["id"] as? String else { return }
        Task { @MainActor in
            print("[WatchTransfer] didFinish id=\(id) error=\(String(describing: error))")
            if error == nil {
                self.markSynced(id)
            } else {
                // 실패한 전송은 붙잡지 않는다 → 다음 activate() 때 retryUnsynced 가 다시 보낸다.
                self.transfers[id] = nil
            }
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        print("[WatchTransfer] reachability changed reachable=\(session.isReachable)")
        guard session.isReachable else { return }
        Task { @MainActor in
            for memo in self.memos where !memo.synced {
                self.sendImmediately(memo, info: self.transferInfo(for: memo), enqueueOnFailure: false)
            }
        }
    }

    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        print("[WatchTransfer] activation state=\(activationState.rawValue) error=\(String(describing: error)) companionInstalled=\(session.isCompanionAppInstalled) reachable=\(session.isReachable)")
        guard activationState == .activated, error == nil else { return }
        // 재실행 시 진행 중이던 전송을 id로 다시 매핑하고 빠진 것은 재전송
        let outstanding = session.outstandingUserInfoTransfers
        // 앱이 꺼져 있는 동안 폰이 보낸 최신 장소 목록
        let context = session.receivedApplicationContext
        Task { @MainActor in
            self.applyPlaces(from: context)
            self.retryUnsynced(outstanding: outstanding)
        }
    }

    // 폰에서 즐겨찾기 장소가 바뀌면 호출
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.applyPlaces(from: applicationContext) }
    }
}

// MARK: - 위치

@MainActor
final class WatchLocation: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var last: CLLocation?
    @Published var placeText: String = "위치 확보 중…"
    /// "📍 " 접두어를 뗀 순수 동네 이름. 아직 못 구했으면 nil.
    var placeName: String? {
        placeText.hasPrefix("📍 ") ? String(placeText.dropFirst(2)) : nil
    }
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func requestOnce() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            placeText = "위치 권한 없음"
        default:
            break
        }
    }

    private func reverseGeocode(_ loc: CLLocation) {
        Task { [weak self] in
            guard let request = MKReverseGeocodingRequest(location: loc),
                  let mapItem = try? await request.mapItems.first else { return }
            let name = mapItem.address?.shortAddress ?? mapItem.name ?? "위치 확보됨"
            self?.placeText = "📍 " + name
        }
    }

    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in
            self.last = loc
            self.reverseGeocode(loc)
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in if self.last == nil { self.placeText = "위치를 못 찾음" } }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        switch status {
        case .authorizedWhenInUse, .authorizedAlways:
            Task { @MainActor in m.requestLocation() }
        case .denied, .restricted:
            Task { @MainActor in self.placeText = "위치 권한 없음" }
        default:
            break
        }
    }
}

// 메모 시각을 "HH:mm" 로.
func memoDate(_ ts: Double) -> Date {
    Date(timeIntervalSince1970: ts / 1000)
}

// MARK: - 기록 화면

struct RecordView: View {
    @ObservedObject var location: WatchLocation
    @ObservedObject var store: WatchStore
    @State private var justSent = false

    /// 즐겨찾기 반경 안이면 그 이름, 아니면 동네 이름.
    private var placeLine: String {
        if let fav = store.favorite(at: location.last) { return "📍 " + fav.label }
        return location.placeText
    }

    var body: some View {
        VStack(spacing: 8) {
            if justSent {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40)).foregroundStyle(.green)
                Text("기록됨").font(.headline)
            } else {
                TextFieldLink(prompt: Text("음성으로 메모")) {
                    ZStack {
                        Circle().fill(Color.blue)
                        Image(systemName: "mic.fill")
                            .font(.system(size: 30)).foregroundStyle(.white)
                    }
                    .frame(width: 92, height: 92)
                } onSubmit: { text in
                    submit(text)
                }
                .buttonStyle(.plain)
                // 손가락 더블 탭(엄지·검지 두 번)으로 마이크 버튼을 누른 것처럼 받아쓰기 시작.
                .handGestureShortcut(.primaryAction)

                Text("탭 또는 더블 탭 제스처로 기록").font(.caption).foregroundStyle(.secondary)

                Text(placeLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
        }
        .padding()
    }

    private func submit(_ text: String) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        WatchStore.shared.add(text: t, location: location.last, place: location.placeName)
        withAnimation { justSent = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            withAnimation { justSent = false }
        }
    }
}

// MARK: - 메모 리스트 / 상세

/// 전송 상태 표시. 적녹 색맹에서도 구분되도록 색(파랑/노랑) + 모양(✓/시계)을 함께 쓴다.
struct SyncBadge: View {
    let synced: Bool

    static let syncedColor = Color.blue
    static let pendingColor = Color.yellow

    var body: some View {
        Image(systemName: synced ? "checkmark.circle.fill" : "clock.fill")
            .font(.caption2)
            .foregroundStyle(synced ? Self.syncedColor : Self.pendingColor)
            .accessibilityLabel(synced ? "전송됨" : "전송 대기")
    }
}

struct MemoRow: View {
    let memo: Memo
    let showPlace: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(memo.text).lineLimit(1)
            HStack(spacing: 4) {
                SyncBadge(synced: memo.synced)
                Text(memoDate(memo.ts), format: .dateTime.month().day().hour().minute())
                    .font(.caption2).foregroundStyle(.secondary)
                if showPlace, let place = memo.place {
                    Text("· 📍\(place)")
                        .font(.caption2).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.tail)
                }
            }
        }
    }
}

struct MemoListView: View {
    @ObservedObject var store: WatchStore

    var body: some View {
        NavigationStack {
            List {
                if store.memos.isEmpty {
                    Text("기록 없음").foregroundStyle(.secondary)
                } else {
                    // 즐겨찾기 장소별 섹션. 장소 이름은 헤더에 있으니 "기타"에서만 동네 이름을 보여준다.
                    ForEach(store.groups) { group in
                        Section {
                            ForEach(group.memos) { m in
                                NavigationLink {
                                    MemoDetailView(memoID: m.id, store: store)
                                } label: {
                                    MemoRow(memo: m, showPlace: group.id == "_other")
                                }
                            }
                            .onDelete { offsets in
                                for i in offsets { store.deleteById(group.memos[i].id) }
                            }
                        } header: {
                            Text("\(group.title) · \(group.memos.count)")
                        }
                    }
                }
            }
            .navigationTitle("내 기록")
        }
    }
}

struct MemoDetailView: View {
    let memoID: Memo.ID
    @ObservedObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if let memo = store.memos.first(where: { $0.id == memoID }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(memo.text)
                            .font(.body)

                        if let fav = store.favorite(lat: memo.lat, lng: memo.lng) {
                            Text("📍 \(fav.label)")
                                .font(.caption).foregroundStyle(.secondary)
                        } else if let place = memo.place {
                            Text("📍 \(place)")
                                .font(.caption).foregroundStyle(.secondary)
                        }

                        HStack(spacing: 4) {
                            SyncBadge(synced: memo.synced)
                            Text(memo.synced ? "전송됨" : "전송 대기")
                                .font(.caption2)
                                .foregroundStyle(memo.synced ? SyncBadge.syncedColor : SyncBadge.pendingColor)
                            Text(memoDate(memo.ts), format: .dateTime.month().day().hour().minute())
                                .font(.caption2).foregroundStyle(.secondary)
                        }

                        if !memo.synced {
                            Button(role: .destructive) {
                                store.deleteById(memo.id)
                                dismiss()
                            } label: {
                                Label("삭제", systemImage: "trash")
                            }
                            .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
                }
            } else {
                Text("삭제된 메모입니다.")
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("메모")
    }
}

// MARK: - 루트

struct ContentView: View {
    @StateObject private var location = WatchLocation()
    @ObservedObject private var store = WatchStore.shared
    @State private var page = 0
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $page) {
            RecordView(location: location, store: store).tag(0)
            MemoListView(store: store).tag(1)
        }
        .tabViewStyle(.page)
        .onAppear {
            store.activate()
            location.requestOnce()
        }
        // 앱으로 돌아올 때마다 전송 대기 메모를 다시 보낸다.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { store.activate() }
        }
        // 컴플리케이션(geogiseo://record)으로 열리면 기록 화면으로 이동하고 위치를 새로 잡는다.
        .onOpenURL { url in
            guard url.scheme == "geogiseo", url.host == "record" else { return }
            page = 0
            location.requestOnce()
        }
    }
}

#Preview {
    ContentView()
}
