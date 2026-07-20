#[macro_use]
extern crate rocket;

use rocket::fs::{relative, FileServer};
use rocket::http::{ContentType, Header, Status};
use rocket::request::{FromRequest, Outcome};
use rocket::response::{self, Responder, Response};
use rocket::Request;
use rocket_dyn_templates::{context, Template};
use std::fs;
use std::io::{Cursor, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

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

/// Captures the raw `Range` request header (if present) so the media route can
/// answer partial requests. Without them, browsers can't seek inside a video.
struct RangeHeader(Option<String>);

#[rocket::async_trait]
impl<'r> FromRequest<'r> for RangeHeader {
    type Error = std::convert::Infallible;
    async fn from_request(req: &'r Request<'_>) -> Outcome<Self, Self::Error> {
        Outcome::Success(RangeHeader(
            req.headers().get_one("Range").map(|s| s.to_owned()),
        ))
    }
}

/// A byte body plus the headers a browser needs to seek: `Accept-Ranges`, and
/// for partial responses a `Content-Range` alongside a 206 status.
struct MediaResponse {
    status: Status,
    content_type: ContentType,
    content_range: Option<String>,
    body: Vec<u8>,
}

impl<'r> Responder<'r, 'static> for MediaResponse {
    fn respond_to(self, _: &'r Request<'_>) -> response::Result<'static> {
        let mut build = Response::build();
        build
            .status(self.status)
            .header(self.content_type)
            .header(Header::new("Accept-Ranges", "bytes"))
            .sized_body(self.body.len(), Cursor::new(self.body));
        if let Some(cr) = self.content_range {
            build.header(Header::new("Content-Range", cr));
        }
        build.ok()
    }
}

/// Serve everything under `static/videa` WITH HTTP range support. Rocket's
/// `FileServer` answers every request with a full `200` and no `Accept-Ranges`,
/// which makes scrubbing a `<video>` impossible; this route (ranked above the
/// FileServer) parses `Range: bytes=…` and replies `206 Partial Content`.
#[get("/videa/<file..>", rank = 1)]
fn media(file: PathBuf, range: RangeHeader) -> Option<MediaResponse> {
    // Resolve inside static/videa. PathBuf's FromSegments already strips `..`,
    // but re-check the canonical path never escapes the directory.
    let base = Path::new(relative!("static/videa")).canonicalize().ok()?;
    let path = base.join(&file).canonicalize().ok()?;
    if !path.starts_with(&base) {
        return None;
    }

    let mut f = fs::File::open(&path).ok()?;
    let total = f.metadata().ok()?.len();
    let content_type = path
        .extension()
        .and_then(|e| e.to_str())
        .and_then(ContentType::from_extension)
        .unwrap_or(ContentType::Binary);

    // Cap each partial response so memory stays bounded — a shorter-than-asked
    // range is a valid 206; the browser simply requests the next chunk.
    const MAX_CHUNK: u64 = 2 * 1024 * 1024;

    match range.0.as_deref().and_then(|h| parse_range(h, total)) {
        Some((start, end)) => {
            let end = end.min(start + MAX_CHUNK - 1).min(total.saturating_sub(1));
            let len = (end - start + 1) as usize;
            let mut body = vec![0u8; len];
            f.seek(SeekFrom::Start(start)).ok()?;
            f.read_exact(&mut body).ok()?;
            Some(MediaResponse {
                status: Status::PartialContent,
                content_type,
                content_range: Some(format!("bytes {start}-{end}/{total}")),
                body,
            })
        }
        None => {
            let mut body = Vec::with_capacity(total as usize);
            f.read_to_end(&mut body).ok()?;
            Some(MediaResponse {
                status: Status::Ok,
                content_type,
                content_range: None,
                body,
            })
        }
    }
}

/// Parse a single `bytes=start-end` / `bytes=start-` / `bytes=-suffix` range
/// into inclusive `[start, end]` offsets, clamped to the file size.
fn parse_range(header: &str, total: u64) -> Option<(u64, u64)> {
    if total == 0 {
        return None;
    }
    let spec = header.trim().strip_prefix("bytes=")?;
    let spec = spec.split(',').next()?.trim(); // first range only
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", "") => return None,
        ("", suf) => {
            let suf: u64 = suf.parse().ok()?;
            let suf = suf.min(total);
            (total - suf, total - 1)
        }
        (s, "") => (s.parse().ok()?, total - 1),
        (s, e) => {
            let start: u64 = s.parse().ok()?;
            let end: u64 = e.parse().ok()?;
            (start, end.min(total - 1))
        }
    };
    if start > end || start >= total {
        return None;
    }
    Some((start, end))
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
        .mount("/", routes![index, editor, get_content, save_content, login, media])
        .mount("/", FileServer::from(relative!("static")))
        .attach(Template::fairing())
        // Browsers must revalidate everything on each load: stale CSS/JS kept
        // haunting sessions after deploys (assets carry no version hashes).
        // FileServer sends Last-Modified, so revalidation is a cheap 304.
        .attach(rocket::fairing::AdHoc::on_response("no-cache", |_, res| {
            Box::pin(async move {
                res.set_raw_header("Cache-Control", "no-cache");
            })
        }))
}
