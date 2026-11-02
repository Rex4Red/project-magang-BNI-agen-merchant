#!/usr/bin/env python3
"""Install repository polling and release switching for an existing BNI service."""

import argparse
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import tempfile

from deploy import Deployer, write_json


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="/data/home/apps/bni")
    parser.add_argument("--node", default="/data/home/tools/node24/bin/node")
    parser.add_argument("--state-dir")
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--enable", action="store_true")
    args = parser.parse_args()
    if os.geteuid() == 0:
        parser.error("Run as the application user; sudo is used only to install systemd files")
    repo = Path(args.repo).resolve(strict=True)
    state = Path(args.state_dir or repo.parent / "bni-deploy").resolve()
    node = Path(args.node).resolve(strict=True)
    user = pwd.getpwuid(os.geteuid())
    if any(any(char.isspace() for char in str(path)) for path in (repo, state, node, user.pw_dir)):
        parser.error("Installation paths must not contain whitespace")
    subprocess.run(["sudo", "-n", "true"], check=True)
    env_file = repo / "webapp/.env.local"
    runtime = json.loads(subprocess.check_output([
        str(node), "--env-file=.env.local", "-e",
        "const p=require('node:path');console.log(JSON.stringify({database:p.resolve(process.env.BNI_DATABASE_PATH||'data/canvasing.sqlite'),python:process.env.BNI_PYTHON_EXECUTABLE||null}));",
    ], cwd=repo / "webapp", text=True))
    if not runtime["python"] or not Path(runtime["python"]).is_file():
        parser.error("Set BNI_PYTHON_EXECUTABLE to the existing Python environment first")
    database = Path(runtime["database"]).resolve(strict=True)
    if database.parent != (repo / "webapp/data").resolve():
        parser.error("This installer expects the existing database inside webapp/data")
    config = {
        "repo": str(repo), "state_dir": str(state), "node": str(node), "home": user.pw_dir,
        "env_file": str(env_file), "data_dir": str(database.parent), "database": str(database),
        "python": runtime["python"], "service": "bni-webapp.service", "port": args.port,
    }
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    (state / "releases").mkdir(exist_ok=True)
    config_file = state / "config.json"
    if config_file.exists() and json.loads(config_file.read_text()) != config:
        parser.error("Existing deployment configuration differs; review it before reinstalling")
    write_json(config_file, config)
    os.chmod(config_file, 0o600)
    deployer = Deployer(config)
    if not deployer.status_file.exists():
        sha = deployer.command(["git", "rev-parse", "HEAD"], capture=True)
        release = deployer.prepare(sha)
        deployer.share(release)
        for name in ("node_modules", ".next"):
            (release / "webapp" / name).symlink_to(repo / "webapp" / name, target_is_directory=True)
        deployer.switch(release)
        write_json(deployer.status_file, {"deployed_sha": sha, "failed_sha": None})
    existing_unit = Path("/etc/systemd/system/bni-webapp.service")
    if not existing_unit.is_file():
        parser.error("The existing bni-webapp.service must be installed first")
    backup = state / "bni-webapp.service.original"
    if not backup.exists():
        shutil.copy2(existing_unit, backup)
    current_webapp = state / "current/webapp"
    units = {
        "/etc/systemd/system/bni-webapp.service.d/releases.conf": f"""[Service]
WorkingDirectory={current_webapp}
ExecStart=
ExecStart={node} {current_webapp}/node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port {args.port}
""",
        "/etc/systemd/system/bni-auto-deploy.service": f"""[Unit]
Description=Build and deploy BNI changes from GitHub main
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User={user.pw_name}
WorkingDirectory={repo}
Environment=HOME={user.pw_dir}
Environment=PATH={node.parent}:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/python3 /usr/local/lib/bni-deploy/deploy.py --config {config_file}
TimeoutStartSec=20min
TimeoutStopSec=90
Nice=10
CPUQuota=200%
MemoryMax=4G
UMask=0077
""",
        "/etc/systemd/system/bni-auto-deploy.timer": """[Unit]
Description=Check BNI GitHub main every minute

[Timer]
OnBootSec=90s
OnUnitInactiveSec=60s
AccuracySec=5s
Unit=bni-auto-deploy.service

[Install]
WantedBy=timers.target
""",
    }
    with tempfile.TemporaryDirectory(dir=state, prefix="install-") as temporary:
        for index, (target, content) in enumerate(units.items()):
            source = Path(temporary) / str(index)
            source.write_text(content)
            subprocess.run(["sudo", "-n", "install", "-D", "-m", "0644", str(source), target], check=True)
    subprocess.run([
        "sudo", "-n", "install", "-D", "-m", "0755", str(Path(__file__).with_name("deploy.py")),
        "/usr/local/lib/bni-deploy/deploy.py",
    ], check=True)
    subprocess.run(["sudo", "-n", "systemctl", "daemon-reload"], check=True)
    if args.enable:
        subprocess.run(["sudo", "-n", "systemctl", "enable", "--now", "bni-auto-deploy.timer"], check=True)
    print(json.dumps({"installed": True, "timer_enabled": args.enable, "state_dir": str(state)}))


if __name__ == "__main__":
    main()
