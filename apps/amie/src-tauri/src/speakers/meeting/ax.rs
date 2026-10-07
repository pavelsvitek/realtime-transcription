//! Read one accessibility tree from a process.
//!
//! The application element is created on every call. Zoom rebuilds its
//! elements in place, and a cached `AXUIElement` then returns
//! `kAXErrorInvalidUIElement`.

use core_foundation::array::CFArray;
use core_foundation::base::{
    CFGetTypeID, CFRelease, CFRetain, CFType, CFTypeID, CFTypeRef, TCFType,
};
use core_foundation::boolean::CFBoolean;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
use std::ffi::c_void;

use crate::speakers::tree::AxNode;

const MAX_DEPTH: u32 = 40;
const AX_SUCCESS: i32 = 0;
const AX_INVALID_ELEMENT: i32 = -25202;
const AX_API_DISABLED: i32 = -25211;
const AX_VALUE_CGSIZE: u32 = 2;
const AX_VALUE_CGRECT: u32 = 3;
const WEB_VIEW: &str = "RenderWidgetHostViewCocoa";

#[repr(C)]
struct CgSize {
    width: f64,
    height: f64,
}

#[repr(C)]
struct CgPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
struct CgRect {
    origin: CgPoint,
    size: CgSize,
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
    fn AXUIElementPerformAction(element: CFTypeRef, action: CFStringRef) -> i32;
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
            read_node(app, 0, enable_electron)
        })();
        CFRelease(app);
        result
    }
}

/// Press the first node whose Chromium `AXDOMIdentifier` equals `want`.
pub fn press_dom_id(pid: i32, want: &str) -> Result<bool, String> {
    press_first(pid, |element| {
        Ok(copy_string(element, "AXDOMIdentifier")?.as_deref() == Some(want))
    })
}

/// Press the first node whose accessibility title equals `want`.
pub fn press_titled(pid: i32, want: &str) -> Result<bool, String> {
    press_first(pid, |element| {
        Ok(copy_string(element, "AXTitle")?.as_deref() == Some(want))
    })
}

fn press_first(
    pid: i32,
    matches: impl Fn(CFTypeRef) -> Result<bool, String>,
) -> Result<bool, String> {
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            return Err(format!("Could not open accessibility tree for pid {pid}"));
        }
        let found = find_first(app, 0, &matches);
        let pressed = match found {
            Ok(Some(element)) => {
                let action = CFString::new("AXPress");
                let err = AXUIElementPerformAction(element, action.as_concrete_TypeRef());
                CFRelease(element);
                require_access(err)?;
                err == AX_SUCCESS
            }
            Ok(None) => false,
            Err(error) => {
                CFRelease(app);
                return Err(error);
            }
        };
        CFRelease(app);
        Ok(pressed)
    }
}

fn find_first(
    element: CFTypeRef,
    depth: u32,
    matches: &impl Fn(CFTypeRef) -> Result<bool, String>,
) -> Result<Option<CFTypeRef>, String> {
    if depth > MAX_DEPTH {
        return Ok(None);
    }
    if matches(element)? {
        unsafe { CFRetain(element) };
        return Ok(Some(element));
    }
    if let Some(children) = copy_children(element)? {
        for child in &children {
            let ptr = *child as CFTypeRef;
            if ptr.is_null() {
                continue;
            }
            if let Some(found) = find_first(ptr, depth + 1, matches)? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
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

/// `AXURL` is a `CFURL`, not a string.
fn copy_url(element: CFTypeRef) -> Result<Option<String>, String> {
    let Some(value) = copy_attribute(element, "AXURL")? else {
        return Ok(None);
    };
    Ok(value
        .downcast_into::<CFURL>()
        .map(|url| url.get_string().to_string()))
}

fn copy_size(element: CFTypeRef) -> Result<(f64, f64), String> {
    if let Some((width, height)) = read_cgsize(element, "AXSize")? {
        if width > 0.0 || height > 0.0 {
            return Ok((width, height));
        }
    }
    if let Some((width, height)) = read_cgrect(element, "AXFrame")? {
        return Ok((width, height));
    }
    Ok((0.0, 0.0))
}

fn read_cgsize(element: CFTypeRef, name: &str) -> Result<Option<(f64, f64)>, String> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(None);
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
        Ok(Some((size.width, size.height)))
    } else {
        Ok(None)
    }
}

fn read_cgrect(element: CFTypeRef, name: &str) -> Result<Option<(f64, f64)>, String> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(None);
    };
    let mut rect = CgRect {
        origin: CgPoint { x: 0.0, y: 0.0 },
        size: CgSize {
            width: 0.0,
            height: 0.0,
        },
    };
    let raw = value.as_CFTypeRef();
    let ok = unsafe {
        CFGetTypeID(raw) == AXValueGetTypeID()
            && AXValueGetType(raw) == AX_VALUE_CGRECT
            && AXValueGetValue(
                raw,
                AX_VALUE_CGRECT,
                &mut rect as *mut CgRect as *mut c_void,
            ) != 0
    };
    if ok {
        Ok(Some((rect.size.width, rect.size.height)))
    } else {
        Ok(None)
    }
}

fn wants_electron_accessibility(node: &AxNode) -> bool {
    node.role == "AXWindow"
        || node.role == "AXApplication"
        || node.role.contains(WEB_VIEW)
        || node
            .title
            .as_deref()
            .is_some_and(|title| title.contains(WEB_VIEW))
        || node
            .description
            .as_deref()
            .is_some_and(|description| description.contains(WEB_VIEW))
}

fn copy_children(element: CFTypeRef) -> Result<Option<CFArray>, String> {
    let Some(value) = copy_attribute(element, "AXChildren")? else {
        return Ok(None);
    };
    Ok(value.downcast_into::<CFArray>())
}

fn copy_string_array(element: CFTypeRef, name: &str) -> Result<Vec<String>, String> {
    let Some(value) = copy_attribute(element, name)? else {
        return Ok(Vec::new());
    };
    let Some(array) = value.downcast_into::<CFArray>() else {
        return Ok(Vec::new());
    };
    let mut out = Vec::new();
    for item in &array {
        let ptr = *item as CFTypeRef;
        if ptr.is_null() {
            continue;
        }
        let wrapped = unsafe { CFType::wrap_under_get_rule(ptr) };
        if let Some(text) = wrapped.downcast_into::<CFString>() {
            out.push(text.to_string());
        }
    }
    Ok(out)
}

fn read_node(element: CFTypeRef, depth: u32, enable_electron: bool) -> Result<AxNode, String> {
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
    if let Some(dom_id) = copy_string(element, "AXDOMIdentifier")? {
        node = node.id(dom_id);
    }
    if node.role == "AXWebArea" {
        if let Some(url) = copy_url(element)? {
            node = node.at_url(url);
        }
    }
    let classes = copy_string_array(element, "AXDOMClassList")?;
    if !classes.is_empty() {
        node = node.classes(classes);
    }
    let (width, height) = copy_size(element)?;
    node = node.frame(width, height);
    if enable_electron && wants_electron_accessibility(&node) {
        // Teams keeps the web view closed until this is set on the window,
        // not only on the application element. Children may appear next poll.
        let _ = set_bool(element, "AXManualAccessibility");
        let _ = set_bool(element, "AXEnhancedUserInterface");
    }

    // The children array owns each element. Walk them before it is released.
    if let Some(children) = copy_children(element)? {
        for child in &children {
            let ptr = *child as CFTypeRef;
            if ptr.is_null() {
                continue;
            }
            node.children
                .push(read_node(ptr, depth + 1, enable_electron)?);
        }
    }
    Ok(node)
}
