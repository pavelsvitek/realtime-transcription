//! Read one accessibility tree from a process.
//!
//! The application element is created on every call. Zoom rebuilds its
//! elements in place, and a cached `AXUIElement` then returns
//! `kAXErrorInvalidUIElement`.

use core_foundation::array::CFArray;
use core_foundation::base::{CFGetTypeID, CFRelease, CFType, CFTypeID, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;

use crate::speakers::tree::AxNode;

const MAX_DEPTH: u32 = 40;
const AX_SUCCESS: i32 = 0;
const AX_INVALID_ELEMENT: i32 = -25202;
const AX_API_DISABLED: i32 = -25211;
const AX_VALUE_CGSIZE: u32 = 2;

#[repr(C)]
struct CgSize {
    width: f64,
    height: f64,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(
        element: CFTypeRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: CFTypeRef,
        attribute: CFStringRef,
        value: CFTypeRef,
    ) -> i32;
    fn AXValueGetType(value: CFTypeRef) -> u32;
    fn AXValueGetValue(value: CFTypeRef, value_type: u32, out: *mut c_void) -> u8;
    fn AXValueGetTypeID() -> CFTypeID;
}

/// Snapshot the accessibility tree of `pid`.
///
/// When `enable_electron` is set, `AXManualAccessibility` and
/// `AXEnhancedUserInterface` are turned on first. Teams stays a single
/// `RenderWidgetHostViewCocoa` until one of those flags is set.
pub fn application_tree(pid: i32, enable_electron: bool) -> Result<AxNode, String> {
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            return Err(format!("Could not open accessibility tree for pid {pid}"));
        }
        let result = (|| {
            if enable_electron {
                require_access(set_bool(app, "AXManualAccessibility"))?;
                require_access(set_bool(app, "AXEnhancedUserInterface"))?;
            }
            read_node(app, 0)
        })();
        CFRelease(app);
        result
    }
}

fn set_bool(element: CFTypeRef, name: &str) -> i32 {
    let attribute = CFString::new(name);
    let value = CFBoolean::true_value();
    unsafe {
        AXUIElementSetAttributeValue(
            element,
            attribute.as_concrete_TypeRef(),
            value.as_CFTypeRef(),
        )
    }
}

/// `kAXErrorAPIDisabled` and a stale element fail the poll. Other codes mean
/// the attribute is absent on this node.
fn require_access(err: i32) -> Result<(), String> {
    if err == AX_API_DISABLED {
        return Err("Accessibility permission is off".into());
    }
    if err == AX_INVALID_ELEMENT {
        return Err("Accessibility element is stale".into());
    }
    Ok(())
}

fn copy_attribute(element: CFTypeRef, name: &str) -> Result<Option<CFType>, String> {
    let attribute = CFString::new(name);
    let mut raw: CFTypeRef = std::ptr::null();
    let err = unsafe {
        AXUIElementCopyAttributeValue(element, attribute.as_concrete_TypeRef(), &mut raw)
    };
    if err == AX_SUCCESS && !raw.is_null() {
        return Ok(Some(unsafe { CFType::wrap_under_create_rule(raw) }));
    }
    if !raw.is_null() {
        unsafe { CFRelease(raw) };
    }
    require_access(err)?;
    Ok(None)
}

fn copy_string(element: CFTypeRef, name: &str) -> Result<Option<String>, String> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(None);
    };
    Ok(value
        .downcast_into::<CFString>()
        .map(|text| text.to_string()))
}

fn copy_size(element: CFTypeRef) -> Result<(f64, f64), String> {
    let Some(value) = copy_attribute(element, "AXSize")? else {
        return Ok((0.0, 0.0));
    };
    let mut size = CgSize {
        width: 0.0,
        height: 0.0,
    };
    let raw = value.as_CFTypeRef();
    let ok = unsafe {
        CFGetTypeID(raw) == AXValueGetTypeID()
            && AXValueGetType(raw) == AX_VALUE_CGSIZE
            && AXValueGetValue(
                raw,
                AX_VALUE_CGSIZE,
                &mut size as *mut CgSize as *mut c_void,
            ) != 0
    };
    if ok {
        Ok((size.width, size.height))
    } else {
        Ok((0.0, 0.0))
    }
}

fn copy_children(element: CFTypeRef) -> Result<Option<CFArray>, String> {
    let Some(value) = copy_attribute(element, "AXChildren")? else {
        return Ok(None);
    };
    Ok(value.downcast_into::<CFArray>())
}

fn read_node(element: CFTypeRef, depth: u32) -> Result<AxNode, String> {
    if depth > MAX_DEPTH {
        return Ok(AxNode::new("AXGroup"));
    }
    let role = copy_string(element, "AXRole")?.unwrap_or_else(|| "AXGroup".into());
    let mut node = AxNode::new(role);
    if let Some(title) = copy_string(element, "AXTitle")? {
        node = node.titled(title);
    }
    if let Some(description) = copy_string(element, "AXDescription")? {
        node = node.described(description);
    }
    if let Some(value) = copy_string(element, "AXValue")? {
        node = node.valued(value);
    }
    let (width, height) = copy_size(element)?;
    node = node.frame(width, height);

    // The children array owns each element. Walk them before it is released.
    if let Some(children) = copy_children(element)? {
        for child in &children {
            let ptr = *child as CFTypeRef;
            if ptr.is_null() {
                continue;
            }
            node.children.push(read_node(ptr, depth + 1)?);
        }
    }
    Ok(node)
}
