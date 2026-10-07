/// One node of an accessibility tree.
///
/// Production fills this from `AXUIElement`. Tests build it directly.
/// Chromium / WebView2 also expose `AXDOMIdentifier` and `AXDOMClassList`.
#[derive(Debug, Clone, PartialEq)]
pub struct AxNode {
    pub role: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub value: Option<String>,
    pub dom_id: Option<String>,
    /// Page address of an `AXWebArea`.
    pub url: Option<String>,
    pub classes: Vec<String>,
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
            dom_id: None,
            url: None,
            classes: Vec::new(),
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

    pub fn id(mut self, dom_id: impl Into<String>) -> Self {
        self.dom_id = Some(dom_id.into());
        self
    }

    pub fn at_url(mut self, url: impl Into<String>) -> Self {
        self.url = Some(url.into());
        self
    }

    pub fn classes<I, S>(mut self, classes: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.classes = classes.into_iter().map(Into::into).collect();
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

    /// One indented line per node, for reading a live tree while debugging a
    /// meeting app. Values are cut short so chat text cannot flood the dump.
    pub fn dump(&self) -> String {
        let mut out = String::new();
        self.dump_into(0, &mut out);
        out
    }

    fn dump_into(&self, depth: usize, out: &mut String) {
        out.push_str(&"  ".repeat(depth));
        out.push_str(&self.role);
        if let Some(title) = &self.title {
            out.push_str(&format!(" title={title:?}"));
        }
        if let Some(description) = &self.description {
            out.push_str(&format!(" desc={description:?}"));
        }
        if let Some(value) = &self.value {
            let short: String = value.chars().take(120).collect();
            out.push_str(&format!(" value={short:?}"));
        }
        if let Some(dom_id) = &self.dom_id {
            out.push_str(&format!(" id={dom_id}"));
        }
        if let Some(url) = &self.url {
            out.push_str(&format!(" url={url}"));
        }
        if !self.classes.is_empty() {
            out.push_str(&format!(" class={}", self.classes.join(".")));
        }
        out.push_str(&format!(" size={}x{}\n", self.width, self.height));
        for child in &self.children {
            child.dump_into(depth + 1, out);
        }
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
