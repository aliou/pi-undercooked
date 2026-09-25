import SwiftUI

struct RootView: View {
  @State private var showLongPressHint = false
  @State private var searchText = ""

  private let items = (1...50).map { "Row \($0)" }

  private var filteredItems: [String] {
    if searchText.isEmpty { return items }
    return items.filter { $0.localizedCaseInsensitiveContains(searchText) }
  }

  var body: some View {
    NavigationStack {
      List(filteredItems, id: \.self) { item in
        NavigationLink(value: item) {
          Text(item)
            .accessibilityIdentifier("row-\(item.replacingOccurrences(of: " ", with: "-"))")
        }
      }
      .accessibilityIdentifier("main-list")
      .navigationTitle("Smoke List")
      .navigationBarTitleDisplayMode(.inline)
      .navigationDestination(for: String.self) { item in
        DetailView(title: item)
      }
      .searchable(text: $searchText, prompt: "Search rows")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Add") {}
            .accessibilityIdentifier("add-button")
        }
      }
      .overlay(alignment: .bottom) {
        if showLongPressHint {
          Text("Long press detected")
            .font(.headline)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.thinMaterial)
            .clipShape(Capsule())
            .padding(.bottom, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityIdentifier("long-press-hint")
        }
      }
      .simultaneousGesture(
        LongPressGesture(minimumDuration: 1.0)
          .onEnded { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
              showLongPressHint = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
              withAnimation(.easeInOut(duration: 0.2)) {
                showLongPressHint = false
              }
            }
          }
      )
    }
  }
}

#Preview {
  RootView()
}
