// hover.swift - dev only. Move the mouse over a point of the Civilization VII window, given as fractions of the
// window's width and height (0..1), so a capture can show a tooltip. Run: swift devtools/hover.swift 0.979 0.84
import CoreGraphics
import Foundation
let args = CommandLine.arguments
guard args.count >= 3, let fx = Double(args[1]), let fy = Double(args[2]) else { print("usage: hover.swift fx fy"); exit(1) }
let list = CGWindowListCopyWindowInfo(.optionOnScreenOnly, kCGNullWindowID) as! [[String: Any]]
for w in list {
  let owner = w[kCGWindowOwnerName as String] as? String ?? ""
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let wd = b["Width"] as? Double ?? 0, ht = b["Height"] as? Double ?? 0
  let x = b["X"] as? Double ?? 0, y = b["Y"] as? Double ?? 0
  if owner.contains("ivilization") && wd > 400 && ht > 600 && (w[kCGWindowLayer as String] as? Int ?? -1) == 0 {
    let p = CGPoint(x: x + wd * fx, y: y + ht * fy)
    for dx in [-6.0, -3.0, 0.0] {
      CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: p.x + dx, y: p.y), mouseButton: .left)?.post(tap: .cghidEventTap)
      usleep(120000)
    }
    print("hover at \(Int(p.x)),\(Int(p.y))")
    exit(0)
  }
}
print("no game window"); exit(1)
