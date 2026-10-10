//! Write `web/src/protocol/generated` and `fixtures/protocol`.

fn main() {
    if let Err(error) = skt_protocol::export() {
        eprintln!("export-protocol: {error}");
        std::process::exit(1);
    }
}
