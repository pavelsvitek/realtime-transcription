//! Local stdio MCP server. stdout is the protocol; logs go to stderr.

fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("amie_lib=info")),
        )
        .init();

    if let Err(err) = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime")
        .block_on(amie_lib::mcp::run())
    {
        eprintln!("amie_mcp: {err}");
        std::process::exit(1);
    }
}
