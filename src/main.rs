#[macro_use]
extern crate rocket;

use rocket::fs::{relative, FileServer};
use rocket::http::{ContentType, Status};
use rocket::request::{FromRequest, Outcome};
use rocket::Request;
use rocket_dyn_templates::{context, Template};
use std::fs;
use std::io::Read;

/// The editor password — from EDITOR_PASSWORD, or randomly generated at startup
/// (and printed to the log) if that env var is unset.
struct EditorPassword(String);

/// Request guard: succeeds only when the `X-Editor-Password` header matches the
/// configured editor password. Gates the save endpoint.
struct EditorAuth;

#[rocket::async_trait]
impl<'r> FromRequest<'r> for EditorAuth {
    type Error = ();
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        let expected = req.rocket().state::<EditorPassword>().map(|p| p.0.as_str());
        let given = req.headers().get_one("X-Editor-Password");
        match (expected, given) {
            (Some(exp), Some(got)) if !exp.is_empty() && exp == got => Outcome::Success(EditorAuth),
            _ => Outcome::Error((Status::Unauthorized, ())),
        }
    }
}

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

/// The password-gated editor UI for content.json.
#[get("/editor")]
fn editor() -> Template {
    Template::render("editor", context! {})
}

/// Current content.json, so the editor can populate its fields.
#[get("/api/content")]
fn get_content() -> Result<(ContentType, String), Status> {
    fs::read_to_string(relative!("content.json"))
        .map(|s| (ContentType::JSON, s))
        .map_err(|_| Status::InternalServerError)
}

/// Save edited content.json (password-protected). Rejects invalid JSON so a
/// bad save can never break the site.
#[post("/api/content", data = "<body>")]
fn save_content(_auth: EditorAuth, body: String) -> Status {
    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return Status::UnprocessableEntity;
    }
    match fs::write(relative!("content.json"), body) {
        Ok(()) => Status::Ok,
        Err(_) => Status::InternalServerError,
    }
}

/// Password check for the editor's unlock step.
#[post("/api/login")]
fn login(_auth: EditorAuth) -> Status {
    Status::Ok
}

/// Resolve the editor password: the EDITOR_PASSWORD env var, or a random hex
/// string. Returns (password, was_generated).
fn resolve_editor_password() -> (String, bool) {
    if let Ok(pw) = std::env::var("EDITOR_PASSWORD") {
        if !pw.trim().is_empty() {
            return (pw, false);
        }
    }
    let mut buf = [0u8; 12];
    let pw = fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut buf).map(|()| buf))
        .map(|b| b.iter().map(|x| format!("{x:02x}")).collect::<String>())
        .unwrap_or_else(|_| "change-me-please".into());
    (pw, true)
}

#[launch]
fn rocket() -> _ {
    let (password, generated) = resolve_editor_password();
    if generated {
        println!(
            "\n  ==> EDITOR_PASSWORD not set — generated a temporary editor password:\n\n        {password}\n\n      Open /editor and use it to save content.json.\n      Set EDITOR_PASSWORD to choose your own (it survives restarts then).\n"
        );
    }
    rocket::build()
        .manage(EditorPassword(password))
        .mount("/", routes![index, editor, get_content, save_content, login])
        .mount("/", FileServer::from(relative!("static")))
        .attach(Template::fairing())
}
