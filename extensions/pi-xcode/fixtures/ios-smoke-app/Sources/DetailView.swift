import SwiftUI

struct DetailView: View {
  let title: String

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        Text(title)
          .font(.largeTitle.bold())
          .accessibilityIdentifier("detail-title")

        ForEach(1...20, id: \.self) { index in
          Text("Detail line \(index) for \(title)")
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 2)
        }
      }
      .padding()
    }
    .navigationTitle("Detail")
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("detail-scroll")
  }
}

#Preview {
  NavigationStack {
    DetailView(title: "Row 1")
  }
}
