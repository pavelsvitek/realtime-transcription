/// One node of an accessibility tree.
///
/// Production fills this from `AXUIElement`. Tests build it directly. Class
/// names and `data-*` attributes are not here, because the accessibility API
/// does not return them.
#[derive(Debug, Clone, PartialEq)]
pub struct AxNode {
    pub role: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub value: Option<String>,
    pub width: f64,
    pub height: f64,
    pub children: Vec<AxNode>,
}

impl AxNode {
    pub fn new(role: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            title: None,
            description: None,
            value: None,
            width: 0.0,
            height: 0.0,
            children: Vec::new(),
        }
    }

    pub fn titled(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn described(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn valued(mut self, value: impl Into<String>) -> Self {
        self.value = Some(value.into());
        self
    }

    pub fn frame(mut self, width: f64, height: f64) -> Self {
        self.width = width;
        self.height = height;
        self
    }

    pub fn child(mut self, child: AxNode) -> Self {
        self.children.push(child);
        self
    }

    pub fn has_tile_frame(&self) -> bool {
        self.width > 10.0 && self.height > 10.0
    }
}

/// Title, then description, then the first descendant static-text value.
pub fn accessible_name(node: &AxNode) -> Option<String> {
    if let Some(title) = nonempty(node.title.as_deref()) {
        return Some(title.to_string());
    }
    if let Some(description) = nonempty(node.description.as_deref()) {
        return Some(description.to_string());
    }
    first_static_text(node)
}

fn first_static_text(node: &AxNode) -> Option<String> {
    for child in &node.children {
        if child.role == "AXStaticText" {
            if let Some(value) = nonempty(child.value.as_deref()) {
                return Some(value.to_string());
            }
        }
        if let Some(found) = first_static_text(child) {
            return Some(found);
        }
    }
    None
}

fn nonempty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|text| !text.is_empty())
}
