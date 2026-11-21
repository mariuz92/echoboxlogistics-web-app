"""Configure Resend SMTP in the EchoBox Supabase .env file."""

import argparse
import getpass
import os
import re
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("env_file", type=Path, help="Path to the EchoBox Supabase .env file")
    args = parser.parse_args()
    try:
        env_file = args.env_file.resolve(strict=True)
        lines = env_file.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        parser.error(str(error))

    api_key = getpass.getpass("Resend API key: ").strip()
    if not re.fullmatch(r"re_[A-Za-z0-9_-]+", api_key):
        parser.error("Enter a Resend API key beginning with re_.")

    settings = {
        "ENABLE_EMAIL_SIGNUP": "true",
        "ENABLE_EMAIL_AUTOCONFIRM": "false",
        "SMTP_ADMIN_EMAIL": "admin@echoboxlogistics.com",
        "SMTP_HOST": "smtp.resend.com",
        "SMTP_PORT": "587",
        "SMTP_USER": "resend",
        "SMTP_PASS": api_key,
        "SMTP_SENDER_NAME": '"EchoBox Logistics"',
        "ENABLE_ANONYMOUS_USERS": "false",
    }
    updated = []
    for line in lines:
        key, separator, _ = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        if not separator or key not in settings:
            updated.append(line)
            continue
        if settings[key] is not None:
            updated.append(f"{key}={settings[key]}")
            settings[key] = None
    updated.extend(f"{key}={value}" for key, value in settings.items() if value is not None)

    fd, temporary_name = tempfile.mkstemp(dir=env_file.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write("\n".join(updated) + "\n")
        os.replace(temporary_name, env_file)
    finally:
        Path(temporary_name).unlink(missing_ok=True)
    print(f"Resend SMTP configured in {env_file}.")


if __name__ == "__main__":
    main()
