#!/usr/bin/env swift
// PolyBlue macOS CoreAudio Multi-Output Aggregate Device Helper
// Creates or updates an Aggregate Multi-Output Device across connected Bluetooth
// headphones and speakers with hardware drift compensation enabled.

import CoreAudio
import Foundation

struct SyncPayload: Decodable {
    let devices: [String]
    let delaysMs: [String: Double]?
}

func getAudioDevices() -> [(AudioDeviceID, String, String)] {
    var propAddress = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var dataSize: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize) == noErr else {
        return []
    }
    let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var ids = [AudioDeviceID](repeating: 0, count: count)
    guard AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &propAddress, 0, nil, &dataSize, &ids) == noErr else {
        return []
    }

    var results: [(AudioDeviceID, String, String)] = []
    for devId in ids {
        var nameRef: CFString = "" as CFString
        var nameSize = UInt32(MemoryLayout<CFString>.size)
        var nameAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectGetPropertyData(devId, &nameAddr, 0, nil, &nameSize, &nameRef)

        var uidRef: CFString = "" as CFString
        var uidSize = UInt32(MemoryLayout<CFString>.size)
        var uidAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceUID,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        AudioObjectGetPropertyData(devId, &uidAddr, 0, nil, &uidSize, &uidRef)

        results.append((devId, nameRef as String, uidRef as String))
    }
    return results
}

guard CommandLine.arguments.count >= 2,
      let data = CommandLine.arguments[1].data(using: .utf8),
      let payload = try? JSONDecoder().decode(SyncPayload.self, from: data) else {
    fputs("Usage: swift macos-coreaudio-sync.swift '{\"devices\":[\"AirPods Pro 2\",\"Sony WH-1000XM5\"]}'\n", stderr)
    exit(1)
}

let allDevices = getAudioDevices()
let matched = allDevices.filter { (_, name, _) in
    payload.devices.contains { target in name.localizedCaseInsensitiveContains(target) }
}

guard matched.count >= 2 else {
    print("{\"created\":false,\"reason\":\"fewer_than_two_audio_endpoints\",\"matched\":\(matched.count)}")
    exit(0)
}

let subDevices: [[String: Any]] = matched.enumerated().map { (idx, entry) in
    [
        kAudioSubDeviceUIDKey as String: entry.2,
        kAudioSubDeviceDriftCompensationKey as String: idx == 0 ? 0 : 1
    ]
}

let aggregateDesc: [String: Any] = [
    kAudioAggregateDeviceNameKey as String: "PolyBlue Multi-Output",
    kAudioAggregateDeviceUIDKey as String: "org.polyblue.aggregate.multi-output",
    kAudioAggregateDeviceIsStackedKey as String: 1,
    kAudioAggregateDeviceMasterSubDeviceKey as String: matched[0].2,
    kAudioAggregateDeviceSubDeviceListKey as String: subDevices
]

var aggregateId: AudioDeviceID = 0
let status = AudioHardwareCreateAggregateDevice(aggregateDesc as CFDictionary, &aggregateId)

if status == noErr {
    print("{\"created\":true,\"aggregateId\":\(aggregateId),\"subDevices\":\(matched.count)}")
} else {
    fputs("CoreAudio aggregate creation returned status \(status)\n", stderr)
    exit(Int32(status))
}
