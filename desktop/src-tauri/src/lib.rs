//! Cápsula de escritorio FNF-Agent (Tauri 2).
//!
//! Arranca un HTTP local que sirve `web/`, spawnea `agente/relay.py` con token/puerto,
//! abre el WebView en `http://127.0.0.1:…` (Origin válido para el relay) y limpia hijos al salir.

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use rand::Rng;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};
use tiny_http::{Header, Response, Server, StatusCode};

/// CSP del juego. El mismo texto va en `app.security.csp` de `tauri.conf.json`.
///
/// El WebView acaba en `http://127.0.0.1:<puerto>/` (otro puerto que el relay), así que
/// `'self'` no cubre el WebSocket: hay que nombrar `ws://127.0.0.1:*` y `ws://localhost:*`.
/// `http://127.0.0.1:*` / `http://localhost:*` es el servidor local en cualquier puerto.
///
/// No hay `'unsafe-inline'` ni `'unsafe-eval'`. `web/index.html` solo enlaza `app.js` y
/// `estilos.css`. Los colores y el alto táctil se ponen con `element.style` (CSSOM), que
/// el navegador no trata como estilo en línea. `AudioContext` no pide URLs: el audio propio
/// entra por `decodeAudioData`. El service worker es `sw.js` del mismo origen (`worker-src`).
/// Exportar perfiles hace `<a download href="blob:…">`; `frame-src 'self' blob:` lo permite
/// sin abrir `blob:` en `script-src` ni en `worker-src`.
const CSP_JUEGO: &str = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; worker-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

fn cabecera(nombre: &[u8], valor: &[u8]) -> Result<Header, String> {
    Header::from_bytes(nombre, valor)
        .map_err(|_| format!("cabecera {}", String::from_utf8_lossy(nombre)))
}

/// Estado vivo de la cápsula (HTTP + relay). Se mata al cerrar la app.
struct Capsule {
    http_port: u16,
    ws_port: u16,
    token: String,
    relay: Child,
    /// Al dropear `Capsule` se cierra el servidor HTTP.
    _http_shutdown: std::sync::mpsc::Sender<()>,
}

impl Drop for Capsule {
    fn drop(&mut self) {
        let _ = self._http_shutdown.send(());
        stop_child(&mut self.relay, "relay");
    }
}

fn stop_child(child: &mut Child, label: &str) {
    let pid = child.id();
    match child.try_wait() {
        Ok(Some(_)) => return,
        Ok(None) => {}
        Err(e) => {
            eprintln!("[capsula] no pude consultar {label} (pid {pid}): {e}");
            return;
        }
    }
    // Intento amable: en Unix, `kill()` de std manda SIGKILL en muchas versiones;
    // preferimos esperar un momento tras un kill del proceso hijo.
    let _ = child.kill();
    let _ = child.wait();
    eprintln!("[capsula] {label} (pid {pid}) detenido");
}

/// Mismo alfabeto y forma que `nuevo_token()` en `agente/relay.py`.
pub fn nuevo_token() -> String {
    const ABC: &[u8] = b"abcdefghjkmnpqrstuvwxyz23456789";
    let mut rng = rand::thread_rng();
    let grupo = |rng: &mut rand::rngs::ThreadRng| -> String {
        (0..4)
            .map(|_| ABC[rng.gen_range(0..ABC.len())] as char)
            .collect()
    };
    format!("{}-{}-{}", grupo(&mut rng), grupo(&mut rng), grupo(&mut rng))
}

