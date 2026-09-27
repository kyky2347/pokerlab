"""Exercise the real POSIX launcher without Docker, browsers, or user data."""

import json
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
  *' config --quiet') exit "${TEST_CONFIG_EXIT:-0}" ;;
  *' up '*)
    printf 'ports=%s,%s api=%s cors=%s\\n' \\
      "${POKERLAB_WEB_PORT:-}" "${POKERLAB_API_PORT:-}" \\
      "${NEXT_PUBLIC_API_URL:-}" "${CORS_ORIGINS:-}" >> "$POKERLAB_TEST_LOG"
    exit "${TEST_UP_EXIT:-0}" ;;
esac
""",
        "curl": """#!/bin/sh
printf '%s\\n' "curl $*" >> "$POKERLAB_TEST_LOG"
exit "${TEST_CURL_EXIT:-0}"
""",
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
            and key not in {"NEXT_PUBLIC_API_URL", "CORS_ORIGINS"}
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


@pytest.mark.parametrize("key", ["POKERLAB_WEB_PORT", "POKERLAB_API_PORT"])
@pytest.mark.parametrize(
    "port",
    ["", "0", "-1", "65536", "100000000000000000000", "abc", "2.5", "08000", "80:80", "$(id)"],
)
def test_invalid_ports_are_rejected_before_restart_side_effects(launcher, key, port):
    root, log, run = launcher
    result = run("restart", **{key: port})
    assert result.returncode != 0
    assert key in result.stderr
    assert not log.exists()
    assert not (root / ".pokerlab.env").exists()


def test_equal_ports_are_rejected_before_docker(launcher):
    _root, log, run = launcher
    result = run("start", POKERLAB_WEB_PORT="8000")
    assert result.returncode != 0
    assert "must be different" in result.stderr
    assert not log.exists()


@pytest.mark.parametrize("web,api", [("13000", "18000"), ("1", "65535")])
def test_custom_ports_connect_every_local_endpoint_without_changing_credentials(launcher, web, api):
    root, log, run = launcher
    runtime = root / ".pokerlab.env"
    # Legacy defaults must not send a custom-port frontend to another app's API.
    original = (
        "POSTGRES_PASSWORD=private-test-value\n"
        "NEXT_PUBLIC_API_URL=http://localhost:8000\n"
        "CORS_ORIGINS=http://localhost:3000\n"
        "DO_NOT_EXECUTE=$(touch unsafe-file)\n"
    )
    runtime.write_text(original)
    overrides = {"POKERLAB_WEB_PORT": web, "POKERLAB_API_PORT": api}
    result = run("start", **overrides)
    assert result.returncode == 0, result.stderr
    commands = log.read_text()
    assert f"ports={web},{api} api=http://localhost:{api} cors=http://localhost:{web}" in commands
    assert f"curl --fail --silent --show-error --max-time 10 http://localhost:{web}\n" in commands
    assert (
        f"curl --fail --silent --show-error --max-time 10 http://localhost:{api}/health\n"
        in commands
    )
    assert f"open http://localhost:{web}" in commands
    assert f"http://localhost:{api}/docs" in result.stdout
    assert runtime.read_text() == original
    assert not (root / "unsafe-file").exists()
    assert "private-test-value" not in result.stdout + result.stderr + commands
    assert run("open", **overrides).returncode == 0
    assert run("restart", "--no-open", **overrides).returncode == 0
    assert runtime.read_text() == original


@pytest.mark.parametrize(
    "overrides,web,api",
    [
        ({"POKERLAB_WEB_PORT": "13000"}, "13000", "8000"),
        ({"POKERLAB_API_PORT": "18000"}, "3000", "18000"),
    ],
)
def test_single_port_override_keeps_other_service_default(launcher, overrides, web, api):
    _root, log, run = launcher
    result = run("start", "--no-open", **overrides)
    assert result.returncode == 0, result.stderr
    assert (
        f"ports={web},{api} api=http://localhost:{api} cors=http://localhost:{web}"
        in log.read_text()
    )


def test_explicit_proxy_configuration_is_preserved(launcher):
    _root, log, run = launcher
    result = run(
        "start",
        POKERLAB_WEB_PORT="13000",
        POKERLAB_API_PORT="18000",
        NEXT_PUBLIC_API_URL="https://api.example.test",
        CORS_ORIGINS="https://web.example.test",
        POKERLAB_WEB_URL="https://web.example.test",
        POKERLAB_API_HEALTH_URL="https://api.example.test/health",
    )
    assert result.returncode == 0, result.stderr
    assert "api=https://api.example.test cors=https://web.example.test" in log.read_text()
    assert "open https://web.example.test" in log.read_text()
    assert "https://api.example.test/docs" in result.stdout


def test_default_launch_does_not_override_runtime_file_url_settings(launcher):
    _root, log, run = launcher
    assert run("start", "--no-open").returncode == 0
    assert "ports=3000,8000 api= cors=\n" in log.read_text()


def test_invalid_compose_configuration_does_not_stop_existing_services(launcher):
    root, log, run = launcher
    runtime = root / ".pokerlab.env"
    runtime.write_text("POSTGRES_PASSWORD=private-test-value\n")
    result = run("restart", TEST_CONFIG_EXIT="1")
    assert result.returncode != 0
    assert "no services were stopped" in result.stderr
    assert " down" not in log.read_text()
    assert " up " not in log.read_text()
    assert runtime.read_text() == "POSTGRES_PASSWORD=private-test-value\n"


@pytest.mark.parametrize(
    "overrides,web,api,api_url,cors",
    [
        ({}, "3000", "8000", "http://localhost:8000", "http://localhost:3000"),
        (
            {"POKERLAB_WEB_PORT": "13000", "POKERLAB_API_PORT": "18000"},
            "13000",
            "18000",
            "http://localhost:18000",
            "http://localhost:13000",
        ),
        (
            {
                "NEXT_PUBLIC_API_URL": "https://api.example.test",
                "CORS_ORIGINS": "https://web.example.test",
            },
            "3000",
            "8000",
            "https://api.example.test",
            "https://web.example.test",
        ),
    ],
)
def test_real_compose_model_uses_loopback_and_consistent_defaults(
    tmp_path, overrides, web, api, api_url, cors
):
    # No daemon, containers, real credentials, or user configuration required.
    if not shutil.which("docker"):
        pytest.skip("Docker Compose is required for configuration integration tests")
    if subprocess.run(["docker", "compose", "version"], capture_output=True).returncode:
        pytest.skip("Docker Compose is unavailable")
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("POKERLAB_", "COMPOSE_", "POSTGRES_"))
        and key not in {"NEXT_PUBLIC_API_URL", "CORS_ORIGINS"}
    }
    env.update(
        {
            "COMPOSE_DISABLE_ENV_FILE": "1",
            "POSTGRES_USER": "test",
            "POSTGRES_DB": "test",
            "POSTGRES_PASSWORD": "disposable-test-only",
            **overrides,
        }
    )
    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            os.devnull,
            "-f",
            str(REPO_ROOT / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        env=env,
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    services = json.loads(result.stdout)["services"]
    for name, port in [("web", web), ("api", api)]:
        bindings = services[name]["ports"]
        assert len(bindings) == 1
        assert bindings[0]["host_ip"] == "127.0.0.1"
        assert bindings[0]["published"] == port
        assert bindings[0]["target"] == (3000 if name == "web" else 8000)
    assert "ports" not in services["postgres"]
    assert services["web"]["build"]["args"]["NEXT_PUBLIC_API_URL"] == api_url
    assert services["api"]["environment"]["CORS_ORIGINS"] == cors
