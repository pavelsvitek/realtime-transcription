//! Core Audio process tap on one output device, plus the private aggregate
//! device that exposes it as an input.
//!
//! cpal has its own loopback, but it only taps an output when the device has
//! no input streams. USB headsets and conferencing speakerphones (IER-EX15C,
//! Logitech MeetUp) have both, so cpal opened their *microphone* instead and
//! "system audio" came back as near-silence. This builds the tap ourselves so
//! any output works; the aggregate is then opened as a plain cpal input.

use std::ffi::{c_void, CStr};
use std::mem::MaybeUninit;
use std::ptr::NonNull;

use cpal::traits::{DeviceTrait, HostTrait};
use objc2::{rc::Retained, AnyThread};
use objc2_core_audio::{
    kAudioAggregateDeviceNameKey, kAudioAggregateDeviceTapAutoStartKey,
    kAudioAggregateDeviceTapListKey, kAudioAggregateDeviceUIDKey,
    kAudioEndPointDeviceIsPrivateKey, kAudioSubTapDriftCompensationKey, kAudioSubTapUIDKey,
    AudioHardwareCreateAggregateDevice, AudioHardwareCreateProcessTap,
    AudioHardwareDestroyAggregateDevice, AudioHardwareDestroyProcessTap, AudioObjectID,
    CATapDescription, CATapMuteBehavior,
};
use objc2_core_foundation::{
    kCFAllocatorDefault, kCFTypeArrayCallBacks, kCFTypeDictionaryKeyCallBacks,
    kCFTypeDictionaryValueCallBacks, CFArray, CFDictionary, CFMutableDictionary, CFRetained,
    CFString, CFStringCreateWithCString,
};
use objc2_foundation::{NSArray, NSNumber, NSString};

/// Owns the tap and its aggregate device; both are destroyed on drop.
/// Drop the cpal stream that reads the aggregate *before* this.
pub struct OutputTap {
    tap_id: AudioObjectID,
    aggregate_id: AudioObjectID,
    aggregate_uid: String,
}

impl OutputTap {
    /// `output_uid` is the Core Audio UID of the output device to tap.
    pub fn new(output_uid: &str) -> anyhow::Result<Self> {
        let processes = NSArray::new();
        let uid = NSString::from_str(output_uid);
        let tap_desc = unsafe {
            CATapDescription::initWithProcesses_andDeviceUID_withStream(
                CATapDescription::alloc(),
                &processes,
                &uid,
                0,
            )
        };
        let tap_name = NSString::from_str("Amie system audio");
        unsafe {
            // Captured audio still reaches the headphones.
            tap_desc.setMuteBehavior(CATapMuteBehavior::Unmuted);
            tap_desc.setName(&tap_name);
            tap_desc.setPrivate(true);
            // Empty process list + exclusive = every process.
            tap_desc.setExclusive(true);
        }

        let mut tap_id = MaybeUninit::<AudioObjectID>::uninit();
        let status = unsafe {
            AudioHardwareCreateProcessTap(Some(tap_desc.as_ref()), tap_id.as_mut_ptr())
        };
        anyhow::ensure!(
            status == 0,
            "Could not tap {output_uid}: Core Audio status {status} \
             (is System Audio Recording allowed for Amie?)"
        );
        let tap_id = unsafe { tap_id.assume_init() };
        let tap_uid = unsafe { tap_desc.UUID().UUIDString() };

        let aggregate_uid = format!("com.amie.SystemAudioTap.{}", uuid::Uuid::new_v4());
        let properties = aggregate_properties(tap_uid, &aggregate_uid);
        let mut aggregate_id: AudioObjectID = 0;
        let status = unsafe {
            AudioHardwareCreateAggregateDevice(
                properties.as_ref(),
                NonNull::from(&mut aggregate_id),
            )
        };
        if status != 0 {
            unsafe {
                let _ = AudioHardwareDestroyProcessTap(tap_id);
            }
            anyhow::bail!("Could not create the system audio aggregate device: status {status}");
        }

        Ok(Self {
            tap_id,
            aggregate_id,
            aggregate_uid,
        })
    }

    /// The aggregate as a cpal input device. A process's private aggregate is
    /// visible to that process, so it shows up in cpal's device list.
    pub fn input_device(&self) -> anyhow::Result<cpal::Device> {
        let wanted = format!("coreaudio:{}", self.aggregate_uid);
        let host = cpal::default_host();
        for _ in 0..20 {
            if let Some(device) = host
                .devices()?
                .find(|d| d.id().ok().map(|id| id.to_string()).as_deref() == Some(wanted.as_str()))
            {
                return Ok(device);
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        anyhow::bail!("System audio aggregate device ({}) did not appear", self.aggregate_id)
    }
}

impl Drop for OutputTap {
    fn drop(&mut self) {
        unsafe {
            let _ = AudioHardwareDestroyAggregateDevice(self.aggregate_id);
            let _ = AudioHardwareDestroyProcessTap(self.tap_id);
        }
    }
}

fn to_cfstring(cstr: &'static CStr) -> CFRetained<CFString> {
    unsafe { CFStringCreateWithCString(kCFAllocatorDefault, cstr.as_ptr(), 0x08000100) }.unwrap()
}

fn aggregate_properties(tap_uid: Retained<NSString>, aggregate_uid: &str) -> CFRetained<CFDictionary> {
    let tap_entry = unsafe {
        let dict = CFMutableDictionary::new(
            kCFAllocatorDefault,
            2,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
        .unwrap();
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioSubTapUIDKey) as *const _ as *const c_void,
            &*tap_uid as *const _ as *const c_void,
        );
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioSubTapDriftCompensationKey) as *const _ as *const c_void,
            &*NSNumber::initWithBool(NSNumber::alloc(), true) as *const _ as *const c_void,
        );
        dict
    };
    let entries = [tap_entry];
    let taps = unsafe {
        CFArray::new(
            kCFAllocatorDefault,
            entries.as_ptr() as *mut *const c_void,
            entries.len() as _,
            &kCFTypeArrayCallBacks,
        )
        .unwrap()
    };
    unsafe {
        let dict = CFMutableDictionary::new(
            kCFAllocatorDefault,
            5,
            &kCFTypeDictionaryKeyCallBacks,
            &kCFTypeDictionaryValueCallBacks,
        )
        .unwrap();
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioAggregateDeviceNameKey) as *const _ as *const c_void,
            &*CFString::from_str("Amie system audio tap") as *const _ as *const c_void,
        );
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioAggregateDeviceUIDKey) as *const _ as *const c_void,
            &*CFString::from_str(aggregate_uid) as *const _ as *const c_void,
        );
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioAggregateDeviceTapListKey) as *const _ as *const c_void,
            &*taps as *const _ as *const c_void,
        );
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioAggregateDeviceTapAutoStartKey) as *const _ as *const c_void,
            &*NSNumber::initWithBool(NSNumber::alloc(), false) as *const _ as *const c_void,
        );
        CFMutableDictionary::set_value(
            Some(dict.as_ref()),
            &*to_cfstring(kAudioEndPointDeviceIsPrivateKey) as *const _ as *const c_void,
            &*NSNumber::initWithBool(NSNumber::alloc(), true) as *const _ as *const c_void,
        );
        CFRetained::cast_unchecked::<CFDictionary>(dict)
    }
}