fn puerto_libre(preferido: Option<u16>) -> Result<u16, String> {
    if let Some(p) = preferido {
        if TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return Ok(p);
        }
        eprintln!("[capsula] puerto {p} ocupado; busco otro libre");
    }
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("no hay puerto libre: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("no pude leer el puerto: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

/// Resuelve `web/` y `agente/` empaquetados o, en desarrollo, relativos al repo.
pub fn resolver_rutas(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if let Ok(dir) = app.path().resource_dir() {
        let web = dir.join("web");
        let agente = dir.join("agente");
        if web.is_dir() && agente.join("relay.py").is_file() {
            return Ok((web, agente));
        }
    }
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .map_err(|e| format!("no encuentro la raíz del repo: {e}"))?;
    let web = root.join("web");
    let agente = root.join("agente");
    if !web.is_dir() {
        return Err(format!("falta el directorio web en {}", web.display()));
    }
    if !agente.join("relay.py").is_file() {
        return Err(format!("falta agente/relay.py en {}", agente.display()));
    }
    Ok((web, agente))
}

fn python_cmd() -> String {
    std::env::var("FNF_PYTHON").unwrap_or_else(|_| {
        if which_exists("python3") {
            "python3".into()
        } else {
            "python".into()
        }
    })
}

fn which_exists(bin: &str) -> bool {
    Command::new(bin)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn servir_web(web_root: PathBuf, port: u16) -> Result<std::sync::mpsc::Sender<()>, String> {
    let server = Server::http(("127.0.0.1", port))
        .map_err(|e| format!("no pude abrir HTTP en 127.0.0.1:{port}: {e}"))?;
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    thread::Builder::new()
        .name("fnf-http".into())
        .spawn(move || loop {
            if rx.try_recv().is_ok() {
                break;
            }
            match server.recv_timeout(Duration::from_millis(200)) {
                Ok(Some(req)) => {
                    if let Err(e) = responder(&web_root, req) {
                        eprintln!("[capsula] HTTP: {e}");
                    }
                }
                Ok(None) => {} // timeout sin petición
                Err(e) => {
                    eprintln!("[capsula] HTTP io: {e}");
                    break;
                }
            }
        })
        .map_err(|e| format!("no pude arrancar el hilo HTTP: {e}"))?;
    Ok(tx)
}

fn responder(web_root: &Path, request: tiny_http::Request) -> Result<(), String> {
    let url = request.url().to_string();
    let path = url.split('?').next().unwrap_or("/");
    let rel = if path == "/" || path.is_empty() {
        "index.html"
    } else {
        path.trim_start_matches('/')
    };
    let joined = web_root.join(rel);
    let canon_root = web_root
        .canonicalize()
        .map_err(|e| format!("web root: {e}"))?;
    let file = match joined.canonicalize() {
        Ok(p) if p.starts_with(&canon_root) && p.is_file() => p,
        _ => {
            let resp = Response::from_string("404")
                .with_status_code(StatusCode(404))
                .with_header(cabecera(b"Content-Type", b"text/plain; charset=utf-8")?)
                .with_header(cabecera(b"Content-Security-Policy", CSP_JUEGO.as_bytes())?);
            request.respond(resp).map_err(|e| e.to_string())?;
            return Ok(());
        }
    };
    let data = fs::read(&file).map_err(|e| format!("leer {}: {e}", file.display()))?;
    let mime = mime_guess::from_path(&file)
        .first_or_octet_stream()
        .to_string();
    let resp = Response::from_data(data)
        .with_header(cabecera(b"Content-Type", mime.as_bytes())?)
        .with_header(cabecera(b"Cache-Control", b"no-cache")?)
        .with_header(cabecera(b"Content-Security-Policy", CSP_JUEGO.as_bytes())?);
    request.respond(resp).map_err(|e| e.to_string())?;
    Ok(())
}

fn arrancar_relay(agente_dir: &Path, port: u16, token: &str) -> Result<Child, String> {
    let relay = agente_dir.join("relay.py");
    let py = python_cmd();
    if !which_exists(&py) {
        return Err(format!(
            "no encuentro Python ({py}). Instálalo o define FNF_PYTHON. MVP: Python del sistema."
        ));
    }
    let mut child = Command::new(&py)
        .arg("-u")
        .arg(&relay)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(token)
        .current_dir(agente_dir)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("no pude arrancar el relay ({py} {}): {e}", relay.display()))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "sin stdout del relay".to_string())?;
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || {
            for line in BufReader::new(err).lines().flatten() {
                eprintln!("[relay:err] {line}");
            }
        });
    }

    let mut reader = BufReader::new(stdout);
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut listo = false;
    let mut line = String::new();
    while Instant::now() < deadline {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => break,
            Ok(_) => {
                let trimmed = line.trim_end();
                println!("{trimmed}");
                if trimmed.contains("[relay] listo") {
                    listo = true;
                    break;
                }
            }
            Err(e) => return Err(format!("leyendo relay: {e}")),
        }
    }
    // Seguir volcando stdout en segundo plano (mover el reader).
    thread::spawn(move || {
        for line in reader.lines().flatten() {
            println!("{line}");
        }
    });

    if !listo {
        let _ = child.kill();
        let _ = child.wait();
        return Err(
            "el relay no dijo «[relay] listo» a tiempo (¿puerto ocupado? ¿Python?).".into(),
        );
    }
    match child.try_wait() {
        Ok(Some(status)) => Err(format!("el relay salió de inmediato: {status}")),
        Ok(None) => Ok(child),
        Err(e) => Err(format!("relay: {e}")),
    }
}

