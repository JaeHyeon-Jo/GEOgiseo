import Foundation
import Capacitor
import MapKit

// 커스텀 annotation — noteId/isPlace/emoji 보관
class GeoAnnotation: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    var title: String?
    let noteId: String?
    let isPlace: Bool
    let emoji: String?
    let noteCount: Int
    let preview: String?   // 콜아웃에 보여줄 본문 미리보기
    let meta: String?      // 콜아웃 하단 시간·장소

    init(coordinate: CLLocationCoordinate2D, title: String?,
         noteId: String? = nil, isPlace: Bool = false, emoji: String? = nil, noteCount: Int = 0,
         preview: String? = nil, meta: String? = nil) {
        self.coordinate = coordinate
        self.title = title
        self.noteId = noteId
        self.isPlace = isPlace
        self.emoji = emoji
        self.noteCount = noteCount
        self.preview = preview
        self.meta = meta
    }

    /// 클러스터 배지에 더할 메모 수 — 노트 핀은 1, 장소 핀은 반경 안 노트 수.
    var memoWeight: Int { isPlace ? noteCount : 1 }
}

// 지도 뷰 컨트롤러
class NativeMapVC: UIViewController, MKMapViewDelegate {
    var mapView: MKMapView!
    var isPickMode = false
    var isEmbedded = false  // 지도 탭 안에 임베드(모달 아님) — 내 위치 버튼 + 가장자리 페이드
    private let embedFadeBottom: CGFloat = 36  // 탭바 쪽으로 녹아드는 높이
    private var fadeMask: CAGradientLayer?
    var showRadius = true   // 메모 위치 변경 시 false — 반경 슬라이더 없이 핀만
    var pickRadius: CLLocationDistance = 200

    // 초기 위치 — viewDidLoad에서 즉시 세팅해 present 애니메이션 중 플래시 방지
    var initialLat: Double = 37.5665
    var initialLng: Double = 126.978
    var initialSpan: Double = 0.01

    private var pickedAnnotation: MKPointAnnotation?
    private var pickCircle: MKCircle?
    private var radiusLabel: UILabel?

    var onClose: (() -> Void)?
    var onConfirm: ((CLLocationCoordinate2D, Double) -> Void)?
    var onAnnotationTapped: ((String) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        // 지도
        mapView = MKMapView()
        mapView.translatesAutoresizingMaskIntoConstraints = false
        mapView.delegate = self
        mapView.showsUserLocation = !isPickMode
        view.addSubview(mapView)

        // 네비게이션
        title = isPickMode ? (showRadius ? "위치 선택" : "메모 위치") : "지도"
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: isPickMode ? "취소" : "닫기",
            style: .plain, target: self, action: #selector(closeTapped)
        )

        if isPickMode {
            navigationItem.rightBarButtonItem = UIBarButtonItem(
                title: "확인", style: .done, target: self, action: #selector(confirmTapped)
            )

            if showRadius {
                // 반경 패널 (하단)
                let panel = makeRadiusPanel()
                view.addSubview(panel)

                NSLayoutConstraint.activate([
                    mapView.topAnchor.constraint(equalTo: view.topAnchor),
                    mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                    mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                    mapView.bottomAnchor.constraint(equalTo: panel.topAnchor),

                    panel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                    panel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                    panel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
                    panel.heightAnchor.constraint(equalToConstant: 64),
                ])
            } else {
                // 반경 없이 지도 전체
                NSLayoutConstraint.activate([
                    mapView.topAnchor.constraint(equalTo: view.topAnchor),
                    mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                    mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                    mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                ])
            }

            // 안내 레이블
            let hint = UILabel()
            hint.text = "탭해서 위치를 선택하세요"
            hint.font = .systemFont(ofSize: 12)
            hint.textColor = .secondaryLabel
            hint.textAlignment = .center
            hint.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.85)
            hint.translatesAutoresizingMaskIntoConstraints = false
            mapView.addSubview(hint)
            NSLayoutConstraint.activate([
                hint.topAnchor.constraint(equalTo: mapView.topAnchor),
                hint.leadingAnchor.constraint(equalTo: mapView.leadingAnchor),
                hint.trailingAnchor.constraint(equalTo: mapView.trailingAnchor),
                hint.heightAnchor.constraint(equalToConstant: 28),
            ])

