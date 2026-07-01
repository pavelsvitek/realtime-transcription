use std::mem;
use std::ptr::{null, NonNull};
use std::thread::JoinHandle;

use coreaudio::audio_unit::macos_helpers::{
    get_audio_device_ids, get_default_device_id, get_device_name, get_device_transport_type,
};
use objc2_core_audio::{
    kAudioDevicePropertyDataSource, kAudioHardwareNoError,
    kAudioHardwarePropertyDefaultInputDevice, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyScopeOutput,
    kAudioObjectSystemObject, kAudioDeviceTransportTypeBuiltIn, AudioDeviceID,
    AudioObjectAddPropertyListener, AudioObjectGetPropertyData, AudioObjectID,
    AudioObjectPropertyAddress, AudioObjectPropertyListenerProc,
};
use tauri::{AppHandle, Emitter};

use crate::audio_device::{classify_device, AudioDeviceInfo, Transport};
use crate::ipc::transcript::{event_names, AudioDevicePayload};

pub fn get_default_input_device() -> Result<AudioDeviceInfo, String> {
    let device_id = get_default_device_id(true)
        .ok_or_else(|| "No default input device available".to_string())?;
    query_input_device(device_id)
}

fn query_input_device(device_id: AudioDeviceID) -> Result<AudioDeviceInfo, String> {
    let name = get_input_device_name(device_id)?;
    let transport = get_device_transport_type(device_id)
        .map(Transport::from_raw)
        .unwrap_or(Transport::Unknown);
    let output_data_source = built_in_output_data_source();
    let kind = classify_device(&name, transport, output_data_source);

    Ok(AudioDeviceInfo {
        name,
        kind,
        transport: transport.as_str().to_string(),
    })
}

fn get_input_device_name(device_id: AudioDeviceID) -> Result<String, String> {
    get_device_name(device_id).map_err(|e| format!("Failed to read device name: {e}"))
}

fn built_in_output_data_source() -> Option<u32> {
    let device_id = find_built_in_output_device_id()?;
    get_output_data_source(device_id).ok()
}

fn find_built_in_output_device_id() -> Option<AudioDeviceID> {
    let device_ids = get_audio_device_ids().ok()?;
    device_ids.into_iter().find(|device_id| {
        get_device_transport_type(*device_id)
            .map(|transport| transport == kAudioDeviceTransportTypeBuiltIn)
            .unwrap_or(false)
            && device_has_output_scope(*device_id)
    })
}

fn device_has_output_scope(device_id: AudioDeviceID) -> bool {
    let property_address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyDataSource,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain,
    };

    let mut data_source: u32 = 0;
    let mut data_size = mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device_id,
            NonNull::from(&property_address),
            0,
            null(),
            NonNull::from(&mut data_size),
            NonNull::from(&mut data_source).cast(),
        )
    };
    status == kAudioHardwareNoError
}

fn get_output_data_source(device_id: AudioDeviceID) -> Result<u32, String> {
    let property_address = AudioObjectPropertyAddress {
        mSelector: kAudioDevicePropertyDataSource,
        mScope: kAudioObjectPropertyScopeOutput,
        mElement: kAudioObjectPropertyElementMain,
    };

    let mut data_source: u32 = 0;
    let mut data_size = mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device_id,
            NonNull::from(&property_address),
            0,
            null(),
            NonNull::from(&mut data_size),
            NonNull::from(&mut data_source).cast(),
        )
    };

    if status != kAudioHardwareNoError {
        return Err(format!("Failed to read output data source: status {status}"));
    }

    Ok(data_source)
}

pub fn emit_device_update(app_handle: &AppHandle) {
    match get_default_input_device() {
        Ok(device) => {
            if let Err(error) = app_handle.emit(event_names::DEVICE, AudioDevicePayload { device }) {
                tracing::warn!(%error, "Failed to emit audio device update");
            }
        }
        Err(error) => {
            tracing::warn!(%error, "Failed to query default input device");
        }
    }
}