fn url_juego(http_port: u16, ws_port: u16, token: &str) -> String {
    format!(
        "http://127.0.0.1:{http_port}/?fnf_token={}&fnf_port={ws_port}&fnf_host={}&jugador=remoto",
        urlencoding::encode(token),
        urlencoding::encode("ws://127.0.0.1"),
    )
}

fn arrancar_capsula(app: &AppHandle) -> Result<Capsule, String> {
    let (web, agente) = resolver_rutas(app)?;
    let http_port = puerto_libre(None)?;
    let ws_port = puerto_libre(Some(8765))?;
    let token = std::env::var("FNF_TOKEN").unwrap_or_else(|_| nuevo_token());
    if token.len() < 8 {
        return Err("FNF_TOKEN demasiado corto (mín. 8)".into());
    }

    let shutdown = servir_web(web, http_port)?;
    let relay = arrancar_relay(&agente, ws_port, &token)?;

    let game = url_juego(http_port, ws_port, &token);
    println!("[capsula] juego {game}");
    println!("[capsula] relay ws://127.0.0.1:{ws_port}/  token {token}");

    Ok(Capsule {
        http_port,
        ws_port,
        token,
        relay,
        _http_shutdown: shutdown,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let smoke = std::env::var_os("FNF_CAPSULE_SMOKE").is_some();

    let builder = tauri::Builder::default().setup(move |app| {
        let handle = app.handle().clone();
        let capsule = match arrancar_capsula(&handle) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[capsula] ERROR: {e}");
                handle.exit(1);
                return Ok(());
            }
        };

        if smoke {
            let ok = smoke_check(capsule.http_port, capsule.ws_port);
            app.manage(Mutex::new(Some(capsule)));
            if !ok {
                eprintln!("[capsula] smoke FALLÓ");
                handle.exit(1);
            } else {
                println!("[capsula] smoke OK");
                handle.exit(0);
            }
            return Ok(());
        }

        let url = url_juego(capsule.http_port, capsule.ws_port, &capsule.token);
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "ventana main ausente".to_string())?;
        window
            .navigate(url.parse().map_err(|e| format!("URL: {e}"))?)
            .map_err(|e| format!("navigate: {e}"))?;
        window.show().map_err(|e| format!("show: {e}"))?;
        let title = format!("FNF-Agent · relay :{}", capsule.ws_port);
        let _ = window.set_title(&title);

        app.manage(Mutex::new(Some(capsule)));
        Ok(())
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error al construir la cápsula Tauri");

    app.run(|app_handle, event| match event {
        RunEvent::Exit | RunEvent::ExitRequested { .. } => {
            if let Some(state) = app_handle.try_state::<Mutex<Option<Capsule>>>() {
                if let Ok(mut guard) = state.lock() {
                    *guard = None; // Drop → mata relay + HTTP
                }
            }
        }
        RunEvent::WindowEvent { label, event, .. } if label == "main" => {
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = app_handle.try_state::<Mutex<Option<Capsule>>>() {
                    if let Ok(mut guard) = state.lock() {
                        *guard = None;
                    }
                }
            }
        }
        _ => {}
    });
}

