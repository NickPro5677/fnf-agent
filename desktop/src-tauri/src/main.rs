//! Punto de entrada de la cápsula de escritorio.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fnf_agent_desktop_lib::run();
}
