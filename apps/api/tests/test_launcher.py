"""Exercise the real POSIX launcher without Docker, browsers, or user data."""

import os
import re
import shutil
import stat
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def launcher(tmp_path):
    # Spaces in the checkout path are intentional: they used to be a common
    # source of shell-launcher bugs and match the application's local workspace.
    root = tmp_path / "Poker Lab"
    root.mkdir()
    shutil.copy2(REPO_ROOT / "pokerlab", root / "pokerlab")
    bin_dir = root / "bin"
    bin_dir.mkdir()
    log = root / "commands.log"
    scripts = {
        "docker": """#!/bin/sh
printf '%s\\n' "docker $*" >> "$POKERLAB_TEST_LOG"
case "$*" in
  'volume ls '*) printf '%s\\n' "${TEST_VOLUMES:-}"; exit "${TEST_VOLUME_EXIT:-0}" ;;
  *' up '*) exit "${TEST_UP_EXIT:-0}" ;;
esac
""",
        "curl": '#!/bin/sh\nexit "${TEST_CURL_EXIT:-0}"\n',
        "open": """#!/bin/sh
printf '%s\\n' "open $*" >> "$POKERLAB_TEST_LOG"
exit "${TEST_OPEN_EXIT:-0}"
""",
    }
    for name, content in scripts.items():
        path = bin_dir / name
        path.write_text(content)
        path.chmod(0o700)

    env = {
        **{
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("POKERLAB_", "COMPOSE_", "TEST_"))
        },
        "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}",
        "POKERLAB_TEST_LOG": str(log),
    }

    def run(*args, **overrides):
        return subprocess.run(
            ["sh", str(root / "pokerlab"), *args],
            cwd=tmp_path,
            env={**env, **overrides},
            capture_output=True,
            text=True,
            timeout=15,
        )

    return root, log, run


@pytest.mark.parametrize("command", ["status", "stop", "logs"])
def test_operational_commands_do_not_generate_credentials(launcher, command):
    root, _log, run = launcher
    result = run(command)
    assert result.returncode != 0
    assert ".pokerlab.env" in result.stderr
    assert not (root / ".pokerlab.env").exists()


@pytest.mark.parametrize(
    "args",
    [("restart", "--typo"), ("start", "--typo"), ("logs", "bad-service"), ("stop", "extra")],
)
def test_bad_arguments_have_no_docker_or_credential_side_effects(launcher, args):
    root, log, run = launcher
    result = run(*args)
    assert result.returncode != 0
    assert not log.exists()
    assert not (root / ".pokerlab.env").exists()


@pytest.mark.parametrize("timeout", ["0", "-1", "abc", "2.5"])
def test_invalid_timeout_is_rejected_before_stopping_services(launcher, timeout):
    _root, log, run = launcher
    assert run("restart", POKERLAB_START_TIMEOUT=timeout).returncode != 0
    assert not log.exists()


def test_first_start_creates_private_credentials_and_opens_only_after_ready(launcher):
    root, log, run = launcher
    result = run()
    assert result.returncode == 0, result.stderr
    runtime = root / ".pokerlab.env"
    assert stat.S_IMODE(runtime.stat().st_mode) == 0o600
    password = re.search(r"^POSTGRES_PASSWORD=([a-f0-9]{64})$", runtime.read_text(), re.MULTILINE)
    assert password is not None
    assert password[1] not in result.stdout + result.stderr + log.read_text()
    commands = log.read_text()
    assert " up --build --detach --wait --wait-timeout 300" in commands
    assert commands.index(" up ") < commands.index("open http://localhost:3000")
    assert not list(root.glob(".pokerlab.env.*"))
    assert run("start", "--no-open").returncode == 0
    assert password[1] in runtime.read_text()


def test_no_build_reuses_images_and_no_open_does_not_launch_a_browser(launcher):
    _root, log, run = launcher
    result = run("start", "--no-open", "--no-build")
    assert result.returncode == 0, result.stderr
    assert " up --no-build " in log.read_text()
    assert " up --build " not in log.read_text()
    assert "open http" not in log.read_text()


def test_custom_health_origin_is_used_for_the_documentation_link(launcher):
    _root, _log, run = launcher
    result = run("start", "--no-open", POKERLAB_API_HEALTH_URL="http://localhost:18000/health")
    assert result.returncode == 0
    assert "API docs / API 文档: http://localhost:18000/docs" in result.stdout


def test_missing_credentials_never_replace_an_existing_database_password(launcher):
    root, log, run = launcher
    result = run("start", TEST_VOLUMES="pokerlab_pokerlab-postgres")
    assert result.returncode != 0
    assert "Restore the original configuration" in result.stderr
    assert " up " not in log.read_text()
    assert not (root / ".pokerlab.env").exists()


def test_volume_inspection_failure_does_not_create_credentials(launcher):
    root, _log, run = launcher
    result = run("start", TEST_VOLUME_EXIT="1")
    assert result.returncode != 0
    assert not (root / ".pokerlab.env").exists()


@pytest.mark.parametrize("kind", ["empty", "directory", "symlink"])
def test_invalid_runtime_file_is_not_overwritten(launcher, kind):
    root, log, run = launcher
    runtime = root / ".pokerlab.env"
    if kind == "empty":
        runtime.touch()
    elif kind == "directory":
        runtime.mkdir()
    else:
        target = root / "original"
        target.write_text("must remain untouched")
        runtime.symlink_to(target)
    result = run("start")
    assert result.returncode != 0
    assert " up " not in log.read_text()
    if kind == "symlink":
        assert target.read_text() == "must remain untouched"


def test_browser_failure_is_not_reported_as_success(launcher):
    _root, _log, run = launcher
    result = run("open", TEST_OPEN_EXIT="1")
    assert result.returncode == 0
    assert "Opened" not in result.stdout
    assert "manually" in result.stderr


@pytest.mark.parametrize("failure", [{"TEST_UP_EXIT": "1"}, {"TEST_CURL_EXIT": "1"}])
def test_failed_start_does_not_announce_ready_or_open_browser(launcher, failure):
    _root, log, run = launcher
    result = run("start", **failure)
    assert result.returncode != 0
    assert "PokerLab is ready" not in result.stdout
    assert "open http" not in log.read_text()


def test_concurrent_initialization_publishes_one_complete_configuration(launcher):
    root, _log, run = launcher
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: run("start", "--no-open"), range(8)))
    assert all(result.returncode == 0 for result in results)
    assert sum("Created a private" in result.stdout for result in results) == 1
    assert (root / ".pokerlab.env").read_text().endswith("POKERLAB_MAX_CONCURRENT_SOLVERS=2\n")
    assert not list(root.glob(".pokerlab.env.*"))


def test_stop_preserves_runtime_credentials_and_volumes(launcher):
    root, log, run = launcher
    assert run("start", "--no-open").returncode == 0
    before = (root / ".pokerlab.env").read_bytes()
    assert run("stop").returncode == 0
    assert (root / ".pokerlab.env").read_bytes() == before
    assert " down\n" in log.read_text()
    assert " down -v" not in log.read_text()
