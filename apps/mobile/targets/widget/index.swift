import WidgetKit
import SwiftUI

// MARK: - Shared data model
// The RN side writes a JSON snapshot into the App Group container
// every time the ledger changes. The widget reads it on each
// timeline refresh (iOS schedules those ~every 15 minutes).

private let appGroup = "group.app.se7a.mobile"

struct Snapshot {
    let kcalEaten: Int
    let kcalTarget: Int
    let streakDays: Int
    let updatedAt: Date

    static let empty = Snapshot(
        kcalEaten: 0,
        kcalTarget: 2000,
        streakDays: 0,
        updatedAt: Date()
    )
}

private func readSnapshot() -> Snapshot {
    guard let defaults = UserDefaults(suiteName: appGroup) else {
        return .empty
    }
    let kcalEaten = defaults.integer(forKey: "kcalEaten")
    let kcalTarget = max(1, defaults.integer(forKey: "kcalTarget"))
    let streakDays = defaults.integer(forKey: "streakDays")
    let updatedAtTs = defaults.double(forKey: "updatedAt")
    let updatedAt = updatedAtTs > 0 ? Date(timeIntervalSince1970: updatedAtTs) : Date()
    return Snapshot(
        kcalEaten: kcalEaten,
        kcalTarget: kcalTarget,
        streakDays: streakDays,
        updatedAt: updatedAt
    )
}

// MARK: - Timeline

struct SE7AEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SE7AEntry {
        SE7AEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (SE7AEntry) -> Void) {
        completion(SE7AEntry(date: Date(), snapshot: readSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SE7AEntry>) -> Void) {
        let entry = SE7AEntry(date: Date(), snapshot: readSnapshot())
        // Refresh in 15 minutes. iOS treats this as a budget hint and
        // may batch; that's fine — the user opening the app also
        // triggers an explicit WidgetCenter.reloadAllTimelines().
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - View

struct SE7AWidgetView: View {
    var entry: Provider.Entry

    private var kcalLeft: Int {
        max(0, entry.snapshot.kcalTarget - entry.snapshot.kcalEaten)
    }

    private var progress: Double {
        let t = Double(entry.snapshot.kcalTarget)
        let e = Double(entry.snapshot.kcalEaten)
        return t > 0 ? min(1.0, max(0.0, e / t)) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Text("SE7A")
                    .font(.system(size: 11, weight: .heavy, design: .default))
                    .foregroundColor(Color("$accent"))
                Spacer()
                HStack(spacing: 2) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 10))
                        .foregroundColor(Color("$accent"))
                    Text("\(entry.snapshot.streakDays)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.primary)
                }
            }

            Spacer(minLength: 0)

            Text("\(kcalLeft)")
                .font(.system(size: 36, weight: .heavy, design: .default))
                .foregroundColor(.primary)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text("kcal left")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)

            // Thin progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.secondary.opacity(0.25))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color("$accent"))
                        .frame(width: geo.size.width * CGFloat(progress), height: 4)
                }
            }
            .frame(height: 4)
        }
        .containerBackground(for: .widget) {
            Color("$widgetBackground")
        }
    }
}

// MARK: - Widget definition

@main
struct SE7AWidgetBundle: WidgetBundle {
    var body: some Widget {
        SE7AWidget()
    }
}

struct SE7AWidget: Widget {
    let kind: String = "SE7AWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            SE7AWidgetView(entry: entry)
        }
        .configurationDisplayName("SE7A")
        .description("Calories left + streak")
        .supportedFamilies([.systemMedium])
    }
}
