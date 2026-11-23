"""Install the private FCM credentials and loopback scheduler token."""

import argparse
import json
import os
import re
import secrets
import tempfile
from pathlib import Path


def replace_file(path, contents):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        try:
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("firebase_key", type=Path)
    parser.add_argument("--functions-env", type=Path, default=Path("/opt/echobox/supabase/.env.functions"))
    parser.add_argument("--worker-env", type=Path, default=Path("/opt/echobox/push-worker.env"))
    parser.add_argument("--api-port", type=int, default=18000)
    args = parser.parse_args()
    if not 1 <= args.api_port <= 65535:
        parser.error("--api-port must be a valid TCP port")

    try:
        functions_env = args.functions_env.read_text()
        account = json.loads(args.firebase_key.read_text())
        if account["type"] != "service_account":
            raise ValueError("wrong credential type")
        account = {key: account[key] for key in ("project_id", "client_email", "private_key")}
        if not re.fullmatch(r"[a-z0-9-]+", account["project_id"]):
            raise ValueError("invalid project")
        if not re.fullmatch(r"[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+", account["client_email"]):
            raise ValueError("invalid service account email")
        if not re.fullmatch(
            r"-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+-----END PRIVATE KEY-----\s*",
            account["private_key"],
        ):
            raise ValueError("invalid service account key")
    except (OSError, TypeError, KeyError, ValueError):
        parser.error("Provide a Google service account JSON file and an existing Supabase functions environment")

    existing_token = re.search(r"^PUSH_WORKER_TOKEN=([A-Za-z0-9_-]{43,})$", functions_env, re.MULTILINE)
    token = existing_token[1] if existing_token else secrets.token_urlsafe(32)
    current = [
        line for line in functions_env.splitlines()
        if not re.match(r"\s*(?:export\s+)?(?:PUSH_WORKER_TOKEN|FCM_SERVICE_ACCOUNT_JSON)\s*=", line)
    ]
    current.extend([
        f"PUSH_WORKER_TOKEN={token}",
        f"FCM_SERVICE_ACCOUNT_JSON='{json.dumps(account, separators=(',', ':'))}'",
    ])
    replace_file(args.functions_env, "\n".join(current) + "\n")
    replace_file(args.worker_env, f"PUSH_WORKER_TOKEN={token}\nECHOBOX_PUSH_PORT={args.api_port}\n")
    print("Push configuration written. Recreate the functions container and restart the push timer.")


if __name__ == "__main__":
    main()
