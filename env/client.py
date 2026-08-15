#!/usr/bin/env python3
import json
import os
import socket
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SOCK = os.environ.get(
    "FNF_SOCK",
    os.path.join(ROOT, "run", "engine.sock"),
)


def call(payload, timeout=2):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(timeout)
    s.connect(SOCK)
    s.sendall((json.dumps(payload) + "\n").encode())
    rep = b""
    try:
        while b"\n" not in rep:
            chunk = s.recv(4096)
            if not chunk:
                break
            rep += chunk
    except socket.timeout:
        pass
    finally:
        s.close()
    return json.loads(rep.split(b"\n")[0].decode() or "{}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "test":
        print("status:", call({"cmd": "status"}))
        print("start:", call({"cmd": "start", "song": "tutorial", "diff": 2}))
        print("status:", call({"cmd": "status"}))
        print("press left:", call({"cmd": "key", "key": "left", "down": True}))
        print("release:", call({"cmd": "key", "key": "left", "down": False}))
    elif cmd == "start":
        song = sys.argv[2] if len(sys.argv) > 2 else "tutorial"
        diff = int(sys.argv[3]) if len(sys.argv) > 3 else 2
        scale = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
        sides = sys.argv[5] if len(sys.argv) > 5 else "player"
        print(call({"cmd": "start", "song": song, "diff": diff, "scale": scale, "sides": sides}))
    elif cmd == "status":
        print(call({"cmd": "status"}))
    elif cmd == "list":
        print(call({"cmd": "list"}))
    elif cmd == "press":
        key = sys.argv[2]
        print(call({"cmd": "key", "key": key, "down": True}))
    elif cmd == "quit":
        print(call({"cmd": "quit"}))
    else:
        print("uso: client.py [status|start|press|quit|list|test]", file=sys.stderr)
        sys.exit(1)
