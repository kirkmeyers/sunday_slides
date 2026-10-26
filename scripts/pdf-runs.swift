// Prints a PDF's text as one JSON line per line of a font run:
// {"p": page, "f": font, "z": size, "x", "y": where the line starts (PDF points, y up), "s": text}.
// Runs are split at line breaks because a single run can continue into the
// other column. Used by niv84.js; macOS only (PDFKit).
import PDFKit

guard CommandLine.arguments.count > 1, let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else {
  FileHandle.standardError.write("usage: swift pdf-runs.swift <file.pdf>\n".data(using: .utf8)!)
  exit(1)
}
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i), let a = page.attributedString else { continue }
  let text = a.string as NSString
  a.enumerateAttribute(.font, in: NSRange(location: 0, length: a.length)) { value, range, _ in
    let font = value as? NSFont
    var start = range.location
    let end = range.location + range.length
    while start < end {
      // One line, including its line break
      var stop = start
      while stop < end && text.character(at: stop) != 10 { stop += 1 }
      if stop < end { stop += 1 }
      let line = NSRange(location: start, length: stop - start)
      let at = page.selection(for: NSRange(location: start, length: 1))?.bounds(for: page) ?? .zero
      let run: [String: Any] = [
        "p": i + 1,
        "f": font?.fontName ?? "",
        "z": Double(font?.pointSize ?? 0),
        "x": Double(at.minX.rounded()),
        "y": Double(at.minY.rounded()),
        "s": text.substring(with: line),
      ]
      let data = try! JSONSerialization.data(withJSONObject: run)
      print(String(data: data, encoding: .utf8)!)
      start = stop
    }
  }
}