fn smoke_check(http_port: u16, ws_port: u16) -> bool {
    let pagina = http_get("127.0.0.1", http_port, "/");
    let ok_game = pagina.as_deref().is_some_and(|b| {
        contiene(b, b"<!DOCTYPE html") || contiene(b, b"<html") || contiene(b, b"<!doctype html")
    });
    let ok_csp = pagina.as_deref().is_some_and(|b| {
        contiene(b, b"Content-Security-Policy:") && contiene(b, CSP_JUEGO.as_bytes())
    });
    // json.dumps por defecto pone espacios: "relay": "fnf-agent"
    let ok_relay = http_get_contains("127.0.0.1", ws_port, "/", b"fnf-agent");
    if !ok_game {
        eprintln!("[capsula] smoke: el juego no respondió en :{http_port}");
    }
    if !ok_csp {
        eprintln!("[capsula] smoke: falta la CSP en :{http_port}");
    }
    if !ok_relay {
        eprintln!("[capsula] smoke: el relay no respondió salud en :{ws_port}");
    }
    ok_game && ok_csp && ok_relay
}

fn contiene(buf: &[u8], needle: &[u8]) -> bool {
    !needle.is_empty() && buf.windows(needle.len()).any(|w| w == needle)
}

fn http_get(host: &str, port: u16, path: &str) -> Option<Vec<u8>> {
    let mut stream = TcpStream::connect((host, port)).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    let req = format!("GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;
    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    if buf.is_empty() {
        None
    } else {
        Some(buf)
    }
}

fn http_get_contains(host: &str, port: u16, path: &str, needle: &[u8]) -> bool {
    http_get(host, port, path).is_some_and(|buf| contiene(&buf, needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_tiene_forma_del_relay() {
        let t = nuevo_token();
        let partes: Vec<_> = t.split('-').collect();
        assert_eq!(partes.len(), 3);
        for p in partes {
            assert_eq!(p.len(), 4);
            assert!(p
                .chars()
                .all(|c| "abcdefghjkmnpqrstuvwxyz23456789".contains(c)));
        }
    }

    #[test]
    fn url_incluye_params() {
        let u = url_juego(8000, 8765, "abcd-efgh-ijkl");
        assert!(u.contains("fnf_token=abcd-efgh-ijkl"));
        assert!(u.contains("fnf_port=8765"));
        assert!(u.contains("jugador=remoto"));
        assert!(u.starts_with("http://127.0.0.1:8000/"));
    }

    #[test]
    fn csp_es_la_de_tauri_conf_y_no_abre_inline() {
        let conf = include_str!("../tauri.conf.json");
        assert!(
            conf.contains(&format!("\"csp\": \"{CSP_JUEGO}\"")),
            "app.security.csp debe ser exactamente CSP_JUEGO"
        );
        assert!(!CSP_JUEGO.contains("unsafe-inline"));
        assert!(!CSP_JUEGO.contains("unsafe-eval"));
        assert!(CSP_JUEGO.contains("script-src 'self'"));
        assert!(CSP_JUEGO.contains("style-src 'self'"));
        assert!(CSP_JUEGO.contains("http://127.0.0.1:*"));
        assert!(CSP_JUEGO.contains("http://localhost:*"));
        assert!(CSP_JUEGO.contains("ws://127.0.0.1:*"));
        assert!(CSP_JUEGO.contains("ws://localhost:*"));
        assert!(CSP_JUEGO.contains("worker-src 'self'"));
        assert!(CSP_JUEGO.contains("frame-src 'self' blob:"));
    }
}
