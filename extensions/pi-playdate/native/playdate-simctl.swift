import Darwin
import Foundation

struct CLIError: Error, CustomStringConvertible {
    let message: String
    var description: String { message }
}

enum Command {
    case inject(pid: Int32)
    case crankSet(pid: Int32, angle: Double, docked: Bool?)
    case crankDock(pid: Int32, docked: Bool)
    case accelSet(pid: Int32, x: Double, y: Double, z: Double)
    case menuOpen(pid: Int32)
}

do {
    let command = try parse(CommandLine.arguments)
    let output = try run(command)
    let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    exit(0)
} catch {
    FileHandle.standardError.write(("\(error)\n").data(using: .utf8)!)
    exit(1)
}

func parse(_ args: [String]) throws -> Command {
    guard args.count >= 2 else { throw CLIError(message: usage()) }
    let command = args[1]
    let options = try parseOptions(Array(args.dropFirst(2)))
    let pid = try intOption("pid", options)

    switch command {
    case "inject":
        return .inject(pid: pid)
    case "crank-set":
        return .crankSet(
            pid: pid,
            angle: try doubleOption("angle", options),
            docked: try boolOption("docked", options, required: false),
        )
    case "crank-dock":
        return .crankDock(pid: pid, docked: try boolOption("docked", options) ?? false)
    case "accel-set":
        return .accelSet(
            pid: pid,
            x: try doubleOption("x", options),
            y: try doubleOption("y", options),
            z: try doubleOption("z", options),
        )
    case "menu-open":
        return .menuOpen(pid: pid)
    default:
        throw CLIError(message: "Unknown command: \(command)\n\n\(usage())")
    }
}

func usage() -> String {
    """
    Usage:
      playdate-simctl inject --pid <pid>
      playdate-simctl crank-set --pid <pid> --angle <degrees> [--docked true|false]
      playdate-simctl crank-dock --pid <pid> --docked true|false
      playdate-simctl accel-set --pid <pid> --x <n> --y <n> --z <n>
      playdate-simctl menu-open --pid <pid>
    """
}

func parseOptions(_ args: [String]) throws -> [String: String] {
    var result: [String: String] = [:]
    var index = 0
    while index < args.count {
        let key = args[index]
        guard key.hasPrefix("--") else { throw CLIError(message: "Unexpected argument: \(key)") }
        guard index + 1 < args.count else { throw CLIError(message: "Missing value for \(key)") }
        result[String(key.dropFirst(2))] = args[index + 1]
        index += 2
    }
    return result
}

func stringOption(_ name: String, _ options: [String: String], required: Bool = true) throws -> String? {
    if let value = options[name] { return value }
    if required { throw CLIError(message: "Missing --\(name)") }
    return nil
}

func intOption(_ name: String, _ options: [String: String]) throws -> Int32 {
    guard let raw = try stringOption(name, options), let value = Int32(raw) else {
        throw CLIError(message: "Invalid --\(name)")
    }
    return value
}

func doubleOption(_ name: String, _ options: [String: String]) throws -> Double {
    guard let raw = try stringOption(name, options), let value = Double(raw) else {
        throw CLIError(message: "Invalid --\(name)")
    }
    return value
}

func boolOption(_ name: String, _ options: [String: String], required: Bool = true) throws -> Bool? {
    guard let raw = try stringOption(name, options, required: required) else { return nil }
    switch raw.lowercased() {
    case "1", "true", "yes": return true
    case "0", "false", "no": return false
    default: throw CLIError(message: "Invalid --\(name): \(raw)")
    }
}

func run(_ command: Command) throws -> [String: Any] {
    switch command {
    case let .inject(pid):
        try ensureAgentLoaded(pid: pid)
        return ["ok": true, "action": "inject", "pid": pid]
    case let .crankSet(pid, angle, docked):
        let response = try sendAgentCommand(pid: pid, command: crankSetCommand(angle: angle, docked: docked))
        return mergeBase(response: response, pid: pid)
    case let .crankDock(pid, docked):
        let response = try sendAgentCommand(pid: pid, command: ["action": "crankDock", "docked": docked])
        return mergeBase(response: response, pid: pid)
    case let .accelSet(pid, x, y, z):
        let response = try sendAgentCommand(pid: pid, command: ["action": "accelSet", "x": x, "y": y, "z": z])
        return mergeBase(response: response, pid: pid)
    case let .menuOpen(pid):
        let response = try sendAgentCommand(pid: pid, command: ["action": "menuOpen"])
        return mergeBase(response: response, pid: pid)
    }
}

