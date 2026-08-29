import WidgetKit
import SwiftUI

// MARK: - Data model

struct SE7AStatus: Codable {
    let displayName: String?
    let target: Int?
    let eaten: Range
    let remaining: Range

    struct Range: Codable {
        let low: Int
        let high: Int
    }

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case target
        case eaten
        case remaining
    }
}

// MARK: - Timeline entry

struct SE7AEntry: TimelineEntry {
    let date: Date
    let status: SE7AStatus?
    let error: String?
}

// MARK: - Shared config

enum Shared {
    static let appGroup = "group.app.se7a.mobile"
    static let tokenKey = "widget_token"
    static let baseURL = "https://se7a.vercel.app"
}

func loadToken() -> String? {
    let defaults = UserDefaults(suiteName: Shared.appGroup)
    return defaults?.string(forKey: Shared.tokenKey)
}

// MARK: - Provider

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SE7AEntry {
        SE7AEntry(
            date: Date(),
            status: SE7AStatus(
                displayName: nil,
                target: 2000,
                eaten: .init(low: 800, high: 900),
                remaining: .init(low: 1100, high: 1200)
            ),
            error: nil
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (SE7AEntry) -> ()) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SE7AEntry>) -> ()) {
        let refreshAt = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)

        guard let token = loadToken(), !token.isEmpty else {
            let entry = SE7AEntry(date: Date(), status: nil, error: "Open SE7A to sync")
            completion(Timeline(entries: [entry], policy: .after(refreshAt)))
            return
        }

        let urlStr = "\(Shared.baseURL)/api/widget/status?token=\(token)"
        guard let url = URL(string: urlStr) else {
            let entry = SE7AEntry(date: Date(), status: nil, error: "Bad URL")
            completion(Timeline(entries: [entry], policy: .after(refreshAt)))
            return
        }

        var req = URLRequest(url: url)
        req.timeoutInterval = 10
        URLSession.shared.dataTask(with: req) { data, _, err in
            var entry: SE7AEntry
            if let data = data,
               let status = try? JSONDecoder().decode(SE7AStatus.self, from: data) {
                entry = SE7AEntry(date: Date(), status: status, error: nil)
            } else {
                entry = SE7AEntry(date: Date(), status: nil, error: err?.localizedDescription ?? "No data")
            }
            completion(Timeline(entries: [entry], policy: .after(refreshAt)))
        }.resume()
    }
}

// MARK: - View

struct SE7AWidgetEntryView: View {
    let entry: SE7AEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Wordmark: single kerned Text, no scattered letters.
            Text("SE7A")
                .font(.system(size: 11, weight: .heavy))
                .kerning(2.4)
                .foregroundColor(Color("AccentColor"))

            // Thin editorial rule under the wordmark.
            Rectangle()
                .fill(Color("AccentColor"))
                .frame(width: 24, height: 1)
                .padding(.top, 8)

            Spacer(minLength: 8)

            if let s = entry.status {
                Text("REMAINING")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.gray)
                    .kerning(1.6)

                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("\(s.remaining.low)")
                        .font(.system(size: 30, weight: .heavy, design: .default))
                        .foregroundColor(Color.primary)
                    Text("–")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.gray)
                    Text("\(s.remaining.high)")
                        .font(.system(size: 30, weight: .heavy, design: .default))
                        .foregroundColor(Color.primary)
                }
                .padding(.top, 4)

                Text("KCAL · TARGET \(s.target ?? 0)")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundColor(.gray)
                    .kerning(1.2)
                    .padding(.top, 4)
            } else {
                Text(entry.error ?? "Loading…")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundColor(.gray)
                    .kerning(0.6)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .containerBackground(for: .widget) {
            Color("WidgetBackground")
        }
    }
}

// MARK: - Widget

@main
struct SE7AWidget: Widget {
    let kind: String = "SE7AWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            SE7AWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("SE7A · Remaining today")
        .description("How many calories you have left today.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