            let tap = UITapGestureRecognizer(target: self, action: #selector(mapTapped(_:)))
            mapView.addGestureRecognizer(tap)

            // 초기 위치 핀+원 즉시 표시
            setPickedCoord(CLLocationCoordinate2D(latitude: initialLat, longitude: initialLng))
        } else {
            NSLayoutConstraint.activate([
                mapView.topAnchor.constraint(equalTo: view.topAnchor),
                mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            ])
            if isEmbedded {
                // 내 위치로 이동 버튼 (우하단)
                let track = MKUserTrackingButton(mapView: mapView)
                track.translatesAutoresizingMaskIntoConstraints = false
                track.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.9)
                track.layer.cornerRadius = 8
                track.layer.masksToBounds = true
                mapView.addSubview(track)
                // 하단 페이드 구간만큼 안전 영역을 올려 버튼·Apple 로고가 흐려진 곳에 걸리지 않게
                additionalSafeAreaInsets.bottom = embedFadeBottom
                NSLayoutConstraint.activate([
                    track.trailingAnchor.constraint(equalTo: mapView.trailingAnchor, constant: -12),
                    track.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -4),
                ])
            }
        }

        // 카메라를 viewDidLoad에서 즉시 세팅 — present 애니메이션 중 이미 올바른 위치
        centerOn(lat: initialLat, lng: initialLng, spanDelta: initialSpan)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard isEmbedded else { return }
        updateFadeMask()
    }

    /// 임베드 지도의 위(상태바)·아래(탭바 쪽) 가장자리를 투명하게 녹여 아래 웹 배경과 자연스럽게 잇는다.
    private func updateFadeMask() {
        let h = view.bounds.height
        guard h > 0 else { return }
        let mask = fadeMask ?? CAGradientLayer()
        let topFade = min(view.window?.safeAreaInsets.top ?? 0, h / 3) + 12
        let opaque = UIColor.black.cgColor, clear = UIColor.clear.cgColor
        mask.colors = [UIColor.black.withAlphaComponent(0.15).cgColor, opaque, opaque, clear]
        mask.locations = [0, NSNumber(value: Double(topFade / h)),
                          NSNumber(value: Double((h - embedFadeBottom) / h)), 1]
        CATransaction.begin()
        CATransaction.setDisableActions(true)  // 프레임 변경 시 마스크가 애니메이션되며 깜빡이지 않게
        mask.frame = view.bounds
        CATransaction.commit()
        if fadeMask == nil {
            fadeMask = mask
            view.layer.mask = mask
        }
    }

    // MARK: - 반경 패널

    private func makeRadiusPanel() -> UIView {
        let panel = UIView()
        panel.translatesAutoresizingMaskIntoConstraints = false
        panel.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.94)

        let line = UIView()
        line.translatesAutoresizingMaskIntoConstraints = false
        line.backgroundColor = UIColor.separator
        panel.addSubview(line)

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium)
        label.textColor = .label
        label.text = radiusText()
        label.setContentHuggingPriority(.required, for: .horizontal)
        radiusLabel = label
        panel.addSubview(label)

        let slider = UISlider()
        slider.translatesAutoresizingMaskIntoConstraints = false
        slider.minimumValue = 50
        slider.maximumValue = 3000
        slider.value = Float(pickRadius)
        slider.addTarget(self, action: #selector(radiusChanged(_:)), for: .valueChanged)
        panel.addSubview(slider)

        NSLayoutConstraint.activate([
            line.topAnchor.constraint(equalTo: panel.topAnchor),
            line.leadingAnchor.constraint(equalTo: panel.leadingAnchor),
            line.trailingAnchor.constraint(equalTo: panel.trailingAnchor),
            line.heightAnchor.constraint(equalToConstant: 0.5),

            label.centerYAnchor.constraint(equalTo: panel.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 16),
            label.widthAnchor.constraint(equalToConstant: 72),

            slider.centerYAnchor.constraint(equalTo: panel.centerYAnchor),
            slider.leadingAnchor.constraint(equalTo: label.trailingAnchor, constant: 8),
            slider.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -16),
        ])

        return panel
    }

    private func radiusText() -> String {
        pickRadius < 1000 ? "\(Int(pickRadius))m" : String(format: "%.1fkm", pickRadius / 1000)
    }

    @objc private func radiusChanged(_ slider: UISlider) {
        // 50m 단위로 스냅
        let snapped = (Double(slider.value) / 50).rounded() * 50
        pickRadius = max(50, snapped)
        radiusLabel?.text = radiusText()
        if let ann = pickedAnnotation {
            updatePickCircle(for: ann.coordinate)
        }
    }

    private func updatePickCircle(for coord: CLLocationCoordinate2D) {
        if let c = pickCircle { mapView.removeOverlay(c) }
        guard pickRadius > 0 else { return }
        let c = MKCircle(center: coord, radius: pickRadius)
        pickCircle = c
        mapView.addOverlay(c, level: .aboveRoads)
    }

    // MARK: - 액션

    @objc private func closeTapped() { onClose?() }

    @objc private func confirmTapped() {
        guard let ann = pickedAnnotation else { return }
        onConfirm?(ann.coordinate, pickRadius)
    }

    @objc private func mapTapped(_ g: UITapGestureRecognizer) {
        let pt = g.location(in: mapView)
        let coord = mapView.convert(pt, toCoordinateFrom: mapView)
        setPickedCoord(coord)
    }

    func setPickedCoord(_ coord: CLLocationCoordinate2D) {
        if let a = pickedAnnotation { mapView.removeAnnotation(a) }
        updatePickCircle(for: coord)

        let ann = MKPointAnnotation()
        ann.coordinate = coord
        ann.title = "선택한 위치"
        pickedAnnotation = ann
        mapView.addAnnotation(ann)
        navigationItem.rightBarButtonItem?.isEnabled = true
    }

    func centerOn(lat: Double, lng: Double, spanDelta: Double = 0.01) {
        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
            span: MKCoordinateSpan(latitudeDelta: spanDelta, longitudeDelta: spanDelta)
        )
        mapView.setRegion(region, animated: false)
    }

    func setMarkers(_ markers: [[String: Any]]) {
        // 재사용 시 이전 마커/오버레이 제거 (내 위치 핀은 유지)
        mapView.removeAnnotations(mapView.annotations.filter { !($0 is MKUserLocation) })
        mapView.removeOverlays(mapView.overlays)
        for m in markers {
            guard let lat = m["lat"] as? Double, let lng = m["lng"] as? Double else { continue }
            let coord = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            let isPlace = m["isPlace"] as? Bool ?? false
            let ann = GeoAnnotation(
                coordinate: coord,
                title: m["title"] as? String ?? "",
                noteId: m["id"] as? String,
                isPlace: isPlace,
                emoji: m["emoji"] as? String,
                noteCount: (m["noteCount"] as? NSNumber)?.intValue ?? 0,
                preview: m["preview"] as? String,
                meta: m["meta"] as? String
            )
            mapView.addAnnotation(ann)
            if let r = m["radiusM"] as? Double, r > 0, isPlace {
                mapView.addOverlay(MKCircle(center: coord, radius: r), level: .aboveRoads)
            }
        }
    }

    // MARK: - MKMapViewDelegate

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard !(annotation is MKUserLocation) else { return nil }

        // 축소 시 묶인 핀 — 안에 든 메모 개수를 글리프로 표시
        if let cluster = annotation as? MKClusterAnnotation {
            let v = (mapView.dequeueReusableAnnotationView(withIdentifier: "cluster") as? MKMarkerAnnotationView)
                ?? MKMarkerAnnotationView(annotation: cluster, reuseIdentifier: "cluster")
            v.annotation = cluster
            v.markerTintColor = .systemBlue
            v.displayPriority = .required
            v.titleVisibility = .hidden
            v.subtitleVisibility = .hidden
            let total = clusterMemoCount(cluster)
            v.glyphText = total > 99 ? "99+" : "\(total)"
            cluster.title = "메모 \(total)개"
            cluster.subtitle = nil
            v.canShowCallout = true
            v.detailCalloutAccessoryView = makeClusterCallout(cluster)
            return v
        }

        let v = (mapView.dequeueReusableAnnotationView(withIdentifier: "geo") as? MKMarkerAnnotationView)
            ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: "geo")
        v.annotation = annotation
        v.markerTintColor = .systemBlue
        v.clusteringIdentifier = nil
        v.canShowCallout = false
        v.detailCalloutAccessoryView = nil
        v.rightCalloutAccessoryView = nil

        // 재사용 시 이전 배지 제거
        let badgeTag = 9901
        v.subviews.filter { $0.tag == badgeTag }.forEach { $0.removeFromSuperview() }

        if let g = annotation as? GeoAnnotation {
            v.glyphText = g.emoji ?? (g.isPlace ? "📍" : "●")
            v.titleVisibility = g.isPlace ? .visible : .hidden
            v.clusteringIdentifier = "geo"
            // 핀 탭 → 콜아웃으로 메모 살짝 보기
            v.canShowCallout = true
            if g.isPlace {
                v.detailCalloutAccessoryView = makeCalloutLabels(
                    preview: g.noteCount > 0 ? "메모 \(g.noteCount)개" : "메모 없음", meta: nil)
            } else {
                v.detailCalloutAccessoryView = makeCalloutLabels(preview: g.preview, meta: g.meta)
                v.rightCalloutAccessoryView = UIButton(type: .detailDisclosure)
            }
            // 장소 반경 안 노트 개수 배지 — 마커 우상단 모서리에 제약으로 고정(글리프와 안 겹침)
            if g.isPlace && g.noteCount > 0 {
                let text = g.noteCount > 99 ? "99+" : "\(g.noteCount)"
                let badge = UILabel()
                badge.tag = badgeTag
                badge.text = text
                badge.font = .systemFont(ofSize: 11, weight: .bold)
                badge.textColor = .white
                badge.backgroundColor = .systemRed
                badge.textAlignment = .center
                badge.layer.cornerRadius = 9
                badge.layer.masksToBounds = true
                badge.layer.borderColor = UIColor.white.cgColor
                badge.layer.borderWidth = 1.5
                badge.translatesAutoresizingMaskIntoConstraints = false
                v.addSubview(badge)
                let w = max(18, CGFloat(text.count) * 8 + 8)
                NSLayoutConstraint.activate([
                    badge.heightAnchor.constraint(equalToConstant: 18),
                    badge.widthAnchor.constraint(equalToConstant: w),
                    badge.centerXAnchor.constraint(equalTo: v.trailingAnchor, constant: -3),
                    badge.centerYAnchor.constraint(equalTo: v.topAnchor, constant: 3),
                ])
            }
        } else {
            v.glyphText = "📍"
            v.titleVisibility = .visible
        }
        return v
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let circle = overlay as? MKCircle else { return MKOverlayRenderer(overlay: overlay) }
        let r = MKCircleRenderer(circle: circle)
        r.fillColor = UIColor.systemBlue.withAlphaComponent(0.1)
        r.strokeColor = UIColor.systemBlue.withAlphaComponent(0.4)
        r.lineWidth = 1.5
        return r
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        // 묶음 핀: 아직 펼칠 수 있으면 확대, 같은 자리에 겹친 메모면 콜아웃 목록을 그대로 보여준다
        guard let cluster = view.annotation as? MKClusterAnnotation else { return }
        let coords = cluster.memberAnnotations.map {
            CLLocation(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude)
        }
        guard let first = coords.first else { return }
        let spread = coords.map { $0.distance(from: first) }.max() ?? 0
        if spread > 30 {
            mapView.deselectAnnotation(cluster, animated: false)
            mapView.showAnnotations(cluster.memberAnnotations, animated: true)
        }
    }

    func mapView(_ mapView: MKMapView, annotationView view: MKAnnotationView,
                 calloutAccessoryControlTapped control: UIControl) {
        openNote(for: view.annotation)
    }

    // MARK: - 콜아웃

    private func openNote(for annotation: MKAnnotation?) {
        guard let g = annotation as? GeoAnnotation, let id = g.noteId, !g.isPlace else { return }
        mapView.deselectAnnotation(g, animated: false)
        onAnnotationTapped?(id)
    }

    @objc private func calloutBodyTapped() {
        openNote(for: mapView.selectedAnnotations.first)
    }

    private func clusterMemoCount(_ cluster: MKClusterAnnotation) -> Int {
        let total = cluster.memberAnnotations.reduce(0) { $0 + (($1 as? GeoAnnotation)?.memoWeight ?? 0) }
        return total > 0 ? total : cluster.memberAnnotations.count
    }

    /// 단일 핀 콜아웃 — 본문 미리보기(최대 3줄) + 시간·장소. 본문을 탭해도 메모가 열린다.
    private func makeCalloutLabels(preview: String?, meta: String?) -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 4
        if let p = preview, !p.isEmpty {
            let l = UILabel()
            l.text = p
            l.font = .preferredFont(forTextStyle: .subheadline)
            l.adjustsFontForContentSizeCategory = true
            l.textColor = .secondaryLabel
            l.numberOfLines = 3
            stack.addArrangedSubview(l)
        }
        if let m = meta, !m.isEmpty {
            let l = UILabel()
            l.text = m
            l.font = .preferredFont(forTextStyle: .caption1)
            l.adjustsFontForContentSizeCategory = true
            l.textColor = .tertiaryLabel
            l.numberOfLines = 1
            stack.addArrangedSubview(l)
        }
        stack.widthAnchor.constraint(lessThanOrEqualToConstant: 240).isActive = true
        stack.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(calloutBodyTapped)))
        return stack
    }

    /// 묶음 핀 콜아웃 — 안에 든 메모 첫 줄 목록(최대 5개), 각 줄을 탭하면 그 메모가 열린다.
    private func makeClusterCallout(_ cluster: MKClusterAnnotation) -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.alignment = .leading
        stack.spacing = 2
        let notes = cluster.memberAnnotations.compactMap { $0 as? GeoAnnotation }.filter { !$0.isPlace }
        let places = cluster.memberAnnotations.compactMap { $0 as? GeoAnnotation }.filter { $0.isPlace }
        for p in places.prefix(3) {
            let l = UILabel()
            l.text = "\(p.emoji ?? "📍") \(p.title ?? "") · 메모 \(p.noteCount)개"
            l.font = .preferredFont(forTextStyle: .subheadline)
            l.adjustsFontForContentSizeCategory = true
            l.textColor = .secondaryLabel
            stack.addArrangedSubview(l)
        }
        for n in notes.prefix(5) {
            guard let id = n.noteId else { continue }
            var cfg = UIButton.Configuration.plain()
            cfg.title = (n.title?.isEmpty == false) ? n.title : "빈 메모"
            cfg.subtitle = n.meta
            cfg.titleLineBreakMode = .byTruncatingTail
            cfg.contentInsets = NSDirectionalEdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0)
            let b = UIButton(configuration: cfg, primaryAction: UIAction { [weak self] _ in
                guard let self else { return }
                self.mapView.deselectAnnotation(cluster, animated: false)
                self.onAnnotationTapped?(id)
            })
            b.contentHorizontalAlignment = .leading
            stack.addArrangedSubview(b)
        }
        if notes.count > 5 {
            let more = UILabel()
            more.text = "외 \(notes.count - 5)개 — 확대해서 보기"
            more.font = .preferredFont(forTextStyle: .caption1)
            more.adjustsFontForContentSizeCategory = true
            more.textColor = .tertiaryLabel
            stack.addArrangedSubview(more)
        }
        stack.widthAnchor.constraint(lessThanOrEqualToConstant: 260).isActive = true
        return stack
    }
}

