#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Herramienta de Diagnóstico IMAP en Tiempo Real para Hostinger
"""

import sys
import time
import socket
import ssl
import getpass
import os

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

IMAP_HOST = "imap.hostinger.com"
IMAP_PORT = 993
IMAP_USER = "ia-automatica@arquimedescarrizo.com.ar"

def log(msg, level="INFO"):
    t = time.strftime("%H:%M:%S")
    symbols = {"INFO": "[INFO]", "OK": "[OK]", "WARN": "[WARN]", "ERROR": "[ERROR]", "NET": "[NET]", "MAIL": "📩"}
    print(f"[{t}] {symbols.get(level, '[•]')} {msg}", flush=True)

def run_diagnostic(password: str, idle_seconds: int = 180):
    print("=" * 65)
    print("DIAGNOSTICO IMAP EN TIEMPO REAL - PRUEBA DE CORREO ENTRANTE")
    print(f"Host: {IMAP_HOST}:{IMAP_PORT} (SSL)")
    print(f"Usuario: {IMAP_USER}")
    print("=" * 65)

    log(f"Iniciando conexion SSL a {IMAP_HOST}:{IMAP_PORT}...", "NET")
    start_t = time.time()
    try:
        context = ssl.create_default_context()
        raw_sock = socket.create_connection((IMAP_HOST, IMAP_PORT), timeout=15)
        ssl_sock = context.wrap_socket(raw_sock, server_hostname=IMAP_HOST)
        latency = (time.time() - start_t) * 1000
        log(f"Conexion SSL establecida en {latency:.1f} ms", "OK")
    except Exception as e:
        log(f"Fallo al conectar: {e}", "ERROR")
        return

    tag_counter = 1
    def send_cmd(cmd_str):
        nonlocal tag_counter
        tag = f"A{tag_counter:04d}"
        tag_counter += 1
        raw_msg = f"{tag} {cmd_str}\r\n".encode("utf-8")
        ssl_sock.sendall(raw_msg)
        return tag

    def read_response(until_tag=None, timeout=15):
        ssl_sock.settimeout(timeout)
        lines = []
        buf = ""
        while True:
            try:
                data = ssl_sock.recv(4096).decode("utf-8", errors="replace")
                if not data:
                    break
                buf += data
                while "\r\n" in buf:
                    line, buf = buf.split("\r\n", 1)
                    lines.append(line)
                    if until_tag and line.startswith(until_tag):
                        return lines
            except socket.timeout:
                break
            except Exception as e:
                lines.append(f"[ERROR DE SOCKET]: {e}")
                break
        return lines

    read_response(timeout=6)

    # LOGIN
    log(f"Autenticando usuario '{IMAP_USER}'...", "INFO")
    tag = send_cmd(f'LOGIN "{IMAP_USER}" "{password}"')
    login_lines = read_response(until_tag=tag)
    login_ok = any(l.startswith(tag) and "OK" in l.upper() for l in login_lines)
    if not login_ok:
        log("Fallo de autenticacion", "ERROR")
        ssl_sock.close()
        return
    log("Autenticacion exitosa (LOGIN OK)", "OK")

    # SELECT INBOX
    tag = send_cmd("SELECT INBOX")
    select_lines = read_response(until_tag=tag)
    initial_exists = "0"
    for l in select_lines:
        if "EXISTS" in l and not l.startswith(tag):
            initial_exists = l.split()[1]
    log(f"Estado inicial de INBOX: {initial_exists} correos", "OK")

    # PRUEBA DE IDLE EN TIEMPO REAL
    print("\n" + "=" * 65)
    log(f"*** INICIANDO ESCUCHA IDLE POR {idle_seconds} SEGUNDOS (3 MINUTOS) ***", "NET")
    log("👉 ENVIÁ EL CORREO DE PRUEBA DESDE GMAIL AHORA.", "MAIL")
    log("El script monitorea el socket segundo a segundo...", "INFO")
    print("=" * 65 + "\n")

    tag = send_cmd("IDLE")
    ssl_sock.settimeout(1.0)
    start_idle = time.time()
    socket_open = True
    new_mails_detected = 0

    while time.time() - start_idle < idle_seconds:
        elapsed = int(time.time() - start_idle)
        remaining = idle_seconds - elapsed
        try:
            data = ssl_sock.recv(4096).decode("utf-8", errors="replace")
            if data:
                for line in data.splitlines():
                    if line.strip():
                        if "EXISTS" in line or "RECENT" in line:
                            new_mails_detected += 1
                            log(f"🔔 ¡EVENTO DE NUEVO CORREO DETECTADO EN TIEMPO REAL! (a los {elapsed}s): {line}", "MAIL")
                        else:
                            log(f"[Respuesta Servidor IDLE] (a los {elapsed}s): {line}", "INFO")
            else:
                log(f"El servidor cerro el socket silenciosamente a los {elapsed}s", "WARN")
                socket_open = False
                break
        except socket.timeout:
            print(f"\r⏳ Escuchando en IDLE... Tiempo: {elapsed}s / {idle_seconds}s (Restan {remaining}s) | Nuevos correos: {new_mails_detected}", end="", flush=True)
        except Exception as e:
            log(f"\nExcepcion en socket a los {elapsed}s: {e}", "ERROR")
            socket_open = False
            break

    print()
    if socket_open:
        log(f"Conexion IDLE completada ({idle_seconds}s escuchados). Total eventos recibidos: {new_mails_detected}", "OK")
        try:
            ssl_sock.sendall(b"DONE\r\n")
            read_response(until_tag=tag, timeout=3)
        except Exception:
            pass
    else:
        log("El socket IDLE se desconecto antes de finalizar el tiempo.", "WARN")

    # SEARCH UNSEEN FINAL
    log("Realizando busqueda final de correos no leidos (SEARCH UNSEEN)...", "INFO")
    tag = send_cmd("SEARCH UNSEEN")
    search_lines = read_response(until_tag=tag)
    for l in search_lines:
        if l.startswith("* SEARCH"):
            unseen_ids = l.split()[2:]
            log(f"Total correos no leidos al finalizar: {len(unseen_ids)} (IDs: {unseen_ids})", "OK")

    # LOGOUT
    log("Cerrando sesion...", "INFO")
    try:
        tag = send_cmd("LOGOUT")
        read_response(until_tag=tag, timeout=3)
        ssl_sock.close()
    except Exception:
        pass

    print("\n" + "=" * 65)
    print("🏁 Diagnostico en tiempo real finalizado.")
    print("=" * 65)

if __name__ == "__main__":
    pwd = os.environ.get("IMAP_PASSWORD", "inteliganciaArtificial$1")
    run_diagnostic(pwd, idle_seconds=180)
