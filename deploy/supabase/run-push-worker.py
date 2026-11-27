"""Invoke the EchoBox workers on the loopback gateway: rider notifications, then billing e-mails."""

import http.client
import json
import os
import sys


def call(path, token, timeout):
    """POST to a private worker function; returns (status, parsed JSON object or None)."""
    connection = http.client.HTTPConnection(
        "127.0.0.1", port=int(os.environ.get("ECHOBOX_PUSH_PORT", "18000")), timeout=timeout
    )
    try:
        connection.request("POST", path, headers={"X-EchoBox-Push-Worker": token})
        response = connection.getresponse()
        body = response.read(4096)
        if response.status != 200:
            return response.status, None
        summary = json.loads(body)
        if not isinstance(summary, dict):
            raise ValueError("invalid worker summary")
        return 200, summary
    finally:
        connection.close()


def main():
    token = os.environ.get("PUSH_WORKER_TOKEN", "")
    if len(token) < 32:
        sys.exit("Push worker token is missing.")

    try:
        status, summary = call("/functions/v1/notify-rider", token, 45)
    except (OSError, ValueError, http.client.HTTPException):
        sys.exit("Push worker did not return a valid response.")
    if summary is None:
        sys.exit(f"Push worker returned HTTP {status}.")

    counts = {
        name: summary[name] for name in ("sent", "retry", "skipped", "failed", "unregistered")
        if isinstance(summary.get(name), int) and summary[name] > 0
    }
    if counts:
        print(json.dumps(counts))

    # Billing e-mails are best effort: a missing function (404) or a mail problem must never
    # stop rider notifications, so errors here are reported but do not fail the run.
    try:
        status, billing = call("/functions/v1/notify-billing", token, 30)
    except (OSError, ValueError, http.client.HTTPException):
        print("Billing e-mail worker did not return a valid response.", file=sys.stderr)
        return
    if billing is None:
        if status != 404:
            print(f"Billing e-mail worker returned HTTP {status}.", file=sys.stderr)
        return
    billing_counts = {
        f"billing_{name}": billing[name] for name in ("sent", "failed")
        if isinstance(billing.get(name), int) and billing[name] > 0
    }
    if billing_counts:
        print(json.dumps(billing_counts))


if __name__ == "__main__":
    main()