struct MonitorState {
    app_handle: AppHandle,
    default_input_listener: AudioObjectPropertyListenerProc,
    built_in_output_listener: Option<AudioObjectPropertyListenerProc>,
    built_in_output_device_id: AudioDeviceID,
}

impl Drop for MonitorState {
    fn drop(&mut self) {
        let default_input_address = AudioObjectPropertyAddress {
            mSelector: kAudioHardwarePropertyDefaultInputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain,
        };

        unsafe {
            let _ = objc2_core_audio::AudioObjectRemovePropertyListener(
                kAudioObjectSystemObject as AudioObjectID,
                NonNull::from(&default_input_address),
                self.default_input_listener,
                self as *const _ as *mut _,
            );
        }

        if let (Some(listener), device_id) =
            (self.built_in_output_listener, self.built_in_output_device_id)
        {
            if device_id != 0 {
                let data_source_address = AudioObjectPropertyAddress {
                    mSelector: kAudioDevicePropertyDataSource,
                    mScope: kAudioObjectPropertyScopeOutput,
                    mElement: kAudioObjectPropertyElementMain,
                };
                unsafe {
                    let _ = objc2_core_audio::AudioObjectRemovePropertyListener(
                        device_id,
                        NonNull::from(&data_source_address),
                        listener,
                        self as *const _ as *mut _,
                    );
                }
            }
        }
    }
}

pub fn spawn_device_monitor(app_handle: AppHandle) -> JoinHandle<()> {
    std::thread::Builder::new()
        .name("audio-device-monitor".into())
        .spawn(move || run_device_monitor(app_handle))
        .expect("failed to spawn audio device monitor thread")
}

fn run_device_monitor(app_handle: AppHandle) {
    emit_device_update(&app_handle);

    let built_in_output_device_id = find_built_in_output_device_id().unwrap_or(0);
    let state = Box::leak(Box::new(MonitorState {
        app_handle,
        default_input_listener: default_input_listener_proc(),
        built_in_output_listener: if built_in_output_device_id != 0 {
            Some(built_in_output_listener_proc())
        } else {
            None
        },
        built_in_output_device_id,
    }));

    let default_input_address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyDefaultInputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };

    let status = unsafe {
        AudioObjectAddPropertyListener(
            kAudioObjectSystemObject as AudioObjectID,
            NonNull::from(&default_input_address),
            state.default_input_listener,
            state as *mut MonitorState as *mut _,
        )
    };

    if status != kAudioHardwareNoError {
        tracing::warn!(status, "Failed to register default input device listener");
    }

    if let (Some(listener), device_id) =
        (state.built_in_output_listener, state.built_in_output_device_id)
    {
        let data_source_address = AudioObjectPropertyAddress {
            mSelector: kAudioDevicePropertyDataSource,
            mScope: kAudioObjectPropertyScopeOutput,
            mElement: kAudioObjectPropertyElementMain,
        };
        let status = unsafe {
            AudioObjectAddPropertyListener(
                device_id,
                NonNull::from(&data_source_address),
                listener,
                state as *mut MonitorState as *mut _,
            )
        };
        if status != kAudioHardwareNoError {
            tracing::warn!(status, "Failed to register built-in output data source listener");
        }
    }

    // Core Audio delivers listener callbacks on this thread's run loop.
    loop {
        unsafe {
            core_foundation::runloop::CFRunLoopRun();
        }
    }
}

fn default_input_listener_proc() -> AudioObjectPropertyListenerProc {
    Some(device_change_listener)
}

fn built_in_output_listener_proc() -> AudioObjectPropertyListenerProc {
    Some(device_change_listener)
}

unsafe extern "C-unwind" fn device_change_listener(
    _object_id: AudioObjectID,
    _num_addresses: u32,
    _addresses: NonNull<AudioObjectPropertyAddress>,
    client_data: *mut std::ffi::c_void,
) -> i32 {
    let state = &*(client_data as *const MonitorState);
    emit_device_update(&state.app_handle);
    kAudioHardwareNoError
}
