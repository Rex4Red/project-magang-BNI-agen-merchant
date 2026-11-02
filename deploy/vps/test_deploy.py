import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import unittest

from deploy import Deployer, write_json


class SimulatedRuntime(Deployer):
    def __init__(self, config):
        super().__init__(config)
        self.fail_build = False
        self.fail_probe = False
        self.fail_restart = False
        self.builds = 0
        self.backups = 0
        self.restarts = []

    def build(self, release):
        self.builds += 1
        if self.fail_build:
            raise RuntimeError("Simulated compiler failure")
        (release / "webapp/.next").mkdir()

    def probe(self, release):
        if self.fail_probe:
            raise RuntimeError("Simulated candidate startup failure")

    def backup(self, current):
        self.backups += 1
        with sqlite3.connect(self.config["database"]) as source:
            with sqlite3.connect(self.state / "backup.sqlite") as destination:
                source.backup(destination)

    def restart(self, release):
        self.restarts.append(release)
        if self.fail_restart and release.name == self.target:
            raise RuntimeError("Simulated production health failure")


class DeploymentTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="bni-deployment-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Deployment test")
        self.git("config", "user.email", "deployment-test@example.invalid")
        (self.repo / "webapp").mkdir()
        (self.repo / "webapp/version.txt").write_text("old")
        self.git("add", ".")
        self.git("commit", "-m", "Old release")
        self.old = self.git("rev-parse", "HEAD")
        (self.repo / "webapp/version.txt").write_text("new")
        self.git("commit", "-am", "New release")
        self.target = self.git("rev-parse", "HEAD")
        self.git("clone", "--bare", str(self.repo), str(self.root / "upstream"))
        self.git("remote", "add", "origin", str(self.root / "upstream"))
        self.git("reset", "--hard", self.old)
        shared = self.root / "shared"
        shared.mkdir()
        database = shared / "canvasing.sqlite"
        with sqlite3.connect(database) as connection:
            connection.execute("CREATE TABLE visits (note TEXT)")
            connection.execute("INSERT INTO visits VALUES ('Keep this visit and its photo')")
        environment = self.root / "application.env"
        environment.write_text("PRIVATE_SETTING=keep-out-of-git\n")
        config = {
            "repo": str(self.repo), "state_dir": str(self.root / "state"),
            "node": "/usr/bin/node", "home": str(self.root),
            "data_dir": str(shared), "database": str(database), "env_file": str(environment),
            "python": "/usr/bin/python3", "service": "test-only.service", "port": 1,
        }
        self.runtime = SimulatedRuntime(config)
        self.runtime.target = self.target
        self.runtime.releases.mkdir(parents=True)
        old_release = self.runtime.releases / self.old
        (old_release / "webapp").mkdir(parents=True)
        self.runtime.switch(old_release)
        write_json(self.runtime.status_file, {"deployed_sha": self.old, "failed_sha": None})

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True, stderr=subprocess.DEVNULL).strip()

    def assert_visit_preserved(self):
        with sqlite3.connect(self.runtime.config["database"]) as connection:
            self.assertEqual(connection.execute("SELECT note FROM visits").fetchall(),
                             [("Keep this visit and its photo",)])

    def test_build_failure_keeps_old_service_and_data(self):
        self.runtime.fail_build = True
        with self.assertRaisesRegex(RuntimeError, "compiler failure"):
            self.runtime.check()
        self.assertEqual(self.runtime.current.resolve().name, self.old)
        self.assertEqual(self.runtime.restarts, [])
        self.assertEqual(self.runtime.backups, 0)
        self.assert_visit_preserved()

    def test_candidate_failure_does_not_restart_production(self):
        self.runtime.fail_probe = True
        with self.assertRaisesRegex(RuntimeError, "candidate startup"):
            self.runtime.check()
        self.assertEqual(self.runtime.current.resolve().name, self.old)
        self.assertEqual(self.runtime.restarts, [])
        self.assert_visit_preserved()

    def test_failed_restart_restores_previous_release_and_preserves_visits(self):
        self.runtime.fail_restart = True
        with self.assertRaisesRegex(RuntimeError, "production health"):
            self.runtime.check()
        self.assertEqual([path.name for path in self.runtime.restarts], [self.target, self.old])
        self.assertEqual(self.runtime.current.resolve().name, self.old)
        self.assertEqual(self.runtime.status()["deployed_sha"], self.old)
        self.assertEqual(self.runtime.status()["failed_sha"], self.target)
        self.assertEqual(self.runtime.backups, 1)
        self.assertTrue((self.runtime.state / "backup.sqlite").is_file())
        self.assert_visit_preserved()

    def test_successful_poll_deploys_once_and_shares_existing_data(self):
        self.runtime.check()
        self.runtime.check()
        self.assertEqual(self.runtime.builds, 1)
        self.assertEqual(self.runtime.backups, 1)
        self.assertEqual(self.runtime.status()["deployed_sha"], self.target)
        self.assertEqual(self.git("rev-parse", "HEAD"), self.target)
        self.assertEqual((self.runtime.current / "webapp/data").resolve(),
                         Path(self.runtime.config["data_dir"]))
        self.assertEqual((self.runtime.current / "webapp/.env.local").resolve(),
                         Path(self.runtime.config["env_file"]))
        self.assert_visit_preserved()

    def test_failed_commit_waits_for_explicit_retry(self):
        self.runtime.fail_build = True
        with self.assertRaises(RuntimeError):
            self.runtime.check()
        self.runtime.check()
        self.assertEqual(self.runtime.builds, 1)
        self.runtime.fail_build = False
        self.runtime.check(retry=True)
        self.assertEqual(self.runtime.builds, 2)
        self.assertEqual(self.runtime.status()["deployed_sha"], self.target)
        self.assert_visit_preserved()

    def test_cleanup_refuses_shared_data_and_active_release(self):
        with self.assertRaises(RuntimeError):
            self.runtime.remove_release(Path(self.runtime.config["data_dir"]))
        with self.assertRaises(RuntimeError):
            self.runtime.remove_release(self.runtime.current.resolve())
        self.assert_visit_preserved()


if __name__ == "__main__":
    unittest.main()
