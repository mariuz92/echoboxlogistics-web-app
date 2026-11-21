"""Invoke the EchoBox rider notifications worker on the loopback gateway."""

import http.client
import json
import os
import sys


def main():
    token = os.environ.get("PUSH_WORKER_TOKEN", "")
    if len(token) < 32:
        sys.exit("Push worker token is missing.")
    connection = http.client.HTTPConnection(
        "127.0.0.1", port=int(os.environ.get("ECHOBOX_PUSH_PORT", "18000")), timeout=45
    )
    try:
        connection.request("POST", "/functions/v1/notify-rider", headers={"X-EchoBox-Push-Worker": token})
        response = connection.getresponse()
        if response.status != 200:
            sys.exit(f"Push worker returned HTTP {response.status}.")
        summary = json.loads(response.read(4096))
        if not isinstance(summary, dict):
            raise ValueError("invalid push summary")
    except (OSError, ValueError, http.client.HTTPException):
        sys.exit("Push worker did not return a valid response.")
    finally:
        connection.close()

    counts = {
        name: summary[name] for name in ("sent", "retry", "skipped", "failed", "unregistered")
        if isinstance(summary.get(name), int) and summary[name] > 0
    }
    if counts:
        print(json.dumps(counts))


if __name__ == "__main__":
    main()