func crankSetCommand(angle: Double, docked: Bool?) -> [String: Any] {
    var command: [String: Any] = ["action": "crankSet", "angle": angle]
    if let docked { command["docked"] = docked }
    return command
}

func mergeBase(response: [String: Any], pid: Int32) -> [String: Any] {
    var merged = response
    merged["pid"] = pid
    return merged
}

func ensureAgentLoaded(pid: Int32) throws {
    if isAgentReachable(pid: pid) { return }

    let dylibPath = try agentPath()
    let escaped = dylibPath.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
    let expr = "expr -l c -- (void*)dlopen(\"\(escaped)\", 2)"
    _ = try runProcess("/usr/bin/lldb", arguments: ["-b", "-o", "process attach --pid \(pid)", "-o", expr, "-o", "detach", "-o", "quit"])

    for _ in 0..<20 {
        if isAgentReachable(pid: pid) { return }
        Thread.sleep(forTimeInterval: 0.1)
    }

    throw CLIError(message: "Agent did not become reachable after injection")
}

func isAgentReachable(pid: Int32) -> Bool {
    do {
        _ = try sendSocketJSON(pid: pid, command: ["action": "ping"])
        return true
    } catch {
        return false
    }
}

func sendAgentCommand(pid: Int32, command: [String: Any]) throws -> [String: Any] {
    try ensureAgentLoaded(pid: pid)
    return try sendSocketJSON(pid: pid, command: command)
}

func sendSocketJSON(pid: Int32, command: [String: Any]) throws -> [String: Any] {
    let path = socketPath(pid: pid)
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw CLIError(message: "Failed to create socket") }
    defer { close(fd) }

    var addr = sockaddr_un()
    addr.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(path.utf8)
    guard pathBytes.count < MemoryLayout.size(ofValue: addr.sun_path) else {
        throw CLIError(message: "Socket path too long")
    }
    withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
        let raw = UnsafeMutableRawPointer(ptr).assumingMemoryBound(to: UInt8.self)
        for (index, byte) in pathBytes.enumerated() {
            raw[index] = byte
        }
        raw[pathBytes.count] = 0
    }

    let addrLen = socklen_t(MemoryLayout<sa_family_t>.size + pathBytes.count + 1)
    let connectResult = withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { ptr in
            connect(fd, ptr, addrLen)
        }
    }
    guard connectResult == 0 else {
        throw CLIError(message: "Failed to connect to agent socket at \(path)")
    }

    let data = try JSONSerialization.data(withJSONObject: command, options: []) + Data([0x0a])
    let writeResult = data.withUnsafeBytes { bytes in
        Darwin.write(fd, bytes.baseAddress, bytes.count)
    }
    guard writeResult == data.count else {
        throw CLIError(message: "Failed to write command to agent")
    }

    var buffer = [UInt8](repeating: 0, count: 4096)
    let readCount = Darwin.read(fd, &buffer, buffer.count)
    guard readCount > 0 else { throw CLIError(message: "Empty response from agent") }
    let responseData = Data(buffer.prefix(readCount))
    guard let text = String(data: responseData, encoding: .utf8), let line = text.split(separator: "\n").first else {
        throw CLIError(message: "Invalid response from agent")
    }
    guard let json = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any] else {
        throw CLIError(message: "Invalid JSON response from agent")
    }
    if let ok = json["ok"] as? Bool, ok == false {
        throw CLIError(message: json["error"] as? String ?? "Agent error")
    }
    return json
}

func socketPath(pid: Int32) -> String {
    "/tmp/pi-playdate-agent-\(pid).sock"
}

func agentPath() throws -> String {
    let url = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        .appendingPathComponent("bin")
        .appendingPathComponent("playdate-sim-agent.dylib")
    let path = url.path
    guard FileManager.default.fileExists(atPath: path) else {
        throw CLIError(message: "Agent dylib not found at \(path)")
    }
    return path
}

@discardableResult
func runProcess(_ executable: String, arguments: [String]) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments

    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr

    try process.run()
    process.waitUntilExit()

    let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
    let stderrData = stderr.fileHandleForReading.readDataToEndOfFile()
    let stdoutText = String(data: stdoutData, encoding: .utf8) ?? ""
    let stderrText = String(data: stderrData, encoding: .utf8) ?? ""

    guard process.terminationStatus == 0 else {
        let combined = [stdoutText, stderrText].filter { !$0.isEmpty }.joined(separator: "\n")
        throw CLIError(message: combined.isEmpty ? "Process failed: \(executable)" : combined)
    }

    return stdoutText
}
