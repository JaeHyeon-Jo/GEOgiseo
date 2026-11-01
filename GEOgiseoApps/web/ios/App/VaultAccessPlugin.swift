import Foundation
import Capacitor
import UniformTypeIdentifiers

/**
 * 사용자가 고른 폴더(예: iCloud Drive의 옵시디언 vault)에 `.md` 노트를 읽고 쓴다.
 */
@objc(VaultAccessPlugin)
public class VaultAccessPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "VaultAccessPlugin"
    public let jsName = "VaultAccess"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readNotes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeNote", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteNote", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPlaces", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writePlaces", returnType: CAPPluginReturnPromise)
    ]

    private var pickCall: CAPPluginCall?
    private let fileQueue = DispatchQueue(label: "app.geogiseo.vault-files", qos: .userInitiated)
    private let maximumNoteSize = 5 * 1024 * 1024
    private let maximumPlacesSize = 1024 * 1024
    private let placesFilename = "geogiseo-places.json"

    // MARK: - 폴더 선택

    @objc func pickFolder(_ call: CAPPluginCall) {
        guard pickCall == nil else {
            call.reject("폴더 선택 화면이 이미 열려 있습니다.", "PICKER_IN_PROGRESS")
            return
        }
        self.pickCall = call
        call.keepAlive = true
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.keepAlive = false
                self.pickCall = nil
                call.reject("폴더 선택 화면을 열 수 없습니다.", "PRESENTATION_UNAVAILABLE")
                return
            }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
            picker.delegate = self
            picker.allowsMultipleSelection = false
            viewController.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = self.pickCall else { return }

        // pickFolder는 최종 결과가 한 번만 오는 Promise다. 응답을 보내기 전에
        // keepAlive를 해제해야 Capacitor가 저장된 콜백을 완료하고 정리한다.
        call.keepAlive = false
        self.pickCall = nil

        guard let url = urls.first else {
            call.reject("폴더를 선택하지 않았습니다.")
            return
        }

        do {
            let bookmark = try makeBookmark(url)
            call.resolve(["bookmark": bookmark, "name": url.lastPathComponent])
        } catch {
            call.reject("북마크 생성 실패: \(error.localizedDescription)")
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        self.pickCall?.keepAlive = false
        self.pickCall?.reject("취소됨", "CANCELLED")
        self.pickCall = nil
    }

    // MARK: - 노트 읽기

    @objc func readNotes(_ call: CAPPluginCall) {
        guard let bookmark = call.getString("bookmark") else { call.reject("bookmark 가 필요합니다."); return }
        fileQueue.async { [weak self] in
            guard let self else { return }
            do {
                let (folderURL, refreshed) = try self.resolveBookmark(bookmark)
                let didAccess = folderURL.startAccessingSecurityScopedResource()
                defer { if didAccess { folderURL.stopAccessingSecurityScopedResource() } }

                var notes: [[String: String]] = []
                var skippedNoteCount = 0
                let keys: [URLResourceKey] = [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]
                let enumerator = FileManager.default.enumerator(
                    at: folderURL,
                    includingPropertiesForKeys: keys,
                    options: [.skipsHiddenFiles, .skipsPackageDescendants]
                )
                while let fileURL = enumerator?.nextObject() as? URL {
                    guard fileURL.pathExtension.lowercased() == "md" else { continue }
                    do {
                        let values = try fileURL.resourceValues(forKeys: Set(keys))
                        guard values.isRegularFile == true,
                              values.isSymbolicLink != true,
                              (values.fileSize ?? 0) <= self.maximumNoteSize else { continue }
                        let safeURL = try self.validatedExistingNoteURL(fileURL, in: folderURL)
                        let content = try String(contentsOf: safeURL, encoding: .utf8)
                        notes.append(["path": self.relativePath(of: safeURL, base: folderURL), "content": content])
                    } catch {
                        // 파일 하나의 일시적 다운로드/인코딩 문제가 전체 vault 읽기를 막지 않게 한다.
                        skippedNoteCount += 1
                    }
                }

                var result: [String: Any] = [
                    "notes": notes,
                    "skippedNoteCount": skippedNoteCount,
                ]
                if let refreshed = refreshed { result["bookmark"] = refreshed }
                call.resolve(result)
            } catch {
                call.reject("읽기 실패: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 노트 쓰기

    @objc func writeNote(_ call: CAPPluginCall) {
        guard let bookmark = call.getString("bookmark"),
              let path = call.getString("path"),
              let content = call.getString("content") else {
            call.reject("bookmark, path, content 가 필요합니다."); return
        }
        guard content.utf8.count <= maximumNoteSize else {
            call.reject("노트는 5MB를 넘을 수 없습니다.")
            return
        }
        fileQueue.async { [weak self] in
            guard let self else { return }
            do {
                let (folderURL, refreshed) = try self.resolveBookmark(bookmark)
                let didAccess = folderURL.startAccessingSecurityScopedResource()
                defer { if didAccess { folderURL.stopAccessingSecurityScopedResource() } }

                let fileURL = try self.validatedNoteURL(for: path, in: folderURL)
                try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                let safeURL = try self.validatedNoteURL(for: path, in: folderURL)

                var coordinationError: NSError?
                var writeError: Error?
                NSFileCoordinator().coordinate(writingItemAt: safeURL, options: [], error: &coordinationError) { coordURL in
                    do { try content.write(to: coordURL, atomically: true, encoding: .utf8) }
                    catch { writeError = error }
                }
                if let error = coordinationError ?? writeError { throw error }

                var result: [String: Any] = [:]
                if let refreshed = refreshed { result["bookmark"] = refreshed }
                call.resolve(result)
            } catch {
                call.reject("쓰기 실패: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 노트 삭제

    @objc func deleteNote(_ call: CAPPluginCall) {
        guard let bookmark = call.getString("bookmark"),
              let path = call.getString("path") else {
            call.reject("bookmark, path 가 필요합니다."); return
        }
        fileQueue.async { [weak self] in
            guard let self else { return }
            do {
                let (folderURL, refreshed) = try self.resolveBookmark(bookmark)
                let didAccess = folderURL.startAccessingSecurityScopedResource()
                defer { if didAccess { folderURL.stopAccessingSecurityScopedResource() } }

                let fileURL = try self.validatedNoteURL(for: path, in: folderURL)
                let safeURL = try self.validatedExistingNoteURL(fileURL, in: folderURL)
                var coordinationError: NSError?
                var deleteError: Error?
                NSFileCoordinator().coordinate(writingItemAt: safeURL, options: .forDeleting, error: &coordinationError) { coordURL in
                    do { try FileManager.default.removeItem(at: coordURL) }
                    catch { deleteError = error }
                }
                if let error = coordinationError ?? deleteError { throw error }

                var result: [String: Any] = [:]
                if let refreshed = refreshed { result["bookmark"] = refreshed }
                call.resolve(result)
            } catch {
                call.reject("삭제 실패: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - 즐겨찾기 (고정 파일만 접근, Markdown 노트 경로 검증은 유지)

    @objc func readPlaces(_ call: CAPPluginCall) {
        guard let bookmark = call.getString("bookmark") else { call.reject("bookmark 가 필요합니다."); return }
        fileQueue.async { [weak self] in
            guard let self else { return }
            do {
                let (folderURL, refreshed) = try self.resolveBookmark(bookmark)
                let didAccess = folderURL.startAccessingSecurityScopedResource()
                defer { if didAccess { folderURL.stopAccessingSecurityScopedResource() } }

                // 폴더 자체의 접근 실패를 '즐겨찾기 파일 없음'으로 취급하지 않는다.
                let folderValues = try folderURL.resourceValues(forKeys: [.isDirectoryKey])
                guard folderValues.isDirectory == true else {
                    throw self.vaultError(code: 2, description: "보관함 폴더에 접근할 수 없습니다.")
                }
                var result: [String: Any] = ["content": NSNull()]
                do {
                    let fileURL = try self.placesURL(in: folderURL)
                    var coordinationError: NSError?
                    var readError: Error?
                    NSFileCoordinator().coordinate(readingItemAt: fileURL, options: [], error: &coordinationError) { coordURL in
                        do {
                            let values = try coordURL.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                            guard values.isRegularFile == true, (values.fileSize ?? 0) <= self.maximumPlacesSize else {
                                throw self.vaultError(code: 2, description: "즐겨찾기 파일은 1MB 이하의 일반 파일이어야 합니다.")
                            }
                            result["content"] = try String(contentsOf: coordURL, encoding: .utf8)
                        } catch { readError = error }
                    }
                    if let error = coordinationError ?? readError { throw error }
                } catch {
                    let nsError = error as NSError
                    guard nsError.domain == NSCocoaErrorDomain,
                          [NSFileReadNoSuchFileError, NSFileNoSuchFileError].contains(nsError.code) else { throw error }
                }
                if let refreshed { result["bookmark"] = refreshed }
                call.resolve(result)
            } catch {
                call.reject("즐겨찾기 읽기 실패: \(error.localizedDescription)")
            }
        }
    }

    @objc func writePlaces(_ call: CAPPluginCall) {
        guard let bookmark = call.getString("bookmark"), let content = call.getString("content") else {
            call.reject("bookmark, content 가 필요합니다."); return
        }
        guard content.utf8.count <= maximumPlacesSize else {
            call.reject("즐겨찾기 파일은 1MB를 넘을 수 없습니다."); return
        }
        fileQueue.async { [weak self] in
            guard let self else { return }
            do {
                let (folderURL, refreshed) = try self.resolveBookmark(bookmark)
                let didAccess = folderURL.startAccessingSecurityScopedResource()
                defer { if didAccess { folderURL.stopAccessingSecurityScopedResource() } }
                let fileURL = try self.placesURL(in: folderURL)
                var coordinationError: NSError?
                var writeError: Error?
                NSFileCoordinator().coordinate(writingItemAt: fileURL, options: [], error: &coordinationError) { coordURL in
                    do { try content.write(to: coordURL, atomically: true, encoding: .utf8) }
                    catch { writeError = error }
                }
                if let error = coordinationError ?? writeError { throw error }
                var result: [String: Any] = [:]
                if let refreshed { result["bookmark"] = refreshed }
                call.resolve(result)
            } catch {
                call.reject("즐겨찾기 쓰기 실패: \(error.localizedDescription)")
            }
        }
    }

    private func placesURL(in folderURL: URL) throws -> URL {
        let url = folderURL.appendingPathComponent(placesFilename)
        do {
            let values = try url.resourceValues(forKeys: [.isSymbolicLinkKey])
            guard values.isSymbolicLink != true else {
                throw vaultError(code: 2, description: "즐겨찾기 파일에 심볼릭 링크를 사용할 수 없습니다.")
            }
        } catch {
            let nsError = error as NSError
            guard nsError.domain == NSCocoaErrorDomain,
                  [NSFileReadNoSuchFileError, NSFileNoSuchFileError].contains(nsError.code) else { throw error }
        }
        let safeURL = canonicalURL(url)
        try ensureInsideVault(safeURL, base: folderURL)
        return safeURL
    }

    // MARK: - 헬퍼

    private func makeBookmark(_ url: URL) throws -> String {
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        let data = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        return data.base64EncodedString()
    }

    private func resolveBookmark(_ bookmark: String) throws -> (URL, String?) {
        guard let data = Data(base64Encoded: bookmark) else {
            throw NSError(domain: "VaultAccess", code: 1, userInfo: [NSLocalizedDescriptionKey: "잘못된 북마크 형식"])
        }
        var isStale = false
        let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &isStale)
        var refreshed: String?
        if isStale {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            if let newData = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                refreshed = newData.base64EncodedString()
            }
        }
        return (url, refreshed)
    }

    private func validatedNoteURL(for path: String, in folderURL: URL) throws -> URL {
        guard !path.hasPrefix("/"), path.lowercased().hasSuffix(".md") else {
            throw vaultError(code: 2, description: "Markdown(.md) 노트 경로만 사용할 수 있습니다.")
        }
        let components = path
            .split(separator: "/", omittingEmptySubsequences: false)
            .filter { !$0.isEmpty && $0 != "." }

        guard !components.isEmpty,
              !components.contains("..") else {
            throw vaultError(code: 2, description: "잘못된 노트 경로")
        }

        let candidate = canonicalURL(components.reduce(folderURL) { url, component in
            url.appendingPathComponent(String(component))
        })
        try ensureInsideVault(candidate, base: folderURL)
        return candidate
    }

    /// 존재하는 가장 깊은 상위 경로까지만 심볼릭 링크를 해석하고 나머지 경로는 그대로 붙인다.
    /// resolvingSymlinksInPath()는 존재하는 경로에서만 /private/var → /var 로 바꾸므로,
    /// 아직 없는 새 파일을 그대로 해석하면 vault 경로와 prefix 가 어긋난다.
    private func canonicalURL(_ url: URL) -> URL {
        var existing = url.standardizedFileURL
        var pending: [String] = []
        while !FileManager.default.fileExists(atPath: existing.path), existing.pathComponents.count > 1 {
            pending.insert(existing.lastPathComponent, at: 0)
            existing.deleteLastPathComponent()
        }
        return pending.reduce(existing.resolvingSymlinksInPath()) { $0.appendingPathComponent($1) }
    }

    private func validatedExistingNoteURL(_ fileURL: URL, in folderURL: URL) throws -> URL {
        let resolved = canonicalURL(fileURL)
        guard resolved.pathExtension.lowercased() == "md" else {
            throw vaultError(code: 2, description: "Markdown(.md) 노트만 사용할 수 있습니다.")
        }
        try ensureInsideVault(resolved, base: folderURL)
        return resolved
    }

    private func ensureInsideVault(_ candidate: URL, base folderURL: URL) throws {
        let base = canonicalURL(folderURL)
        let baseComponents = base.pathComponents
        let candidateComponents = candidate.pathComponents
        guard candidateComponents.count > baseComponents.count,
              Array(candidateComponents.prefix(baseComponents.count)) == baseComponents else {
            throw vaultError(code: 3, description: "선택한 폴더 밖의 파일에는 접근할 수 없습니다.")
        }
    }

    private func vaultError(code: Int, description: String) -> NSError {
        NSError(domain: "VaultAccess", code: code, userInfo: [NSLocalizedDescriptionKey: description])
    }

    private func relativePath(of fileURL: URL, base: URL) -> String {
        let baseComponents = base.standardizedFileURL.pathComponents
        let fileComponents = fileURL.standardizedFileURL.pathComponents
        if fileComponents.count > baseComponents.count,
           Array(fileComponents.prefix(baseComponents.count)) == baseComponents {
            return fileComponents.suffix(from: baseComponents.count).joined(separator: "/")
        }
        return fileURL.lastPathComponent
    }
}
