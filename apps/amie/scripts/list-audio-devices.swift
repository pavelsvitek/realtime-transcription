import CoreAudio
import Foundation
func addr(_ s: AudioObjectPropertySelector, _ sc: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress { AudioObjectPropertyAddress(mSelector: s, mScope: sc, mElement: kAudioObjectPropertyElementMain) }
func str(_ id: AudioObjectID, _ s: AudioObjectPropertySelector) -> String { var a = addr(s); var v: Unmanaged<CFString>?; var sz = UInt32(MemoryLayout<Unmanaged<CFString>?>.size); let r = AudioObjectGetPropertyData(id,&a,0,nil,&sz,&v); return r==0 ? (v?.takeRetainedValue() as String? ?? "") : "err\(r)" }
func u32(_ id: AudioObjectID, _ s: AudioObjectPropertySelector, _ sc: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> UInt32? { var a = addr(s,sc); var v: UInt32 = 0; var sz = UInt32(4); return AudioObjectGetPropertyData(id,&a,0,nil,&sz,&v)==0 ? v : nil }
func fourcc(_ v: UInt32) -> String { String(bytes: [UInt8((v>>24)&255),UInt8((v>>16)&255),UInt8((v>>8)&255),UInt8(v&255)], encoding: .ascii) ?? "\(v)" }
func chans(_ id: AudioObjectID, _ sc: AudioObjectPropertyScope) -> Int { var a = addr(kAudioDevicePropertyStreamConfiguration, sc); var sz: UInt32 = 0; guard AudioObjectGetPropertyDataSize(id,&a,0,nil,&sz)==0 else {return -1}; let p = UnsafeMutableRawPointer.allocate(byteCount:Int(sz),alignment:16); defer{p.deallocate()}; AudioObjectGetPropertyData(id,&a,0,nil,&sz,p); let l = p.assumingMemoryBound(to: AudioBufferList.self); return UnsafeMutableAudioBufferListPointer(l).reduce(0){$0+Int($1.mNumberChannels)} }
func rate(_ id: AudioObjectID) -> Double { var a = addr(kAudioDevicePropertyNominalSampleRate); var v: Float64 = 0; var sz = UInt32(8); AudioObjectGetPropertyData(id,&a,0,nil,&sz,&v); return v }
func rates(_ id: AudioObjectID) -> String { var a = addr(kAudioDevicePropertyAvailableNominalSampleRates); var sz: UInt32 = 0; guard AudioObjectGetPropertyDataSize(id,&a,0,nil,&sz)==0 else {return "?"}; var arr = [AudioValueRange](repeating: AudioValueRange(), count: Int(sz)/MemoryLayout<AudioValueRange>.size); AudioObjectGetPropertyData(id,&a,0,nil,&sz,&arr); return arr.map{"\(Int($0.mMinimum))-\(Int($0.mMaximum))"}.joined(separator:",") }
func dflt(_ s: AudioObjectPropertySelector) -> AudioObjectID { var a = addr(s); var v: AudioObjectID = 0; var sz = UInt32(4); AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&a,0,nil,&sz,&v); return v }
var a = addr(kAudioHardwarePropertyDevices); var sz: UInt32 = 0
AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject),&a,0,nil,&sz)
var ids = [AudioObjectID](repeating: 0, count: Int(sz)/4)
AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject),&a,0,nil,&sz,&ids)
let dIn = dflt(kAudioHardwarePropertyDefaultInputDevice), dOut = dflt(kAudioHardwarePropertyDefaultOutputDevice), dSys = dflt(kAudioHardwarePropertyDefaultSystemOutputDevice)
print("default input=\(dIn) output=\(dOut) systemOutput=\(dSys)")
for id in ids {
  print("id=\(id) name=\(str(id,kAudioObjectPropertyName)) uid=\(str(id,kAudioDevicePropertyDeviceUID)) model=\(str(id,kAudioDevicePropertyModelUID))")
  print("   transport=\(fourcc(u32(id,kAudioDevicePropertyTransportType) ?? 0)) in=\(chans(id,kAudioObjectPropertyScopeInput)) out=\(chans(id,kAudioObjectPropertyScopeOutput)) rate=\(rate(id)) avail=\(rates(id))")
  print("   alive=\(u32(id,kAudioDevicePropertyDeviceIsAlive) ?? 99) running=\(u32(id,kAudioDevicePropertyDeviceIsRunning) ?? 99) runningSomewhere=\(u32(id,kAudioDevicePropertyDeviceIsRunningSomewhere) ?? 99) hidden=\(u32(id,kAudioDevicePropertyIsHidden) ?? 99)")
  print("   inLatency=\(u32(id,kAudioDevicePropertyLatency,kAudioObjectPropertyScopeInput) ?? 0) outLatency=\(u32(id,kAudioDevicePropertyLatency,kAudioObjectPropertyScopeOutput) ?? 0) isDefaultIn=\(id==dIn) isDefaultOut=\(id==dOut)")
}
