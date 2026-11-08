//
//  GeoWatchComplication.swift
//  GeoWatchComplication
//
//  워치 페이스에 올려두는 "거기서" 기록 버튼.
//  탭하면 워치 앱의 기록 화면(geogiseo://record)으로 바로 열린다.
//

import WidgetKit
import SwiftUI

/// 내용이 바뀌지 않는 정적 버튼이라 항목 하나로 충분하다.
struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        completion(SimpleEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        completion(Timeline(entries: [SimpleEntry(date: Date())], policy: .never))
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
}

struct GeoWatchComplicationEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: Provider.Entry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            Label("기록", systemImage: "mic.fill")
                .labelStyle(.titleAndIcon)
                .font(.headline)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .accessoryInline:
            Text("\(Image(systemName: "mic.fill")) 기록")
        case .accessoryCorner:
            Label("기록", systemImage: "mic.fill")
                .labelStyle(.titleAndIcon)
                .font(.caption2)
                .minimumScaleFactor(0.8)
                .lineLimit(1)
        default: // accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                Label("기록", systemImage: "mic.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.caption2)
                    .minimumScaleFactor(0.8)
                    .lineLimit(1)
            }
        }
    }
}

struct GeoWatchComplication: Widget {
    let kind: String = "GeoWatchComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            GeoWatchComplicationEntryView(entry: entry)
                .accessibilityLabel("거기서 기록")
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "geogiseo://record"))
        }
        .configurationDisplayName("거기서 기록")
        .description("탭하면 바로 음성 메모 화면이 열립니다.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}

#Preview(as: .accessoryCircular) {
    GeoWatchComplication()
} timeline: {
    SimpleEntry(date: .now)
}

#Preview(as: .accessoryRectangular) {
    GeoWatchComplication()
} timeline: {
    SimpleEntry(date: .now)
}
