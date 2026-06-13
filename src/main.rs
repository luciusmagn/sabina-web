#[macro_use]
extern crate rocket;

use rocket::fs::{relative, FileServer};
use rocket_dyn_templates::{context, Template};
use std::fs;

/// The homepage is rendered from `content.json` (project root). The file is
/// read on every request, so editing the copy and refreshing the page is
/// enough to see changes — no rebuild or restart needed.
#[get("/")]
fn index() -> Result<Template, String> {
    let raw = fs::read_to_string(relative!("content.json"))
        .map_err(|e| format!("Could not read content.json: {e}"))?;
    let content: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("content.json has a formatting error — {e}"))?;
    Ok(Template::render("index", context! { content: content }))
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount("/", routes![index])
        .mount("/", FileServer::from(relative!("static")))
        .attach(Template::fairing())
}
