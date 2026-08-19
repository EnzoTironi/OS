fn dispatch(action_id: &str) -> &'static str {
    if action_id == "quality.releaseLot" {
        "quality"
    } else {
        "generic"
    }
}
