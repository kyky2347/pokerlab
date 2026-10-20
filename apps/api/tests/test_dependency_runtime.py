"""Loaded trust-store contents, Mako URI guards and our migration template."""

import ast
import ntpath
import os
import posixpath
import ssl
from importlib import metadata, resources

import certifi
import pytest
from alembic.util import format_as_comma
from mako import exceptions, template
from packaging.version import Version


def test_certifi_security_floor():
    version = Version(metadata.version("certifi"))
    assert not version.is_prerelease
    assert version >= Version("2026.10.19")


def test_certifi_bundle_distrusts_affected_emsign_root():
    # Inspect the bundle OpenSSL actually loads, not a comment or version alone.
    # No network access, custom CA installation or TLS verification bypass.
    context = ssl.create_default_context(cafile=certifi.where())
    common_names = {
        value
        for certificate in context.get_ca_certs()
        for rdn in certificate["subject"]
        for key, value in rdn
        if key == "commonName"
    }
    assert common_names
    assert "emSign ECC Root CA - G3" not in common_names
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


@pytest.fixture(params=[posixpath, ntpath], ids=["posix", "windows-paths"])
def template_path_semantics(request, monkeypatch):
    class ScopedOS:
        path = request.param

        def __getattr__(self, name):
            return getattr(os, name)

    # Emulate the vulnerable Windows boundary without changing global os.path
    # or reading any files. Other modules and pytest retain host path semantics.
    monkeypatch.setattr(template, "os", ScopedOS())


def test_mako_security_floor():
    version = Version(metadata.version("mako"))
    assert not version.is_prerelease
    assert version >= Version("1.4.2")


@pytest.mark.parametrize(
    "uri", ["C:/../../outside.txt", r"C:\..\..\outside.txt", "d:/../../../outside.txt"]
)
def test_drive_letter_traversal_is_rejected(template_path_semantics, uri):
    with pytest.raises(exceptions.TemplateLookupException):
        template.Template(text="in-memory fixture", uri=uri)


def test_normal_template_uri_still_renders(template_path_semantics):
    value = template.Template(text="Hello ${name}", uri="migrations/example.py")
    assert value.render(name="PokerLab") == "Hello PokerLab"


def test_packaged_alembic_template_renders_valid_python():
    source = resources.files("pokerlab_api.migrations").joinpath("script.py.mako")
    rendered = template.Template(text=source.read_text(encoding="utf-8")).render(
        message="Dependency compatibility check",
        up_revision="test_revision",
        down_revision="0002_durable_training",
        create_date="2026-10-07",
        comma=format_as_comma,
        imports="",
        branch_labels=None,
        depends_on=None,
        upgrades="pass",
        downgrades="pass",
    )
    module = ast.parse(rendered)
    assert {node.name for node in module.body if isinstance(node, ast.FunctionDef)} == {
        "upgrade",
        "downgrade",
    }
