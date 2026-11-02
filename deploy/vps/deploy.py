#!/usr/bin/env python3
"""Build an isolated release and switch the existing systemd service to it."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.request import urlopen


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


class Deployer:
    def __init__(self, config):
        self.config = config
        self.repo = Path(config["repo"]).resolve()
        self.state = Path(config["state_dir"]).resolve()
        self.releases = self.state / "releases"
        self.current = self.state / "current"
        self.status_file = self.state / "status.json"
        self.node = config["node"]
        self.env = os.environ.copy()
        self.env.update({
            "HOME": config["home"],
            "PATH": str(Path(self.node).parent) + os.pathsep + os.environ.get("PATH", "/usr/bin:/bin"),
            "GIT_TERMINAL_PROMPT": "0",
            "NEXT_TELEMETRY_DISABLED": "1",
        })

    def command(self, args, cwd=None, capture=False, timeout=900, env=None):
        with subprocess.Popen(
            [str(arg) for arg in args], cwd=cwd or self.repo, env=env or self.env,
            stdout=subprocess.PIPE if capture else None,
            stderr=subprocess.PIPE if capture else None,
            text=True, start_new_session=True,
        ) as process:
            try:
                output, errors = process.communicate(timeout=timeout)
            except BaseException:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                raise
            if process.returncode:
                detail = (errors or "").strip()[-1000:]
                raise RuntimeError(f"{Path(str(args[0])).name} exited {process.returncode}: {detail}")
            return (output or "").strip()

    def status(self):
        return json.loads(self.status_file.read_text())

    def switch(self, release):
        temporary = self.state / "current.next"
        temporary.unlink(missing_ok=True)
        temporary.symlink_to(release, target_is_directory=True)
        temporary.replace(self.current)

    def remove_release(self, release):
        if release.is_symlink() or release.parent.resolve() != self.releases:
            raise RuntimeError("Refusing to remove a path outside the releases directory")
        if not re.fullmatch(r"[0-9a-f]{40}", release.name):
            raise RuntimeError("Invalid release directory")
        if release.resolve() == self.current.resolve():
            raise RuntimeError("Refusing to remove the active release")
        shutil.rmtree(release)

    def prepare(self, sha):
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise RuntimeError("Invalid commit ID")
        release = self.releases / sha
        if release.exists():
            self.remove_release(release)
        release.mkdir()
        with tempfile.NamedTemporaryFile(dir=self.state, suffix=".tar") as archive:
            self.command(["git", "archive", "--format=tar", "--output", archive.name, sha])
            with tarfile.open(archive.name) as source:
                source.extractall(release, filter="data")
        webapp = release / "webapp"
        if (webapp / "data").exists() or (webapp / ".env.local").exists():
            raise RuntimeError("Data and local configuration must not be tracked in Git")
        (webapp / "data").symlink_to(self.config["data_dir"], target_is_directory=True)
        (webapp / ".env.local").symlink_to(self.config["env_file"])
        return release

    def build(self, release):
        webapp = release / "webapp"
        self.command([self.node, "--check", webapp / "scripts/database-maintenance.mjs"])
        self.command(["npm", "ci", "--include=dev", "--no-audit", "--no-fund"], cwd=webapp)
        self.command(["npm", "run", "build"], cwd=webapp)

    @staticmethod
    def health(port):
        with urlopen(f"http://127.0.0.1:{port}/", timeout=5) as response:
            if response.status != 200:
                raise RuntimeError("Login page health check failed")
        with urlopen(f"http://127.0.0.1:{port}/api/v1/session", timeout=5) as response:
            payload = json.load(response)
            if response.status != 200 or "user" not in payload:
                raise RuntimeError("Session API health check failed")

    def wait_healthy(self, port, process=None):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process is not None and process.poll() is not None:
                raise RuntimeError("Candidate server exited before becoming healthy")
            try:
                self.health(port)
                return
            except (OSError, ValueError, RuntimeError):
                time.sleep(1)
        raise RuntimeError("Application did not pass health checks within 60 seconds")

    def probe(self, release):
        webapp = release / "webapp"
        browser_check = """(async () => {
          const browser = await require('puppeteer').launch({headless:true,
            args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
          try { const page = await browser.newPage(); await page.goto('about:blank'); }
          finally { await browser.close(); }
          console.log('Chromium ready');
        })().catch(error => { console.error(error.message); process.exitCode=1; });"""
        self.command([self.node, "--env-file=.env.local", "-e", browser_check], cwd=webapp, timeout=60)
        model = release / "scraper/trained_model_v3/store_classifier.keras"
        self.command([
            self.config["python"], "-c",
            "import sys; import tensorflow as tf; tf.keras.models.load_model(sys.argv[1]); print('Model ready')",
            model,
        ], cwd=webapp, timeout=120)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        env = self.env.copy()
        env.update({"NODE_ENV": "production", "BNI_DATABASE_PATH": str(webapp / ".probe.sqlite")})
        with subprocess.Popen([
            self.node, "--env-file=.env.local", "node_modules/next/dist/bin/next", "start",
            "--hostname", "127.0.0.1", "--port", str(port),
        ], cwd=webapp, env=env, start_new_session=True) as process:
            try:
                self.wait_healthy(port, process)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                for path in webapp.glob(".probe.sqlite*"):
                    path.unlink()

    def backup(self, current):
        if not Path(self.config["database"]).is_file():
            raise RuntimeError("Production database is missing; refusing to create an empty database")
        env = self.env.copy()
        env["BNI_DATABASE_PATH"] = self.config["database"]
        self.command([
            self.node, "--env-file=.env.local", "scripts/database-maintenance.mjs", "backup",
        ], cwd=current / "webapp", env=env, timeout=60)

    def restart(self, release):
        self.command(["sudo", "-n", "systemctl", "restart", self.config["service"]], timeout=90)
        pid = self.command([
            "systemctl", "show", self.config["service"], "--property=MainPID", "--value",
        ], capture=True, timeout=10)
        if not pid.isdigit() or pid == "0":
            raise RuntimeError("Application service has no running process")
        if Path(f"/proc/{pid}/cwd").resolve() != release / "webapp":
            raise RuntimeError("Application service is running from an unexpected release")
        self.wait_healthy(self.config["port"])

    def prune(self, previous):
        directories = sorted(
            (path for path in self.releases.iterdir() if path.is_dir() and not path.is_symlink()
             and re.fullmatch(r"[0-9a-f]{40}", path.name)),
            key=lambda path: path.stat().st_mtime, reverse=True,
        )
        protected = {self.current.resolve(), previous.resolve()}
        for release in directories[:3]:
            protected.add(release.resolve())
        for release in directories:
            if release.resolve() not in protected:
                self.remove_release(release)

    def deploy(self, sha):
        status = self.status()
        previous = self.current.resolve(strict=True)
        switched = False
        try:
            for args in (["git", "diff", "--quiet"], ["git", "diff", "--cached", "--quiet"],
                         ["git", "merge-base", "--is-ancestor", "HEAD", sha]):
                self.command(args)
            print(f"Building {sha}", flush=True)
            release = self.prepare(sha)
            self.build(release)
            self.probe(release)
            self.backup(previous)
            switched = True
            self.switch(release)
            self.restart(release)
        except Exception as error:
            rollback_error = None
            if switched:
                try:
                    self.switch(previous)
                    self.restart(previous)
                except Exception as rollback:
                    rollback_error = str(rollback)
            status.update({"failed_sha": sha, "last_error": str(error), "rollback_error": rollback_error})
            write_json(self.status_file, status)
            raise
        status.update({
            "deployed_sha": sha, "previous_release": str(previous),
            "deployed_at": datetime.now(timezone.utc).isoformat(),
            "failed_sha": None, "last_error": None, "rollback_error": None,
        })
        write_json(self.status_file, status)
        try:
            self.command(["git", "merge", "--ff-only", "--no-edit", sha])
            self.prune(previous)
        except Exception as error:
            print(f"Release is healthy; repository/cleanup maintenance needs attention: {error}", flush=True)
        print(f"Deployed {sha}", flush=True)

    def check(self, retry=False):
        with (self.state / "deploy.lock").open("a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            self.command([
                "git", "fetch", "--no-tags", "origin",
                "refs/heads/main:refs/remotes/origin/main",
            ], timeout=60)
            sha = self.command(["git", "rev-parse", "refs/remotes/origin/main"], capture=True)
            status = self.status()
            if sha == status.get("deployed_sha"):
                return
            if sha == status.get("failed_sha") and not retry:
                print(f"Skipping failed commit {sha}; use --retry after fixing the cause", flush=True)
                return
            self.deploy(sha)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--retry", action="store_true")
    args = parser.parse_args()
    def interrupted(_signum, _frame):
        raise RuntimeError("Deployment interrupted")

    signal.signal(signal.SIGTERM, interrupted)
    try:
        Deployer(json.loads(Path(args.config).read_text())).check(args.retry)
    except Exception as error:
        print(f"Deployment failed: {error}", file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