// MARK: - Capacitor 플러그인

@objc(NativeMapPlugin)
public class NativeMapPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "NativeMapPlugin"
    public let jsName = "NativeMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hide", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHeading", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "embed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEmbedMarkers", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideEmbed", returnType: CAPPluginReturnPromise),
    ]

    private weak var navController: UINavigationController?          // 피커(showPicker)용
    // 표시용 지도는 재사용 — MKMapView 재생성 비용을 피하려 강하게 붙잡아 둔다.
    private var displayVC: NativeMapVC?
    private var displayNav: UINavigationController?
    // 지도 탭에 임베드된 지도 — 탭을 오가도 위치/확대 상태를 유지하려 숨기기만 한다.
    private var embedVC: NativeMapVC?

    // MARK: - 임베드 지도 (지도 탭)

    /// 웹뷰 위에 지도를 x/y/width/height(CSS px = pt) 영역으로 띄운다. 처음 한 번만 lat/lng로 센터링.
    @objc func embed(_ call: CAPPluginCall) {
        let frame = CGRect(
            x: call.getDouble("x") ?? 0,
            y: call.getDouble("y") ?? 0,
            width: call.getDouble("width") ?? 0,
            height: call.getDouble("height") ?? 0
        )
        let lat = call.getDouble("lat") ?? 37.5665
        let lng = call.getDouble("lng") ?? 126.978

        DispatchQueue.main.async { [weak self] in
            guard let self, let host = self.bridge?.viewController else {
                call.reject("호스트 뷰가 없습니다.")
                return
            }
            if let vc = self.embedVC {
                vc.view.frame = frame
                vc.view.isHidden = false
                call.resolve()
                return
            }
            let vc = NativeMapVC()
            vc.isPickMode = false
            vc.isEmbedded = true
            vc.initialLat = lat
            vc.initialLng = lng
            vc.initialSpan = 0.015
            vc.onAnnotationTapped = { [weak self] id in
                self?.notifyListeners("markerTapped", data: ["id": id])
            }
            host.addChild(vc)
            vc.view.frame = frame
            // CAPBridgeViewController의 view는 웹뷰 자체 — 그 위에 얹는다(스크롤뷰가 아니라 따라 움직이지 않음)
            host.view.addSubview(vc.view)
            vc.didMove(toParent: host)
            self.embedVC = vc
            call.resolve()
        }
    }

    @objc func setEmbedMarkers(_ call: CAPPluginCall) {
        let rawMarkers: [Any] = call.getArray("markers") ?? []
        let markers: [[String: Any]] = rawMarkers.compactMap { $0 as? [String: Any] }
        DispatchQueue.main.async { [weak self] in
            self?.embedVC?.setMarkers(markers)
            call.resolve()
        }
    }

    @objc func hideEmbed(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.embedVC?.view.isHidden = true
            call.resolve()
        }
    }

    // MARK: - 나침반(heading) — 권한 프롬프트 없이 항상 방향을 흘려보낸다.

    private lazy var headingManager: CLLocationManager = {
        let m = CLLocationManager()
        m.delegate = self
        m.headingFilter = 2 // 2도 이상 변할 때만 콜백 (센서 부하/이벤트 최소화)
        return m
    }()

    @objc func startHeading(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if CLLocationManager.headingAvailable() {
                self.headingManager.startUpdatingHeading()
            }
            call.resolve()
        }
    }

    @objc func stopHeading(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.headingManager.stopUpdatingHeading()
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        // trueHeading은 위치 정보가 있을 때만 유효(-1). 없으면 자기 북쪽 기준 magneticHeading 사용.
        let h = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        guard h >= 0 else { return }
        notifyListeners("heading", data: ["heading": h])
    }

    @objc func show(_ call: CAPPluginCall) {
        let lat = call.getDouble("lat") ?? 37.5665
        let lng = call.getDouble("lng") ?? 126.978
        let rawMarkers: [Any] = call.getArray("markers") ?? []
        let markers: [[String: Any]] = rawMarkers.compactMap { $0 as? [String: Any] }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.bridge?.viewController?.presentedViewController == nil else {
                call.reject("다른 화면이 이미 열려 있습니다.", "PRESENTATION_IN_PROGRESS")
                return
            }

            if let vc = self.displayVC, let nav = self.displayNav {
                // 재사용 — MKMapView를 다시 만들지 않아 즉시 표시(타일도 캐시됨)
                vc.centerOn(lat: lat, lng: lng, spanDelta: 0.015)
                self.bridge?.viewController?.present(nav, animated: true) {
                    vc.setMarkers(markers)
                }
                call.resolve()
                return
            }

            let vc = NativeMapVC()
            vc.isPickMode = false
            vc.initialLat = lat
            vc.initialLng = lng
            vc.initialSpan = 0.015
            vc.onClose = { [weak self] in
                self?.displayNav?.dismiss(animated: true)   // VC/nav는 살려둬 다음에 재사용
                self?.notifyListeners("closed", data: [:])
            }
            vc.onAnnotationTapped = { [weak self] id in
                self?.displayNav?.dismiss(animated: true)
                self?.notifyListeners("markerTapped", data: ["id": id])
            }
            let nav = UINavigationController(rootViewController: vc)
            nav.modalPresentationStyle = .fullScreen
            self.displayVC = vc
            self.displayNav = nav
            // 마커는 present 완료 후 추가 (지도 레이어 준비 후)
            self.bridge?.viewController?.present(nav, animated: true) {
                vc.setMarkers(markers)
            }
            call.resolve()
        }
    }

    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let pickerNav = self?.navController {
                pickerNav.dismiss(animated: true)
                self?.navController = nil
            } else {
                self?.displayNav?.dismiss(animated: true)
            }
            call.resolve()
        }
    }

    @objc func showPicker(_ call: CAPPluginCall) {
        let lat = call.getDouble("lat") ?? 37.5665
        let lng = call.getDouble("lng") ?? 126.978
        let radiusM = call.getDouble("radiusM") ?? 200
        let showRadius = call.getBool("showRadius") ?? true

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.bridge?.viewController?.presentedViewController == nil else {
                call.reject("다른 화면이 이미 열려 있습니다.", "PRESENTATION_IN_PROGRESS")
                return
            }
            let vc = NativeMapVC()
            vc.isPickMode = true
            vc.showRadius = showRadius
            vc.pickRadius = showRadius ? radiusM : 0
            vc.initialLat = lat
            vc.initialLng = lng
            vc.initialSpan = 0.008
            vc.onClose = { [weak self] in
                self?.navController?.dismiss(animated: true)
                self?.navController = nil
                self?.notifyListeners("pickerCancelled", data: [:])
            }
            vc.onConfirm = { [weak self] coord, radius in
                self?.navController?.dismiss(animated: true)
                self?.navController = nil
                self?.notifyListeners("locationPicked", data: [
                    "lat": coord.latitude,
                    "lng": coord.longitude,
                    "radiusM": radius,
                ])
            }
            let nav = UINavigationController(rootViewController: vc)
            nav.modalPresentationStyle = .fullScreen
            // 초기 위치·반경은 viewDidLoad에서 세팅 완료 — completion 불필요
            self.bridge?.viewController?.present(nav, animated: true)
            self.navController = nav
            call.resolve()
        }
    }
}
