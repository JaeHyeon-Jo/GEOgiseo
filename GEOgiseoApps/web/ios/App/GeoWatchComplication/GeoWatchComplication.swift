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
            HStack(spacing: 6) {
                Image(systemName: "mic.fill")
                    .font(.title2)
                VStack(alignment: .leading) {
                    Text("거기서").font(.headline)
                    Text("탭해서 기록").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        case .accessoryInline:
            Label("거기서 기록", systemImage: "mic.fill")
        case .accessoryCorner:
            Image(systemName: "mic.fill")
                .font(.title3)
                .widgetLabel("거기서")
        default: // accessoryCircular
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "mic.fill")
                    .font(.title2)
            }
        }
    }
}

struct GeoWatchComplication: Widget {
    let kind: String = "GeoWatchComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            GeoWatchComplicationEntryView(entry: entry)
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
